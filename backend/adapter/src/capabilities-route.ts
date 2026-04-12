import type { SignalRuntime } from "@digelim/12.signal";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function handleCapabilitiesRequest(
  runtime: SignalRuntime,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.code(200).send(runtime.capabilities());
}
