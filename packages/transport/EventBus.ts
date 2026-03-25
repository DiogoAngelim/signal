/**
 * Event Bus
 * 
 * Coordinates event publishing and subscription.
 * Supports wildcard patterns and at-least-once delivery.
 */

import { SignalEvent, EventSubscriber, SignalTransportSubscribeOptions } from "../core/Types";
import { generateId } from "../utils/stableHash";

interface SubscriptionEntry {
  readonly pattern: string;
  readonly handler: EventSubscriber;
  readonly consumerId: string;
  readonly dedupe: boolean;
}

interface ConsumerLedger {
  seenEvents: Set<string>;
  latestVersionByResource: Map<string, number>;
}

/**
 * Event Bus implementation with pattern matching
 */
export class EventBus {
  private subscribers = new Map<string, Set<SubscriptionEntry>>();
  private eventHistory: SignalEvent[] = [];
  private maxHistorySize = 1000;
  private consumerLedger = new Map<string, ConsumerLedger>();

  /**
   * Subscribe to events with pattern matching
   * Patterns: "exact", "prefix.*", "*"
   */
  subscribe(
    pattern: string,
    handler: EventSubscriber,
    options: SignalTransportSubscribeOptions = {}
  ): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }

    const handlers = this.subscribers.get(pattern)!;
    const entry: SubscriptionEntry = {
      pattern,
      handler,
      consumerId: options.consumerId || generateId("consumer"),
      dedupe: options.dedupe ?? Boolean(options.consumerId),
    };
    handlers.add(entry);

    // Return unsubscribe function
    return () => {
      handlers.delete(entry);
      if (handlers.size === 0) {
        this.subscribers.delete(pattern);
      }
      this.cleanupConsumerLedger(entry.consumerId);
    };
  }

  /**
   * Publish an event to all matching subscribers
   */
  async publish(event: SignalEvent): Promise<void> {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify subscribers
    const matchingPatterns = this.findMatchingPatterns(event.name);

    const deliveredConsumers = new Set<string>();

    for (const pattern of matchingPatterns) {
      const handlers = this.subscribers.get(pattern);
      if (handlers) {
        for (const subscription of handlers) {
          const delivery = this.deliver(subscription, event, deliveredConsumers);
          if (!delivery) {
            continue;
          }

          try {
            await delivery;
          } catch (error) {
            console.error(`Subscriber (${pattern}) failed:`, error);
          }
        }
      }
    }
  }

  /**
   * Find patterns that match an event name
   */
  private findMatchingPatterns(eventName: string): string[] {
    const matching: string[] = [];

    for (const pattern of this.subscribers.keys()) {
      if (this.matchesPattern(eventName, pattern)) {
        matching.push(pattern);
      }
    }

    return matching;
  }

  /**
   * Check if event name matches pattern
   */
  private matchesPattern(eventName: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern === eventName) return true;

    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return eventName.startsWith(prefix + ".");
    }

    return false;
  }

  /**
   * Deliver an event to a subscription if it is not a duplicate or stale replay.
   */
  private deliver(
    subscription: SubscriptionEntry,
    event: SignalEvent,
    deliveredConsumers: Set<string>
  ): Promise<void> | null {
    const consumerId = subscription.consumerId;
    const ledger = this.getConsumerLedger(consumerId);
    const resourceKey = event._metadata?.resourceKey || this.resolveResourceKey(event);
    const version = event._metadata?.resourceVersion ?? event.version;

    if (subscription.dedupe && (ledger.seenEvents.has(event.id) || deliveredConsumers.has(consumerId))) {
      return null;
    }

    if (subscription.dedupe && resourceKey && version != null) {
      const lastVersion = ledger.latestVersionByResource.get(resourceKey);
      if (lastVersion != null && version <= lastVersion) {
        return null;
      }
    }

    if (subscription.dedupe) {
      deliveredConsumers.add(consumerId);
    }

    return Promise.resolve()
      .then(() => subscription.handler(event))
      .then(() => {
        if (subscription.dedupe) {
          ledger.seenEvents.add(event.id);
          if (resourceKey && version != null) {
            const current = ledger.latestVersionByResource.get(resourceKey) || 0;
            ledger.latestVersionByResource.set(resourceKey, Math.max(current, version));
          }
        }
      });
  }

  /**
   * Resolve resource key for version tracking.
   */
  private resolveResourceKey(event: SignalEvent): string | undefined {
    if (event.resource && event.resourceId != null) {
      return `${event.resource}:${event.resourceId}`;
    }
    const id = event.payload?.id || event.payload?._id;
    if (event.name.includes(".") && id != null) {
      const [resource] = event.name.split(".");
      return `${resource}:${id}`;
    }
    return undefined;
  }

  /**
   * Get or create consumer ledger.
   */
  private getConsumerLedger(consumerId: string): ConsumerLedger {
    const existing = this.consumerLedger.get(consumerId);
    if (existing) {
      return existing;
    }

    const ledger: ConsumerLedger = {
      seenEvents: new Set(),
      latestVersionByResource: new Map(),
    };
    this.consumerLedger.set(consumerId, ledger);
    return ledger;
  }

  /**
   * Remove consumer ledger if no subscriptions reference it.
   */
  private cleanupConsumerLedger(consumerId: string): void {
    for (const subscriptions of this.subscribers.values()) {
      for (const subscription of subscriptions) {
        if (subscription.consumerId === consumerId) {
          return;
        }
      }
    }

    this.consumerLedger.delete(consumerId);
  }

  /**
   * Get event history (for testing/replay)
   */
  getHistory(): SignalEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Get events matching a pattern (for testing)
   */
  getHistoryByPattern(pattern: string): SignalEvent[] {
    return this.eventHistory.filter((e) => this.matchesPattern(e.name, pattern));
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get subscriber count (for testing)
   */
  getSubscriberCount(pattern?: string): number {
    if (pattern) {
      return this.subscribers.get(pattern)?.size || 0;
    }
    let total = 0;
    for (const handlers of this.subscribers.values()) {
      total += handlers.size;
    }
    return total;
  }

  /**
   * Inspect the inbox ledger for a consumer.
   */
  getInboxLedger(consumerId: string): {
    seenEvents: string[];
    latestVersionByResource: Record<string, number>;
  } | undefined {
    const ledger = this.consumerLedger.get(consumerId);
    if (!ledger) {
      return undefined;
    }

    const latestVersionByResource: Record<string, number> = {};
    for (const [resourceKey, version] of ledger.latestVersionByResource.entries()) {
      latestVersionByResource[resourceKey] = version;
    }

    return {
      seenEvents: Array.from(ledger.seenEvents),
      latestVersionByResource,
    };
  }
}
