import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  EmitSignalRequestSchema,
  SignalEnvelopeSchema,
  type SignalEnvelope,
  type SignalFilters,
} from "../schemas/signal-api.js";
import {
  getSignalStore,
  type SignalRecord,
  type SignalStorageAdapter,
  type SignalTrustMetadata,
} from "../storage/signal-store.js";
import { SignalStreamHub } from "../streams/signal-stream.js";
import { SignalWebhookDispatcher } from "../webhooks/signal-webhooks.js";
import { ApiProblem } from "../observability/signal-http.js";
import { incrementSignalCounter, observeSignalLatency, snapshotSignalMetrics } from "../observability/signal-metrics.js";
import { logger } from "../lib/logger.js";

export type SignalEmitContext = {
  requestId: string;
  actor?: string;
};

export type SignalEmitResult = {
  accepted: boolean;
  duplicate: boolean;
  latencyMs: number;
  record: SignalRecord;
};

export class SignalDistributionService {
  constructor(
    private readonly store: SignalStorageAdapter,
    private readonly streamHub: SignalStreamHub,
    private readonly webhookDispatcher: SignalWebhookDispatcher,
  ) {}

  async emit(rawRequest: unknown, context: SignalEmitContext): Promise<SignalEmitResult> {
    const startedAt = performance.now();
    const rawSignal = EmitSignalRequestSchema.parse(rawRequest);
    const signal = parseSignal(rawSignal);
    const existing = await this.store.findByIdempotencyKey(signal.idempotencyKey);

    if (existing) {
      await this.store.appendAudit({
        signalId: existing.signal.id,
        messageId: existing.signal.messageId,
        action: "signal.duplicate",
        actor: context.actor,
        requestId: context.requestId,
        metadata: { idempotencyKey: signal.idempotencyKey },
      });
      return {
        accepted: false,
        duplicate: true,
        latencyMs: duration(startedAt),
        record: existing,
      };
    }

    const record: SignalRecord = {
      signal,
      trust: buildSignalTrustMetadata(signal),
      acceptedAt: new Date().toISOString(),
      sequence: 0,
      requestId: context.requestId,
    };
    const saved = await this.store.saveSignal(record);

    if (saved.saved === false) {
      incrementSignalCounter("signal.emit.duplicate");
      return {
        accepted: false,
        duplicate: true,
        latencyMs: duration(startedAt),
        record: saved.duplicate,
      };
    }

    const stored = await this.store.getSignal(signal.id);
    const nextRecord = stored ?? record;

    await this.store.appendAudit({
      signalId: signal.id,
      messageId: signal.messageId,
      action: "signal.emitted",
      actor: context.actor,
      requestId: context.requestId,
      metadata: {
        idempotencyKey: signal.idempotencyKey,
        symbol: signal.symbol,
        venue: signal.venue,
        kind: signal.kind,
        trust: signal.trust,
      },
    });

    // Hot path: persistence and SSE fanout happen before return; webhooks are queued without blocking acceptance.
    await this.streamHub.publish(nextRecord);
    void this.webhookDispatcher.enqueueSignal(nextRecord).catch((error) => {
      logger.warn({ err: error, signalId: signal.id }, "Failed to enqueue signal webhooks");
    });
    incrementSignalCounter("signal.emit.accepted", { kind: signal.kind, status: signal.status });
    observeSignalLatency("signal.emit", duration(startedAt));

    return {
      accepted: true,
      duplicate: false,
      latencyMs: duration(startedAt),
      record: nextRecord,
    };
  }

  async latest(filters: Partial<SignalFilters>) {
    return this.store.getLatestSignal(filters);
  }

  async get(id: string) {
    return this.store.getSignal(id);
  }

  async list(filters: Partial<SignalFilters>) {
    return this.store.listSignals(filters);
  }

  async audit(limit?: number) {
    return this.store.listAudit(limit);
  }

  async metrics() {
    const stats = await this.store.stats();
    const queue = await this.store.queueStats();
    return {
      storage: stats,
      queue,
      process: {
        uptimeMs: Math.round(process.uptime() * 1000),
        memory: process.memoryUsage(),
      },
      metrics: snapshotSignalMetrics(),
      streamClients: this.streamHub.clientCount(),
      timestamp: new Date().toISOString(),
    };
  }

  capabilities() {
    return {
      protocol: "stocks-optimizer.signal",
      versions: ["1.0"],
      transports: ["rest", "sse", "webhook"],
      auth: ["api_key", "optional_hmac_ingestion_signature"],
      deliverySemantics: {
        webhookDelivery: "at_least_once",
        streamDelivery: "best_effort_with_replay",
        idempotency: "required_signal_idempotency_key",
        replayCursor: "Last-Event-ID or lastEventId",
      },
      endpoints: [
        "GET /health",
        "GET /ready",
        "GET /api/v1/signals/latest",
        "GET /api/v1/signals/:id",
        "GET /api/v1/signals",
        "POST /api/v1/signals/emit",
        "GET /api/v1/signals/stream",
        "POST /api/v1/webhooks",
        "GET /api/v1/webhooks",
        "DELETE /api/v1/webhooks/:id",
        "POST /api/v1/webhooks/:id/test",
        "POST /api/v1/webhooks/:id/rotate-secret",
        "GET /api/v1/audit/signals",
        "GET /api/v1/capabilities",
        "GET /api/v1/openapi.json",
        "POST /api/v1/admin/api-keys",
        "GET /api/v1/admin/api-keys",
        "POST /api/v1/admin/api-keys/:id/rotate",
        "POST /api/v1/admin/api-keys/:id/revoke",
        "POST /api/v1/admin/queue/redrive",
      ],
      filters: ["symbol", "venue", "kind", "timeframe", "minTrust"],
      webhookHeaders: [
        "X-Stocks-Optimizer-Timestamp",
        "X-Stocks-Optimizer-Signature",
        "X-Stocks-Optimizer-Event",
        "X-Stocks-Optimizer-Delivery-Id",
      ],
    };
  }

