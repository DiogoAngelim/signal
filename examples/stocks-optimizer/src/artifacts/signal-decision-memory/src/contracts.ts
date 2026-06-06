import {
  assessCoherence,
  createDecisionRecord,
  evaluateOutcome,
  type CoherenceAssessment,
  type OutcomeEvaluation,
  type SignalDecisionRecord,
} from "@signal/decision";
import { findSimilarRegimes, type CalibrationRecord, type DecisionReview, type LearningRecord, type RegimeSnapshot } from "./learning";
import type {
  CalibrationQueryContractInput,
  CalibrationQueryContractResult,
  DecisionMemoryStore,
  DecisionRecordContractInput,
  LessonRecordContractInput,
  MemoryRecordGovernance,
  MemoryScope,
  MemoryStatsContractInput,
  MemoryStatsContractResult,
  MemoryTimelineContractInput,
  MemoryTimelineContractResult,
  MemoryTimelineEntry,
  OutcomeRecordContractInput,
  ReviewRecordContractInput,
  SimilarityQueryContractInput,
  SimilarityQueryContractResult,
} from "./types";

export const MEMORY_CONTRACT_VERSION = "v1";
export const MEMORY_SCOPE_METADATA_KEY = "signalMemory";

export class MemoryScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryScopeError";
  }
}

export class MemoryAppendOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryAppendOnlyError";
  }
}

export class DecisionMemoryContractAdapter {
  constructor(private readonly store: DecisionMemoryStore) {}

  async recordDecision(input: DecisionRecordContractInput): Promise<SignalDecisionRecord> {
    const scope = assertMemoryScope(input.scope);
    const storageDecisionId = memoryStorageDecisionId(scope);
    const existing = await this.store.getDecisionRecord(storageDecisionId);
    if (existing) {
      throw new MemoryAppendOnlyError(`Decision memory is append-only for ${scopeKey(scope)}.`);
    }

    const governance = governanceFor(scope, input.correlationId, "Decision");
    const source = input.source ?? input.record?.source ?? scope.appId;
    const createdAt = input.record?.createdAt ?? scope.timestamp;
    const coherence = input.coherence ?? input.record?.coherence ?? assessCoherence(input.modules ?? {});
    const record = createDecisionRecord({
      ...(input.record ?? {}),
      decisionId: storageDecisionId,
      originalDecisionId: scope.decisionId,
      appId: scope.appId,
      domain: scope.domain,
      timestamp: scope.timestamp,
      correlationId: governance.correlationId,
      version: governance.version,
      source,
      createdAt,
      observation: scopedPayload(input.observation ?? input.record?.observation ?? {}, governance),
      realitySnapshotId: input.record?.realitySnapshotId ?? `reality:${storageDecisionId}`,
      realitySnapshot: input.record?.realitySnapshot
        ? {
            ...input.record.realitySnapshot,
            snapshotId: input.record.realitySnapshot.snapshotId ?? `reality:${storageDecisionId}`,
            source,
            createdAt,
            metadata: scopedMetadata(input.record.realitySnapshot.metadata, governance),
          }
        : undefined,
      coherence,
      action: input.action ?? input.record?.action,
      humanSummary: input.humanSummary ?? input.record?.humanSummary,
      retentionTier: input.retentionTier ?? input.record?.retentionTier ?? "hot",
    });
    const saved = await this.store.saveDecisionRecord(record);
    await this.store.saveRegimeSnapshot(regimeSnapshotFromDecision(saved, scope, governance));
    return saved;
  }

  async recordOutcome(input: OutcomeRecordContractInput): Promise<OutcomeEvaluation> {
    const scope = assertMemoryScope(input.scope);
    const storageDecisionId = memoryStorageDecisionId(scope);
    await this.requireDecision(storageDecisionId, scope);
    const governance = governanceFor(scope, input.correlationId, "Outcome");
    const outcome = input.outcome
      ? scopeOutcome(input.outcome, scope, governance, storageDecisionId)
      : evaluateOutcome({
          outcomeId: `outcome:${storageDecisionId}:${scope.timestamp}`,
          decisionId: storageDecisionId,
          originalDecisionId: scope.decisionId,
          appId: scope.appId,
          domain: scope.domain,
          timestamp: scope.timestamp,
          correlationId: governance.correlationId,
          version: governance.version,
          expectedConfidence: input.expectedConfidence,
          expectedRisk: input.expectedRisk,
          actualSuccessScore: input.actualSuccessScore,
          purposeAlignment: input.purposeAlignment,
          needAlignment: input.needAlignment,
          realizedReward: input.realizedReward,
          riskTaken: input.riskTaken,
          unexpected: input.unexpected,
          inconclusive: input.inconclusive,
          lessons: input.lessons,
          metadata: scopedMetadata(undefined, governance),
        });
    await this.assertNoOutcome(outcome.outcomeId);
    const saved = await this.store.recordOutcome(outcome);
    await this.saveCalibrationForOutcome(saved, scope, governance);
    await this.attachOutcomeToRegime(saved, scope, governance);
    return saved;
  }

