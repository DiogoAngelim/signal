import type { SignalAuth } from "@signal/protocol";
import rateLimit from "@fastify/rate-limit";
import type { SignalRuntime } from "@signal/sdk-node";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { handleCapabilitiesRequest } from "./capabilities-route";
import { handleMutationRequest, handleQueryRequest } from "./handlers";

export interface SignalHttpRateLimitOptions {
  max?: number;
  timeWindow?: number | string;
}

export interface SignalHttpRateLimits {
  query?: SignalHttpRateLimitOptions;
  mutation?: SignalHttpRateLimitOptions;
}

function resolveRateLimit(
  options: SignalHttpRateLimitOptions | undefined,
  fallbackMax: number,
) {
  const max = options?.max ?? fallbackMax;
  const timeWindow = options?.timeWindow ?? 60_000;
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new RangeError("HTTP rate-limit max must be a positive integer.");
  }
  if (
    (typeof timeWindow === "number" && (!Number.isFinite(timeWindow) || timeWindow <= 0)) ||
    (typeof timeWindow === "string" && timeWindow.trim().length === 0)
  ) {
    throw new RangeError("HTTP rate-limit timeWindow must be positive.");
  }
  return { max, timeWindow };
}

export function registerSignalHttpRoutes(
  app: FastifyInstance,
  runtime: SignalRuntime,
  options: {
    basePath?: string;
    rateLimits?: SignalHttpRateLimits;
    resolveAuthContext?: (
      request: FastifyRequest,
    ) => SignalAuth | undefined | Promise<SignalAuth | undefined>;
  } = {},
): FastifyInstance {
  const basePath = options.basePath ?? "/signal";
  const queryRateLimit = resolveRateLimit(options.rateLimits?.query, 120);
  const mutationRateLimit = resolveRateLimit(options.rateLimits?.mutation, 60);

  // Limits are per-process by default. Multi-replica deployments must supply
  // a shared Redis store or enforce equivalent limits at a trusted edge.
  app.register(rateLimit, {
    global: false,
    max: 1_000,
    timeWindow: 60_000,
    errorResponseBuilder: (_request, context) => ({
      ok: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Request rate limit exceeded.",
        category: "rate_limit",
        retryable: true,
        details: { retryAfterSeconds: context.ttlInSeconds },
      },
    }),
  });

  app.get(`${basePath}/capabilities`, async (request, reply) =>
    handleCapabilitiesRequest(runtime, request, reply),
  );

  app.post(`${basePath}/query/:name`, {
    config: { rateLimit: queryRateLimit },
  }, async (request, reply) => {
    const trustedAuth = await options.resolveAuthContext?.(request);
    return handleQueryRequest(runtime, request as never, reply, trustedAuth);
  });

  app.post(`${basePath}/mutation/:name`, {
    config: { rateLimit: mutationRateLimit },
  }, async (request, reply) => {
    const trustedAuth = await options.resolveAuthContext?.(request);
    return handleMutationRequest(runtime, request as never, reply, trustedAuth);
  });

  return app;
}
