import { z } from "zod";

export const signalErrorCodes = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
  "RETRYABLE_ERROR",
  "UNSUPPORTED_OPERATION",
] as const;

export type SignalErrorCode = (typeof signalErrorCodes)[number];

export const signalErrorCodeSchema = z.enum(signalErrorCodes);

export const signalErrorSchema = z.object({
  code: signalErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().optional(),
  details: z.record(z.unknown()).optional(),
});

export type SignalErrorEnvelope = z.infer<typeof signalErrorSchema>;

export function createSignalError(
  code: SignalErrorCode,
  message: string,
  options: {
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {}
): SignalErrorEnvelope {
  return {
    code,
    message,
    retryable: options.retryable,
    details: options.details,
  };
}

export function createProtocolError(
  code: SignalErrorCode,
  message: string,
  options: {
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {}
): Error & SignalErrorEnvelope {
  const error = new Error(message) as Error & SignalErrorEnvelope;
  error.code = code;
  error.retryable = options.retryable;
  error.details = options.details;
  return error;
}
