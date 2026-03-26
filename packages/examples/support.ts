import { createSignalRuntime } from "@signal/sdk-node";
import { createMemoryIdempotencyStore, createReplaySafeSubscriber } from "@signal/runtime";

export function createExampleRuntime() {
  return createSignalRuntime({
    idempotencyStore: createMemoryIdempotencyStore(),
    runtimeName: "signal-example",
  });
}

export { createReplaySafeSubscriber };
