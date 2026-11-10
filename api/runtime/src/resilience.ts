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
  return sample * ceiling;
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

export interface CircuitBreakerPermit {
  readonly id: number;
  readonly generation: number;
  readonly kind: "closed" | "probe";
}

export interface CircuitBreakerController {
  snapshot(): CircuitBreakerState;
  /** Returns an opaque permit, or null when the breaker denies the request. */
  acquire(now?: number): CircuitBreakerPermit | null;
  /** Renews the single half-open probe lease. Closed-state permits cannot renew. */
  renewProbe(permit: CircuitBreakerPermit, now?: number): boolean;
  /** Records an outcome only for a live permit from the current breaker generation. */
  recordSuccess(permit: CircuitBreakerPermit, now?: number): boolean;
  recordFailure(permit: CircuitBreakerPermit, now?: number): boolean;
}

/**
 * Stateful, single-process circuit breaker with permit-scoped outcomes.
 *
 * Each admitted operation receives an opaque permit. Outcomes from stale
 * closed-state requests cannot close a breaker after another request opened
 * it, and only the current half-open probe can close or reopen that generation.
 * The probe lease can be renewed by long-running health checks. This is not a
 * distributed lock: use createDistributedCircuitBreakerController when
 * multiple processes must coordinate one global probe.
 */
export function createCircuitBreakerController(
  threshold = 5,
  resetTimeoutMs = 30000,
  clock: () => number = Date.now,
  probeLeaseMs = 15_000,
): CircuitBreakerController {
  validateCircuitBreaker(threshold, resetTimeoutMs);
  if (
    !Number.isSafeInteger(probeLeaseMs) ||
    probeLeaseMs < 1_000 ||
    probeLeaseMs > 86_400_000
  ) {
    throw new RangeError("probeLeaseMs must be between 1000 and 86400000 milliseconds.");
  }

  let current: CircuitBreakerState = createCircuitBreaker(threshold, resetTimeoutMs);
  let generation = 0;
  let nextPermitId = 1;
  const activePermits = new WeakMap<CircuitBreakerPermit, true>();
  let activeProbe: CircuitBreakerPermit | undefined;
  let probeExpiresAt: number | undefined;

  function expireProbeIfNeeded(now: number): void {
    if (
      current.state !== "half-open" ||
      !activeProbe ||
      probeExpiresAt === undefined ||
      now < probeExpiresAt
    ) {
      return;
    }
    activePermits.delete(activeProbe);
    activeProbe = undefined;
    probeExpiresAt = undefined;
    current = { ...current, state: "open", lastFailureAt: now };
    generation += 1;
  }

  function issuePermit(kind: CircuitBreakerPermit["kind"], now: number) {
    const permit = Object.freeze({ id: nextPermitId++, generation, kind });
    activePermits.set(permit, true);
    if (kind === "probe") {
      activeProbe = permit;
      probeExpiresAt = now + probeLeaseMs;
    }
    return permit;
  }

  return {
    snapshot: () => ({ ...current }),
    acquire(now = clock()) {
      if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
      expireProbeIfNeeded(now);
      if (current.state === "closed") return issuePermit("closed", now);
      if (current.state === "half-open") return null;
      if (
        current.lastFailureAt === null ||
        now - current.lastFailureAt < current.resetTimeoutMs
      ) {
        return null;
      }
      current = { ...current, state: "half-open" };
      return issuePermit("probe", now);
    },
    renewProbe(permit, now = clock()) {
      if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
      expireProbeIfNeeded(now);
      if (
        permit.kind !== "probe" ||
        permit.generation !== generation ||
        activeProbe !== permit ||
        !activePermits.has(permit)
      ) {
        return false;
      }
      probeExpiresAt = now + probeLeaseMs;
      return true;
    },
    recordSuccess(permit, now = clock()) {
      if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
      expireProbeIfNeeded(now);
      if (
        permit.generation !== generation ||
        !activePermits.has(permit)
      ) {
        return false;
      }
      activePermits.delete(permit);
      if (permit.kind === "probe") {
        if (current.state !== "half-open" || activeProbe !== permit) return false;
        activeProbe = undefined;
        probeExpiresAt = undefined;
        current = recordSuccess(current);
        generation += 1;
        return true;
      }
      if (current.state !== "closed") return false;
      current = recordSuccess(current);
      return true;
    },
    recordFailure(permit, now = clock()) {
      if (!Number.isFinite(now)) throw new RangeError("now must be finite.");
      expireProbeIfNeeded(now);
      if (
        permit.generation !== generation ||
        !activePermits.has(permit)
      ) {
        return false;
      }
      activePermits.delete(permit);
      if (permit.kind === "probe") {
        if (current.state !== "half-open" || activeProbe !== permit) return false;
        activeProbe = undefined;
        probeExpiresAt = undefined;
        current = recordFailure(current, now);
        generation += 1;
        return true;
      }
      if (current.state !== "closed") return false;
      const next = recordFailure(current, now);
      current = next;
      if (next.state === "open") generation += 1;
      return true;
    },
  };
}


