import { z } from "zod";

export const signalErrorCodes = [
  "VALIDATION_ERROR",
  "POLICY_REJECTED",
  "EXECUTION_FAILED",
  "TIMEOUT",
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

export const signalErrorCategories = [
  "validation",
  "policy",
  "execution",
  "timeout",
  "authorization",
  "idempotency",
  "runtime",
  "capability",
] as const;

export type SignalErrorCategory = (typeof signalErrorCategories)[number];

export const signalErrorCategorySchema = z.enum(signalErrorCategories);

const signalErrorDefaults = {
  VALIDATION_ERROR: { category: "validation", retryable: false },
  POLICY_REJECTED: { category: "policy", retryable: false },
  EXECUTION_FAILED: { category: "execution", retryable: false },
  TIMEOUT: { category: "timeout", retryable: true },
  UNAUTHORIZED: { category: "authorization", retryable: false },
  FORBIDDEN: { category: "authorization", retryable: false },
  NOT_FOUND: { category: "execution", retryable: false },
  CONFLICT: { category: "execution", retryable: false },
  IDEMPOTENCY_CONFLICT: { category: "idempotency", retryable: false },
  INTERNAL_ERROR: { category: "runtime", retryable: true },
  RETRYABLE_ERROR: { category: "runtime", retryable: true },
  UNSUPPORTED_OPERATION: { category: "capability", retryable: false },
} as const satisfies Record<
  SignalErrorCode,
  { category: SignalErrorCategory; retryable: boolean }
>;

export const signalErrorSchema = z.object({
  code: signalErrorCodeSchema,
  category: signalErrorCategorySchema,
  message: z.string().min(1),
  traceId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
  details: z.record(z.unknown()).optional(),
});

export type SignalErrorEnvelope = z.infer<typeof signalErrorSchema>;

export function getSignalErrorDefaults(code: SignalErrorCode): {
  category: SignalErrorCategory;
  retryable: boolean;
} {
  return signalErrorDefaults[code];
}

export function createSignalError(
  code: SignalErrorCode,
  message: string,
  options: {
    category?: SignalErrorCategory;
    retryable?: boolean;
    traceId?: string;
    messageId?: string;
    details?: Record<string, unknown>;
  } = {},
): SignalErrorEnvelope {
  const defaults = getSignalErrorDefaults(code);

  return {
    code,
    category: options.category ?? defaults.category,
    message,
    traceId: options.traceId,
    messageId: options.messageId,
    retryable: options.retryable ?? defaults.retryable,
    details: options.details,
  };
}

export function createProtocolError(
  code: SignalErrorCode,
  message: string,
  options: {
    category?: SignalErrorCategory;
    retryable?: boolean;
    traceId?: string;
    messageId?: string;
    details?: Record<string, unknown>;
  } = {},
): Error & SignalErrorEnvelope {
  const error = new Error(message) as Error & SignalErrorEnvelope;
  const defaults = getSignalErrorDefaults(code);

  error.code = code;
  error.category = options.category ?? defaults.category;
  error.traceId = options.traceId;
  error.messageId = options.messageId;
  error.retryable = options.retryable ?? defaults.retryable;
  error.details = options.details;
  return error;
}

export function signalErrorHttpStatus(
  error: Pick<SignalErrorEnvelope, "code" | "category">,
): number {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "TIMEOUT":
      return 408;
    case "RETRYABLE_ERROR":
      return 503;
    case "UNSUPPORTED_OPERATION":
      return 404;
    case "INTERNAL_ERROR":
    case "EXECUTION_FAILED":
      return 500;
    default:
      return error.category === "capability" ? 404 : 500;
  }
}
