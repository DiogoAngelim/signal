import type {
  AccountabilityReport,
  CoherenceAssessment,
  DecisionModuleInputs,
  DecisionReplayComparison,
  OutcomeEvaluation,
  RealitySnapshot,
  SignalDecisionRecord,
} from "@signal/decision";
import type {
  CalibrationRecord,
  DecisionReview,
  Evidence,
  LearningRecord,
  ProcessQualityRecord,
  RegimeSnapshot,
  Thesis,
} from "./learning";

export type MemoryScope = {
  appId: string;
  domain: string;
  decisionId: string;
  timestamp: string;
};

export type MemoryRecordKind =
  | "Decision"
  | "Outcome"
  | "Review"
  | "Lesson"
  | "Correction"
  | "Replay"
  | "Calibration"
  | "Similarity";

export type MemoryRecordGovernance = {
  scope: MemoryScope;
  correlationId: string;
  version: "v1";
  recordKind: MemoryRecordKind;
};

export type RetentionTier = "hot" | "warm" | "cold" | "expired";
export type ExpiredMemoryMode = "delete" | "anonymize";

export type RetentionPolicy = {
  hotDays: number;
  warmDays: number;
  coldDays: number;
  expiredMode: ExpiredMemoryMode;
};

export type DecisionMemoryConfig = {
  enabled: boolean;
  provider: "memory" | "postgres";
  source: string;
  databaseUrl?: string;
  retentionPolicy: RetentionPolicy;
};

export type DecisionRecordFilter = {
  appId?: string;
  domain?: string;
  source?: string;
  retentionTier?: RetentionTier;
  decisionId?: string;
  createdBefore?: string;
  createdAfter?: string;
  limit?: number;
};

export type RealitySnapshotFilter = {
  appId?: string;
  domain?: string;
  source?: string;
  snapshotId?: string;
  createdBefore?: string;
  createdAfter?: string;
  limit?: number;
};

export type LearningRecordFilter = {
  appId?: string;
  domain?: string;
  source?: string;
  decisionId?: string;
  thesisId?: string;
  regimeSnapshotId?: string;
  venue?: string;
  createdBefore?: string;
  createdAfter?: string;
  limit?: number;
};

export type ReplaySnapshot = {
  snapshotId: string;
  decisionId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  createdAt: string;
  source: string;
  snapshot: unknown;
  retentionTier: RetentionTier;
};

export type CalibrationHistoryEntry = {
  calibrationId: string;
  decisionId?: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  createdAt: string;
  source: string;
  impact: number;
  calibration: unknown;
};

export type TrustHistoryEntry = {
  trustId: string;
  decisionId?: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  createdAt: string;
  source: string;
  impact: number;
  trust: unknown;
};

export type MemorySummary = {
  summaryId: string;
  appId?: string;
  domain?: string;
  source: string;
  createdAt: string;
  windowStart?: string;
  windowEnd?: string;
  retentionTier: RetentionTier;
  humanSummary: string;
  summary: {
    decisions: number;
    outcomes: number;
    averageCoherence?: number;
    averageOutcomeAccuracy?: number;
    trustChange?: number;
    calibrationChange?: number;
    lessons: string[];
    replayCheckpoints: string[];
    explanations: string[];
  };
};

export type RetentionJobRecord = {
  jobId: string;
  jobType: "compact" | "expire" | "summary";
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  policy: RetentionPolicy;
  result?: unknown;
  error?: string;
};

export type CompactionJobInput = {
  source?: string;
  now?: Date;
  limit?: number;
};

export type CompactionJobResult = {
  jobId: string;
  scanned: number;
  compacted: number;
  summarized: number;
  expired: number;
  anonymized: number;
  deleted: number;
  retained: number;
};

export type DecisionRecordStore = {
  saveDecisionRecord(
    record: SignalDecisionRecord,
  ): Promise<SignalDecisionRecord>;
  getDecisionRecord(
    decisionId: string,
  ): Promise<SignalDecisionRecord | undefined>;
  listDecisionRecords(
    filter?: DecisionRecordFilter,
  ): Promise<SignalDecisionRecord[]>;
  deleteDecisionRecord?(decisionId: string): Promise<void>;
};

export type RealityStore = {
  saveRealitySnapshot(snapshot: RealitySnapshot): Promise<RealitySnapshot>;
  getRealitySnapshot(snapshotId: string): Promise<RealitySnapshot | undefined>;
  listRealitySnapshots(
    filter?: RealitySnapshotFilter,
  ): Promise<RealitySnapshot[]>;
};

export type OutcomeStore = {
  recordOutcome(outcome: OutcomeEvaluation): Promise<OutcomeEvaluation>;
  listOutcomes(decisionId?: string): Promise<OutcomeEvaluation[]>;
};

export type ReplayStore = {
  saveReplaySnapshot(snapshot: ReplaySnapshot): Promise<ReplaySnapshot>;
  listReplaySnapshots(decisionId?: string): Promise<ReplaySnapshot[]>;
};

export type CalibrationStore = {
  recordCalibration(
    entry: CalibrationHistoryEntry,
  ): Promise<CalibrationHistoryEntry>;
  recordTrust(entry: TrustHistoryEntry): Promise<TrustHistoryEntry>;
  listCalibrationHistory(
    decisionId?: string,
  ): Promise<CalibrationHistoryEntry[]>;
  listTrustHistory(decisionId?: string): Promise<TrustHistoryEntry[]>;
};

export type SummaryStore = {
  saveSummary(summary: MemorySummary): Promise<MemorySummary>;
  listSummaries(filter?: {
    appId?: string;
    domain?: string;
    source?: string;
    limit?: number;
  }): Promise<MemorySummary[]>;
};

