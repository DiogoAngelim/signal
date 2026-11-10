import type { SignalAuth } from "@signal/protocol";
import type { SignalRuntime } from "@signal/sdk-node";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { handleCapabilitiesRequest } from "./capabilities-route";
import { handleMutationRequest, handleQueryRequest } from "./handlers";

export function registerSignalHttpRoutes(
  app: FastifyInstance,
  runtime: SignalRuntime,
  options: {
    basePath?: string;
    resolveAuthContext?: (
      request: FastifyRequest,
    ) => SignalAuth | undefined | Promise<SignalAuth | undefined>;
  } = {},
): FastifyInstance {
  const basePath = options.basePath ?? "/signal";

  app.get(`${basePath}/capabilities`, async (request, reply) =>
    handleCapabilitiesRequest(runtime, request, reply),
  );

  app.post(`${basePath}/query/:name`, async (request, reply) => {
    const trustedAuth = await options.resolveAuthContext?.(request);
    return handleQueryRequest(runtime, request as never, reply, trustedAuth);
  });

  app.post(`${basePath}/mutation/:name`, async (request, reply) => {
    const trustedAuth = await options.resolveAuthContext?.(request);
    return handleMutationRequest(runtime, request as never, reply, trustedAuth);
  });

  return app;
}
