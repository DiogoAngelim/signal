export type CircuitBreakerState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private stateValue: CircuitBreakerState = "closed";
  private failureCountValue = 0;
  private openedAtValue: string | null = null;
  private lastFailureAt = 0;

  constructor(
    private readonly options: {
      failureThreshold?: number;
      coolDownMs?: number;
    } = {},
  ) {}

  get state() {
    return this.stateValue;
  }

  get failureCount() {
    return this.failureCountValue;
  }

  canAttempt() {
    if (this.stateValue !== "open") return true;
    const elapsed = Date.now() - this.lastFailureAt;
    if (elapsed >= (this.options.coolDownMs ?? 30_000)) {
      this.stateValue = "half-open";
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failureCountValue = 0;
    this.openedAtValue = null;
    this.stateValue = "closed";
  }

  recordFailure() {
    this.failureCountValue += 1;
    this.lastFailureAt = Date.now();
    if (this.failureCountValue >= (this.options.failureThreshold ?? 3)) {
      this.stateValue = "open";
      this.openedAtValue = new Date(this.lastFailureAt).toISOString();
    }
  }

  snapshot() {
    return {
      state: this.stateValue,
      failureCount: this.failureCountValue,
      openedAt: this.openedAtValue,
    };
  }

  hydrate(value?: {
    state?: CircuitBreakerState;
    failureCount?: number;
    openedAt?: string | null;
  }) {
    this.stateValue = value?.state ?? "closed";
    this.failureCountValue = Number.isFinite(value?.failureCount)
      ? Number(value?.failureCount)
      : 0;
    this.openedAtValue = value?.openedAt ?? null;
    this.lastFailureAt = this.openedAtValue
      ? Date.parse(this.openedAtValue)
      : 0;
  }
}
