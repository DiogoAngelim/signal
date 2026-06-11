import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import {
  positiveInt,
  validateSignalEnvironment,
} from "../config/signal-environment.js";
import { logger } from "../lib/logger.js";
import { ApiProblem } from "../observability/signal-http.js";
import {
  incrementSignalCounter,
  observeSignalLatency,
  sanitizeForLog,
} from "../observability/signal-metrics.js";
import {
  CreateWebhookSchema,
  RotateWebhookSecretSchema,
} from "../schemas/signal-api.js";
import {
  decryptSecret,
  encryptSecret,
  generateDisplaySecret,
  secretPreview,
  signWebhookPayload,
} from "../security/signal-secrets.js";
import { loadSignalSecurityConfig } from "../security/signal-security.js";
import {
  type QueueJobRecord,
  type SignalRecord,
  type SignalStorageAdapter,
  type WebhookSubscription,
  signalMatchesFilters,
} from "../storage/signal-store.js";

type FetchLike = typeof fetch;

type WebhookQueuePayload = {
  type: "webhook.delivery";
  webhookId: string;
  deliveryId: string;
  event: string;
  signalId?: string;
  body: unknown;
};

const WEBHOOK_QUEUE = "signal-webhooks";

export class SignalWebhookDispatcher {
  private readonly workerId =
    `webhook-inline-${process.pid}-${crypto.randomUUID()}`;
  private processing = false;

