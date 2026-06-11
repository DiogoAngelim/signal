import { ApiProblem } from "../observability/signal-http.js";

export type SignalEnvironmentReport = {
  ok: boolean;
  environment: string;
  storageDriver: string;
  errors: string[];
  warnings: string[];
  settings: {
    queueMaxDepth: number;
    streamMaxClients: number;
    webhookTimeoutMs: number;
    webhookResponseMaxBytes: number;
    webhookRedirectLimit: number;
  };
};

export function validateSignalEnvironment(): SignalEnvironmentReport {
  const environment = process.env.NODE_ENV ?? "development";
  const production = environment === "production";
  const storageDriver =
    process.env.SIGNAL_STORAGE_DRIVER ??
    (process.env.DATABASE_URL ? "postgres" : "memory");
  const errors: string[] = [];
  const warnings: string[] = [];

  if (production && storageDriver !== "postgres") {
    errors.push("Production requires SIGNAL_STORAGE_DRIVER=postgres.");
  }

  if (storageDriver === "postgres" && !process.env.DATABASE_URL) {
    errors.push("Postgres signal storage requires DATABASE_URL.");
  }

  if (production && !process.env.SIGNAL_SECRET_ENCRYPTION_KEY) {
    errors.push(
      "Production requires SIGNAL_SECRET_ENCRYPTION_KEY for API and webhook secret encryption.",
    );
  }

  if (production && process.env.SIGNAL_API_ALLOW_DEV_KEY !== "false") {
    errors.push("Production must set SIGNAL_API_ALLOW_DEV_KEY=false.");
  }

  if (
    production &&
    process.env.SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS === "true"
  ) {
    errors.push("Production cannot allow private webhook targets.");
  }

  if (production && process.env.SIGNAL_API_KEYS) {
    errors.push(
      "Production cannot use plaintext SIGNAL_API_KEYS; use persisted API keys or SIGNAL_BOOTSTRAP_ADMIN_KEY_HASH.",
    );
  }

  if (
    process.env.SIGNAL_REQUIRE_EMIT_SIGNATURE === "true" &&
    !process.env.SIGNAL_INGESTION_SIGNING_SECRET
  ) {
    errors.push(
      "SIGNAL_REQUIRE_EMIT_SIGNATURE=true requires SIGNAL_INGESTION_SIGNING_SECRET.",
    );
  }

  if (!process.env.SIGNAL_API_CORS_ORIGINS && production) {
    warnings.push(
      "Production should set SIGNAL_API_CORS_ORIGINS to explicit consumer origins.",
    );
  }

  if (!process.env.SIGNAL_BACKUP_POLICY_URL && production) {
    warnings.push(
      "Production backup/restore runbook should be linked with SIGNAL_BACKUP_POLICY_URL.",
    );
  }

  return {
    ok: errors.length === 0,
    environment,
    storageDriver,
    errors,
    warnings,
    settings: {
      queueMaxDepth: positiveInt(process.env.SIGNAL_QUEUE_MAX_DEPTH, 10_000),
      streamMaxClients: positiveInt(
        process.env.SIGNAL_STREAM_MAX_CLIENTS,
        1_000,
      ),
      webhookTimeoutMs: positiveInt(
        process.env.SIGNAL_WEBHOOK_TIMEOUT_MS,
        5_000,
      ),
      webhookResponseMaxBytes: positiveInt(
        process.env.SIGNAL_WEBHOOK_RESPONSE_MAX_BYTES,
        64 * 1024,
      ),
      webhookRedirectLimit: positiveInt(
        process.env.SIGNAL_WEBHOOK_REDIRECT_LIMIT,
        3,
      ),
    },
  };
}

export function assertSignalProductionReady() {
  const report = validateSignalEnvironment();
  if (!report.ok) {
    throw new ApiProblem(
      503,
      "unsafe_production_config",
      "Signal API production configuration is not safe.",
      { errors: report.errors },
    );
  }
}

export function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
