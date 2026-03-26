import {
  createSignalCapabilities,
  type SignalCapabilities,
  type SignalOperationCapability,
} from "@signal/protocol";
import type { SignalRegistry } from "./registry";

function toCapability(operation: {
  name: string;
  kind: "query" | "mutation" | "event";
  inputSchemaId?: string;
  resultSchemaId?: string;
  idempotency?: "required" | "optional" | "none";
}): SignalOperationCapability {
  return {
    name: operation.name,
    kind: operation.kind,
    inputSchemaId: operation.inputSchemaId,
    resultSchemaId: operation.resultSchemaId,
    idempotency: operation.idempotency,
  };
}

export function buildCapabilities(
  registry: SignalRegistry,
  bindings: SignalCapabilities["bindings"],
  subscribedEventNames: string[] = []
): SignalCapabilities {
  return createSignalCapabilities({
    protocol: "signal.v1",
    version: "v1",
    queries: registry.listQueries().map(toCapability),
    mutations: registry.listMutations().map(toCapability),
    publishedEvents: registry.listEvents().map(toCapability),
    subscribedEvents: subscribedEventNames.map((name) => ({
      name,
      kind: "event" as const,
    })),
    bindings,
  });
}