  async recordReview(input: ReviewRecordContractInput): Promise<DecisionReview> {
    const scope = assertMemoryScope(input.scope);
    const storageDecisionId = memoryStorageDecisionId(scope);
    await this.requireDecision(storageDecisionId, scope);
    const governance = governanceFor(scope, input.correlationId, "Review");
    const review: DecisionReview = {
      ...(input.review ?? {}),
      reviewId: input.review?.reviewId ?? `review:${storageDecisionId}:${scope.timestamp}`,
      decisionId: storageDecisionId,
      appId: scope.appId,
      domain: scope.domain,
      timestamp: scope.timestamp,
      correlationId: governance.correlationId,
      version: governance.version,
      source: input.review?.source ?? scope.appId,
      reviewedAt: input.review?.reviewedAt ?? scope.timestamp,
      classification: input.classification ?? input.review?.classification ?? "inconclusive",
      whatWasRecommended: input.whatWasRecommended ?? input.review?.whatWasRecommended ?? "Unknown recommendation.",
      whyRecommended: input.whyRecommended ?? input.review?.whyRecommended ?? "No rationale recorded.",
      whatHappened: input.whatHappened ?? input.review?.whatHappened ?? "Outcome review was inconclusive.",
      lesson: input.lesson ?? input.review?.lesson ?? "Keep the lesson provisional until more reviewed outcomes arrive.",
      confidenceAdjustment: input.confidenceAdjustment ?? input.review?.confidenceAdjustment ?? 0,
      trustAdjustment: input.trustAdjustment ?? input.review?.trustAdjustment ?? 0,
      metadata: scopedMetadata(input.review?.metadata, governance),
    };
    await this.assertNoReview(review.reviewId);
    return this.store.saveDecisionReview(review);
  }

  async recordLesson(input: LessonRecordContractInput): Promise<LearningRecord> {
    const scope = assertMemoryScope(input.scope);
    const storageDecisionId = memoryStorageDecisionId(scope);
    await this.requireDecision(storageDecisionId, scope);
    const governance = governanceFor(scope, input.correlationId, "Lesson");
    const record: LearningRecord = {
      learningId: `lesson:${storageDecisionId}:${scope.timestamp}`,
      appId: scope.appId,
      domain: scope.domain,
      timestamp: scope.timestamp,
      correlationId: governance.correlationId,
      version: governance.version,
      source: scope.appId,
      createdAt: scope.timestamp,
      decisionId: storageDecisionId,
      ...(input.thesisId ? { thesisId: input.thesisId } : {}),
      ...(input.regimeSnapshotId ? { regimeSnapshotId: input.regimeSnapshotId } : {}),
      lesson: input.lesson ?? "Lesson pending review.",
      changes: input.changes ?? ["No behavioral change recorded yet."],
      confidenceAdjustment: input.confidenceAdjustment ?? 0,
      trustAdjustment: input.trustAdjustment ?? 0,
      metadata: scopedMetadata(undefined, governance),
    };
    await this.assertNoLesson(record.learningId);
    return this.store.saveLearningRecord(record);
  }

