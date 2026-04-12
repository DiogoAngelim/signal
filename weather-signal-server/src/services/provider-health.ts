import type { ProviderHealth, ProviderHealthStatus } from "../types/index.js";
import { nowIso } from "../utils/time.js";
import { InMemoryStore } from "../store/index.js";

export class ProviderHealthService {
  constructor(private readonly store: InMemoryStore) { }

  recordSuccess(provider: string, latencyMs?: number): ProviderHealth {
    const next: ProviderHealth = {
      provider,
      status: "healthy",
      failureCount: 0,
      lastSuccessAt: nowIso(),
      lastLatencyMs: latencyMs
    };
    this.store.setProviderHealth(next);
    return next;
  }

  recordFailure(provider: string, error?: string): ProviderHealth {
    const current = this.store.getProviderHealth(provider);
    const failureCount = (current?.failureCount ?? 0) + 1;
    const status = resolveStatus(failureCount);
    const next: ProviderHealth = {
      provider,
      status,
      failureCount,
      lastFailureAt: nowIso(),
      lastLatencyMs: current?.lastLatencyMs,
      notes: error
    };
    this.store.setProviderHealth(next);
    return next;
  }
}

function resolveStatus(failureCount: number): ProviderHealthStatus {
  if (failureCount >= 5) {
    return "down";
  }
  if (failureCount >= 3) {
    return "degraded";
  }
  return "healthy";
}
