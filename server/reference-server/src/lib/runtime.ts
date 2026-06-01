import { createSignalHttpServer } from "@signal/binding-http";
import { createSignalRuntime } from "@signal/sdk-node";
import { createReferenceIdempotencyStore } from "../db";
import { registerReferenceOperations } from "../operations/register";
import { registerReferenceSubscribers } from "../subscribers/register";

export function createReferenceRuntime() {
  const runtime = createSignalRuntime({
    idempotencyStore: createReferenceIdempotencyStore(),
    runtimeName: "signal-reference-server",
  });

  const operations = registerReferenceOperations(runtime);
  const subscribers = registerReferenceSubscribers(runtime);

  return { runtime, operations, subscribers };
}

export function createReferenceServer(runtime: ReturnType<typeof createReferenceRuntime>["runtime"]) {
  return createSignalHttpServer(runtime, { logger: true });
}
