import type { SignalDecisionRecord } from "@signal/decision";
import type {
  DecisionMemoryConfig,
  ExpiredMemoryMode,
  RetentionPolicy,
  RetentionTier,
} from "./types";

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  hotDays: 30,
  warmDays: 180,
  coldDays: 365,
  expiredMode: "delete",
};

export function retentionPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RetentionPolicy {
  return {
    hotDays: positiveInt(
      env.SIGNAL_MEMORY_RETENTION_HOT_DAYS,
      DEFAULT_RETENTION_POLICY.hotDays,
    ),
    warmDays: positiveInt(
      env.SIGNAL_MEMORY_RETENTION_WARM_DAYS,
      DEFAULT_RETENTION_POLICY.warmDays,
    ),
    coldDays: positiveInt(
      env.SIGNAL_MEMORY_RETENTION_COLD_DAYS,
      DEFAULT_RETENTION_POLICY.coldDays,
    ),
    expiredMode: expiredMode(env.SIGNAL_MEMORY_EXPIRED_MODE),
  };
}

export function decisionMemoryConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DecisionMemoryConfig {
  const enabled = env.SIGNAL_MEMORY_ENABLED !== "false";
  const provider =
    env.SIGNAL_MEMORY_PROVIDER === "postgres" || env.DATABASE_URL
      ? "postgres"
      : "memory";
  return {
    enabled,
    provider: enabled ? provider : "memory",
    source: env.SIGNAL_SOURCE_ID?.trim() || "signal",
    databaseUrl: env.DATABASE_URL,
    retentionPolicy: retentionPolicyFromEnv(env),
  };
}

export function retentionTierForCreatedAt(
  createdAt: string,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
  now: Date = new Date(),
): RetentionTier {
  const ageDays = ageInDays(createdAt, now);
  if (ageDays <= policy.hotDays) return "hot";
  if (ageDays <= policy.warmDays) return "warm";
  if (ageDays <= policy.coldDays) return "cold";
  return "expired";
}

export function normalizeRetentionTier(
  value: unknown,
  fallback: RetentionTier = "hot",
): RetentionTier {
  if (
    value === "hot" ||
    value === "warm" ||
    value === "cold" ||
    value === "expired"
  )
    return value;
  return fallback;
}

export function withLifecycleTier(
  record: SignalDecisionRecord,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
  now: Date = new Date(),
): SignalDecisionRecord {
  return {
    ...record,
    retentionTier: retentionTierForCreatedAt(record.createdAt, policy, now),
  };
}

export class MemoryLifecycle {
  readonly policy: RetentionPolicy;

  constructor(policy: RetentionPolicy = DEFAULT_RETENTION_POLICY) {
    this.policy = normalizeRetentionPolicy(policy);
  }

  tierFor(
    record: Pick<SignalDecisionRecord, "createdAt">,
    now: Date = new Date(),
  ): RetentionTier {
    return retentionTierForCreatedAt(record.createdAt, this.policy, now);
  }

  apply(
    record: SignalDecisionRecord,
    now: Date = new Date(),
  ): SignalDecisionRecord {
    return withLifecycleTier(record, this.policy, now);
  }

  shouldCompact(record: SignalDecisionRecord, now: Date = new Date()): boolean {
    const tier = this.tierFor(record, now);
    return tier === "warm" || tier === "cold";
  }

  shouldExpire(record: SignalDecisionRecord, now: Date = new Date()): boolean {
    return this.tierFor(record, now) === "expired";
  }
}

export function normalizeRetentionPolicy(
  policy: Partial<RetentionPolicy> = {},
): RetentionPolicy {
  const hotDays = positiveInt(policy.hotDays, DEFAULT_RETENTION_POLICY.hotDays);
  const warmDays = Math.max(
    hotDays,
    positiveInt(policy.warmDays, DEFAULT_RETENTION_POLICY.warmDays),
  );
  const coldDays = Math.max(
    warmDays,
    positiveInt(policy.coldDays, DEFAULT_RETENTION_POLICY.coldDays),
  );
  return {
    hotDays,
    warmDays,
    coldDays,
    expiredMode: policy.expiredMode === "anonymize" ? "anonymize" : "delete",
  };
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function expiredMode(value: unknown): ExpiredMemoryMode {
  return value === "anonymize" ? "anonymize" : "delete";
}

function ageInDays(createdAt: string, now: Date): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, (now.getTime() - created) / 86_400_000);
}
