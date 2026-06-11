import { validateSignalEnvironment } from "../config/signal-environment.js";
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
  const environment = validateSignalEnvironment();
  const store = getSignalStore();
  const stats = await store.stats();
  const storageHealth = await store.healthCheck();
  const queue = await store.queueStats();
  const production = process.env.NODE_ENV === "production";
  const authReady =
    !production ||
    Boolean(process.env.SIGNAL_BOOTSTRAP_ADMIN_KEY_HASH) ||
    stats.apiKeys > 0;
  const queueReady = queue.queued < environment.settings.queueMaxDepth;
  const ready = environment.ok && storageHealth.ok && authReady && queueReady;

  return {
    status: ready ? "ready" : "not_ready",
    service: "stocks-optimizer-signal-api",
    timestamp: new Date().toISOString(),
    checks: {
      authConfigured: authReady,
      storage: storageHealth,
      queue,
      queueWithinThreshold: queueReady,
      productionSafeDefaults: environment.ok,
      environment,
      ingestionSignatureConfigured:
        !config.requireEmitSignature || Boolean(config.signatureSecret),
    },
    stats,
  };
}