  async querySimilarity(input: SimilarityQueryContractInput): Promise<SimilarityQueryContractResult> {
    const scope = assertMemoryScope(input.scope);
    const current = input.current ?? await this.currentRegime(scope);
    const history = (await this.store.listRegimeSnapshots({
      appId: scope.appId,
      domain: scope.domain,
      source: scope.appId,
      limit: 1_000,
    })).filter((snapshot) => matchesMemoryScope(snapshot, { appId: scope.appId, domain: scope.domain }));
    const matches = findSimilarRegimes(current, history, {
      limit: input.limit,
      threshold: input.threshold,
    });
    const similarCases = [];
    const lessonReferences: string[] = [];
    const outcomeDistribution: Record<string, number> = {};

    for (const match of matches) {
      const matchedScope = memoryScopeFromRecord(match.snapshot) ?? {
        ...scope,
        decisionId: match.snapshot.decisionId ?? match.snapshot.regimeSnapshotId,
      };
      const lessons = await this.store.listLearningRecords({
        appId: scope.appId,
        domain: scope.domain,
        decisionId: match.snapshot.decisionId,
        limit: 20,
      });
      const references = lessons.map((lesson) => lesson.learningId);
      lessonReferences.push(...references);
      const classification = match.snapshot.eventualOutcome?.classification ?? "unknown";
      outcomeDistribution[classification] = (outcomeDistribution[classification] ?? 0) + 1;
      similarCases.push({
        decisionId: matchedScope.decisionId,
        similarityScore: match.similarity,
        outcomeSummary: match.whatHappened,
        lessonReferences: references,
      });
    }

    return {
      scope,
      similarCases,
      similarityScore: matches[0]?.similarity ?? 0,
      outcomeDistribution,
      lessonReferences: uniqueStrings(lessonReferences),
    };
  }

  async queryCalibration(input: CalibrationQueryContractInput): Promise<CalibrationQueryContractResult> {
    const scope = assertMemoryScope(input.scope);
    const storageDecisionId = memoryStorageDecisionId(scope);
    const records = (await this.store.listCalibrationRecords({
      appId: scope.appId,
      domain: scope.domain,
      decisionId: storageDecisionId,
      limit: input.limit ?? 100,
    })).filter((record) => matchesMemoryScope(record, scope));
    const scores = records.map((record) => record.calibrationScore);
    const averageCalibrationScore = scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;
    const latest = records[0];
    return {
      scope,
      confidenceAccuracy: latest?.actualOutcomeScore == null
        ? 0
        : Math.max(0, Math.round(100 - Math.abs(latest.predictedConfidence - latest.actualOutcomeScore))),
      overconfidence: records.some((record) => record.overconfidenceSignal),
      underconfidence: records.some((record) => record.underconfidenceSignal),
      historicalCalibration: {
        sampleSize: records.length,
        averageCalibrationScore,
        reliabilityTrend: latest?.reliabilityTrend ?? "insufficient-data",
      },
      records,
    };
  }

  async timeline(input: MemoryTimelineContractInput): Promise<MemoryTimelineContractResult> {
    const scope = assertMemoryScope(input.scope);
    const storageDecisionId = memoryStorageDecisionId(scope);
    const decision = await this.store.getDecisionRecord(storageDecisionId) ?? null;
    const outcomes = await this.store.listOutcomes(storageDecisionId);
    const reviews = (await this.store.listDecisionReviews({
      appId: scope.appId,
      domain: scope.domain,
      decisionId: storageDecisionId,
      limit: 1_000,
    })).filter((review) => matchesMemoryScope(review, scope));
    const lessons = (await this.store.listLearningRecords({
      appId: scope.appId,
      domain: scope.domain,
      decisionId: storageDecisionId,
      limit: 1_000,
    })).filter((lesson) => matchesMemoryScope(lesson, scope));
    const entries = [
      ...(decision ? [timelineEntry("Decision", decision.decisionId, decision.createdAt, decision)] : []),
      ...outcomes.map((outcome) => timelineEntry("Outcome", outcome.outcomeId, outcome.timestamp ?? scope.timestamp, outcome)),
      ...reviews.map((review) => timelineEntry("Review", review.reviewId, review.reviewedAt, review)),
      ...lessons.map((lesson) => timelineEntry("Lesson", lesson.learningId, lesson.createdAt, lesson)),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      scope,
      decision,
      outcomes,
      reviews,
      lessons,
      entries,
      orphanLessons: lessons.filter((lesson) => !lesson.decisionId),
    };
  }

