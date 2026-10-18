import {
  createSignalError,
  signalAuthSchema,
  signalContextSchema,
  signalDeliverySchema,
  signalErrorHttpStatus,
} from "@signal/protocol";
import type { SignalRuntime } from "@signal/sdk-node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

export interface SignalHttpBody<TPayload = unknown> {
  payload: TPayload;
  context?: {
    correlationId?: string;
    causationId?: string;
    idempotencyKey?: string;
    deadlineAt?: string;
    traceId?: string;
    trace?: {
      traceId?: string;
      spanId?: string;
      parentSpanId?: string;
      state?: string;
    };
    auth?: Record<string, unknown>;
    source?: {
      system?: string;
      transport?: string;
      runtime?: string;
    };
    meta?: Record<string, unknown>;
  };
  delivery?: {
    mode?: "in-process" | "at-least-once" | "exactly-once";
    attempt?: number;
    consumerId?: string;
    replayed?: boolean;
    subscription?: string;
    transportMessageId?: string;
  };
  auth?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  idempotencyKey?: string;
}

const signalHttpBodySchema = z
  .object({
    payload: z.unknown(),
    context: signalContextSchema,
    delivery: signalDeliverySchema,
    auth: signalAuthSchema,
    meta: z.record(z.unknown()).optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((body, context) => {
    // z.unknown() accepts undefined, so explicitly require the payload key.
    if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: "payload is required",
      });
    }
  });

function toRequestContext(body: SignalHttpBody) {
  return {
    correlationId: body.context?.correlationId,
    causationId: body.context?.causationId,
    traceId: body.context?.traceId,
    trace: body.context?.trace,
    idempotencyKey: body.idempotencyKey ?? body.context?.idempotencyKey,
    deadlineAt: body.context?.deadlineAt,
    delivery: body.delivery,
    auth: body.auth ?? body.context?.auth,
    source: body.context?.source,
    meta: body.meta ?? body.context?.meta,
  };
}

function parseBody(body: unknown): SignalHttpBody {
  return signalHttpBodySchema.parse(body) as SignalHttpBody;
}

export async function handleQueryRequest(
  runtime: SignalRuntime,
  request: FastifyRequest<{ Params: { name: string }; Body: SignalHttpBody }>,
  reply: FastifyReply,
) {
  let body: SignalHttpBody;
  try {
    body = parseBody(request.body);
  } catch (error) {
    const failure = {
      ok: false as const,
      error: createSignalError(
        "BAD_REQUEST",
        error instanceof Error ? error.message : "Invalid Signal HTTP request body",
      ),
    };
    return reply.code(400).send(failure);
  }

  try {
    const result = await runtime.query(
      request.params.name,
      body.payload,
      toRequestContext(body),
    );
    return reply
      .code(result.ok ? 200 : signalErrorHttpStatus(result.error))
      .send(result);
  } catch {
    const failure = {
      ok: false as const,
      error: createSignalError(
        "INTERNAL_ERROR",
        "Signal query execution failed",
        { retryable: true },
      ),
    };
    return reply.code(500).send(failure);
  }
}

export async function handleMutationRequest(
  runtime: SignalRuntime,
  request: FastifyRequest<{ Params: { name: string }; Body: SignalHttpBody }>,
  reply: FastifyReply,
) {
  let body: SignalHttpBody;
  try {
    body = parseBody(request.body);
  } catch (error) {
    const failure = {
      ok: false as const,
      error: createSignalError(
        "BAD_REQUEST",
        error instanceof Error ? error.message : "Invalid Signal HTTP request body",
      ),
    };
    return reply.code(400).send(failure);
  }

  try {
    const result = await runtime.mutation(
      request.params.name,
      body.payload,
      toRequestContext(body),
    );
    return reply
      .code(result.ok ? 200 : signalErrorHttpStatus(result.error))
      .send(result);
  } catch {
    const failure = {
      ok: false as const,
      error: createSignalError(
        "INTERNAL_ERROR",
        "Signal mutation execution failed",
        { retryable: true },
      ),
    };
    return reply.code(500).send(failure);
  }
}
