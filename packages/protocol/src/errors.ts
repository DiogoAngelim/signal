import { z } from "zod";

export const signalErrorCodes = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_REJECTION",
  "IDEMPOTENCY_CONFLICT",
  "DEADLINE_EXCEEDED",
  "CANCELLED",
  "TRANSPORT_ERROR",
  "INTERNAL_ERROR",
  "RETRYABLE_ERROR",
  "UNSUPPORTED_OPERATION",
] as const;

export type SignalErrorCode = (typeof signalErrorCodes)[number];

export const signalErrorCodeSchema = z.enum(signalErrorCodes);

export const signalErrorCategories = [
  "validation",
  "authorization",
  "business",
  "idempotency",
  "deadline",
  "cancellation",
  "transport",
  "runtime",
  "capability",
] as const;

export type SignalErrorCategory = (typeof signalErrorCategories)[number];

export const signalErrorCategorySchema = z.enum(signalErrorCategories);

const signalErrorDefaults = {
  BAD_REQUEST: { category: "validation", retryable: false },
  VALIDATION_ERROR: { category: "validation", retryable: false },
  UNAUTHORIZED: { category: "authorization", retryable: false },
  FORBIDDEN: { category: "authorization", retryable: false },
  NOT_FOUND: { category: "business", retryable: false },
  CONFLICT: { category: "business", retryable: false },
  BUSINESS_REJECTION: { category: "business", retryable: false },
  IDEMPOTENCY_CONFLICT: { category: "idempotency", retryable: false },
  DEADLINE_EXCEEDED: { category: "deadline", retryable: false },
  CANCELLED: { category: "cancellation", retryable: false },
  TRANSPORT_ERROR: { category: "transport", retryable: true },
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
    details?: Record<string, unknown>;
  } = {}
): SignalErrorEnvelope {
  const defaults = getSignalErrorDefaults(code);

  return {
    code,
    category: options.category ?? defaults.category,
    message,
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
    details?: Record<string, unknown>;
  } = {}
): Error & SignalErrorEnvelope {
  const error = new Error(message) as Error & SignalErrorEnvelope;
  const defaults = getSignalErrorDefaults(code);

  error.code = code;
  error.category = options.category ?? defaults.category;
  error.retryable = options.retryable ?? defaults.retryable;
  error.details = options.details;
  return error;
}

export function signalErrorHttpStatus(error: Pick<SignalErrorEnvelope, "code" | "category">): number {
  switch (error.code) {
    case "BAD_REQUEST":
    case "VALIDATION_ERROR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "BUSINESS_REJECTION":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "DEADLINE_EXCEEDED":
      return 408;
    case "CANCELLED":
      return 499;
    case "TRANSPORT_ERROR":
    case "RETRYABLE_ERROR":
      return 503;
    case "UNSUPPORTED_OPERATION":
      return 404;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return error.category === "capability" ? 404 : 500;
  }
}
