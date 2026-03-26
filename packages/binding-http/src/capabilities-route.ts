import type { FastifyReply, FastifyRequest } from "fastify";
import type { SignalRuntime } from "@signal/runtime";

export async function handleCapabilitiesRequest(
  runtime: SignalRuntime,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  return reply.code(200).send(runtime.capabilities());
}
