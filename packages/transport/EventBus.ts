/**
 * Event Bus
 * 
 * Coordinates event publishing and subscription.
 * Supports wildcard patterns and at-least-once delivery.
 */

import { SignalEvent, EventSubscriber } from "../core/Types";

/**
 * Event Bus implementation with pattern matching
 */
export class EventBus {
  private subscribers = new Map<string, Set<EventSubscriber>>();
  private eventHistory: SignalEvent[] = [];
  private maxHistorySize = 1000;

  /**
   * Subscribe to events with pattern matching
   * Patterns: "exact", "prefix.*", "*"
   */
  subscribe(pattern: string, handler: EventSubscriber): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }

    const handlers = this.subscribers.get(pattern)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(pattern);
      }
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

    for (const pattern of matchingPatterns) {
      const handlers = this.subscribers.get(pattern);
      if (handlers) {
        const results = await Promise.allSettled(
          Array.from(handlers).map((h) => h(event))
        );

        for (const result of results) {
          if (result.status === "rejected") {
            console.error(`Subscriber (${pattern}) failed:`, result.reason);
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
}