  async stats(input: MemoryStatsContractInput): Promise<MemoryStatsContractResult> {
    const appId = requiredText(input.scope.appId, "scope.appId");
    const domain = requiredText(input.scope.domain, "scope.domain");
    const decisions = (await this.store.listDecisionRecords({ appId, domain, source: appId, limit: 1_000 }))
      .filter((decision) => matchesMemoryScope(decision, { appId, domain }));
    const outcomes = (await this.store.listOutcomes()).filter((outcome) => outcome.appId === appId && outcome.domain === domain);
    const reviews = (await this.store.listDecisionReviews({ appId, domain, limit: 1_000 }))
      .filter((review) => matchesMemoryScope(review, { appId, domain }));
    const lessons = (await this.store.listLearningRecords({ appId, domain, limit: 1_000 }))
      .filter((lesson) => matchesMemoryScope(lesson, { appId, domain }));
    const calibrationRecords = (await this.store.listCalibrationRecords({ appId, domain, limit: 1_000 }))
      .filter((record) => matchesMemoryScope(record, { appId, domain }));
    const replaySnapshots = (await Promise.all(decisions.map((decision) => this.store.listReplaySnapshots(decision.decisionId))))
      .flat()
      .filter((snapshot) => snapshot.appId === appId && snapshot.domain === domain);

    return {
      appId,
      domain,
      decisions: decisions.length,
      outcomes: outcomes.length,
      reviews: reviews.length,
      lessons: lessons.length,
      calibrationRecords: calibrationRecords.length,
      replaySnapshots: replaySnapshots.length,
    };
  }

  private async requireDecision(storageDecisionId: string, scope: MemoryScope) {
    const decision = await this.store.getDecisionRecord(storageDecisionId);
    if (!decision) {
      throw new MemoryAppendOnlyError(`Cannot append memory to unknown decision ${scopeKey(scope)}.`);
    }
    return decision;
  }

  private async assertNoOutcome(outcomeId: string) {
    const existing = (await this.store.listOutcomes()).find((outcome) => outcome.outcomeId === outcomeId);
    if (existing) throw new MemoryAppendOnlyError(`Outcome ${outcomeId} already exists.`);
  }

  private async assertNoReview(reviewId: string) {
    const existing = (await this.store.listDecisionReviews({ limit: 1_000 })).find((review) => review.reviewId === reviewId);
    if (existing) throw new MemoryAppendOnlyError(`Review ${reviewId} already exists.`);
  }

  private async assertNoLesson(learningId: string) {
    const existing = (await this.store.listLearningRecords({ limit: 1_000 })).find((lesson) => lesson.learningId === learningId);
    if (existing) throw new MemoryAppendOnlyError(`Lesson ${learningId} already exists.`);
  }

  private async currentRegime(scope: MemoryScope): Promise<RegimeSnapshot> {
    const storageDecisionId = memoryStorageDecisionId(scope);
    const snapshots = (await this.store.listRegimeSnapshots({
      appId: scope.appId,
      domain: scope.domain,
      source: scope.appId,
      decisionId: storageDecisionId,
      limit: 1,
    })).filter((snapshot) => matchesMemoryScope(snapshot, scope));
    return snapshots[0] ?? regimeSnapshotFromDecision(await this.requireDecision(storageDecisionId, scope), scope, governanceFor(scope, undefined, "Similarity"));
  }

  private async saveCalibrationForOutcome(outcome: OutcomeEvaluation, scope: MemoryScope, governance: MemoryRecordGovernance) {
    const decision = await this.store.getDecisionRecord(outcome.decisionId);
    const predictedConfidence = decision?.coherence.score ?? 50;
    const actualOutcomeScore = outcome.successScore;
    const calibrationError = Math.round((predictedConfidence - actualOutcomeScore) * 100) / 100;
    const reliabilityTrend = calibrationError > 12
      ? "overconfident"
      : calibrationError < -12
        ? "underconfident"
        : "aligned";
    const record: CalibrationRecord = {
      calibrationRecordId: `calibration-record:${outcome.decisionId}:${outcome.outcomeId}`,
      appId: scope.appId,
      domain: scope.domain,
      timestamp: scope.timestamp,
      correlationId: governance.correlationId,
      version: governance.version,
      source: scope.appId,
      createdAt: scope.timestamp,
      decisionId: outcome.decisionId,
      predictedConfidence,
      actualOutcomeScore,
      calibrationError,
      calibrationScore: Math.max(0, Math.round(100 - Math.abs(calibrationError))),
      overconfidenceSignal: reliabilityTrend === "overconfident",
      underconfidenceSignal: reliabilityTrend === "underconfident",
      reliabilityTrend,
      sampleSize: 1,
      explanation: `Predicted confidence differed from the reviewed outcome by ${Math.abs(calibrationError)} points.`,
      metadata: scopedMetadata(undefined, { ...governance, recordKind: "Calibration" }),
    };
    await this.store.saveCalibrationRecord(record);
  }

