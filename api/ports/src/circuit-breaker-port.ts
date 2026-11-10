/**
 * Shared coordination contract for circuit breakers.
 *
 * Implementations must serialize state transitions across processes and fence
 * every half-open probe with a generation-specific token.
 */
export interface DistributedCircuitBreakerSnapshot {
  readonly key: string;
  readonly failureCount: number;
  readonly lastFailureAt: string | null;
  readonly state: "closed" | "open" | "half-open";
  readonly threshold: number;
  readonly resetTimeoutMs: number;
}

export interface DistributedCircuitBreakerPermit {
  readonly allowed: boolean;
  /** Present only when this call owns the globally unique half-open probe. */
  readonly probeToken?: string;
}

export interface DistributedCircuitBreakerConfig {
  readonly threshold: number;
  readonly resetTimeoutMs: number;
  readonly probeLeaseMs: number;
}

export interface DistributedCircuitBreakerPort {
  snapshot(key: string): Promise<DistributedCircuitBreakerSnapshot | null>;
  tryAcquire(
    key: string,
    config: DistributedCircuitBreakerConfig,
    now?: Date,
  ): Promise<DistributedCircuitBreakerPermit>;
  renewProbe(key: string, probeToken: string, probeLeaseMs: number): Promise<boolean>;
  recordSuccess(key: string, probeToken?: string): Promise<boolean>;
  recordFailure(
    key: string,
    config: DistributedCircuitBreakerConfig,
    probeToken?: string,
    now?: Date,
  ): Promise<boolean>;
}