  constructor(
    private readonly store: SignalStorageAdapter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  async register(
    rawInput: unknown,
    actor?: string,
  ): Promise<{
    webhook: PublicWebhook;
    secret: string;
    generatedSecret: boolean;
  }> {
    const input = CreateWebhookSchema.parse(rawInput);
    await validateWebhookUrl(input.url);
    const generatedSecret = !input.secret;
    const secret = input.secret ?? generateDisplaySecret();
    const webhook = await this.store.createWebhook({
      url: input.url,
      secretCiphertext: encryptSecret(secret),
      secretPreview: secretPreview(secret),
      events: input.events,
      filters: input.filters,
      description: input.description,
    });

    await this.store.appendSecretRotation({
      subjectType: "webhook",
      subjectId: webhook.id,
      action: "created",
      actor,
      metadata: { generatedSecret },
    });
    await this.store.appendAudit({
      action: "webhook.created",
      actor,
      metadata: {
        webhookId: webhook.id,
        url: webhook.url,
        filters: webhook.filters,
      },
    });

    return {
      webhook: publicWebhook(webhook),
      secret,
      generatedSecret,
    };
  }

  async list(): Promise<PublicWebhook[]> {
    const webhooks = await this.store.listWebhooks();
    return webhooks.map(publicWebhook);
  }

  async remove(id: string, actor?: string) {
    const deleted = await this.store.deleteWebhook(id);
    if (deleted) {
      await this.store.appendAudit({
        action: "webhook.deleted",
        actor,
        metadata: { webhookId: id },
      });
    }
    return deleted;
  }

  async rotateSecret(id: string, rawInput: unknown, actor?: string) {
    const input = RotateWebhookSecretSchema.parse(rawInput ?? {});
    const webhook = await this.store.getWebhook(id);
    if (!webhook || !webhook.active) {
      throw new ApiProblem(
        404,
        "webhook_not_found",
        "Webhook subscription was not found.",
      );
    }

    const secret = generateDisplaySecret();
    const graceExpiresAt = new Date(
      Date.now() + input.graceSeconds * 1000,
    ).toISOString();
    const updated = await this.store.rotateWebhookSecret(id, {
      secretCiphertext: encryptSecret(secret),
      secretPreview: secretPreview(secret),
      previousSecretCiphertext: webhook.secretCiphertext,
      previousSecretExpiresAt: graceExpiresAt,
    });
    if (!updated)
      throw new ApiProblem(
        404,
        "webhook_not_found",
        "Webhook subscription was not found.",
      );

    await this.store.appendSecretRotation({
      subjectType: "webhook",
      subjectId: id,
      action: "rotated",
      graceExpiresAt,
      actor,
    });
    await this.store.appendAudit({
      action: "webhook.secret_rotated",
      actor,
      metadata: { webhookId: id, graceExpiresAt },
    });

    return {
      webhook: publicWebhook(updated),
      secret,
      previousSecretGraceExpiresAt: graceExpiresAt,
    };
  }

  async sendTest(id: string) {
    const webhook = await this.store.getWebhook(id);
    if (!webhook || !webhook.active) {
      throw new ApiProblem(
        404,
        "webhook_not_found",
        "Webhook subscription was not found.",
      );
    }

    const deliveryId = crypto.randomUUID();
    await this.enqueueWebhookDelivery({
      webhook,
      dedupeKey: `${webhook.id}:webhook.test:${deliveryId}`,
      deliveryId,
      event: "webhook.test",
      body: {
        event: "webhook.test",
        deliveryId,
        timestamp: new Date().toISOString(),
        webhookId: webhook.id,
      },
    });
    return { deliveryId };
  }

  async enqueueSignal(record: SignalRecord) {
    const env = validateSignalEnvironment();
    const queueStats = await this.store.queueStats(WEBHOOK_QUEUE);
    if (queueStats.queued >= env.settings.queueMaxDepth) {
      incrementSignalCounter("signal.queue.overload", { queue: WEBHOOK_QUEUE });
      await this.store.appendAudit({
        signalId: record.signal.id,
        messageId: record.signal.messageId,
        action: "webhook.queue_overloaded",
        metadata: {
          queue: WEBHOOK_QUEUE,
          queued: queueStats.queued,
          limit: env.settings.queueMaxDepth,
        },
      });
      return;
    }

    const webhooks = await this.store.listWebhooks();

    for (const webhook of webhooks) {
      if (!webhook.events.includes("signal.emitted")) continue;
      if (!signalMatchesFilters(record, webhook.filters)) continue;

      const deliveryKey = `${webhook.id}:${record.signal.id}:signal.emitted`;
      if (!(await this.store.markDelivery(deliveryKey))) continue;

      const deliveryId = stableDeliveryId(deliveryKey);
      await this.enqueueWebhookDelivery({
        webhook,
        dedupeKey: deliveryKey,
        deliveryId,
        event: "signal.emitted",
        signalId: record.signal.id,
        body: {
          event: "signal.emitted",
          deliveryId,
          signal: record.signal,
          trust: record.trust,
          acceptedAt: record.acceptedAt,
          sequence: record.sequence,
        },
      });
    }
  }

  async processDueJobsOnce(
    limit = positiveInt(process.env.SIGNAL_QUEUE_WORKER_BATCH_SIZE, 10),
  ) {
    if (this.processing) return 0;
    this.processing = true;
    let processed = 0;

    try {
      const jobs = await this.store.claimQueueJobs(
        WEBHOOK_QUEUE,
        this.workerId,
        limit,
      );
      for (const job of jobs) {
        await this.processJob(job);
        processed += 1;
      }
    } finally {
      this.processing = false;
    }

    return processed;
  }

  private async enqueueWebhookDelivery(input: {
    webhook: WebhookSubscription;
    dedupeKey: string;
    deliveryId: string;
    event: string;
    signalId?: string;
    body: unknown;
  }) {
    await this.store.enqueueQueueJob({
      queue: WEBHOOK_QUEUE,
      dedupeKey: input.dedupeKey,
      payload: {
        type: "webhook.delivery",
        webhookId: input.webhook.id,
        deliveryId: input.deliveryId,
        event: input.event,
        signalId: input.signalId,
        body: input.body,
      } satisfies WebhookQueuePayload,
      maxAttempts: positiveInt(process.env.SIGNAL_WEBHOOK_MAX_ATTEMPTS, 3),
      runAt: new Date().toISOString(),
    });

    if (process.env.SIGNAL_QUEUE_INLINE_WORKER !== "false") {
      this.scheduleProcess(0);
    }
  }

  private scheduleProcess(delayMs: number) {
    const fastRetry =
      process.env.NODE_ENV === "test" ||
      process.env.SIGNAL_TEST_FAST_RETRY === "true";
    const effectiveDelay = fastRetry ? 0 : delayMs;

    if (effectiveDelay <= 0) {
      setImmediate(() => {
        void this.processDueJobsOnce().catch((error) => {
          logger.warn(
            { err: sanitizeForLog(error) },
            "Signal webhook queue worker failed",
          );
        });
      });
    } else {
      setTimeout(() => {
        void this.processDueJobsOnce().catch((error) => {
          logger.warn(
            { err: sanitizeForLog(error) },
            "Signal webhook queue worker failed",
          );
        });
      }, effectiveDelay).unref?.();
    }
  }

  private async processJob(job: QueueJobRecord) {
    const payload = job.payload as WebhookQueuePayload;
    if (payload.type !== "webhook.delivery") {
      await this.store.failQueueJob(job.id, {
        error: "Unsupported queue payload.",
        deadLetter: true,
      });
      return;
    }

    const webhook = await this.store.getWebhook(payload.webhookId);
    if (!webhook || !webhook.active) {
      await this.store.completeQueueJob(job.id);
      return;
    }

    const attempt = await this.store.appendDeliveryAttempt({
      webhookId: webhook.id,
      signalId: payload.signalId,
      event: payload.event,
      deliveryId: payload.deliveryId,
      attempt: job.attempts,
      status: "queued",
    });

    try {
      const result = await this.deliver(webhook, payload);
      await this.store.updateDeliveryAttempt(attempt.id, {
        status: "delivered",
        statusCode: result.statusCode,
      });
      await this.store.completeQueueJob(job.id);
      incrementSignalCounter("signal.webhook.delivered", {
        event: payload.event,
      });
      await this.store.appendAudit({
        signalId: payload.signalId,
        action: "webhook.delivered",
        metadata: {
          webhookId: webhook.id,
          deliveryId: payload.deliveryId,
          statusCode: result.statusCode,
          queueJobId: job.id,
        },
      });
    } catch (error) {
      const statusCode =
        error instanceof WebhookDeliveryError ? error.statusCode : undefined;
      const safeMessage =
        error instanceof Error ? error.message : String(error);
      await this.retryOrDeadLetter(
        job,
        payload,
        attempt.id,
        safeMessage,
        statusCode,
      );
    }
  }

  private async deliver(
    webhook: WebhookSubscription,
    delivery: WebhookQueuePayload,
  ) {
    const body = JSON.stringify(delivery.body);
    const timestamp = new Date().toISOString();
    const signature = signWebhookPayload({
      secret: decryptSecret(webhook.secretCiphertext),
      timestamp,
      event: delivery.event,
      deliveryId: delivery.deliveryId,
      body,
    });
    const startedAt = performance.now();
    const response = await fetchWebhookWithLimits(this.fetchImpl, webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "stocks-optimizer-signal-api/1.0",
        "X-Stocks-Optimizer-Timestamp": timestamp,
        "X-Stocks-Optimizer-Signature": signature,
        "X-Stocks-Optimizer-Event": delivery.event,
        "X-Stocks-Optimizer-Delivery-Id": delivery.deliveryId,
      },
      body,
    });
    observeSignalLatency("webhook.delivery", performance.now() - startedAt);