  openApiSpec() {
    return {
      openapi: "3.1.0",
      info: {
        title: "stocks-optimizer Signal Distribution API",
        version: "1.0.0",
      },
      paths: {
        "/api/v1/signals": {
          get: { security: [{ signalApiKey: ["signals:read"] }], responses: { "200": { description: "List signals" } } },
        },
        "/api/v1/signals/latest": {
          get: { security: [{ signalApiKey: ["signals:read"] }], responses: { "200": { description: "Latest signal" } } },
        },
        "/api/v1/signals/{id}": {
          get: { security: [{ signalApiKey: ["signals:read"] }], responses: { "200": { description: "Signal by id" } } },
        },
        "/api/v1/signals/emit": {
          post: { security: [{ signalApiKey: ["signals:emit"] }], responses: { "202": { description: "Signal accepted" } } },
        },
        "/api/v1/signals/stream": {
          get: { security: [{ signalApiKey: ["signals:stream"] }], responses: { "200": { description: "SSE stream" } } },
        },
        "/api/v1/webhooks": {
          get: { security: [{ signalApiKey: ["webhooks:read"] }], responses: { "200": { description: "List webhooks" } } },
          post: { security: [{ signalApiKey: ["webhooks:write"] }], responses: { "201": { description: "Create webhook" } } },
        },
        "/api/v1/audit/signals": {
          get: { security: [{ signalApiKey: ["audit:read"] }], responses: { "200": { description: "Signal audit trail" } } },
        },
        "/api/v1/admin/api-keys": {
          get: { security: [{ signalApiKey: ["admin:keys"] }], responses: { "200": { description: "List API keys" } } },
          post: { security: [{ signalApiKey: ["admin:keys"] }], responses: { "201": { description: "Create API key" } } },
        },
      },
      components: {
        securitySchemes: {
          signalApiKey: {
            type: "http",
            scheme: "bearer",
          },
        },
      },
    };
  }
}

let singletonStore = getSignalStore();
let singletonStreamHub = new SignalStreamHub(singletonStore);
let singletonWebhookDispatcher = new SignalWebhookDispatcher(singletonStore);
let singletonService = new SignalDistributionService(
  singletonStore,
  singletonStreamHub,
  singletonWebhookDispatcher,
);

export function getSignalDistributionService() {
  return singletonService;
}

export function getSignalStreamHub() {
  return singletonStreamHub;
}

export function getSignalWebhookDispatcher() {
  return singletonWebhookDispatcher;
}

export function resetSignalServicesForTests() {
  singletonStore = getSignalStore();
  singletonStreamHub = new SignalStreamHub(singletonStore);
  singletonWebhookDispatcher = new SignalWebhookDispatcher(singletonStore);
  singletonService = new SignalDistributionService(
    singletonStore,
    singletonStreamHub,
    singletonWebhookDispatcher,
  );
}

export function buildSignalTrustMetadata(signal: SignalEnvelope): SignalTrustMetadata {
  const now = Date.now();
  const signalTimestamp = Date.parse(signal.timestamp);
  const timestampFreshnessMs = Number.isFinite(signalTimestamp) ? Math.max(0, now - signalTimestamp) : Number.POSITIVE_INFINITY;
  const dataFreshnessMs = Number(signal.metrics.dataFreshnessMs ?? signal.metrics.quoteAgeMs ?? signal.metrics.sourceAgeMs);
  const dataFreshness =
    Number.isFinite(dataFreshnessMs)
      ? dataFreshnessMs <= 120_000 ? "fresh" : "stale"
      : "unknown";
  const calibratedConfidence = clamp(
    Number(signal.metrics.calibratedConfidence ?? ((signal.confidence * 0.65) + (signal.trust * 0.35))),
  );
  const riskState = signal.kind === "risk_off" || signal.risk >= 80
    ? "risk_off"
    : signal.risk >= 55
      ? "elevated"
      : "normal";
  const actionability = signal.status === "rejected" || signal.status === "expired" || riskState === "risk_off"
    ? "blocked"
    : signal.status === "confirmed" && signal.trust >= 60 && signal.confidence >= 50
      ? "actionable"
      : "informational";

  return {
    rawConfidence: signal.confidence,
    calibratedConfidence,
    trustScore: signal.trust,
    riskState,
    exposureCap: signal.maxExposure,
    reason: signal.reason,
    ...(signal.status === "rejected" ? { rejectionReason: signal.explanation } : {}),
    moduleContributionSummary: summarizeModules(signal),
    timestampFreshnessMs,
    dataFreshness,
    actionability,
  };
}

function parseSignal(rawSignal: unknown): SignalEnvelope {
  try {
    return SignalEnvelopeSchema.parse(rawSignal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiProblem(
        400,
        "invalid_signal",
        "Signal payload failed schema validation.",
        error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    throw error;
  }
}

function summarizeModules(signal: SignalEnvelope): SignalTrustMetadata["moduleContributionSummary"] {
  const output: SignalTrustMetadata["moduleContributionSummary"] = {};

  for (const key of Object.keys(signal.modules) as Array<keyof SignalEnvelope["modules"]>) {
    const value = signal.modules[key];
    const score = extractModuleScore(value);
    output[key] = {
      present: value != null,
      ...(score == null ? {} : { score }),
    };
  }

  return output;
}

function extractModuleScore(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>).score ??
    (value as Record<string, unknown>).confidence ??
    (value as Record<string, unknown>).trust;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? clamp(parsed) : undefined;
}

function duration(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