  private async attachOutcomeToRegime(outcome: OutcomeEvaluation, scope: MemoryScope, governance: MemoryRecordGovernance) {
    const snapshots = (await this.store.listRegimeSnapshots({
      appId: scope.appId,
      domain: scope.domain,
      decisionId: outcome.decisionId,
      limit: 1,
    })).filter((snapshot) => matchesMemoryScope(snapshot, scope));
    const snapshot = snapshots[0];
    if (!snapshot) return;
    await this.store.saveRegimeSnapshot({
      ...snapshot,
      eventualOutcome: {
        classification: outcome.category === "success" || outcome.category === "unexpected-success"
          ? "correct"
          : outcome.category === "failure" || outcome.category === "unexpected-failure"
            ? "wrong"
            : "inconclusive",
        summary: outcome.lessons[0] ?? `Outcome recorded as ${outcome.category}.`,
        score: outcome.successScore,
        recordedAt: scope.timestamp,
      },
      metadata: scopedMetadata(snapshot.metadata, governance),
    });
  }
}

export function createDecisionMemoryContractAdapter(store: DecisionMemoryStore): DecisionMemoryContractAdapter {
  return new DecisionMemoryContractAdapter(store);
}

export function assertMemoryScope(scope: MemoryScope | undefined): MemoryScope {
  if (!scope || typeof scope !== "object") {
    throw new MemoryScopeError("Memory operations require explicit scope.");
  }
  return {
    appId: requiredText(scope.appId, "scope.appId"),
    domain: requiredText(scope.domain, "scope.domain"),
    decisionId: requiredText(scope.decisionId, "scope.decisionId"),
    timestamp: validIso(scope.timestamp, "scope.timestamp"),
  };
}

export function memoryStorageDecisionId(scope: MemoryScope): string {
  return [
    "memory",
    encodeScopePart(scope.appId),
    encodeScopePart(scope.domain),
    encodeScopePart(scope.decisionId),
  ].join(":");
}

export function memoryScopeFromRecord(record: unknown): MemoryScope | undefined {
  if (!record || typeof record !== "object") return undefined;
  const object = record as Record<string, unknown>;
  const metadata = metadataFrom(object);
  const metadataScope = metadata ? scopeFromFields(metadata["scope"]) : undefined;
  if (metadataScope) return metadataScope;
  const observation = object["observation"];
  if (observation && typeof observation === "object") {
    const observedMetadata = metadataFrom(observation as Record<string, unknown>);
    const observedScope = observedMetadata ? scopeFromFields(observedMetadata["scope"]) : undefined;
    if (observedScope) return observedScope;
  }
  const direct = scopeFromFields(object);
  if (direct) return direct;
  return undefined;
}

export function matchesMemoryScope(record: unknown, filter: { appId?: string; domain?: string; decisionId?: string }): boolean {
  if (!filter.appId && !filter.domain && !filter.decisionId) return true;
  const scope = memoryScopeFromRecord(record);
  if (!scope) return false;
  if (filter.appId && scope.appId !== filter.appId) return false;
  if (filter.domain && scope.domain !== filter.domain) return false;
  if (filter.decisionId && memoryStorageDecisionId(scope) !== filter.decisionId && scope.decisionId !== filter.decisionId) return false;
  return true;
}

