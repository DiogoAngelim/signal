import type { OutcomeEvaluation, SignalDecisionRecord } from "@signal/decision";
import type {
  CalibrationHistoryEntry,
  DecisionMemoryStore,
  DecisionRecordFilter,
  MemorySummary,
  ReplaySnapshot,
  RetentionJobRecord,
  TrustHistoryEntry,
} from "./types";

export class InMemoryDecisionMemoryStore implements DecisionMemoryStore {
  private readonly decisions = new Map<string, SignalDecisionRecord>();
  private readonly outcomes = new Map<string, OutcomeEvaluation>();
  private readonly replaySnapshots = new Map<string, ReplaySnapshot>();
  private readonly calibrationHistory = new Map<string, CalibrationHistoryEntry>();
  private readonly trustHistory = new Map<string, TrustHistoryEntry>();
  private readonly summaries = new Map<string, MemorySummary>();
  private readonly retentionJobs = new Map<string, RetentionJobRecord>();

  async saveDecisionRecord(record: SignalDecisionRecord): Promise<SignalDecisionRecord> {
    this.decisions.set(record.decisionId, record);
    return record;
  }

  async getDecisionRecord(decisionId: string): Promise<SignalDecisionRecord | undefined> {
    return this.decisions.get(decisionId);
  }

  async listDecisionRecords(filter: DecisionRecordFilter = {}): Promise<SignalDecisionRecord[]> {
    const limit = clampLimit(filter.limit);
    const records = [...this.decisions.values()]
      .filter((record) => matchesFilter(record, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records.slice(0, limit);
  }

  async deleteDecisionRecord(decisionId: string): Promise<void> {
    this.decisions.delete(decisionId);
  }

  async recordOutcome(outcome: OutcomeEvaluation): Promise<OutcomeEvaluation> {
    this.outcomes.set(outcome.outcomeId, outcome);
    const decision = this.decisions.get(outcome.decisionId);
    if (decision) {
      this.decisions.set(outcome.decisionId, { ...decision, outcome });
    }
    return outcome;
  }

  async listOutcomes(decisionId?: string): Promise<OutcomeEvaluation[]> {
    return [...this.outcomes.values()]
      .filter((outcome) => !decisionId || outcome.decisionId === decisionId)
      .sort((a, b) => a.outcomeId.localeCompare(b.outcomeId));
  }

  async saveReplaySnapshot(snapshot: ReplaySnapshot): Promise<ReplaySnapshot> {
    this.replaySnapshots.set(snapshot.snapshotId, snapshot);
    return snapshot;
  }

  async listReplaySnapshots(decisionId?: string): Promise<ReplaySnapshot[]> {
    return [...this.replaySnapshots.values()]
      .filter((snapshot) => !decisionId || snapshot.decisionId === decisionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async recordCalibration(entry: CalibrationHistoryEntry): Promise<CalibrationHistoryEntry> {
    this.calibrationHistory.set(entry.calibrationId, entry);
    return entry;
  }

  async recordTrust(entry: TrustHistoryEntry): Promise<TrustHistoryEntry> {
    this.trustHistory.set(entry.trustId, entry);
    return entry;
  }

  async listCalibrationHistory(decisionId?: string): Promise<CalibrationHistoryEntry[]> {
    return [...this.calibrationHistory.values()]
      .filter((entry) => !decisionId || entry.decisionId === decisionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listTrustHistory(decisionId?: string): Promise<TrustHistoryEntry[]> {
    return [...this.trustHistory.values()]
      .filter((entry) => !decisionId || entry.decisionId === decisionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveSummary(summary: MemorySummary): Promise<MemorySummary> {
    this.summaries.set(summary.summaryId, summary);
    return summary;
  }

  async listSummaries(filter: { source?: string; limit?: number } = {}): Promise<MemorySummary[]> {
    return [...this.summaries.values()]
      .filter((summary) => !filter.source || summary.source === filter.source)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveRetentionJob(job: RetentionJobRecord): Promise<RetentionJobRecord> {
    this.retentionJobs.set(job.jobId, job);
    return job;
  }

  async updateRetentionJob(
    jobId: string,
    patch: Partial<RetentionJobRecord>,
  ): Promise<RetentionJobRecord | undefined> {
    const existing = this.retentionJobs.get(jobId);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.retentionJobs.set(jobId, updated);
    return updated;
  }

  clear(): void {
    this.decisions.clear();
    this.outcomes.clear();
    this.replaySnapshots.clear();
    this.calibrationHistory.clear();
    this.trustHistory.clear();
    this.summaries.clear();
    this.retentionJobs.clear();
  }
}

export function createInMemoryDecisionMemoryStore(): InMemoryDecisionMemoryStore {
  return new InMemoryDecisionMemoryStore();
}

function matchesFilter(record: SignalDecisionRecord, filter: DecisionRecordFilter): boolean {
  if (filter.decisionId && record.decisionId !== filter.decisionId) return false;
  if (filter.source && record.source !== filter.source) return false;
  if (filter.retentionTier && record.retentionTier !== filter.retentionTier) return false;
  if (filter.createdBefore && record.createdAt >= filter.createdBefore) return false;
  if (filter.createdAfter && record.createdAt <= filter.createdAfter) return false;
  return true;
}

function clampLimit(limit: unknown): number {
  const parsed = Number(limit ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(Math.round(parsed), 1_000));
}