export class RetryDeadlineExceededError extends Error {
  readonly code = "RETRY_DEADLINE_EXCEEDED";
  constructor() {
    super("The retry execution deadline was exceeded.");
    this.name = "RetryDeadlineExceededError";
  }
}

export class RetryAbortedError extends Error {
  readonly code = "RETRY_ABORTED";
  constructor(cause?: unknown) {
    super("The retry execution was aborted.", { cause });
    this.name = "RetryAbortedError";
  }
}

export interface RetryExecutionOptions extends RetryPolicy {
  /** Absolute Unix epoch milliseconds or an ISO-8601 timestamp. */
  readonly deadlineAt?: number | string;
  readonly signal?: AbortSignal;
  readonly random?: () => number;
  readonly clock?: () => number;
  readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  readonly onRetry?: (input: {
    attempt: number;
    delayMs: number;
    error: unknown;
  }) => void;
}

function retryErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof RetryDeadlineExceededError) {
    return signal.reason;
  }
  if (signal.reason instanceof Error) return signal.reason;
  return new RetryAbortedError(signal.reason);
}

function abortableSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Execute an operation with a bounded attempt budget, capped exponential
 * backoff, full jitter, an absolute deadline, and caller cancellation.
 *
 * The operation receives an AbortSignal and must honor it to stop in-flight
 * I/O. A deadline cannot undo a side effect already committed by a dependency;
 * use idempotency keys at the destination for retry-safe writes.
 */
export async function executeWithRetry<T>(
  operation: (attempt: number, signal: AbortSignal) => Promise<T>,
  options: RetryExecutionOptions = DEFAULT_RETRY_POLICY,
): Promise<T> {
  validateRetryPolicy(options);
  const clock = options.clock ?? Date.now;
  const random = options.random ?? Math.random;
  const deadlineAt = options.deadlineAt === undefined
    ? undefined
    : typeof options.deadlineAt === "string"
      ? Date.parse(options.deadlineAt)
      : options.deadlineAt;
  if (deadlineAt !== undefined && !Number.isFinite(deadlineAt)) {
    throw new RangeError("deadlineAt must be a valid timestamp or epoch millisecond value.");
  }

  const controller = new AbortController();
  const externalSignal = options.signal;
  const relayAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) relayAbort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  if (deadlineAt !== undefined) {
    const remaining = deadlineAt - clock();
    if (remaining <= 0) {
      controller.abort(new RetryDeadlineExceededError());
    } else {
      deadlineTimer = setTimeout(
        () => controller.abort(new RetryDeadlineExceededError()),
        remaining,
      );
    }
  }

  const sleep = options.sleep ?? abortableSleep;
  const raceAbort = async <TResult>(promise: Promise<TResult>): Promise<TResult> => {
    if (controller.signal.aborted) throw abortReason(controller.signal);
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(abortReason(controller.signal));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([promise, aborted]);
    } finally {
      if (onAbort) controller.signal.removeEventListener("abort", onAbort);
    }
  };

  try {
    for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
      if (controller.signal.aborted) throw abortReason(controller.signal);
      if (deadlineAt !== undefined && clock() >= deadlineAt) {
        throw new RetryDeadlineExceededError();
      }

      try {
        const result = await raceAbort(operation(attempt, controller.signal));
        if (deadlineAt !== undefined && clock() >= deadlineAt) {
          throw new RetryDeadlineExceededError();
        }
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw abortReason(controller.signal);
        const code = retryErrorCode(error);
        if (
          attempt >= options.maxAttempts ||
          code === undefined ||
          !isRetryable(code, options)
        ) {
          throw error;
        }

        const delayMs = calculateJitteredBackoff(attempt - 1, options, random);
        if (deadlineAt !== undefined && clock() + delayMs >= deadlineAt) {
          throw new RetryDeadlineExceededError();
        }
        options.onRetry?.({ attempt, delayMs, error });
        await raceAbort(sleep(delayMs, controller.signal));
      }
    }
    throw new Error("Retry execution exhausted without a result.");
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    externalSignal?.removeEventListener("abort", relayAbort);
  }
}
