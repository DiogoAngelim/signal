/**
 * EventPort — Abstraction for event dispatching and subscription.
 *
 * Runtime owns ALL event lifecycle. External systems provide
 * implementations of this port to handle transport-specific
 * event delivery (in-process, message bus, etc.).
 *
 * Rules:
 * - No business logic in implementations
 * - No state mutation beyond delivery
 * - Deterministic in replay mode (implementations must check delivery.replayed)
 */
import type { SignalEnvelope } from "@signal/protocol";

/**
 * Event dispatch port. Runtime is the ONLY event authority —
 * events are created inside runtime and dispatched through this port.
 */
export interface EventPort {
  /**
   * Dispatch an event envelope to all subscribers.
   * Implementations must deliver the envelope without modification.
   */
  dispatch(envelope: SignalEnvelope): Promise<void>;

  /**
   * Subscribe a handler for events matching the given name.
   * Returns an unsubscribe function.
   */
  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>,
  ): () => void;
}