    if (!response.ok) {
      throw new WebhookDeliveryError(
        `HTTP ${response.status}`,
        response.status,
      );
    }

    return { statusCode: response.status };
  }

  private async retryOrDeadLetter(
    job: QueueJobRecord,
    payload: WebhookQueuePayload,
    attemptId: string,
    error: string,
    statusCode?: number,
  ) {
    const maxAttempts = job.maxAttempts;
    const baseDelay = positiveInt(
      process.env.SIGNAL_WEBHOOK_RETRY_BASE_MS,
      500,
    );
    const deadLetter = job.attempts >= maxAttempts;
    const fastRetry =
      process.env.NODE_ENV === "test" ||
      process.env.SIGNAL_TEST_FAST_RETRY === "true";
    const delayMs = fastRetry
      ? 0
      : baseDelay * 2 ** Math.max(0, job.attempts - 1);
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

    await this.store.updateDeliveryAttempt(attemptId, {
      status: deadLetter ? "failed" : "retrying",
      statusCode,
      error: safeError(error),
      ...(deadLetter ? {} : { nextAttemptAt }),
    });

    await this.store.failQueueJob(job.id, {
      error,
      deadLetter,
      ...(deadLetter ? {} : { nextRunAt: nextAttemptAt }),
    });

    incrementSignalCounter(
      deadLetter ? "signal.webhook.dead_letter" : "signal.webhook.retry",
      {
        event: payload.event,
        statusCode: statusCode ?? "network",
      },
    );
    await this.store.appendAudit({
      signalId: payload.signalId,
      action: deadLetter ? "webhook.dead_lettered" : "webhook.retry_scheduled",
      metadata: {
        webhookId: payload.webhookId,
        deliveryId: payload.deliveryId,
        queueJobId: job.id,
        statusCode,
        error: safeError(error),
        nextAttemptAt: deadLetter ? undefined : nextAttemptAt,
      },
    });

    if (!deadLetter && process.env.SIGNAL_QUEUE_INLINE_WORKER !== "false") {
      this.scheduleProcess(delayMs);
    }
  }
}

