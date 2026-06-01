import { z } from "zod";
import { signalProtocolVersion } from "./envelope";
import { signalKinds } from "./kinds";
import { signalNameSchema } from "./names";

export const signalOperationCapabilitySchema = z.object({
  name: signalNameSchema,
  kind: z.enum(signalKinds),
  description: z.string().min(1).optional(),
  inputSchemaId: z.string().min(1).optional(),
  resultSchemaId: z.string().min(1).optional(),
  idempotency: z.enum(["required", "optional", "none"]).optional(),
  emits: z.array(signalNameSchema).optional(),
  replaySafe: z.boolean().optional(),
  consumerId: z.string().min(1).optional(),
});

export const signalCapabilitiesSchema = z.object({
  protocol: z.literal(signalProtocolVersion),
  version: z.literal("v1"),
  queries: z.array(signalOperationCapabilitySchema),
  mutations: z.array(signalOperationCapabilitySchema),
  publishedEvents: z.array(signalOperationCapabilitySchema),
  subscribedEvents: z.array(signalOperationCapabilitySchema),
  features: z
    .object({
      deadlines: z.boolean(),
      cancellation: z.boolean(),
      idempotency: z.boolean(),
      replaySafety: z.boolean(),
    })
    .optional(),
  bindings: z
    .object({
      inProcess: z.boolean(),
      http: z
        .object({
          basePath: z.string().min(1),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type SignalOperationCapability = z.infer<
  typeof signalOperationCapabilitySchema
>;

export type SignalCapabilities = z.infer<typeof signalCapabilitiesSchema>;

export type CapabilityDocument = {
  queries: string[];
  mutations: string[];
  events: string[];
  subscriptions: string[];
};

export function createSignalCapabilities(
  input: SignalCapabilities,
): SignalCapabilities {
  return signalCapabilitiesSchema.parse(input);
}

export function createCapabilityDocument(
  input: CapabilityDocument,
): CapabilityDocument {
  return {
    queries: [...new Set(input.queries)],
    mutations: [...new Set(input.mutations)],
    events: [...new Set(input.events)],
    subscriptions: [...new Set(input.subscriptions)],
  };
}

export function toCapabilityDocument(
  capabilities: SignalCapabilities,
): CapabilityDocument {
  return createCapabilityDocument({
    queries: capabilities.queries.map((op) => op.name),
    mutations: capabilities.mutations.map((op) => op.name),
    events: capabilities.publishedEvents.map((op) => op.name),
    subscriptions: capabilities.subscribedEvents.map((op) => op.name),
  });
}
