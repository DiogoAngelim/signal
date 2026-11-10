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
  if (!key.trim()) throw new RangeError("Circuit breaker key is required.");
  let probeToken: string | undefined;

  return {
    snapshot: () => port.snapshot(key),
    async tryAcquire(now) {
      const permit = await port.tryAcquire(key, config, now);
      if (permit.allowed) probeToken = permit.probeToken;
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
