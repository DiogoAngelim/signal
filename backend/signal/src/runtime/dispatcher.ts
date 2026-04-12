import { type SignalEnvelope, createSignalEnvelope } from "../protocol";
import type { SignalConsumerDeduper, SignalDispatcher } from "./types";

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
      handler: (envelope: SignalEnvelope) => void | Promise<void>,
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
  handler: (envelope: SignalEnvelope) => void | Promise<void>,
  options: {
    consumerId?: string;
    deduper?: SignalConsumerDeduper;
  } = {},
): (envelope: SignalEnvelope) => Promise<void> {
  const consumerId = options.consumerId ?? "signal-replay-safe-consumer";
  const deduper = options.deduper ?? createInMemoryConsumerDeduper();

  return async (envelope: SignalEnvelope) => {
    const accepted = await deduper.remember({
      consumerId,
      messageId: envelope.messageId,
      envelope,
    });

    if (!accepted) {
      return;
    }

    await handler(envelope);
  };
}

export function createInMemoryConsumerDeduper(): SignalConsumerDeduper {
  const seen = new Set<string>();

  return {
    async remember(input): Promise<boolean> {
      const key = `${input.consumerId}:${input.messageId}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    },
  };
}

export function ensureEnvelope(
  input: Omit<SignalEnvelope, "protocol" | "messageId" | "timestamp">,
): SignalEnvelope {
  return createSignalEnvelope(input);
}
