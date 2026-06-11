/**
 * Resilience primitives for Signal runtime.
 * Provides retry policies, circuit breaker state, and timeout enforcement.
 */

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly maxBackoffMs: number;
  readonly retryableCodes: ReadonlySet<string>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 100,
  maxBackoffMs: 5000,
  retryableCodes: new Set([
    "RETRYABLE_ERROR",
    "TRANSPORT_ERROR",
    "INTERNAL_ERROR",
  ]),
};

export function isRetryable(
  code: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  return policy.retryableCodes.has(code);
}

export function calculateBackoff(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  const exponential = policy.backoffMs * 2 ** attempt;
  return Math.min(exponential, policy.maxBackoffMs);
}

export interface CircuitBreakerState {
  readonly failureCount: number;
  readonly lastFailureAt: number | null;
  readonly state: "closed" | "open" | "half-open";
  readonly threshold: number;
  readonly resetTimeoutMs: number;
}

export function createCircuitBreaker(
  threshold = 5,
  resetTimeoutMs = 30000,
): CircuitBreakerState {
  return {
    failureCount: 0,
    lastFailureAt: null,
    state: "closed",
    threshold,
    resetTimeoutMs,
  };
}

export function recordFailure(
  breaker: CircuitBreakerState,
): CircuitBreakerState {
  const failureCount = breaker.failureCount + 1;
  return {
    ...breaker,
    failureCount,
    lastFailureAt: Date.now(),
    state: failureCount >= breaker.threshold ? "open" : breaker.state,
  };
}

export function recordSuccess(
  breaker: CircuitBreakerState,
): CircuitBreakerState {
  return {
    ...breaker,
    failureCount: 0,
    lastFailureAt: null,
    state: "closed",
  };
}

export function shouldAllowRequest(breaker: CircuitBreakerState): boolean {
  if (breaker.state === "closed") return true;
  if (breaker.state === "half-open") return true;
  if (breaker.state === "open" && breaker.lastFailureAt !== null) {
    const elapsed = Date.now() - breaker.lastFailureAt;
    if (elapsed >= breaker.resetTimeoutMs) return true;
  }
  return false;
}
