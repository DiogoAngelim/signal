import { z } from "zod";
import { signalErrorSchema } from "./errors";

export const signalOutcomeSchema = z.enum(["completed", "replayed"]);

export const signalResultMetaSchema = z
  .object({
    outcome: signalOutcomeSchema,
    durationMs: z.number().nonnegative().optional(),
    context: z
      .object({
        messageId: z.string().min(1).optional(),
        correlationId: z.string().min(1).optional(),
        causationId: z.string().min(1).optional(),
      })
      .optional(),
    idempotency: z
      .object({
        key: z.string().min(1).optional(),
        status: z.enum(["not-applicable", "recorded", "replayed"]).optional(),
        fingerprint: z.string().min(1).optional(),
      })
      .optional(),
    replay: z
      .object({
        replayed: z.boolean(),
        reason: z
          .enum(["idempotency", "event-redelivery", "event-replay"])
          .optional(),
        originalMessageId: z.string().min(1).optional(),
      })
      .optional(),
    deadline: z
      .object({
        deadlineAt: z.string().datetime(),
      })
      .optional(),
    delivery: z
      .object({
        mode: z
          .enum(["in-process", "at-least-once", "exactly-once"])
          .optional(),
        attempt: z.number().int().positive().optional(),
        consumerId: z.string().min(1).optional(),
        replayed: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const signalSuccessSchema = z.object({
  ok: z.literal(true),
  result: z.unknown(),
  meta: signalResultMetaSchema.optional(),
});

export const signalFailureSchema = z.object({
  ok: z.literal(false),
  error: signalErrorSchema,
});

export const signalResultSchema = z.union([
  signalSuccessSchema,
  signalFailureSchema,
]);

export type SignalSuccess<T = unknown> = {
  ok: true;
  result: T;
  meta?: SignalResultMeta;
};

export type SignalFailure = {
  ok: false;
  error: z.infer<typeof signalErrorSchema>;
};

export type SignalResult<T = unknown> = SignalSuccess<T> | SignalFailure;
export type SignalOutcome = z.infer<typeof signalOutcomeSchema>;
export type SignalResultMeta = z.infer<typeof signalResultMetaSchema>;

export function ok<T>(
  result: T,
  meta?: Omit<SignalResultMeta, "outcome"> &
    Partial<Pick<SignalResultMeta, "outcome">>,
): SignalSuccess<T> {
  return {
    ok: true,
    result,
    meta: meta ? { outcome: meta.outcome ?? "completed", ...meta } : undefined,
  };
}

export function fail(error: z.infer<typeof signalErrorSchema>): SignalFailure {
  return { ok: false, error };
}