export type RetentionJobStore = {
  saveRetentionJob(job: RetentionJobRecord): Promise<RetentionJobRecord>;
  updateRetentionJob(
    jobId: string,
    patch: Partial<RetentionJobRecord>,
  ): Promise<RetentionJobRecord | undefined>;
};

export type LearningStore = {
  saveEvidence(evidence: Evidence): Promise<Evidence>;
  listEvidence(filter?: LearningRecordFilter): Promise<Evidence[]>;
  saveThesis(thesis: Thesis): Promise<Thesis>;
  getThesis(thesisId: string): Promise<Thesis | undefined>;
  listTheses(filter?: LearningRecordFilter): Promise<Thesis[]>;
  saveRegimeSnapshot(snapshot: RegimeSnapshot): Promise<RegimeSnapshot>;
  getRegimeSnapshot(
    regimeSnapshotId: string,
  ): Promise<RegimeSnapshot | undefined>;
  listRegimeSnapshots(filter?: LearningRecordFilter): Promise<RegimeSnapshot[]>;
  saveDecisionReview(review: DecisionReview): Promise<DecisionReview>;
  listDecisionReviews(filter?: LearningRecordFilter): Promise<DecisionReview[]>;
  saveLearningRecord(record: LearningRecord): Promise<LearningRecord>;
  listLearningRecords(filter?: LearningRecordFilter): Promise<LearningRecord[]>;
  saveCalibrationRecord(record: CalibrationRecord): Promise<CalibrationRecord>;
  listCalibrationRecords(
    filter?: LearningRecordFilter,
  ): Promise<CalibrationRecord[]>;
  saveProcessQualityRecord(
    record: ProcessQualityRecord,
  ): Promise<ProcessQualityRecord>;
  listProcessQualityRecords(
    filter?: LearningRecordFilter,
  ): Promise<ProcessQualityRecord[]>;
};

export type DecisionMemoryStore = RealityStore &
  DecisionRecordStore &
  OutcomeStore &
  ReplayStore &
  CalibrationStore &
  SummaryStore &
  LearningStore &
  RetentionJobStore & {
    migrate?(): Promise<void>;
    close?(): Promise<void>;
  };

export type DecisionMemoryReplayResult = {
  replay?: DecisionReplayComparison;
  record?: SignalDecisionRecord;
  accountability?: AccountabilityReport;
  currentCoherence?: CoherenceAssessment;
};

export type DecisionRecordContractInput = {
  scope: MemoryScope;
  correlationId?: string;
  record?: SignalDecisionRecord;
  observation?: unknown;
  source?: string;
  modules?: DecisionModuleInputs;
  coherence?: CoherenceAssessment;
  action?: unknown;
  humanSummary?: string;
  retentionTier?: RetentionTier;
};

export type OutcomeRecordContractInput = {
  scope: MemoryScope;
  correlationId?: string;
  outcome?: OutcomeEvaluation;
  expectedConfidence?: number;
  expectedRisk?: number;
  actualSuccessScore?: number;
  purposeAlignment?: number;
  needAlignment?: number;
  realizedReward?: number;
  riskTaken?: number;
  unexpected?: boolean;
  inconclusive?: boolean;
  lessons?: string[];
};

export type ReviewRecordContractInput = {
  scope: MemoryScope;
  correlationId?: string;
  review?: DecisionReview;
  classification?: DecisionReview["classification"];
  whatWasRecommended?: string;
  whyRecommended?: string;
  whatHappened?: string;
  lesson?: string;
  confidenceAdjustment?: number;
  trustAdjustment?: number;
};

export type LessonRecordContractInput = {
  scope: MemoryScope;
  correlationId?: string;
  lesson?: string;
  changes?: string[];
  confidenceAdjustment?: number;
  trustAdjustment?: number;
  thesisId?: string;
  regimeSnapshotId?: string;
};

export type SimilarityQueryContractInput = {
  scope: MemoryScope;
  current?: RegimeSnapshot;
  limit?: number;
  threshold?: number;
};

export type SimilarityQueryContractResult = {
  scope: MemoryScope;
  similarCases: Array<{
    decisionId: string;
    similarityScore: number;
    outcomeSummary: string;
    lessonReferences: string[];
  }>;
  similarityScore: number;
  outcomeDistribution: Record<string, number>;
  lessonReferences: string[];
};

export type CalibrationQueryContractInput = {
  scope: MemoryScope;
  limit?: number;
};

export type CalibrationQueryContractResult = {
  scope: MemoryScope;
  confidenceAccuracy: number;
  overconfidence: boolean;
  underconfidence: boolean;
  historicalCalibration: {
    sampleSize: number;
    averageCalibrationScore: number;
    reliabilityTrend: CalibrationRecord["reliabilityTrend"];
  };
  records: CalibrationRecord[];
};

export type MemoryTimelineEntry = {
  kind: MemoryRecordKind;
  id: string;
  timestamp: string;
  correlationId?: string;
  version?: string;
  record: unknown;
};

export type MemoryTimelineContractInput = {
  scope: MemoryScope;
  includeCorrections?: boolean;
};

export type MemoryTimelineContractResult = {
  scope: MemoryScope;
  decision: SignalDecisionRecord | null;
  outcomes: OutcomeEvaluation[];
  reviews: DecisionReview[];
  lessons: LearningRecord[];
  entries: MemoryTimelineEntry[];
  orphanLessons: LearningRecord[];
};

export type MemoryStatsContractInput = {
  scope: Omit<MemoryScope, "decisionId" | "timestamp"> & {
    decisionId?: string;
    timestamp?: string;
  };
};

export type MemoryStatsContractResult = {
  appId: string;
  domain: string;
  decisions: number;
  outcomes: number;
  reviews: number;
  lessons: number;
  calibrationRecords: number;
  replaySnapshots: number;
};
