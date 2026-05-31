import type {
  AccountabilityReport,
  CoherenceAssessment,
  DecisionReplayComparison,
  OutcomeEvaluation,
  SignalDecisionRecord,
} from "@signal/decision";

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
  source?: string;
  retentionTier?: RetentionTier;
  decisionId?: string;
  createdBefore?: string;
  createdAfter?: string;
  limit?: number;
};

export type ReplaySnapshot = {
  snapshotId: string;
  decisionId: string;
  createdAt: string;
  source: string;
  snapshot: unknown;
  retentionTier: RetentionTier;
};

export type CalibrationHistoryEntry = {
  calibrationId: string;
  decisionId?: string;
  createdAt: string;
  source: string;
  impact: number;
  calibration: unknown;
};

export type TrustHistoryEntry = {
  trustId: string;
  decisionId?: string;
  createdAt: string;
  source: string;
  impact: number;
  trust: unknown;
};

export type MemorySummary = {
  summaryId: string;
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
  saveDecisionRecord(record: SignalDecisionRecord): Promise<SignalDecisionRecord>;
  getDecisionRecord(decisionId: string): Promise<SignalDecisionRecord | undefined>;
  listDecisionRecords(filter?: DecisionRecordFilter): Promise<SignalDecisionRecord[]>;
  deleteDecisionRecord?(decisionId: string): Promise<void>;
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
  recordCalibration(entry: CalibrationHistoryEntry): Promise<CalibrationHistoryEntry>;
  recordTrust(entry: TrustHistoryEntry): Promise<TrustHistoryEntry>;
  listCalibrationHistory(decisionId?: string): Promise<CalibrationHistoryEntry[]>;
  listTrustHistory(decisionId?: string): Promise<TrustHistoryEntry[]>;
};

export type SummaryStore = {
  saveSummary(summary: MemorySummary): Promise<MemorySummary>;
  listSummaries(filter?: { source?: string; limit?: number }): Promise<MemorySummary[]>;
};

export type RetentionJobStore = {
  saveRetentionJob(job: RetentionJobRecord): Promise<RetentionJobRecord>;
  updateRetentionJob(jobId: string, patch: Partial<RetentionJobRecord>): Promise<RetentionJobRecord | undefined>;
};

export type DecisionMemoryStore = DecisionRecordStore &
  OutcomeStore &
  ReplayStore &
  CalibrationStore &
  SummaryStore &
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
