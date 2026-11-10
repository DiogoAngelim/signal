/** Shared retry budget contract for bounding retry amplification across workers. */
export interface RetryBudgetSnapshot {
  readonly capacity: number;
  readonly available: number;
  readonly refillRatePerSecond: number;
}

export interface RetryBudgetPort {
  /** Atomically consumes one retry token; false means the shared budget is exhausted. */
  tryConsume(): boolean | Promise<boolean>;
  snapshot(): RetryBudgetSnapshot | Promise<RetryBudgetSnapshot>;
}
