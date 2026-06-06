import { z } from "zod";

export const SignalKindSchema = z.enum([
  "buy",
  "sell",
  "hold",
  "watch",
  "risk_off",
  "rebalance",
]);

export const SignalStatusSchema = z.enum([
  "candidate",
  "confirmed",
  "rejected",
  "expired",
]);

const percentMetric = z.number().finite().min(0).max(100);
const positiveMetric = z.number().finite().min(0);
const nonEmptyString = z.string().trim().min(1);

export const SignalModulesSchema = z.object({
  discovery: z.unknown().optional(),
  judgement: z.unknown().optional(),
  recovery: z.unknown().optional(),
  calibration: z.unknown().optional(),
  survivalMemory: z.unknown().optional(),
  reflection: z.unknown().optional(),
  agency: z.unknown().optional(),
}).strict();

export const SignalEnvelopeSchema = z.object({
  protocol: z.literal("stocks-optimizer.signal"),
  version: z.literal("1.0"),
  id: nonEmptyString.max(160),
  messageId: nonEmptyString.max(180),
  timestamp: z.string().datetime({ offset: true }),
  source: nonEmptyString.max(120),
  venue: nonEmptyString.max(80),
  symbol: nonEmptyString.max(80).transform((value) => value.toUpperCase()),
  timeframe: nonEmptyString.max(40),
  kind: SignalKindSchema,
  confidence: percentMetric,
  trust: percentMetric,
  risk: percentMetric,
  exposure: positiveMetric,
  sizingMode: nonEmptyString.max(80),
  maxExposure: positiveMetric,
  reason: nonEmptyString.max(600),
  explanation: nonEmptyString.max(2400),
  metrics: z.record(z.string().min(1).max(120), z.number().finite()),
  modules: SignalModulesSchema,
  status: SignalStatusSchema,
  idempotencyKey: nonEmptyString.max(240),
  signature: z.string().trim().min(8).max(300).optional(),
}).strict().superRefine((signal, ctx) => {
  const timestamp = Date.parse(signal.timestamp);

  if (!Number.isFinite(timestamp)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timestamp"],
      message: "timestamp must be a valid ISO-8601 date",
    });
  }

  if (signal.exposure > signal.maxExposure) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exposure"],
      message: "exposure cannot exceed maxExposure",
    });
  }
});

export const EmitSignalRequestSchema = z.object({
  signal: SignalEnvelopeSchema.optional(),
}).catchall(z.unknown()).transform((value) => value.signal ?? value);

export const SignalFilterSchema = z.object({
  symbol: z.string().trim().optional(),
  venue: z.string().trim().optional(),
  kind: SignalKindSchema.optional(),
  minTrust: z.coerce.number().finite().min(0).max(100).optional(),
  timeframe: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  after: z.string().trim().optional(),
});

export const WebhookFilterSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
  venues: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  kinds: z.array(SignalKindSchema).max(20).optional(),
  minTrust: z.number().finite().min(0).max(100).optional(),
}).strict();

export const CreateWebhookSchema = z.object({
  url: z.string().url().max(2000),
  secret: z.string().trim().min(8).max(256).optional(),
  events: z.array(z.enum(["signal.emitted", "webhook.test"])).min(1).max(10).default(["signal.emitted"]),
  filters: WebhookFilterSchema.default({}),
  description: z.string().trim().max(240).optional(),
}).strict();

export const SignalApiScopeSchema = z.enum([
  "signals:read",
  "signals:emit",
  "signals:stream",
  "webhooks:read",
  "webhooks:write",
  "audit:read",
  "admin:keys",
]);

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scopes: z.array(SignalApiScopeSchema).min(1).max(20),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  rateLimitMax: z.number().int().min(1).max(100_000).optional(),
  rateLimitWindowMs: z.number().int().min(1_000).max(86_400_000).optional(),
}).strict();

export const RotateApiKeySchema = z.object({
  graceSeconds: z.number().int().min(0).max(604_800).default(0),
}).strict();

export const RotateWebhookSecretSchema = z.object({
  graceSeconds: z.number().int().min(0).max(604_800).default(86_400),
}).strict();

export const RedriveQueueSchema = z.object({
  queue: z.string().trim().min(1).max(120).optional(),
  ids: z.array(z.string().trim().min(1).max(160)).max(500).optional(),
}).strict();

export type SignalKind = z.infer<typeof SignalKindSchema>;
export type SignalStatus = z.infer<typeof SignalStatusSchema>;
export type SignalEnvelope = z.infer<typeof SignalEnvelopeSchema>;
export type SignalFilters = z.infer<typeof SignalFilterSchema>;
export type WebhookFilters = z.infer<typeof WebhookFilterSchema>;
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type RotateApiKeyInput = z.infer<typeof RotateApiKeySchema>;
export type RotateWebhookSecretInput = z.infer<typeof RotateWebhookSecretSchema>;

export function parseSignalFilters(input: Record<string, unknown>): SignalFilters {
  return SignalFilterSchema.parse(input);
}
