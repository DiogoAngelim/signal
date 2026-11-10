import type { EventPort } from "@signal/ports";
import { type SignalEnvelope, createSignalEnvelope } from "@signal/protocol";
import type { SignalConsumerDeduper } from "./types";

export function createInProcessDispatcher(): EventPort {
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

/**
 * Creates an at-least-once replay-safe subscriber.
 *
 * A message is recorded as consumed only after its handler succeeds. Failed
 * handlers therefore remain eligible for redelivery. Concurrent deliveries
 * of the same message in this process share one in-flight promise.
 *
 * The deduper is not a transaction coordinator: a process crash after the
 * handler's side effect but before remember() can cause redelivery. Consumers
 * with non-idempotent external effects must atomically persist their
 * deduplication marker with that effect in the destination system.
 */
export function createReplaySafeSubscriber(
  handler: (envelope: SignalEnvelope) => void | Promise<void>,
  options: {
    consumerId?: string;
    deduper?: SignalConsumerDeduper;
  } = {},
): (envelope: SignalEnvelope) => Promise<void> {
  const consumerId = options.consumerId ?? "signal-replay-safe-consumer";
  const deduper = options.deduper ?? createInMemoryConsumerDeduper();
  const inFlight = new Map<string, Promise<void>>();

  return async (envelope: SignalEnvelope) => {
    const key = `${consumerId}:${envelope.messageId}`;
    const current = inFlight.get(key);
    if (current) {
      return current;
    }

    const processing = (async () => {
      const accepted = await deduper.remember({
        consumerId,
        messageId: envelope.messageId,
        envelope,
      });

      if (!accepted) {
        return;
      }

      await handler(envelope);
    })();

    inFlight.set(key, processing);
    try {
      await processing;
    } finally {
      if (inFlight.get(key) === processing) {
        inFlight.delete(key);
      }
    }
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
