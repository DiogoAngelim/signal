import { z } from "zod";
import { signalErrorSchema } from "./errors";

export const signalSuccessSchema = z.object({
  ok: z.literal(true),
  result: z.unknown(),
  meta: z.record(z.unknown()).optional(),
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
  meta?: Record<string, unknown>;
};

export type SignalFailure = {
  ok: false;
  error: z.infer<typeof signalErrorSchema>;
};

export type SignalResult<T = unknown> = SignalSuccess<T> | SignalFailure;

export function ok<T>(result: T, meta?: Record<string, unknown>): SignalSuccess<T> {
  return { ok: true, result, meta };
}

export function fail(error: z.infer<typeof signalErrorSchema>): SignalFailure {
  return { ok: false, error };
}
