import { createSignalEnvelope, type SignalEnvelope } from "@signal/protocol";
import type { EventPort } from "@signal/ports";
import type { SignalExecutionContext } from "./types";
import type { SignalRegistry } from "./registry";
import {
  throwIfExecutionBlocked,
  toEnvelopeContext,
  toEnvelopeDelivery,
} from "./execution";

export async function dispatchEvent<TPayload>(
  registry: SignalRegistry,
  eventPort: EventPort | undefined,
  name: string,
  payload: TPayload,
  context: SignalExecutionContext,
  meta?: Record<string, unknown>
): Promise<SignalEnvelope<TPayload>> {
  throwIfExecutionBlocked(context.request);

  const definition = registry.getEvent(name);
  const validatedPayload = definition.inputSchema.parse(payload);

  const envelope = createSignalEnvelope({
    kind: "event",
    name,
    payload: validatedPayload,
    context: {
      ...toEnvelopeContext(context.request),
      causationId: context.request.causationId ?? context.envelope?.messageId,
    },
    delivery: toEnvelopeDelivery(context.request),
    source: context.request.source,
    auth: context.request.auth,
    meta,
  });

  await eventPort?.dispatch(envelope);

  return envelope as SignalEnvelope<TPayload>;
}