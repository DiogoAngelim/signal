import type { SignalRuntime } from "@signal/runtime";
import { createEmergencyAwarenessOperations, type EmergencyAwarenessOperationsOptions } from "./operations";

export function registerEmergencyAwarenessOperations(
  runtime: Pick<SignalRuntime, "registry">,
  options: EmergencyAwarenessOperationsOptions,
) {
  const operations = createEmergencyAwarenessOperations(options);
  for (const operation of operations) {
    runtime.registry.registerQuery(operation);
  }
  return operations;
}
