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

export function createReferenceServer(
  runtime: ReturnType<typeof createReferenceRuntime>["runtime"],
) {
  return createSignalHttpServer(runtime, { logger: true });
}
