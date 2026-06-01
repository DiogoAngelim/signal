import { createInProcessDispatcher } from "@signal/runtime";
import {
  SignalRuntime,
  type SignalRuntimeOptions,
} from "@signal/runtime";

export function createSignalRuntime(options: SignalRuntimeOptions = {}) {
  return new SignalRuntime({
    dispatcher: options.dispatcher ?? createInProcessDispatcher(),
    idempotencyStore: options.idempotencyStore,
    runtimeName: options.runtimeName ?? "signal-node",
  });
}
