import type { FastifyReply, FastifyRequest } from "fastify";
import type { SignalRuntime } from "@signal/runtime";

export interface SignalHttpBody<TPayload = unknown> {
  payload: TPayload;
  context?: {
    correlationId?: string;
    causationId?: string;
    traceId?: string;
    auth?: Record<string, unknown>;
    source?: {
      system?: string;
      transport?: string;
      runtime?: string;
    };
    meta?: Record<string, unknown>;
  };
  idempotencyKey?: string;
}

function toRequestContext(body: SignalHttpBody) {
  return {
    correlationId: body.context?.correlationId,
    causationId: body.context?.causationId,
    traceId: body.context?.traceId,
    auth: body.context?.auth,
    source: body.context?.source,
    meta: body.context?.meta,
    idempotencyKey: body.idempotencyKey,
  };
}

export async function handleQueryRequest(
  runtime: SignalRuntime,
  request: FastifyRequest<{ Params: { name: string }; Body: SignalHttpBody }>,
  reply: FastifyReply
) {
  const result = await runtime.query(
    request.params.name,
    request.body.payload,
    toRequestContext(request.body)
  );

  return reply.code(result.ok ? 200 : 400).send(result);
}

export async function handleMutationRequest(
  runtime: SignalRuntime,
  request: FastifyRequest<{ Params: { name: string }; Body: SignalHttpBody }>,
  reply: FastifyReply
) {
  const result = await runtime.mutation(
    request.params.name,
    request.body.payload,
    toRequestContext(request.body)
  );

  return reply.code(result.ok ? 200 : 409).send(result);
}
