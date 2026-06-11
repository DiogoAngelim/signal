import {
  type OutcomeEvaluation,
  type RealitySnapshot,
  type SignalDecisionRecord,
  createRealitySnapshotForDecision,
} from "@signal/decision";
import { matchesMemoryScope } from "./contracts";
import type {
  CalibrationRecord,
  DecisionReview,
  Evidence,
  LearningRecord,
  ProcessQualityRecord,
  RegimeSnapshot,
  Thesis,
} from "./learning";
import type {
  CalibrationHistoryEntry,
  DecisionMemoryStore,
  DecisionRecordFilter,
  LearningRecordFilter,
  MemorySummary,
  RealitySnapshotFilter,
  ReplaySnapshot,
  RetentionJobRecord,
  TrustHistoryEntry,
} from "./types";

export class InMemoryDecisionMemoryStore implements DecisionMemoryStore {
  private readonly realitySnapshots = new Map<string, RealitySnapshot>();
  private readonly decisions = new Map<string, SignalDecisionRecord>();
  private readonly outcomes = new Map<string, OutcomeEvaluation>();
  private readonly replaySnapshots = new Map<string, ReplaySnapshot>();
  private readonly calibrationHistory = new Map<
    string,
    CalibrationHistoryEntry
  >();
  private readonly trustHistory = new Map<string, TrustHistoryEntry>();
  private readonly summaries = new Map<string, MemorySummary>();
  private readonly evidence = new Map<string, Evidence>();
  private readonly theses = new Map<string, Thesis>();
  private readonly regimeSnapshots = new Map<string, RegimeSnapshot>();
  private readonly decisionReviews = new Map<string, DecisionReview>();
  private readonly learningRecords = new Map<string, LearningRecord>();
  private readonly calibrationRecords = new Map<string, CalibrationRecord>();
  private readonly processQualityRecords = new Map<
    string,
    ProcessQualityRecord
  >();
  private readonly retentionJobs = new Map<string, RetentionJobRecord>();

  async saveRealitySnapshot(
    snapshot: RealitySnapshot,
  ): Promise<RealitySnapshot> {
    this.realitySnapshots.set(snapshot.snapshotId, snapshot);
    return snapshot;
  }

  async getRealitySnapshot(
    snapshotId: string,
  ): Promise<RealitySnapshot | undefined> {
    return this.realitySnapshots.get(snapshotId);
  }

