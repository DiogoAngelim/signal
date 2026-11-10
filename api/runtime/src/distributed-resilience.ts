import type {
  DistributedCircuitBreakerConfig,
  DistributedCircuitBreakerPort,
  DistributedCircuitBreakerSnapshot,
} from "@signal/ports";

export interface DistributedCircuitBreakerController {
  snapshot(): Promise<DistributedCircuitBreakerSnapshot | null>;
  tryAcquire(now?: Date): Promise<boolean>;
  renewProbe(): Promise<boolean>;
  recordSuccess(): Promise<boolean>;
  recordFailure(now?: Date): Promise<boolean>;
}

/**
 * Runtime-facing controller backed by a shared coordination port.
 *
 * A controller instance retains only its own probe token; authoritative state
 * and single-probe exclusion live in the shared store. Recreate controllers
 * freely across processes without losing breaker state.
 */
export function createDistributedCircuitBreakerController(
  port: DistributedCircuitBreakerPort,
  key: string,
  config: DistributedCircuitBreakerConfig = {
    threshold: 5,
    resetTimeoutMs: 30_000,
    probeLeaseMs: 15_000,
  },
): DistributedCircuitBreakerController {
  if (!port) throw new Error("A distributed circuit breaker port is required.");
  if (!key.trim() || key.length > 512) {
    throw new RangeError("Circuit breaker key must contain 1-512 characters.");
  }
  if (!Number.isSafeInteger(config.threshold) || config.threshold < 1) {
    throw new RangeError("Circuit breaker threshold must be a positive integer.");
  }
  if (!Number.isSafeInteger(config.resetTimeoutMs) || config.resetTimeoutMs < 0) {
    throw new RangeError("Circuit breaker reset timeout must be a non-negative safe integer.");
  }
  if (
    !Number.isSafeInteger(config.probeLeaseMs) ||
    config.probeLeaseMs < 1_000 ||
    config.probeLeaseMs > 86_400_000
  ) {
    throw new RangeError("Circuit breaker probe lease must be between 1000 and 86400000 milliseconds.");
  }

  let probeToken: string | undefined;

  return {
    snapshot: () => port.snapshot(key),
    async tryAcquire(now) {
      const permit = await port.tryAcquire(key, config, now);
      // A denied concurrent acquisition must not discard the token held by
      // another in-flight operation on this controller. An allowed permit
      // replaces it; PostgreSQL fencing rejects any expired generation.
      return permit.allowed;
    },
    async renewProbe() {
      if (!probeToken) return false;
      const renewed = await port.renewProbe(key, probeToken, config.probeLeaseMs);
      if (!renewed) probeToken = undefined;
      return renewed;
    },
    async recordSuccess() {
      const token = probeToken;
      const recorded = await port.recordSuccess(key, token);
      if (recorded || token) probeToken = undefined;
      return recorded;
    },
    async recordFailure(now) {
      const token = probeToken;
      const recorded = await port.recordFailure(key, config, token, now);
      if (recorded || token) probeToken = undefined;
      return recorded;
    },
  };
}


export class DistributedCircuitBreakerOpenError extends Error {
  readonly code = "CIRCUIT_BREAKER_OPEN";
  constructor() {
    super("The distributed circuit breaker is open or another half-open probe is in progress.");
    this.name = "DistributedCircuitBreakerOpenError";
  }
}

/**
 * Executes a real dependency call through the shared breaker controller.
 * Applications should use this wrapper at outbound dependency boundaries;
 * Signal cannot automatically wrap dependencies it does not own.
 */
export async function executeWithDistributedCircuitBreaker<T>(
  controller: DistributedCircuitBreakerController,
  operation: () => Promise<T>,
  options: {
    onCoordinationError?: (error: unknown) => void;
  } = {},
): Promise<T> {
  let allowed: boolean;
  try {
    allowed = await controller.tryAcquire();
  } catch (error) {
    options.onCoordinationError?.(error);
    throw error;
  }
  if (!allowed) throw new DistributedCircuitBreakerOpenError();

  try {
    const result = await operation();
    try {
      await controller.recordSuccess();
    } catch (error) {
      options.onCoordinationError?.(error);
    }
    return result;
  } catch (error) {
    try {
      await controller.recordFailure();
    } catch (coordinationError) {
      options.onCoordinationError?.(coordinationError);
    }
    throw error;
  }
}
