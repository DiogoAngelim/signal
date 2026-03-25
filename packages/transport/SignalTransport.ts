/**
 * Signal Transport Interface
 *
 * Compatibility wrappers for transport implementations.
 * The shared EventBus lives in `./EventBus`.
 */

import { SignalEvent, SignalTransport, EventSubscriber, SignalTransportSubscribeOptions } from "../core/Types";
import { EventBus as SharedEventBus } from "./EventBus";

/**
 * No-op transport (default)
 */
export class NoOpTransport implements SignalTransport {
  async emit(_event: SignalEvent): Promise<void> {
    // Events are dropped
  }

  async subscribe(
    _pattern: string,
    _handler: EventSubscriber,
    _options?: SignalTransportSubscribeOptions
  ): Promise<() => void> {
    return () => {};
  }

  async unsubscribe(_pattern: string): Promise<void> {
    // no-op
  }
}

/**
 * Transport wrapper around the shared EventBus.
 * Preserves the async SignalTransport contract.
 */
export class EventBus implements SignalTransport {
  private bus = new SharedEventBus();

  async emit(event: SignalEvent): Promise<void> {
    await this.bus.publish(event);
  }

  async subscribe(
    pattern: string,
    handler: EventSubscriber,
    options?: SignalTransportSubscribeOptions
  ): Promise<() => void> {
    return this.bus.subscribe(pattern, handler, options);
  }

  async unsubscribe(pattern: string): Promise<void> {
    // Pattern-level unsubscribe remains a compatibility no-op here.
    void pattern;
  }

  getHistory(): SignalEvent[] {
    return this.bus.getHistory();
  }

  getHistoryByPattern(pattern: string): SignalEvent[] {
    return this.bus.getHistoryByPattern(pattern);
  }

  getSubscriberCount(pattern?: string): number {
    return this.bus.getSubscriberCount(pattern);
  }

  getInboxLedger(consumerId: string) {
    return this.bus.getInboxLedger(consumerId);
  }

  clearHistory(): void {
    this.bus.clearHistory();
  }
}
