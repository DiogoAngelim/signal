/**
 * Resilience primitives for Signal runtime.
 *
 * Retry timing and circuit-breaker state are operational controls, not domain
 * outputs. Inject clocks/randomness at call boundaries when deterministic
 * tests or reproducible infrastructure behavior are required.
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

function validateRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive safe integer.");
  }
  if (!Number.isFinite(policy.backoffMs) || policy.backoffMs < 0) {
    throw new RangeError("backoffMs must be a finite non-negative number.");
  }
  if (
    !Number.isFinite(policy.maxBackoffMs) ||
    policy.maxBackoffMs < policy.backoffMs
  ) {
    throw new RangeError("maxBackoffMs must be finite and >= backoffMs.");
  }
}

export function isRetryable(
  code: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  return policy.retryableCodes.has(code);
}

/** Returns a capped, deterministic exponential delay for a zero-based attempt. */
export function calculateBackoff(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  validateRetryPolicy(policy);
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new RangeError("attempt must be a non-negative safe integer.");
  }
  if (attempt >= 1024) return policy.maxBackoffMs;
  return Math.min(policy.backoffMs * 2 ** attempt, policy.maxBackoffMs);
}

/**
 * Adds bounded full jitter to a retry delay. Supply a seeded random source in
 * tests; production callers should use Math.random to avoid synchronized retry
 * waves. The random source must return a finite value in [0, 1).
 */
export function calculateJitteredBackoff(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const ceiling = calculateBackoff(attempt, policy);
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError("random must return a finite value in [0, 1).");
  }
  return Math.floor(sample * (ceiling + 1));
}

export interface CircuitBreakerState {
  readonly failureCount: number;
  readonly lastFailureAt: number | null;
  readonly state: "closed" | "open" | "half-open";
  readonly threshold: number;
  readonly resetTimeoutMs: number;
}

function validateCircuitBreaker(threshold: number, resetTimeoutMs: number) {
  if (!Number.isSafeInteger(threshold) || threshold < 1) {
    throw new RangeError("threshold must be a positive safe integer.");
  }
  if (!Number.isFinite(resetTimeoutMs) || resetTimeoutMs < 0) {
    throw new RangeError("resetTimeoutMs must be a finite non-negative number.");
  }
}

export function createCircuitBreaker(
  threshold = 5,
  resetTimeoutMs = 30000,
): CircuitBreakerState {
  validateCircuitBreaker(threshold, resetTimeoutMs);
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
  now = Date.now(),
): CircuitBreakerState {
  if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
  const failureCount = breaker.failureCount + 1;
  return {
    ...breaker,
    failureCount,
    lastFailureAt: now,
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

/**
 * Advisory-only compatibility helper. It does not reserve a half-open probe,
 * so concurrent callers must use createCircuitBreakerController instead.
 */
export function shouldAllowRequest(
  breaker: CircuitBreakerState,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
  if (breaker.state === "closed") return true;
  if (breaker.state === "half-open") return false;
  return (
    breaker.lastFailureAt !== null &&
    now - breaker.lastFailureAt >= breaker.resetTimeoutMs
  );
}

export interface CircuitBreakerController {
  snapshot(): CircuitBreakerState;
  /** Atomically reserves the single half-open probe when the cooldown expires. */
  tryAcquire(now?: number): boolean;
  recordSuccess(): void;
  recordFailure(now?: number): void;
}

/**
 * Stateful, single-process circuit breaker with one half-open probe at a time.
 * It is not a distributed lock: use a shared coordination primitive when
 * multiple processes must enforce one global probe.
 */
export function createCircuitBreakerController(
  threshold = 5,
  resetTimeoutMs = 30000,
  clock: () => number = Date.now,
): CircuitBreakerController {
  validateCircuitBreaker(threshold, resetTimeoutMs);
  let current: CircuitBreakerState = createCircuitBreaker(
    threshold,
    resetTimeoutMs,
  );
  let probeInFlight = false;

  return {
    snapshot: () => ({ ...current }),
    tryAcquire(now = clock()) {
      if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
      if (current.state === "closed") return true;
      if (current.state === "half-open") return false;
      if (
        current.lastFailureAt === null ||
        now - current.lastFailureAt < current.resetTimeoutMs ||
        probeInFlight
      ) {
        return false;
      }
      current = { ...current, state: "half-open" };
      probeInFlight = true;
      return true;
    },
    recordSuccess() {
      current = recordSuccess(current);
      probeInFlight = false;
    },
    recordFailure(now = clock()) {
      current = recordFailure(current, now);
      if (current.state === "open") probeInFlight = false;
    },
  };
}
