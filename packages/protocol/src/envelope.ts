import { randomUUID } from "node:crypto";
import { z } from "zod";
import { signalKinds } from "./kinds";
import { signalNameSchema } from "./names";

export const signalProtocolVersion = "signal.v1" as const;

export const signalProtocolSchema = z.literal(signalProtocolVersion);

const signalContextSchema = z
  .object({
    correlationId: z.string().min(1).optional(),
    causationId: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
  })
  .passthrough()
  .optional();

const signalDeliverySchema = z
  .object({
    mode: z.enum(["in-process", "at-least-once", "exactly-once"]).optional(),
    attempt: z.number().int().nonnegative().optional(),
    consumerId: z.string().min(1).optional(),
  })
  .passthrough()
  .optional();

const signalAuthSchema = z.record(z.unknown()).optional();

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
