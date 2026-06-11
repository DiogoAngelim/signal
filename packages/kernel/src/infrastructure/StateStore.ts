/**
 * StateStore — Key-value state management for the Signal Kernel.
 * Provides typed read/write access to pipeline state with change notification.
 */

import type { EventBus } from "./EventBus";

export type StateChange = {
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly timestamp: number;
};

export class StateStore {
  private readonly state: Map<string, unknown> = new Map();
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  get<T = unknown>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    const oldValue = this.state.get(key);
    this.state.set(key, value);

    const change: StateChange = {
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
    };

    this.eventBus.emit(
      "state:changed",
      { key, oldValue, newValue: value },
      "StateStore",
    );
  }

  delete(key: string): boolean {
    const oldValue = this.state.get(key);
    const result = this.state.delete(key);

    if (result) {
      this.eventBus.emit("state:deleted", { key, oldValue }, "StateStore");
    }

    return result;
  }

  has(key: string): boolean {
    return this.state.has(key);
  }

  keys(): string[] {
    return Array.from(this.state.keys());
  }

  clear(): void {
    this.state.clear();
    this.eventBus.emit("state:cleared", {}, "StateStore");
  }

  snapshot(): Readonly<Record<string, unknown>> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.state) {
      obj[key] = value;
    }
    return Object.freeze(obj);
  }
}
