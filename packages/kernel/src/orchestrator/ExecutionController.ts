/**
 * ExecutionController — Controls pipeline execution concurrency.
 * Ensures the kernel maintains control over execution flow.
 * Plugins cannot bypass this — they are invoked only through the orchestrator.
 */

import type { EventBus } from "../infrastructure/EventBus";

export type ExecutionState = "idle" | "running" | "paused" | "stopped";

export class ExecutionController {
  private _state: ExecutionState = "idle";
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly maxConcurrent: number = 1,
  ) {}

  async acquire(): Promise<void> {
    if (this._state === "stopped") {
      throw new Error("ExecutionController is stopped");
    }

    if (this._state === "paused") {
      await new Promise<void>((resolve) => {
        const check = () => {
          const current = this._state as string;
          if (current !== "paused" && current !== "stopped") {
            resolve();
          }
        };
        this.eventBus.on("execution:resumed", () => check());
        this.eventBus.on("execution:stopped", () => {
          resolve();
        });
      });

      if ((this._state as string) === "stopped") {
        throw new Error("ExecutionController was stopped while waiting");
      }
    }

    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }

    this.activeCount++;
    this._state = "running";
    this.eventBus.emit(
      "execution:acquired",
      { activeCount: this.activeCount },
      "ExecutionController",
    );
  }

  release(): void {
    if (this.activeCount > 0) {
      this.activeCount--;
    }

    if (this.activeCount === 0) {
      this._state = "idle";
    }

    this.eventBus.emit(
      "execution:released",
      { activeCount: this.activeCount },
      "ExecutionController",
    );

    if (this.waitQueue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  pause(): void {
    if (this._state === "running" || this._state === "idle") {
      this._state = "paused";
      this.eventBus.emit(
        "execution:paused",
        { activeCount: this.activeCount },
        "ExecutionController",
      );
    }
  }

  resume(): void {
    if (this._state === "paused") {
      this._state = this.activeCount > 0 ? "running" : "idle";
      this.eventBus.emit(
        "execution:resumed",
        { activeCount: this.activeCount },
        "ExecutionController",
      );
    }
  }

  stop(): void {
    this._state = "stopped";
    // Release all waiting promises
    for (const waiter of this.waitQueue) {
      waiter();
    }
    this.waitQueue.length = 0;
    this.eventBus.emit("execution:stopped", {}, "ExecutionController");
  }

  get state(): ExecutionState {
    return this._state;
  }

  get active(): number {
    return this.activeCount;
  }

  get pending(): number {
    return this.waitQueue.length;
  }
}
