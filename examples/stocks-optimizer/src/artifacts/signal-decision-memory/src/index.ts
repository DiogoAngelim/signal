export { CompactionJob } from "./compaction";
export {
  buildConvictionProfile,
  buildMindChangeTriggers,
  buildReadinessProfile,
  buildRegimeSnapshot,
  buildTimeHorizonViews,
  createDecisionReview,
  createInvestorLearningAssessment,
  createLearningRecordFromReview,
  createThesis,
  evaluatePortfolioContext,
  findSimilarRegimes,
  generateInvestorNarrative,
  rankOpportunities,
  regimeSimilarity,
  updateThesisStatus,
  validateDecisionRecord,
  validateRegimeSnapshot,
  validateThesis,
} from "./learning";
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
  LearningRecordFilter,
  LearningStore,
  MemorySummary,
  OutcomeStore,
  RealitySnapshotFilter,
  RealityStore,
  ReplaySnapshot,
  ReplayStore,
  RetentionJobRecord,
  RetentionJobStore,
  RetentionPolicy,
  RetentionTier,
  SummaryStore,
  TrustHistoryEntry,
} from "./types";
export type {
  ConvictionProfile,
  DecisionOutcome,
  DecisionOutcomeJudgment,
  DecisionRecord,
  DecisionReview,
  DisconfirmingEvidence,
  Evidence,
  EvidenceDirection,
  Horizon,
  InvestorLearningAssessment,
  InvestorLearningInput,
  InvestorNarrative,
  LearningRecord,
  MindChangeTrigger,
  OpportunityRankingInput,
  OpportunityRankingResult,
  PortfolioContext,
  RankedOpportunity,
  ReadinessProfile,
  RegimeSnapshot,
  SimilarRegime,
  Thesis,
  ThesisStatus,
  TimeHorizonView,
  ValidationResult,
} from "./learning";

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
