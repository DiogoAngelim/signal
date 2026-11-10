import type { SignalAuth } from "@signal/protocol";
import type { SignalRuntime } from "@signal/sdk-node";
import fastify, { type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from "fastify";
import { registerSignalHttpRoutes, type SignalHttpRateLimits } from "./routes";

export interface CreateSignalHttpServerOptions {
  logger?: boolean;
  /** Explicitly trust only known reverse proxies; defaults to false. */
  trustProxy?: FastifyServerOptions["trustProxy"];
  basePath?: string;
  rateLimits?: SignalHttpRateLimits;
  /**
   * Resolve identity only from verified server-side authentication middleware.
   * Never derive this value from request.body, query parameters, or headers
   * unless those headers have already been cryptographically/session verified.
   */
  resolveAuthContext?: (
    request: FastifyRequest,
  ) => SignalAuth | undefined | Promise<SignalAuth | undefined>;
}

export function createSignalHttpServer(
  runtime: SignalRuntime,
  options: CreateSignalHttpServerOptions = {},
): FastifyInstance {
  const app = fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  });
  registerSignalHttpRoutes(app, runtime, {
    basePath: options.basePath,
    rateLimits: options.rateLimits,
    resolveAuthContext: options.resolveAuthContext,
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}
