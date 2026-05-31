import { loadSignalSecurityConfig } from "../security/signal-security.js";
import { getSignalStore } from "../storage/signal-store.js";

const startedAt = Date.now();

export function buildHealthPayload() {
  return {
    status: "ok",
    service: "stocks-optimizer-signal-api",
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - startedAt,
  };
}

export async function buildReadinessPayload() {
  const config = loadSignalSecurityConfig();
  const store = getSignalStore();
  const stats = await store.stats();
  const production = process.env.NODE_ENV === "production";
  const authReady = config.apiKeys.length > 0;
  const ready = !production || authReady;

  return {
    status: ready ? "ready" : "not_ready",
    service: "stocks-optimizer-signal-api",
    timestamp: new Date().toISOString(),
    checks: {
      authConfigured: authReady,
      storage: "ready",
      productionSafeDefaults: !production || authReady,
    },
    stats,
  };
}

