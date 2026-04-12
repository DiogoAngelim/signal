import { type SignalEnvelope, createSignalEnvelope } from "../protocol";
import {
  throwIfExecutionBlocked,
  toEnvelopeContext,
  toEnvelopeDelivery,
} from "./execution";
import type { SignalRegistry } from "./registry";
import type { SignalDispatcher, SignalExecutionContext } from "./types";

export async function dispatchEvent<TPayload>(
  registry: SignalRegistry,
  dispatcher: SignalDispatcher | undefined,
  name: string,
  payload: TPayload,
  context: SignalExecutionContext,
  meta?: Record<string, unknown>,
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

  await dispatcher?.dispatch(envelope);

  return envelope as SignalEnvelope<TPayload>;
}
