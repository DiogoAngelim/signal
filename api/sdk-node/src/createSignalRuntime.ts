import {
  SignalRuntime,
  type SignalRuntimeOptions,
  createInProcessDispatcher,
  createMemoryIdempotencyStore,
} from "@signal/runtime";

export function createSignalRuntime(
  options: Partial<SignalRuntimeOptions> = {},
) {
  return new SignalRuntime({
    eventPort: options.eventPort ?? createInProcessDispatcher(),
    storagePort: options.storagePort ?? createMemoryIdempotencyStore(),
    decisionPort: options.decisionPort,
    observabilityPort: options.observabilityPort,
    runtimeName: options.runtimeName ?? "signal-node",
    mode: options.mode,
    bindings: options.bindings,
  });
}

export { createInProcessDispatcher, createMemoryIdempotencyStore };