function regimeSnapshotFromDecision(
  record: SignalDecisionRecord,
  scope: MemoryScope,
  governance: MemoryRecordGovernance,
): RegimeSnapshot {
  return {
    regimeSnapshotId: `regime:${record.decisionId}`,
    appId: scope.appId,
    domain: scope.domain,
    decisionId: record.decisionId,
    correlationId: governance.correlationId,
    version: governance.version,
    source: scope.appId,
    marketCategory: scope.domain,
    venue: scope.appId,
    timestamp: scope.timestamp,
    marketHealth: record.coherence.score,
    riskState: record.coherence.status,
    trust: Math.max(0, Math.min(100, record.coherence.score + record.coherence.trustAdjustment)),
    confidence: record.coherence.score,
    readiness: record.coherence.actionAllowed ? Math.max(50, record.coherence.actionScale * 100) : Math.min(49, record.coherence.actionScale * 100),
    exposureGuidance: record.coherence.actionScale,
    opportunityDensity: record.coherence.consensusLevel,
    finalRecommendation: actionLabel(record.action),
    metadata: scopedMetadata(undefined, governance),
  };
}

function scopeOutcome(
  outcome: OutcomeEvaluation,
  scope: MemoryScope,
  governance: MemoryRecordGovernance,
  storageDecisionId: string,
): OutcomeEvaluation {
  return {
    ...outcome,
    outcomeId: outcome.outcomeId ?? `outcome:${storageDecisionId}:${scope.timestamp}`,
    decisionId: storageDecisionId,
    originalDecisionId: scope.decisionId,
    appId: scope.appId,
    domain: scope.domain,
    timestamp: scope.timestamp,
    correlationId: governance.correlationId,
    version: governance.version,
    metadata: scopedMetadata(outcome.metadata, governance),
  };
}

function governanceFor(scope: MemoryScope, correlationId: string | undefined, recordKind: MemoryRecordGovernance["recordKind"]): MemoryRecordGovernance {
  return {
    scope,
    correlationId: correlationId ?? `corr:${memoryStorageDecisionId(scope)}:${recordKind}:${scope.timestamp}`,
    version: MEMORY_CONTRACT_VERSION,
    recordKind,
  };
}

function scopedPayload(value: unknown, governance: MemoryRecordGovernance): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...(value as Record<string, unknown>),
      [MEMORY_SCOPE_METADATA_KEY]: governance,
    };
  }
  return {
    value,
    [MEMORY_SCOPE_METADATA_KEY]: governance,
  };
}

function scopedMetadata(metadata: Record<string, unknown> | undefined, governance: MemoryRecordGovernance): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [MEMORY_SCOPE_METADATA_KEY]: governance,
  };
}

function metadataFrom(object: Record<string, unknown>): Record<string, unknown> | undefined {
  const metadata = object[MEMORY_SCOPE_METADATA_KEY] ?? object["metadata"];
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const nested = (metadata as Record<string, unknown>)[MEMORY_SCOPE_METADATA_KEY];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, unknown>;
    return metadata as Record<string, unknown>;
  }
  return undefined;
}

function scopeFromFields(value: unknown): MemoryScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const appId = stringOrUndefined(object["appId"]);
  const domain = stringOrUndefined(object["domain"]);
  const decisionId = stringOrUndefined(object["originalDecisionId"] ?? object["decisionId"]);
  const timestamp = stringOrUndefined(object["timestamp"] ?? object["createdAt"] ?? object["reviewedAt"] ?? object["recordedAt"]);
  if (!appId || !domain || !decisionId || !timestamp) return undefined;
  return { appId, domain, decisionId, timestamp };
}

function timelineEntry(kind: MemoryTimelineEntry["kind"], id: string, timestamp: string, record: unknown): MemoryTimelineEntry {
  const object = record && typeof record === "object" ? record as Record<string, unknown> : {};
  return {
    kind,
    id,
    timestamp,
    correlationId: stringOrUndefined(object["correlationId"]),
    version: stringOrUndefined(object["version"]),
    record,
  };
}

function actionLabel(action: unknown): string {
  if (typeof action === "string") return action;
  if (action && typeof action === "object") {
    const value = (action as Record<string, unknown>)["action"] ?? (action as Record<string, unknown>)["recommendation"];
    if (typeof value === "string") return value;
  }
  return "review";
}

function scopeKey(scope: MemoryScope): string {
  return `${scope.appId}/${scope.domain}/${scope.decisionId}`;
}

function requiredText(value: unknown, label: string): string {
  const text = stringOrUndefined(value);
  if (!text) throw new MemoryScopeError(`${label} is required for memory scope.`);
  return text;
}

function validIso(value: unknown, label: string): string {
  const text = requiredText(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new MemoryScopeError(`${label} must be a valid timestamp.`);
  }
  return text;
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function encodeScopePart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "~");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
