import {
  createSignalCapabilities,
  type SignalCapabilities,
  type SignalOperationCapability,
} from "@signal/protocol";
import type { SignalRegistry } from "./registry";

function toCapability(operation: {
  name: string;
  kind: "query" | "mutation" | "event";
  description?: string;
  inputSchemaId?: string;
  resultSchemaId?: string;
  idempotency?: "required" | "optional" | "none";
  emits?: string[];
  replaySafe?: boolean;
  consumerId?: string;
}): SignalOperationCapability {
  return {
    name: operation.name,
    kind: operation.kind,
    description: operation.description,
    inputSchemaId: operation.inputSchemaId,
    resultSchemaId: operation.resultSchemaId,
    idempotency: operation.idempotency,
    emits: operation.emits,
    replaySafe: operation.replaySafe,
    consumerId: operation.consumerId,
  };
}

export function buildCapabilities(
  registry: SignalRegistry,
  bindings: SignalCapabilities["bindings"],
  subscribedEvents: Array<
    | string
    | {
        name: string;
        kind?: "event";
        consumerId?: string;
        replaySafe?: boolean;
        description?: string;
      }
  > = []
): SignalCapabilities {
  return createSignalCapabilities({
    protocol: "signal.v1",
    version: "v1",
    queries: registry.listQueries().map(toCapability),
    mutations: registry.listMutations().map(toCapability),
    publishedEvents: registry.listEvents().map(toCapability),
    subscribedEvents: subscribedEvents.map((event) =>
      toCapability({
        ...(typeof event === "string" ? { name: event } : event),
        kind: "event",
      })
    ),
    features: {
      deadlines: true,
      cancellation: true,
      idempotency: true,
      replaySafety: true,
    },
    bindings,
  });
}
