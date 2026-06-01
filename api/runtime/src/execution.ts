import {
  createProtocolError,
  createSignalError,
  type SignalDelivery,
  type SignalEnvelope,
  type SignalErrorCode,
  type SignalResultMeta,
} from "@signal/protocol";
import type { SignalExecutionContext, SignalRequestContext } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) {
      freezeValue(entry);
    }
    return Object.freeze(value);
  }

  if (
    isPlainObject(value) &&
    !(value instanceof Date) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  ) {
    for (const entry of Object.values(value)) {
      freezeValue(entry);
    }
    return Object.freeze(value);
  }

  return value;
}

export function freezeRequestContext<T extends SignalRequestContext>(request: T): Readonly<T> {
  return freezeValue(request) as Readonly<T>;
}

export function normalizeRequestContext(
  request: Partial<SignalRequestContext> = {}
): SignalRequestContext {
  return freezeRequestContext({
    correlationId: request.correlationId,
    causationId: request.causationId,
    traceId: request.traceId,
    trace: request.trace,
    idempotencyKey: request.idempotencyKey,
    deadlineAt: request.deadlineAt,
    abortSignal: request.abortSignal,
    delivery: request.delivery,
    source: request.source
      ? {
          system: request.source.system,
          transport: request.source.transport,
          runtime: request.source.runtime,
        }
      : undefined,
    auth: request.auth,
    meta: request.meta ? { ...request.meta } : undefined,
  });
}

export function toEnvelopeContext(request: SignalRequestContext) {
  return {
    correlationId: request.correlationId,
    causationId: request.causationId,
    idempotencyKey: request.idempotencyKey,
    deadlineAt: request.deadlineAt,
    traceId: request.traceId,
    trace: request.trace,
  };
}

export function toEnvelopeDelivery(request: SignalRequestContext): SignalDelivery {
  return request.delivery;
}

export function throwIfExecutionBlocked(request: SignalRequestContext): void {
  if (request.deadlineAt && Date.parse(request.deadlineAt) < Date.now()) {
    throw createProtocolError("DEADLINE_EXCEEDED", "Execution deadline exceeded", {
      details: {
        deadlineAt: request.deadlineAt,
      },
    });
  }

  if (request.abortSignal?.aborted) {
    throw createProtocolError("CANCELLED", "Execution cancelled", {
      details: {
        reason:
          request.abortSignal.reason === undefined
            ? undefined
            : String(request.abortSignal.reason),
      },
    });
  }
}

export function createExecutionSuccessMeta(input: {
  outcome: "completed" | "replayed";
  envelope: SignalEnvelope;
  request: SignalRequestContext;
  startedAt?: number;
  idempotency?: {
    key?: string;
    status: "not-applicable" | "recorded" | "replayed";
    fingerprint?: string;
  };
  replay?: {
    replayed: boolean;
    reason?: "idempotency" | "event-redelivery" | "event-replay";
    originalMessageId?: string;
  };
}): SignalResultMeta {
  return {
    outcome: input.outcome,
    durationMs:
      input.startedAt === undefined ? undefined : Math.max(0, Date.now() - input.startedAt),
    context: {
      messageId: input.envelope.messageId,
      correlationId: input.envelope.context?.correlationId,
      causationId: input.envelope.context?.causationId,
    },
    idempotency: input.idempotency,
    replay: input.replay,
    deadline: input.request.deadlineAt
      ? {
          deadlineAt: input.request.deadlineAt,
        }
      : undefined,
    delivery: input.request.delivery
      ? {
          mode: input.request.delivery.mode,
          attempt: input.request.delivery.attempt,
          consumerId: input.request.delivery.consumerId,
          replayed: input.request.delivery.replayed,
        }
      : undefined,
  };
}

export function toSignalFailure(
  error: unknown,
  fallbackCode: SignalErrorCode,
  fallbackMessage: string
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const retryableValue = (error as { retryable?: unknown }).retryable;
    const detailsValue = (error as { details?: unknown }).details;
    const categoryValue = (error as { category?: unknown }).category;

    return createSignalError(
      (error as { code: SignalErrorCode }).code,
      error instanceof Error ? error.message : fallbackMessage,
      {
        category: typeof categoryValue === "string" ? (categoryValue as never) : undefined,
        retryable: typeof retryableValue === "boolean" ? retryableValue : undefined,
        details:
          typeof detailsValue === "object" && detailsValue !== null
            ? (detailsValue as Record<string, unknown>)
            : undefined,
      }
    );
  }

  if (error instanceof Error) {
    return createSignalError(fallbackCode, error.message, {
      retryable: fallbackCode === "TRANSPORT_ERROR" || fallbackCode === "INTERNAL_ERROR",
    });
  }

  return createSignalError(fallbackCode, fallbackMessage, {
    retryable: fallbackCode === "TRANSPORT_ERROR" || fallbackCode === "INTERNAL_ERROR",
  });
}

export function createNestedExecutionContext(
  context: SignalExecutionContext,
  envelope: SignalEnvelope
): SignalExecutionContext {
  return {
    request: normalizeRequestContext({
      ...context.request,
      causationId: envelope.messageId,
    }),
    envelope,
    startedAt: context.startedAt,
    emit: async () => {
      throw new Error("Nested emit is not supported");
    },
  };
}
