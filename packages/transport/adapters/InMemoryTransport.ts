/**
 * In-Memory Transport Adapter
 * 
 * For development and testing.
 * Stores events in memory with event bus support.
 */

import { SignalEvent, SignalTransport, EventSubscriber, SignalTransportSubscribeOptions } from "../../core/Types";
import { EventBus } from "../EventBus";

/**
 * In-memory transport using EventBus
 */
export class InMemoryTransport implements SignalTransport {
  private eventBus: EventBus;

  constructor() {
    this.eventBus = new EventBus();
  }

  /**
   * Emit event (store in memory)
   */
  async emit(event: SignalEvent): Promise<void> {
    await this.eventBus.publish(event);
  }

  /**
   * Subscribe to events
   */
  async subscribe(
    pattern: string,
    handler: EventSubscriber,
    options?: SignalTransportSubscribeOptions
  ): Promise<() => void> {
    return this.eventBus.subscribe(pattern, handler, options);
  }

  /**
   * Unsubscribe
   */
  async unsubscribe(pattern: string): Promise<void> {
    // EventBus doesn't have an unsubscribe method, so we track patterns ourselves
    // For now, this is handled by the unsubscribe function returned from subscribe
  }

  /**
   * Get event bus (for testing)
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Get all events (for testing)
   */
  getEvents(): SignalEvent[] {
    return this.eventBus.getHistory();
  }

  /**
   * Clear events (for testing)
   */
  clearEvents(): void {
    this.eventBus.clearHistory();
  }
}
