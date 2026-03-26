import { createSignalEnvelope, type SignalEnvelope } from "@signal/protocol";
import type { SignalDispatcher, SignalExecutionContext } from "./types";
import type { SignalRegistry } from "./registry";

export async function dispatchEvent<TPayload>(
  registry: SignalRegistry,
  dispatcher: SignalDispatcher | undefined,
  name: string,
  payload: TPayload,
  context: SignalExecutionContext,
  meta?: Record<string, unknown>
): Promise<SignalEnvelope<TPayload>> {
  const definition = registry.getEvent(name);
  const validatedPayload = definition.inputSchema.parse(payload);

  const envelope = createSignalEnvelope({
    kind: "event",
    name,
    payload: validatedPayload,
    context: {
      correlationId: context.request.correlationId,
      causationId: context.request.causationId ?? context.envelope?.messageId,
      traceId: context.request.traceId,
    },
    source: context.request.source,
    auth: context.request.auth,
    meta,
  });

  await dispatcher?.dispatch(envelope);

  return envelope as SignalEnvelope<TPayload>;
}
