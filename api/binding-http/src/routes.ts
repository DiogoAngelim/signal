import type { SignalAuth } from "@signal/protocol";
import rateLimit from "@fastify/rate-limit";
import type { SignalRuntime } from "@signal/sdk-node";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { handleCapabilitiesRequest } from "./capabilities-route";
import { handleMutationRequest, handleQueryRequest } from "./handlers";

type RateLimitPluginOptions = NonNullable<Parameters<typeof rateLimit>[1]>;

export interface SignalHttpRateLimitOptions {
  max?: number;
  timeWindow?: number | string;
}

export interface SignalHttpRateLimits {
  query?: SignalHttpRateLimitOptions;
  mutation?: SignalHttpRateLimitOptions;
  /** Shared custom store constructor for multi-instance deployments. */
  store?: RateLimitPluginOptions["store"];
  /** ioredis-compatible client for the plugin built-in distributed store. */
  redis?: RateLimitPluginOptions["redis"];
  nameSpace?: string;
  keyGenerator?: RateLimitPluginOptions["keyGenerator"];
  skipOnError?: boolean;
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

  if (options.rateLimits?.store && options.rateLimits?.redis) {
    throw new RangeError("Configure either a custom rate-limit store or Redis, not both.");
  }

  // Register the limiter before declaring the routes. Keeping the plugin and
  // protected routes in one encapsulated scope ensures its onRoute hooks see
  // each route's per-endpoint configuration.
  app.register(async (scope) => {
    await scope.register(rateLimit, {
      global: false,
      max: 1_000,
      timeWindow: 60_000,
      ...(options.rateLimits?.store ? { store: options.rateLimits.store } : {}),
      ...(options.rateLimits?.redis ? { redis: options.rateLimits.redis } : {}),
      ...(options.rateLimits?.nameSpace ? { nameSpace: options.rateLimits.nameSpace } : {}),
      ...(options.rateLimits?.keyGenerator ? { keyGenerator: options.rateLimits.keyGenerator } : {}),
      skipOnError: options.rateLimits?.skipOnError ?? false,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        ok: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Request rate limit exceeded.",
          category: "rate_limit",
          retryable: true,
          details: { retryAfterSeconds: Math.ceil(context.ttl / 1000) },
        },
      }),
    });

    scope.get(`${basePath}/capabilities`, async (request, reply) =>
      handleCapabilitiesRequest(runtime, request, reply),
    );

    scope.post(`${basePath}/query/:name`, {
      config: { rateLimit: queryRateLimit },
    }, async (request, reply) => {
      const trustedAuth = await options.resolveAuthContext?.(request);
      return handleQueryRequest(runtime, request as never, reply, trustedAuth);
    });

    scope.post(`${basePath}/mutation/:name`, {
      config: { rateLimit: mutationRateLimit },
    }, async (request, reply) => {
      const trustedAuth = await options.resolveAuthContext?.(request);
      return handleMutationRequest(runtime, request as never, reply, trustedAuth);
    });
  });

  return app;
}
