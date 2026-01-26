/**
 * Signal Transport Interface
 * 
 * Abstract transport for event delivery.
 * Supports wildcard subscriptions and at-least-once semantics.
 */

import { SignalEvent, SignalTransport, EventSubscriber } from "../core/Types";

/**
 * No-op transport (default)
 */
export class NoOpTransport implements SignalTransport {
  async emit(event: SignalEvent): Promise<void> {
    // Events are dropped
  }

  async subscribe(pattern: string, handler: EventSubscriber): Promise<() => void> {
    // Return unsubscribe function (no-op)
    return () => { };
  }

  async unsubscribe(pattern: string): Promise<void> {
    // no-op
  }
}

/**
 * EventBus for coordinating multiple transports
 */
export class EventBus implements SignalTransport {
  private transports: SignalTransport[] = [];
  private subscribers = new Map<string, Set<EventSubscriber>>();

  /**
   * Add a transport
   */
  addTransport(transport: SignalTransport): void {
    this.transports.push(transport);
  }

  /**
   * Emit event to all transports
   */
  async emit(event: SignalEvent): Promise<void> {
    // First notify local subscribers
    await this.notifyLocalSubscribers(event);

    // Then emit to all registered transports
    const results = await Promise.allSettled(
      this.transports.map((t) => t.emit(event))
    );

    // Log failures but don't throw (at-least-once semantics)
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Transport emit failed:", result.reason);
      }
    }
  }

  /**
   * Subscribe to events locally (without transport)
   */
  async subscribe(pattern: string, handler: EventSubscriber): Promise<() => void> {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }

    const handlers = this.subscribers.get(pattern)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(pattern: string): Promise<void> {
    this.subscribers.delete(pattern);

    // Also unsubscribe from all transports
    await Promise.all(this.transports.map((t) => t.unsubscribe(pattern)));
  }

  /**
   * Notify local subscribers
   */
  private async notifyLocalSubscribers(event: SignalEvent): Promise<void> {
    // Notify exact pattern subscribers
    const exactHandlers = this.subscribers.get(event.name);
    if (exactHandlers) {
      const results = await Promise.allSettled(
        Array.from(exactHandlers).map((h) => h(event))
      );

      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Subscriber failed:", result.reason);
        }
      }
    }

    // Notify wildcard subscribers (e.g., "posts.*", "*")
    for (const [pattern, handlers] of this.subscribers.entries()) {
      if (this.matchesPattern(event.name, pattern)) {
        const results = await Promise.allSettled(
          Array.from(handlers).map((h) => h(event))
        );

        for (const result of results) {
          if (result.status === "rejected") {
            console.error("Subscriber failed:", result.reason);
          }
        }
      }
    }
  }

  /**
   * Check if event name matches pattern
   * Patterns: "exact.match", "prefix.*", "*"
   */
  private matchesPattern(eventName: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return eventName.startsWith(prefix + ".");
    }

    return eventName === pattern;
  }

  /**
   * Get all subscribers (for testing)
   */
  getSubscribers(): Map<string, Set<EventSubscriber>> {
    return this.subscribers;
  }
}
