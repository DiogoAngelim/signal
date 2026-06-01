import type { SignalRuntime } from "@digelim/12.signal";
import type { FastifyInstance } from "fastify";
import { handleCapabilitiesRequest } from "./capabilities-route";
import { handleMutationRequest, handleQueryRequest } from "./handlers";

export function registerSignalHttpRoutes(
  app: FastifyInstance,
  runtime: SignalRuntime,
  options: {
    basePath?: string;
  } = {},
): FastifyInstance {
  const basePath = options.basePath ?? "/signal";

  app.get(`${basePath}/capabilities`, async (request, reply) =>
    handleCapabilitiesRequest(runtime, request, reply),
  );

  app.post(`${basePath}/query/:name`, async (request, reply) =>
    handleQueryRequest(runtime, request as never, reply),
  );

  app.post(`${basePath}/mutation/:name`, async (request, reply) =>
    handleMutationRequest(runtime, request as never, reply),
  );

  return app;
}
