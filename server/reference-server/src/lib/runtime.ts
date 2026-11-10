import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { createSignalHttpServer } from "@signal/binding-http";
import { createSignalRuntime } from "@signal/sdk-node";
import { createReferenceIdempotencyStore } from "../db";
import { createHighRiskPaymentStore } from "../operations/high-risk-payment";
import { registerReferenceOperations } from "../operations/register";
import { registerReferenceSubscribers } from "../subscribers/register";

export function createReferenceRuntime() {
  const highRiskPaymentStore = createHighRiskPaymentStore();
  const runtime = createSignalRuntime({
    storagePort: createReferenceIdempotencyStore(),
    runtimeName: "signal-reference-server",
  });

  const operations = registerReferenceOperations(runtime, highRiskPaymentStore);
  const subscribers = registerReferenceSubscribers(
    runtime,
    highRiskPaymentStore,
  );

  return { runtime, operations, subscribers };
}

export function createReferenceAuthResolver(
  token = process.env.SIGNAL_REFERENCE_AUTH_TOKEN,
) {
  return (request: FastifyRequest) => {
    if (!token) return undefined;
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      return undefined;
    }

    const supplied = Buffer.from(authorization.slice("Bearer ".length));
    const expected = Buffer.from(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return undefined;
    }

    // This is a single-tenant reference identity, not a production identity
    // provider. Real deployments should resolve verified sessions/JWT claims.
    return {
      actor: { id: "ops_alice", type: "operator", roles: ["payments"] },
      subject: "tenant:tenant_acme",
      scopes: ["payment:capture", "payment:read", "tenant:tenant_acme"],
    };
  };
}

export function createReferenceServer(
  runtime: ReturnType<typeof createReferenceRuntime>["runtime"],
) {
  return createSignalHttpServer(runtime, {
    logger: true,
    resolveAuthContext: createReferenceAuthResolver(),
  });
}
