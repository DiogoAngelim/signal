export { CompactionJob } from "./compaction";
export { createInMemoryDecisionMemoryStore, InMemoryDecisionMemoryStore } from "./memory-store";
export { NeonPostgresAdapter, SIGNAL_DECISION_MEMORY_MIGRATION_SQL } from "./postgres";
export {
  DEFAULT_RETENTION_POLICY,
  MemoryLifecycle,
  decisionMemoryConfigFromEnv,
  normalizeRetentionPolicy,
  normalizeRetentionTier,
  retentionPolicyFromEnv,
  retentionTierForCreatedAt,
  withLifecycleTier,
} from "./retention";
export {
  DECISION_MEMORY_OPERATION_DEFINITIONS,
  createDecisionMemoryOperations,
  listDecisionMemoryOperations,
  registerDecisionMemoryOperations,
} from "./operations";
export {
  anonymizeExpiredRecord,
  compactDecisionRecord,
  summarizeDecisionRecords,
} from "./summary";
export type {
  CalibrationHistoryEntry,
  CompactionJobInput,
  CompactionJobResult,
  DecisionMemoryConfig,
  DecisionMemoryReplayResult,
  DecisionMemoryStore,
  DecisionRecordFilter,
  DecisionRecordStore,
  ExpiredMemoryMode,
  MemorySummary,
  OutcomeStore,
  ReplaySnapshot,
  ReplayStore,
  RetentionJobRecord,
  RetentionJobStore,
  RetentionPolicy,
  RetentionTier,
  SummaryStore,
  TrustHistoryEntry,
} from "./types";

import { createInMemoryDecisionMemoryStore } from "./memory-store";
import { NeonPostgresAdapter } from "./postgres";
import { decisionMemoryConfigFromEnv } from "./retention";
import type { DecisionMemoryStore } from "./types";

export function createDecisionMemoryStoreFromEnv(env: NodeJS.ProcessEnv = process.env): DecisionMemoryStore {
  const config = decisionMemoryConfigFromEnv(env);
  if (!config.enabled || config.provider === "memory" || !config.databaseUrl) {
    return createInMemoryDecisionMemoryStore();
  }
  return new NeonPostgresAdapter({
    connectionString: config.databaseUrl,
    source: config.source,
  });
}
