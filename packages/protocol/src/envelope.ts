import { randomUUID } from "node:crypto";
import { z } from "zod";
import { signalKinds } from "./kinds";
import { signalNameSchema } from "./names";

export const signalProtocolVersion = "signal.v1" as const;

export const signalProtocolSchema = z.literal(signalProtocolVersion);

export const signalTraceSchema = z
  .object({
    traceId: z.string().min(1).optional(),
    spanId: z.string().min(1).optional(),
    parentSpanId: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
  })
  .passthrough()
  .optional();

export const signalContextSchema = z
  .object({
    correlationId: z.string().min(1).optional(),
    causationId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).optional(),
    deadlineAt: z.string().datetime().optional(),
    traceId: z.string().min(1).optional(),
    trace: signalTraceSchema,
  })
  .passthrough()
  .optional();

export const signalDeliverySchema = z
  .object({
    mode: z.enum(["in-process", "at-least-once", "exactly-once"]).optional(),
    attempt: z.number().int().positive().optional(),
    consumerId: z.string().min(1).optional(),
    replayed: z.boolean().optional(),
    subscription: z.string().min(1).optional(),
    transportMessageId: z.string().min(1).optional(),
  })
  .passthrough()
  .optional();

export const signalActorSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1).optional(),
    roles: z.array(z.string().min(1)).optional(),
  })
  .passthrough();

export const signalAuthSchema = z
  .object({
    actor: z.union([signalActorSchema, z.string().min(1)]).optional(),
    subject: z.string().min(1).optional(),
    scopes: z.array(z.string().min(1)).optional(),
  })
  .passthrough()
  .optional();

export const signalEnvelopeSchema = z.object({
  protocol: signalProtocolSchema,
  kind: z.enum(signalKinds),
  name: signalNameSchema,
  messageId: z.string().min(1),
  timestamp: z.string().datetime(),
  source: z
    .object({
      system: z.string().min(1).optional(),
      transport: z.string().min(1).optional(),
      runtime: z.string().min(1).optional(),
    })
    .passthrough()
    .optional(),
  context: signalContextSchema,
  delivery: signalDeliverySchema,
  auth: signalAuthSchema,
  payload: z.unknown(),
  meta: z.record(z.unknown()).optional(),
});

export type SignalEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof signalEnvelopeSchema>,
  "payload"
> & {
  payload: TPayload;
};

export type SignalContext = z.infer<typeof signalContextSchema>;
export type SignalDelivery = z.infer<typeof signalDeliverySchema>;
export type SignalAuth = z.infer<typeof signalAuthSchema>;

export type SignalEnvelopeInput<TPayload = unknown> = Omit<
  SignalEnvelope<TPayload>,
  "protocol" | "messageId" | "timestamp"
> & {
  protocol?: typeof signalProtocolVersion;
  messageId?: string;
  timestamp?: string;
};

export function createSignalEnvelope<TPayload>(
  input: SignalEnvelopeInput<TPayload>
): SignalEnvelope<TPayload> {
  return signalEnvelopeSchema.parse({
    protocol: signalProtocolVersion,
    messageId: input.messageId ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...input,
  }) as SignalEnvelope<TPayload>;
}

export function validateSignalEnvelope<TPayload = unknown>(
  input: unknown
): SignalEnvelope<TPayload> {
  return signalEnvelopeSchema.parse(input) as SignalEnvelope<TPayload>;
}

export function isSignalEnvelope(input: unknown): input is SignalEnvelope {
  return signalEnvelopeSchema.safeParse(input).success;
}
