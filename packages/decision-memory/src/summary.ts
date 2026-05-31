import type { OutcomeEvaluation, SignalDecisionRecord } from "@signal/decision";
import { normalizeRetentionTier } from "./retention";
import type { MemorySummary, RetentionTier } from "./types";

export function summarizeDecisionRecords(input: {
  records: readonly SignalDecisionRecord[];
  outcomes?: readonly OutcomeEvaluation[];
  source?: string;
  retentionTier?: RetentionTier;
  now?: Date;
}): MemorySummary {
  const now = input.now ?? new Date();
  const records = [...input.records];
  const outcomes = [...(input.outcomes ?? [])];
  const source = input.source ?? records[0]?.source ?? "signal";
  const windowStart = minIso(records.map((record) => record.createdAt));
  const windowEnd = maxIso(records.map((record) => record.createdAt));
  const lessons = uniqueStrings([
    ...outcomes.flatMap((outcome) => outcome.lessons),
    ...records.flatMap((record) => record.outcome?.lessons ?? []),
    ...records.map((record) => lessonFromRecord(record)),
  ]).slice(0, 12);
  const replayCheckpoints = uniqueStrings(
    records.map((record) => {
      const action = actionText(record);
      const score = Math.round(record.coherence?.score ?? 0);
      return `${record.decisionId}: ${action} at ${score}/100 coherence.`;
    }),
  ).slice(0, 20);
  const explanations = uniqueStrings([
    ...records.map((record) => record.humanSummary),
    ...records.flatMap((record) => record.coherence?.explanation ?? []),
  ]).slice(0, 12);
  const averageCoherence = average(records.map((record) => Number(record.coherence?.score)).filter(Number.isFinite));
  const averageOutcomeAccuracy = average(
    outcomes.map((outcome) => Number(outcome.confidenceAccuracy)).filter(Number.isFinite),
  );
  const trustChange = sum(outcomes.map((outcome) => outcome.trustImpact));
  const calibrationChange = sum(outcomes.map((outcome) => outcome.calibrationImpact));
  const retentionTier = normalizeRetentionTier(input.retentionTier, records[0]?.retentionTier ?? "warm");

  return {
    summaryId: stableSummaryId(source, windowStart ?? now.toISOString(), windowEnd ?? now.toISOString(), retentionTier),
    source,
    createdAt: now.toISOString(),
    ...(windowStart ? { windowStart } : {}),
    ...(windowEnd ? { windowEnd } : {}),
    retentionTier,
    humanSummary: humanSummaryFor(records, lessons, averageCoherence),
    summary: {
      decisions: records.length,
      outcomes: outcomes.length,
      ...(averageCoherence === undefined ? {} : { averageCoherence }),
      ...(averageOutcomeAccuracy === undefined ? {} : { averageOutcomeAccuracy }),
      trustChange,
      calibrationChange,
      lessons,
      replayCheckpoints,
      explanations,
    },
  };
}

export function compactDecisionRecord(
  record: SignalDecisionRecord,
  tier: RetentionTier,
  summaryId?: string,
): SignalDecisionRecord {
  if (tier === "hot") {
    return {
      ...record,
      retentionTier: "hot",
    };
  }

  const compactObservation = {
    compacted: true,
    summaryId,
    source: record.source,
    originalCreatedAt: record.createdAt,
    observationKind: objectKind(record.observation),
    lesson: lessonFromRecord(record),
  };

  if (tier === "warm") {
    return {
      ...record,
      observation: compactObservation,
      discovery: compactObject(record.discovery),
      judgment: compactObject(record.judgment),
      purpose: compactObject(record.purpose),
      need: compactObject(record.need),
      action: compactObject(record.action),
      retentionTier: "warm",
    };
  }

  return {
    decisionId: record.decisionId,
    source: record.source,
    createdAt: record.createdAt,
    observation: compactObservation,
    coherence: record.coherence,
    prediction: record.prediction?.map((scenario) => ({
      ...scenario,
      assumptions: scenario.assumptions.slice(0, 2),
      warningSigns: scenario.warningSigns.slice(0, 2),
    })),
    wisdom: record.wisdom,
    outcome: record.outcome,
    accountability: record.accountability,
    humanSummary: record.humanSummary,
    retentionTier: "cold",
  };
}

export function anonymizeExpiredRecord(record: SignalDecisionRecord): SignalDecisionRecord {
  return {
    decisionId: record.decisionId,
    source: record.source,
    createdAt: record.createdAt,
    observation: {
      expired: true,
      source: record.source,
      originalCreatedAt: record.createdAt,
    },
    coherence: record.coherence,
    outcome: record.outcome,
    accountability: record.accountability,
    humanSummary: record.humanSummary || "Expired raw decision inputs were removed; the lesson remains in summaries.",
    retentionTier: "expired",
  };
}

function humanSummaryFor(records: readonly SignalDecisionRecord[], lessons: readonly string[], averageCoherence?: number): string {
  if (!records.length) return "No decisions were available for this memory summary.";
  const coherence = averageCoherence === undefined ? "unknown" : `${Math.round(averageCoherence)}/100`;
  const lesson = lessons[0] ?? "Signal should keep comparing decisions with outcomes before increasing confidence.";
  return `Signal summarized ${records.length} decisions at ${coherence} average coherence. ${lesson}`;
}

function lessonFromRecord(record: SignalDecisionRecord): string {
  if (record.outcome?.lessons?.[0]) return record.outcome.lessons[0];
  if (record.coherence?.actionAllowed === false) {
    return "Caution was preserved when important evidence disagreed.";
  }
  if ((record.coherence?.actionScale ?? 1) < 1) {
    return "Reduced exposure was preferred while uncertainty remained.";
  }
  return "The decision should be compared with its outcome before confidence increases.";
}

function actionText(record: SignalDecisionRecord): string {
  const action = record.action;
  if (action && typeof action === "object" && "action" in action) {
    return String((action as { action?: unknown }).action ?? "tracked");
  }
  return record.coherence?.actionAllowed ? "allowed" : "blocked";
}

function compactObject(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 12);
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of ["score", "confidence", "trust", "risk", "status", "allowed", "reason", "reasons", "explanation"]) {
    if (input[key] !== undefined) output[key] = input[key];
  }
  return Object.keys(output).length ? output : { compacted: true, kind: objectKind(value) };
}

function objectKind(value: unknown): string {
  if (value == null) return "empty";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function average(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function sum(values: readonly number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function minIso(values: readonly string[]): string | undefined {
  const times = values.map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (!times.length) return undefined;
  return new Date(Math.min(...times)).toISOString();
}

function maxIso(values: readonly string[]): string | undefined {
  const times = values.map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (!times.length) return undefined;
  return new Date(Math.max(...times)).toISOString();
}

function stableSummaryId(source: string, start: string, end: string, tier: RetentionTier): string {
  const seed = `${source}:${start}:${end}:${tier}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return `summary:${source}:${tier}:${Math.abs(hash).toString(36)}`;
}