export type PublicWebhook = Omit<
  WebhookSubscription,
  "secretCiphertext" | "previousSecretCiphertext"
>;

export async function validateWebhookUrl(rawUrl: string) {
  const config = loadSignalSecurityConfig();
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiProblem(
      400,
      "invalid_webhook_url",
      "Webhook URL must be a valid absolute URL.",
    );
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new ApiProblem(
      400,
      "invalid_webhook_url",
      "Webhook URL must use http or https.",
    );
  }

  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new ApiProblem(
      400,
      "insecure_webhook_url",
      "Production webhook URLs must use https.",
    );
  }

  if (config.allowPrivateWebhookTargets) return;

  if (isPrivateHostname(parsed.hostname)) {
    throw new ApiProblem(
      400,
      "webhook_ssrf_blocked",
      "Webhook URL points to localhost or a private network.",
    );
  }

  const addresses = await resolveWebhookAddresses(parsed.hostname);
  if (addresses.some((address) => isPrivateAddress(address))) {
    throw new ApiProblem(
      400,
      "webhook_ssrf_blocked",
      "Webhook URL resolved to localhost or a private network.",
    );
  }
}

async function fetchWebhookWithLimits(
  fetchImpl: FetchLike,
  rawUrl: string,
  init: RequestInit,
  remainingRedirects = validateSignalEnvironment().settings
    .webhookRedirectLimit,
): Promise<Response> {
  await validateWebhookUrl(rawUrl);
  const timeoutMs = validateSignalEnvironment().settings.webhookTimeoutMs;
  const responseLimit =
    validateSignalEnvironment().settings.webhookResponseMaxBytes;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(rawUrl, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      if (remainingRedirects <= 0) {
        throw new WebhookDeliveryError(
          "Webhook redirect limit exceeded.",
          response.status,
        );
      }
      const redirected = new URL(
        response.headers.get("location")!,
        rawUrl,
      ).toString();
      return fetchWebhookWithLimits(
        fetchImpl,
        redirected,
        init,
        remainingRedirects - 1,
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > responseLimit) {
      throw new WebhookDeliveryError(
        "Webhook response exceeded the configured size limit.",
        response.status,
      );
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > responseLimit) {
      throw new WebhookDeliveryError(
        "Webhook response exceeded the configured size limit.",
        response.status,
      );
    }

    return response;
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      throw new WebhookDeliveryError("Webhook delivery timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function publicWebhook(webhook: WebhookSubscription): PublicWebhook {
  const { secretCiphertext, previousSecretCiphertext, ...rest } = webhook;
  return rest;
}

async function resolveWebhookAddresses(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) return [hostname];

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    throw new ApiProblem(
      400,
      "webhook_dns_failed",
      "Webhook URL hostname could not be resolved.",
    );
  }
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function isPrivateAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function stableDeliveryId(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function safeError(error: string) {
  return error.slice(0, 300);
}

class WebhookDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "WebhookDeliveryError";
  }
}
