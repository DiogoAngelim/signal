/**
 * EventBus — Central publish/subscribe event system for the Signal Kernel.
 * Provides decoupled communication between pipeline stages and plugins.
 */

export type EventListener = (event: KernelEvent) => void;

export type KernelEvent = {
  readonly type: string;
  readonly timestamp: number;
  readonly payload: Record<string, unknown>;
  readonly source: string;
};

export class EventBus {
  private readonly listeners: Map<string, Set<EventListener>> = new Map();
  private readonly wildcardListeners: Set<EventListener> = new Set();

  on(eventType: string, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.off(eventType, listener);
    };
  }

  onAny(listener: EventListener): () => void {
    this.wildcardListeners.add(listener);
    return () => {
      this.wildcardListeners.delete(listener);
    };
  }

  off(eventType: string, listener: EventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  emit(eventType: string, payload: Record<string, unknown>, source: string): void {
    const event: KernelEvent = {
      type: eventType,
      timestamp: Date.now(),
      payload,
      source,
    };

    const specific = this.listeners.get(eventType);
    if (specific) {
      for (const listener of specific) {
        listener(event);
      }
    }

    for (const listener of this.wildcardListeners) {
      listener(event);
    }
  }

  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
      this.wildcardListeners.clear();
    }
  }

  listenerCount(eventType?: string): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size ?? 0;
    }
    let total = this.wildcardListeners.size;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
}