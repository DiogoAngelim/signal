import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { CreateWebhookSchema, type CreateWebhookInput } from "../schemas/signal-api.js";
import { loadSignalSecurityConfig, signWebhookPayload } from "../security/signal-security.js";
import {
  signalMatchesFilters,
  type SignalRecord,
  type SignalStorageAdapter,
  type WebhookSubscription,
} from "../storage/signal-store.js";
import { ApiProblem } from "../observability/signal-http.js";
import { logger } from "../lib/logger.js";

type FetchLike = typeof fetch;

export class SignalWebhookDispatcher {
  constructor(
    private readonly store: SignalStorageAdapter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  async register(rawInput: unknown): Promise<{ webhook: PublicWebhook; secret: string; generatedSecret: boolean }> {
    const input = CreateWebhookSchema.parse(rawInput);
    await validateWebhookUrl(input.url);
    const generatedSecret = !input.secret;
    const secret = input.secret ?? crypto.randomBytes(32).toString("hex");
    const webhook = await this.store.createWebhook({
      url: input.url,
      secret,
      events: input.events,
      filters: input.filters,
      description: input.description,
    });

    await this.store.appendAudit({
      action: "webhook.created",
      metadata: { webhookId: webhook.id, url: webhook.url, filters: webhook.filters },
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

  async remove(id: string) {
    const deleted = await this.store.deleteWebhook(id);
    if (deleted) {
      await this.store.appendAudit({
        action: "webhook.deleted",
        metadata: { webhookId: id },
      });
    }
    return deleted;
  }

  async sendTest(id: string) {
    const webhook = await this.store.getWebhook(id);
    if (!webhook || !webhook.active) {
      throw new ApiProblem(404, "webhook_not_found", "Webhook subscription was not found.");
    }

    const deliveryId = crypto.randomUUID();
    const payload = {
      event: "webhook.test",
      deliveryId,
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
    };

    await this.deliver(webhook, {
      deliveryId,
      event: "webhook.test",
      payload,
      attempt: 1,
    });

    return { deliveryId };
  }

  async enqueueSignal(record: SignalRecord) {
    const webhooks = await this.store.listWebhooks();

    for (const webhook of webhooks) {
      if (!webhook.events.includes("signal.emitted")) continue;
      if (!signalMatchesFilters(record, webhook.filters)) continue;

      const deliveryKey = `${webhook.id}:${record.signal.id}:signal.emitted`;
      if (!(await this.store.markDelivery(deliveryKey))) continue;

      const deliveryId = crypto.randomUUID();
      const payload = {
        event: "signal.emitted",
        deliveryId,
        signal: record.signal,
        trust: record.trust,
        acceptedAt: record.acceptedAt,
        sequence: record.sequence,
      };

      this.schedule(webhook, {
        deliveryId,
        event: "signal.emitted",
        signalId: record.signal.id,
        payload,
        attempt: 1,
      }, 0);
    }
  }

  private schedule(
    webhook: WebhookSubscription,
    delivery: {
      deliveryId: string;
      event: string;
      signalId?: string;
      payload: unknown;
      attempt: number;
    },
    delayMs: number,
  ) {
    setTimeout(() => {
      void this.deliver(webhook, delivery).catch((error) => {
        logger.warn(
          {
            err: error,
            webhookId: webhook.id,
            event: delivery.event,
            deliveryId: delivery.deliveryId,
          },
          "Signal webhook delivery failed outside retry loop",
        );
      });
    }, delayMs).unref?.();
  }

  private async deliver(
    webhook: WebhookSubscription,
    delivery: {
      deliveryId: string;
      event: string;
      signalId?: string;
      payload: unknown;
      attempt: number;
    },
  ) {
    const body = JSON.stringify(delivery.payload);
    const timestamp = new Date().toISOString();
    const signature = signWebhookPayload({
      secret: webhook.secret,
      timestamp,
      event: delivery.event,
      deliveryId: delivery.deliveryId,
      body,
    });
    const attempt = await this.store.appendDeliveryAttempt({
      webhookId: webhook.id,
      signalId: delivery.signalId,
      event: delivery.event,
      deliveryId: delivery.deliveryId,
      attempt: delivery.attempt,
      status: "queued",
    });

    try {
      const response = await this.fetchImpl(webhook.url, {
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

      if (response.ok) {
        await this.store.updateDeliveryAttempt(attempt.id, {
          status: "delivered",
          statusCode: response.status,
        });
        await this.store.appendAudit({
          signalId: delivery.signalId,
          action: "webhook.delivered",
          metadata: {
            webhookId: webhook.id,
            deliveryId: delivery.deliveryId,
            statusCode: response.status,
          },
        });
        return;
      }

      await this.retryOrFail(webhook, delivery, attempt.id, `HTTP ${response.status}`, response.status);
    } catch (error) {
      await this.retryOrFail(
        webhook,
        delivery,
        attempt.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async retryOrFail(
    webhook: WebhookSubscription,
    delivery: {
      deliveryId: string;
      event: string;
      signalId?: string;
      payload: unknown;
      attempt: number;
    },
    attemptId: string,
    error: string,
    statusCode?: number,
  ) {
    const maxAttempts = positiveInt(process.env.SIGNAL_WEBHOOK_MAX_ATTEMPTS, 3);
    const baseDelay = positiveInt(process.env.SIGNAL_WEBHOOK_RETRY_BASE_MS, 500);

    if (delivery.attempt >= maxAttempts) {
      await this.store.updateDeliveryAttempt(attemptId, {
        status: "failed",
        statusCode,
        error: safeError(error),
      });
      await this.store.appendAudit({
        signalId: delivery.signalId,
        action: "webhook.failed",
        metadata: {
          webhookId: webhook.id,
          deliveryId: delivery.deliveryId,
          statusCode,
          error: safeError(error),
        },
      });
      return;
    }

    const delayMs = baseDelay * 2 ** (delivery.attempt - 1);
    await this.store.updateDeliveryAttempt(attemptId, {
      status: "retrying",
      statusCode,
      error: safeError(error),
      nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
    });
    this.schedule(webhook, { ...delivery, attempt: delivery.attempt + 1 }, delayMs);
  }
}

export type PublicWebhook = Omit<WebhookSubscription, "secret"> & {
  secretPreview: string;
};

export async function validateWebhookUrl(rawUrl: string) {
  const config = loadSignalSecurityConfig();
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiProblem(400, "invalid_webhook_url", "Webhook URL must be a valid absolute URL.");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new ApiProblem(400, "invalid_webhook_url", "Webhook URL must use http or https.");
  }

  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new ApiProblem(400, "insecure_webhook_url", "Production webhook URLs must use https.");
  }

  if (config.allowPrivateWebhookTargets) return;

  if (isPrivateHostname(parsed.hostname)) {
    throw new ApiProblem(400, "webhook_ssrf_blocked", "Webhook URL points to localhost or a private network.");
  }

  const addresses = await resolveWebhookAddresses(parsed.hostname);
  if (addresses.some((address) => isPrivateAddress(address))) {
    throw new ApiProblem(400, "webhook_ssrf_blocked", "Webhook URL resolved to localhost or a private network.");
  }
}

function publicWebhook(webhook: WebhookSubscription): PublicWebhook {
  const { secret, ...rest } = webhook;
  return {
    ...rest,
    secretPreview: secret.length <= 8 ? "********" : `${secret.slice(0, 4)}...${secret.slice(-4)}`,
  };
}

async function resolveWebhookAddresses(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) return [hostname];

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    throw new ApiProblem(400, "webhook_dns_failed", "Webhook URL hostname could not be resolved.");
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
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
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

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function safeError(error: string) {
  return error.slice(0, 300);
}

