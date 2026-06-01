import type { FastifyReply, FastifyRequest } from "fastify";
import {
  signalAuthSchema,
  signalContextSchema,
  signalDeliverySchema,
  signalErrorHttpStatus,
} from "@signal/protocol";
import type { SignalRuntime } from "@signal/runtime";
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

const signalHttpBodySchema = z.object({
  payload: z.unknown(),
  context: signalContextSchema,
  delivery: signalDeliverySchema,
  auth: signalAuthSchema,
  meta: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().min(1).optional(),
}).passthrough();

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
  reply: FastifyReply
) {
  try {
    const body = parseBody(request.body);
    const result = await runtime.query(
      request.params.name,
      body.payload,
      toRequestContext(body)
    );

    return reply.code(result.ok ? 200 : signalErrorHttpStatus(result.error)).send(result);
  } catch (error) {
    const failure = {
      ok: false as const,
      error: {
        code: "BAD_REQUEST" as const,
        category: "validation" as const,
        message: error instanceof Error ? error.message : "Invalid Signal HTTP request body",
        retryable: false,
      },
    };

    return reply.code(400).send(failure);
  }
}

export async function handleMutationRequest(
  runtime: SignalRuntime,
  request: FastifyRequest<{ Params: { name: string }; Body: SignalHttpBody }>,
  reply: FastifyReply
) {
  try {
    const body = parseBody(request.body);
    const result = await runtime.mutation(
      request.params.name,
      body.payload,
      toRequestContext(body)
    );

    return reply.code(result.ok ? 200 : signalErrorHttpStatus(result.error)).send(result);
  } catch (error) {
    const failure = {
      ok: false as const,
      error: {
        code: "BAD_REQUEST" as const,
        category: "validation" as const,
        message: error instanceof Error ? error.message : "Invalid Signal HTTP request body",
        retryable: false,
      },
    };

    return reply.code(400).send(failure);
  }
}
