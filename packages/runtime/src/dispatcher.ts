import { createSignalEnvelope, type SignalEnvelope } from "@signal/protocol";
import type { SignalDispatcher } from "./types";

export function createInProcessDispatcher(): SignalDispatcher {
  const subscribers = new Map<
    string,
    Set<(envelope: SignalEnvelope) => void | Promise<void>>
  >();

  return {
    async dispatch(envelope: SignalEnvelope): Promise<void> {
      const handlers = subscribers.get(envelope.name);
      if (!handlers) {
        return;
      }

      for (const handler of handlers) {
        await handler(envelope);
      }
    },
    subscribe(
      name: string,
      handler: (envelope: SignalEnvelope) => void | Promise<void>
    ): () => void {
      const handlers = subscribers.get(name) ?? new Set();
      handlers.add(handler);
      subscribers.set(name, handlers);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

export function createReplaySafeSubscriber(
  handler: (envelope: SignalEnvelope) => void | Promise<void>
): (envelope: SignalEnvelope) => Promise<void> {
  const seen = new Set<string>();
  return async (envelope: SignalEnvelope) => {
    if (seen.has(envelope.messageId)) {
      return;
    }
    seen.add(envelope.messageId);
    await handler(envelope);
  };
}

export function ensureEnvelope(
  input: Omit<SignalEnvelope, "protocol" | "messageId" | "timestamp">
): SignalEnvelope {
  return createSignalEnvelope(input);
}