  async listRealitySnapshots(
    filter: RealitySnapshotFilter = {},
  ): Promise<RealitySnapshot[]> {
    const limit = clampLimit(filter.limit);
    const snapshots = [...this.realitySnapshots.values()]
      .filter((snapshot) => matchesRealityFilter(snapshot, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return snapshots.slice(0, limit);
  }

  async saveDecisionRecord(
    record: SignalDecisionRecord,
  ): Promise<SignalDecisionRecord> {
    const realitySnapshot =
      record.realitySnapshot ?? createRealitySnapshotForDecision(record);
    const normalized = {
      ...record,
      realitySnapshotId: realitySnapshot.snapshotId,
      realitySnapshot,
    };
    await this.saveRealitySnapshot(realitySnapshot);
    this.decisions.set(record.decisionId, normalized);
    return normalized;
  }

  async getDecisionRecord(
    decisionId: string,
  ): Promise<SignalDecisionRecord | undefined> {
    return this.decisions.get(decisionId);
  }

  async listDecisionRecords(
    filter: DecisionRecordFilter = {},
  ): Promise<SignalDecisionRecord[]> {
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

  async recordCalibration(
    entry: CalibrationHistoryEntry,
  ): Promise<CalibrationHistoryEntry> {
    this.calibrationHistory.set(entry.calibrationId, entry);
    return entry;
  }

  async recordTrust(entry: TrustHistoryEntry): Promise<TrustHistoryEntry> {
    this.trustHistory.set(entry.trustId, entry);
    return entry;
  }

  async listCalibrationHistory(
    decisionId?: string,
  ): Promise<CalibrationHistoryEntry[]> {
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

  async listSummaries(
    filter: {
      appId?: string;
      domain?: string;
      source?: string;
      limit?: number;
    } = {},
  ): Promise<MemorySummary[]> {
    return [...this.summaries.values()]
      .filter(
        (summary) =>
          (!filter.source || summary.source === filter.source) &&
          (!filter.appId || summary.appId === filter.appId) &&
          (!filter.domain || summary.domain === filter.domain),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveEvidence(evidence: Evidence): Promise<Evidence> {
    this.evidence.set(evidence.evidenceId, evidence);
    return evidence;
  }

  async listEvidence(filter: LearningRecordFilter = {}): Promise<Evidence[]> {
    return [...this.evidence.values()]
      .filter((evidence) =>
        matchesLearningFilter(
          {
            source: evidence.source,
            appId: evidence.appId,
            domain: evidence.domain,
            decisionId: evidence.decisionId,
            thesisId: evidence.thesisId,
            regimeSnapshotId: evidence.regimeSnapshotId,
            createdAt: evidence.observedAt,
          },
          filter,
        ),
      )
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveThesis(thesis: Thesis): Promise<Thesis> {
    this.theses.set(thesis.thesisId, thesis);
    return thesis;
  }

  async getThesis(thesisId: string): Promise<Thesis | undefined> {
    return this.theses.get(thesisId);
  }

  async listTheses(filter: LearningRecordFilter = {}): Promise<Thesis[]> {
    return [...this.theses.values()]
      .filter((thesis) =>
        matchesLearningFilter(
          {
            source: thesis.source,
            appId: thesis.appId,
            domain: thesis.domain,
            thesisId: thesis.thesisId,
            createdAt: thesis.createdAt,
          },
          filter,
        ),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveRegimeSnapshot(snapshot: RegimeSnapshot): Promise<RegimeSnapshot> {
    this.regimeSnapshots.set(snapshot.regimeSnapshotId, snapshot);
    return snapshot;
  }

  async getRegimeSnapshot(
    regimeSnapshotId: string,
  ): Promise<RegimeSnapshot | undefined> {
    return this.regimeSnapshots.get(regimeSnapshotId);
  }

  async listRegimeSnapshots(
    filter: LearningRecordFilter = {},
  ): Promise<RegimeSnapshot[]> {
    return [...this.regimeSnapshots.values()]
      .filter((snapshot) =>
        matchesLearningFilter(
          {
            source: snapshot.source,
            appId: snapshot.appId,
            domain: snapshot.domain,
            decisionId: snapshot.decisionId,
            regimeSnapshotId: snapshot.regimeSnapshotId,
            venue: snapshot.venue,
            createdAt: snapshot.timestamp,
          },
          filter,
        ),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, clampLimit(filter.limit));
  }

  async saveDecisionReview(review: DecisionReview): Promise<DecisionReview> {
    this.decisionReviews.set(review.reviewId, review);
    return review;
  }

  async listDecisionReviews(
    filter: LearningRecordFilter = {},
  ): Promise<DecisionReview[]> {
    return [...this.decisionReviews.values()]
      .filter((review) =>
        matchesLearningFilter(
          {
            source: review.source,
            appId: review.appId,
            domain: review.domain,
            decisionId: review.decisionId,
            createdAt: review.reviewedAt,
          },
          filter,
        ),
      )
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveLearningRecord(record: LearningRecord): Promise<LearningRecord> {
    this.learningRecords.set(record.learningId, record);
    return record;
  }

  async listLearningRecords(
    filter: LearningRecordFilter = {},
  ): Promise<LearningRecord[]> {
    return [...this.learningRecords.values()]
      .filter((record) =>
        matchesLearningFilter(
          {
            source: record.source,
            appId: record.appId,
            domain: record.domain,
            decisionId: record.decisionId,
            thesisId: record.thesisId,
            regimeSnapshotId: record.regimeSnapshotId,
            createdAt: record.createdAt,
          },
          filter,
        ),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveCalibrationRecord(
    record: CalibrationRecord,
  ): Promise<CalibrationRecord> {
    this.calibrationRecords.set(record.calibrationRecordId, record);
    return record;
  }

  async listCalibrationRecords(
    filter: LearningRecordFilter = {},
  ): Promise<CalibrationRecord[]> {
    return [...this.calibrationRecords.values()]
      .filter((record) =>
        matchesLearningFilter(
          {
            source: record.source,
            appId: record.appId,
            domain: record.domain,
            decisionId: record.decisionId,
            createdAt: record.createdAt,
          },
          filter,
        ),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, clampLimit(filter.limit));
  }

  async saveProcessQualityRecord(
    record: ProcessQualityRecord,
  ): Promise<ProcessQualityRecord> {
    this.processQualityRecords.set(record.processQualityId, record);
    return record;
  }

  async listProcessQualityRecords(
    filter: LearningRecordFilter = {},
  ): Promise<ProcessQualityRecord[]> {
    return [...this.processQualityRecords.values()]
      .filter((record) =>
        matchesLearningFilter(
          {
            source: record.source,
            appId: record.appId,
            domain: record.domain,
            decisionId: record.decisionId,
            createdAt: record.createdAt,
          },
          filter,
        ),
      )
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
    this.realitySnapshots.clear();
    this.decisions.clear();
    this.outcomes.clear();
    this.replaySnapshots.clear();
    this.calibrationHistory.clear();
    this.trustHistory.clear();
    this.summaries.clear();
    this.evidence.clear();
    this.theses.clear();
    this.regimeSnapshots.clear();
    this.decisionReviews.clear();
    this.learningRecords.clear();
    this.calibrationRecords.clear();
    this.processQualityRecords.clear();
    this.retentionJobs.clear();
  }
}

export function createInMemoryDecisionMemoryStore(): InMemoryDecisionMemoryStore {
  return new InMemoryDecisionMemoryStore();
}

function matchesRealityFilter(
  snapshot: RealitySnapshot,
  filter: RealitySnapshotFilter,
): boolean {
  if (!matchesMemoryScope(snapshot, filter)) return false;
  if (filter.snapshotId && snapshot.snapshotId !== filter.snapshotId)
    return false;
  if (filter.source && snapshot.source !== filter.source) return false;
  if (filter.createdBefore && snapshot.createdAt >= filter.createdBefore)
    return false;
  if (filter.createdAfter && snapshot.createdAt <= filter.createdAfter)
    return false;
  return true;
}

function matchesFilter(
  record: SignalDecisionRecord,
  filter: DecisionRecordFilter,
): boolean {
  if (!matchesMemoryScope(record, filter)) return false;
  if (
    filter.decisionId &&
    record.decisionId !== filter.decisionId &&
    !matchesMemoryScope(record, { decisionId: filter.decisionId })
  )
    return false;
  if (filter.source && record.source !== filter.source) return false;
  if (filter.retentionTier && record.retentionTier !== filter.retentionTier)
    return false;
  if (filter.createdBefore && record.createdAt >= filter.createdBefore)
    return false;
  if (filter.createdAfter && record.createdAt <= filter.createdAfter)
    return false;
  return true;
}

function matchesLearningFilter(
  record: {
    appId?: string;
    domain?: string;
    source?: string;
    decisionId?: string;
    thesisId?: string;
    regimeSnapshotId?: string;
    venue?: string;
    createdAt?: string;
  },
  filter: LearningRecordFilter,
): boolean {
  if (filter.appId && record.appId !== filter.appId) return false;
  if (filter.domain && record.domain !== filter.domain) return false;
  if (filter.source && record.source !== filter.source) return false;
  if (filter.decisionId && record.decisionId !== filter.decisionId)
    return false;
  if (filter.thesisId && record.thesisId !== filter.thesisId) return false;
  if (
    filter.regimeSnapshotId &&
    record.regimeSnapshotId !== filter.regimeSnapshotId
  )
    return false;
  if (filter.venue && record.venue !== filter.venue) return false;
  if (filter.createdBefore && (record.createdAt ?? "") >= filter.createdBefore)
    return false;
  if (filter.createdAfter && (record.createdAt ?? "") <= filter.createdAfter)
    return false;
  return true;
}

function clampLimit(limit: unknown): number {
  const parsed = Number(limit ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(Math.round(parsed), 1_000));
}
