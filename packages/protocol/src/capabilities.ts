import { z } from "zod";
import { signalKinds } from "./kinds";
import { signalProtocolVersion } from "./envelope";

export const signalOperationCapabilitySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(signalKinds),
  inputSchemaId: z.string().min(1).optional(),
  resultSchemaId: z.string().min(1).optional(),
  idempotency: z.enum(["required", "optional", "none"]).optional(),
});

export const signalCapabilitiesSchema = z.object({
  protocol: z.literal(signalProtocolVersion),
  version: z.literal("v1"),
  queries: z.array(signalOperationCapabilitySchema),
  mutations: z.array(signalOperationCapabilitySchema),
  publishedEvents: z.array(signalOperationCapabilitySchema),
  subscribedEvents: z.array(signalOperationCapabilitySchema),
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

export function createSignalCapabilities(
  input: SignalCapabilities
): SignalCapabilities {
  return signalCapabilitiesSchema.parse(input);
}
