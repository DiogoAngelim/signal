import {
  assessCoherence,
  assessDecisionEvidence,
  attachAccountability,
  createAccountabilityReport,
  createDecisionRecord,
  createInMemoryDecisionRecordStore,
  replayDecision,
  reviewDecisionOutcome,
} from "@signal/decision/core";
import type {
  DecisionEvidence,
  DecisionOutcomeReview,
  DecisionOutcomeReviewInput,
  DecisionReplayComparison,
  DecisionRecordStore,
  DecisionStewardshipAssessment,
  SignalDecisionRecord,
} from "@signal/decision/core";

export type Severity = "low" | "medium" | "high" | "critical";
export type EvidenceDirection = "supporting" | "contradicting" | "neutral";
export type TriagePriority = "monitor" | "analyst-review" | "escalate";

export interface AlertSignal {
  readonly id: string;
  readonly observedAt: string;
  readonly source: string;
  readonly summary: string;
  readonly direction: EvidenceDirection;
  readonly quality: number;
  readonly reliability: number;
  readonly freshness: number;
  readonly independence: number;
  readonly traceability: number;
}

export interface SecurityAlert {
  readonly alertId: string;
  readonly observedAt: string;
  readonly severity: Severity;
  readonly assetCriticality: number;
  readonly summary: string;
  readonly signals: readonly AlertSignal[];
}

/**
 * The exact application inputs available at decision time. Outcomes are
 * intentionally not part of this type.
 */
export interface DecisionTimeSnapshot {
  readonly alert: SecurityAlert;
  readonly capturedAt: string;
  readonly estimator: {
    readonly name: "local-heuristic-v1";
    readonly score: number;
  };
}

export interface EvaluatedDecision {
  readonly snapshot: DecisionTimeSnapshot;
  readonly priority: TriagePriority;
  readonly rationale: string;
  readonly assessment: ReturnType<typeof assessDecisionEvidence>;
  readonly record: SignalDecisionRecord;
}

export interface ReplayVerification {
  readonly decisionId: string;
  readonly result: "same-result" | "changed-result";
  readonly differences: readonly string[];
  /** Signal compares the original and new coherence assessments here. */
  readonly signalComparison: DecisionReplayComparison;
}

export interface OutcomeReview extends Omit<
  DecisionOutcomeReviewInput,
  "decisionId"
> {
  readonly decisionId?: string;
}

export const TRIAGE_RULES = {
  monitorMaximumScore: 30,
  minimumStrongSourcesToEscalate: 2,
  minimumQuality: 70,
  minimumReliability: 70,
  minimumFreshness: 60,
  minimumIndependence: 70,
  minimumTraceability: 60,
} as const;

const SEVERITY_BASE: Record<Severity, number> = {
  low: 12,
  medium: 32,
  high: 58,
  critical: 74,
};

/**
 * Strictly validates the small input contract used in this teaching example.
 * Invalid or incomplete input is rejected rather than silently defaulted.
 */
export function validateAlert(value: unknown): SecurityAlert {
  const alert = asRecord(value, "alert");
  const severity = requiredString(alert.severity, "alert.severity");
  if (!isSeverity(severity)) {
    throw new TypeError(
      "alert.severity must be low, medium, high, or critical",
    );
  }

  if (!Array.isArray(alert.signals)) {
    throw new TypeError("alert.signals must be an array");
  }
  if (alert.signals.length > 100) {
    throw new TypeError("alert.signals must contain at most 100 items");
  }

  const signals = alert.signals.map((value, index) => {
    const signal = asRecord(value, `alert.signals[${index}]`);
    const direction = requiredString(
      signal.direction,
      `alert.signals[${index}].direction`,
    );
    if (!isDirection(direction)) {
      throw new TypeError(
        `alert.signals[${index}].direction must be supporting, contradicting, or neutral`,
      );
    }

    return {
      id: requiredString(signal.id, `alert.signals[${index}].id`),
      observedAt: requiredTimestamp(
        signal.observedAt,
        `alert.signals[${index}].observedAt`,
      ),
      source: requiredString(signal.source, `alert.signals[${index}].source`),
      summary: requiredString(
        signal.summary,
        `alert.signals[${index}].summary`,
      ),
      direction,
      quality: boundedScore(signal.quality, `alert.signals[${index}].quality`),
      reliability: boundedScore(
        signal.reliability,
        `alert.signals[${index}].reliability`,
      ),
      freshness: boundedScore(
        signal.freshness,
        `alert.signals[${index}].freshness`,
      ),
      independence: boundedScore(
        signal.independence,
        `alert.signals[${index}].independence`,
      ),
      traceability: boundedScore(
        signal.traceability,
        `alert.signals[${index}].traceability`,
      ),
    } satisfies AlertSignal;
  });

  const seenIds = new Set<string>();
  for (const signal of signals) {
    if (seenIds.has(signal.id)) {
      throw new TypeError(`alert.signals contains duplicate id "${signal.id}"`);
    }
    seenIds.add(signal.id);
  }

  return {
    alertId: requiredString(alert.alertId, "alert.alertId"),
    observedAt: requiredTimestamp(alert.observedAt, "alert.observedAt"),
    severity,
    assetCriticality: boundedScore(
      alert.assetCriticality,
      "alert.assetCriticality",
    ),
    summary: requiredString(alert.summary, "alert.summary"),
    signals,
  };
}

/**
 * Evaluates only captured alert-time facts. Pass the capture timestamp
 * explicitly so identical inputs produce identical records and journals.
 */
export function evaluateAlert(
  rawAlert: unknown,
  capturedAt: string,
): EvaluatedDecision {
  const alert = validateAlert(rawAlert);
  const decisionAt = requiredTimestamp(capturedAt, "capturedAt");
  const decisionId = `security-alert:${alert.alertId}`;
  const modelScore = estimateRiskLocally(alert);
  const snapshot: DecisionTimeSnapshot = {
    alert,
    capturedAt: decisionAt,
    estimator: { name: "local-heuristic-v1", score: modelScore },
  };
  const signalEvidence = alert.signals.map((signal) => ({
    evidenceId: `signal:${signal.id}`,
    label: signal.id,
    summary: signal.summary,
    direction: signal.direction,
    quality: signal.quality,
    reliability: signal.reliability,
    freshness: signal.freshness,
    independence: signal.independence,
    traceability: signal.traceability,
    source: signal.source,
    observedAt: signal.observedAt,
    supports: signal.direction === "supporting" ? ["security threat"] : [],
    contradicts:
      signal.direction === "contradicting" ? ["security threat"] : [],
  }));
  const assessment = assessDecisionEvidence({
    decisionId,
    createdAt: decisionAt,
    evidence: [
      {
        evidenceId: "alert:severity",
        label: "Reported alert severity",
        summary: `The alert envelope reports ${alert.severity} severity.`,
        direction: "neutral",
        quality: 65,
        reliability: 65,
        freshness: 100,
        independence: 50,
        traceability: 100,
        source: "alert-envelope",
        observedAt: alert.observedAt,
      },
      ...signalEvidence,
      {
        evidenceId: "model:risk-estimate",
        label: "Advisory local risk estimate",
        summary: `The local heuristic estimates risk at ${modelScore}/100; this score is not a decision or authorization.`,
        direction: "neutral",
        quality: 45,
        reliability: 40,
        freshness: 100,
        independence: 0,
        traceability: 100,
        source: "local-heuristic-v1",
        observedAt: decisionAt,
        metadata: { score: modelScore, version: "local-heuristic-v1" },
      },
    ],
    known: [
      {
        label: `The alert envelope reports ${alert.severity} severity`,
        evidenceIds: ["alert:severity"],
      },
    ],
    unknowns: [
      {
        label:
          "Whether the available indicators are complete and independently corroborated",
        evidenceIds: signalEvidence.map((item) => item.evidenceId),
      },
    ],
    assumptions: [
      {
        label: "Source identifiers accurately distinguish evidence sources",
        evidenceIds: signalEvidence.map((item) => item.evidenceId),
        reviewAfter: "outcome",
      },
    ],
    contradicted: alert.signals
      .filter((signal) => signal.direction === "contradicting")
      .map((signal) => ({
        label: signal.summary,
        evidenceIds: [`signal:${signal.id}`],
      })),
    desiredConfidence: 90,
    importance: alert.assetCriticality,
    reasoningSummary:
      "Triage uses evidence quality, source independence, and contradictions. The local model score is advisory and cannot by itself trigger escalation.",
  });

  const strongSupportingSignals = assessment.evidence.filter(
    (item) =>
      item.evidenceId.startsWith("signal:") &&
      item.direction === "supporting" &&
      meetsStrongEvidenceThresholds(item),
  );
  const strongSupportingSources = new Set(
    strongSupportingSignals.map((item) => item.source).filter(isString),
  );
  const contradictorySignals = assessment.evidence.filter(
    (item) =>
      item.evidenceId.startsWith("signal:") &&
      item.direction === "contradicting",
  );

  const canEscalate =
    alert.severity === "critical" &&
    strongSupportingSources.size >=
      TRIAGE_RULES.minimumStrongSourcesToEscalate &&
    contradictorySignals.length === 0;

  const canMonitor =
    modelScore <= TRIAGE_RULES.monitorMaximumScore &&
    (alert.severity === "low" || alert.severity === "medium") &&
    alert.signals.length === 0;

  const priority: TriagePriority = canEscalate
    ? "escalate"
    : canMonitor
      ? "monitor"
      : "analyst-review";
  const rationale = buildRationale({
    alert,
    modelScore,
    priority,
    supporting: strongSupportingSignals,
    contradictory: contradictorySignals,
  });

  // Signal's decision record requires a coherence assessment. This generic
  // coherence summary is recorded for audit/replay; the explicit security
  // policy above, not coherence.actionAllowed, selects the triage priority.
  const coherence = assessCoherence({
    discovery: {
      score: assessment.evidenceQuality.coverage,
      confidence: assessment.evidenceQuality.quality,
      reasons: ["Coverage is derived from the captured assessment evidence."],
    },
    judgment: {
      score: assessment.confidence.capped,
      confidence: assessment.confidence.capped,
      reasons: ["Confidence is capped by Signal's evidence assessment."],
    },
    awareness: {
      score: assessment.evidenceQuality.freshness,
      confidence: assessment.evidenceQuality.freshness,
      reasons: ["Freshness is measured from decision-time evidence."],
    },
  });
  const initialRecord = createDecisionRecord({
    decisionId,
    createdAt: decisionAt,
    source: "ai-security-triage-example",
    appId: "signal-ai-decision-system",
    domain: "security-alert-triage",
    version: "1",
    observation: snapshot,
    realitySnapshot: {
      snapshotId: `reality:${decisionId}`,
      source: "synthetic-security-alert",
      createdAt: decisionAt,
      dataQuality: assessment.evidenceQuality.quality,
      freshnessScore: assessment.evidenceQuality.freshness,
      payload: snapshot,
      sourceRef: {
        sourceId: "local-example-fixture",
        name: "Synthetic deterministic fixture",
        sourceType: "system",
        reliabilityScore: 100,
      },
    },
    coherence,
    assessment,
    humanSummary: rationale,
    retentionTier: "hot",
  });
  const accountability = createAccountabilityReport({
    record: initialRecord,
    decisionSummary: rationale,
  });
  const record = attachAccountability(initialRecord, accountability);

  return { snapshot, priority, rationale, assessment, record };
}

/**
 * Re-runs the deterministic example from the original decision-time snapshot.
 * Signal's replay helper compares coherence assessments; this wrapper also
 * compares the example's priority and estimator score.
 */
export function replayCapturedDecision(
  original: EvaluatedDecision,
): ReplayVerification {
  const replayed = evaluateAlert(
    original.snapshot.alert,
    original.snapshot.capturedAt,
  );
  const signalComparison = replayDecision({
    record: original.record,
    currentCoherence: replayed.record.coherence,
  });
  const differences: string[] = [];
  if (replayed.priority !== original.priority) {
    differences.push(
      `Priority changed from ${original.priority} to ${replayed.priority}.`,
    );
  }
  if (replayed.snapshot.estimator.score !== original.snapshot.estimator.score) {
    differences.push("The local risk estimate changed.");
  }
  if (
    replayed.assessment.journal.reasoningSummary !==
      original.assessment.journal.reasoningSummary ||
    replayed.assessment.journal.evidenceUsed.join("|") !==
      original.assessment.journal.evidenceUsed.join("|")
  ) {
    differences.push("The decision-time assessment journal changed.");
  }
  if (signalComparison.replayResult !== "same-decision") {
    differences.push(...signalComparison.differences);
  }

  return {
    decisionId: original.record.decisionId,
    result: differences.length === 0 ? "same-result" : "changed-result",
    differences,
    signalComparison,
  };
}

/** Stores the record in Signal's explicitly in-memory example store. */
export function storeDecision(
  store: DecisionRecordStore,
  decision: EvaluatedDecision,
): SignalDecisionRecord {
  return store.save(decision.record);
}

/**
 * Reviews a later, supplied outcome without changing the original record or
 * feeding future knowledge back into evaluateAlert.
 */
export function reviewLaterOutcome(
  decision: EvaluatedDecision,
  review: OutcomeReview,
): DecisionOutcomeReview {
  if (
    review.decisionId !== undefined &&
    review.decisionId !== decision.record.decisionId
  ) {
    throw new TypeError("Outcome review decisionId does not match the record");
  }
  return reviewDecisionOutcome({
    ...review,
    decisionId: decision.record.decisionId,
  });
}

export function createExampleStore(): DecisionRecordStore {
  return createInMemoryDecisionRecordStore();
}

/** Fixed fixtures make `pnpm start` reproducible without network services. */
export const EXAMPLE_ALERTS: readonly SecurityAlert[] = [
  {
    alertId: "confirmed-critical",
    observedAt: "2025-02-10T09:14:00.000Z",
    severity: "critical",
    assetCriticality: 92,
    summary: "Unexpected privileged process activity on a critical host.",
    signals: [
      {
        id: "endpoint-process",
        observedAt: "2025-02-10T09:14:00.000Z",
        source: "endpoint-agent-east",
        summary:
          "Endpoint telemetry recorded an unsigned process spawning a shell.",
        direction: "supporting",
        quality: 92,
        reliability: 90,
        freshness: 98,
        independence: 88,
        traceability: 100,
      },
      {
        id: "identity-session",
        observedAt: "2025-02-10T09:14:30.000Z",
        source: "identity-provider",
        summary:
          "Identity telemetry recorded an unfamiliar privileged session.",
        direction: "supporting",
        quality: 88,
        reliability: 86,
        freshness: 96,
        independence: 90,
        traceability: 100,
      },
    ],
  },
  {
    alertId: "high-score-unconfirmed",
    observedAt: "2025-02-10T09:20:00.000Z",
    severity: "critical",
    assetCriticality: 100,
    summary: "High model score with no corroborating telemetry attached.",
    signals: [],
  },
  {
    alertId: "low-background",
    observedAt: "2025-02-10T09:25:00.000Z",
    severity: "low",
    assetCriticality: 12,
    summary: "Low-severity background scan with no corroborating evidence.",
    signals: [],
  },
];

function estimateRiskLocally(alert: SecurityAlert): number {
  const supporting = alert.signals.filter(
    (signal) => signal.direction === "supporting",
  ).length;
  const contradicting = alert.signals.filter(
    (signal) => signal.direction === "contradicting",
  ).length;
  const estimate =
    SEVERITY_BASE[alert.severity] +
    Math.round(alert.assetCriticality * 0.2) +
    Math.min(16, supporting * 4) -
    Math.min(12, contradicting * 4);
  return Math.max(0, Math.min(100, estimate));
}

function meetsStrongEvidenceThresholds(evidence: DecisionEvidence): boolean {
  return (
    evidence.quality >= TRIAGE_RULES.minimumQuality &&
    evidence.reliability >= TRIAGE_RULES.minimumReliability &&
    evidence.freshness >= TRIAGE_RULES.minimumFreshness &&
    evidence.independence >= TRIAGE_RULES.minimumIndependence &&
    evidence.traceability >= TRIAGE_RULES.minimumTraceability
  );
}

function buildRationale(input: {
  alert: SecurityAlert;
  modelScore: number;
  priority: TriagePriority;
  supporting: readonly DecisionEvidence[];
  contradictory: readonly DecisionEvidence[];
}): string {
  const evidenceNames = (items: readonly DecisionEvidence[]) =>
    items.map((item) => `"${item.label}" — ${item.summary}`).join(", ");
  const modelNote = ` Advisory model estimate: ${input.modelScore}/100; it is contextual evidence, not an escalation trigger.`;

  if (input.priority === "escalate") {
    return (
      `Escalate because the alert is critical and at least ${TRIAGE_RULES.minimumStrongSourcesToEscalate} independent sources meet the evidence-quality thresholds: ${evidenceNames(input.supporting)}.` +
      modelNote
    );
  }

  if (input.priority === "monitor") {
    return (
      `Monitor because severity is ${input.alert.severity}, no telemetry signals were provided, and the advisory estimate is at or below ${TRIAGE_RULES.monitorMaximumScore}/100.` +
      modelNote
    );
  }

  const reasons: string[] = [];
  if (input.contradictory.length > 0) {
    reasons.push(
      `Contradictory evidence requires analyst review: ${evidenceNames(input.contradictory)}.`,
    );
  }
  const distinctStrongSources = new Set(
    input.supporting.map((item) => item.source).filter(isString),
  ).size;
  if (
    input.alert.severity === "critical" &&
    distinctStrongSources < TRIAGE_RULES.minimumStrongSourcesToEscalate
  ) {
    reasons.push(
      `Escalation requires ${TRIAGE_RULES.minimumStrongSourcesToEscalate} independent high-quality supporting sources; only ${distinctStrongSources} qualified.`,
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      "Available evidence does not meet the explicit rule for escalation or low-risk monitoring.",
    );
  }
  return reasons.join(" ") + modelNote;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function requiredTimestamp(value: unknown, path: string): string {
  const timestamp = requiredString(value, path);
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      timestamp,
    );
  if (!parts || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError(
      `${path} must be a valid date-time string in ISO 8601 format`,
    );
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonthByMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const daysInMonth =
    month >= 1 && month <= 12 ? daysInMonthByMonth[month - 1] : 0;
  if (
    year < 1 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new TypeError(
      `${path} must be a valid date-time string in ISO 8601 format`,
    );
  }
  const timezone = parts[7];
  if (timezone !== "Z") {
    const offsetParts = /^[+-](\d{2}):(\d{2})$/.exec(timezone);
    if (
      !offsetParts ||
      Number(offsetParts[1]) > 23 ||
      Number(offsetParts[2]) > 59
    ) {
      throw new TypeError(
        `${path} must be a valid date-time string in ISO 8601 format`,
      );
    }
  }
  return timestamp;
}

function boundedScore(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new TypeError(`${path} must be a finite number from 0 to 100`);
  }
  return value;
}

function isSeverity(value: string): value is Severity {
  return ["low", "medium", "high", "critical"].includes(value);
}

function isDirection(value: string): value is EvidenceDirection {
  return ["supporting", "contradicting", "neutral"].includes(value);
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

export function describeDecision(decision: EvaluatedDecision): string {
  const uncertainty = decision.assessment.unknowns
    .map((fact) => fact.label)
    .join("; ");
  const stewardship: DecisionStewardshipAssessment =
    decision.assessment.stewardship;
  return [
    `${decision.record.decisionId}: ${decision.priority}`,
    `Risk estimate ${decision.snapshot.estimator.score}/100 (local heuristic; not decisive)`,
    `Signal confidence ${decision.assessment.confidence.capped}/100`,
    `Signal stewardship (separate advisory): ${stewardship.recommendation}`,
    `Rationale: ${decision.rationale}`,
    `Uncertainty: ${uncertainty || "No additional uncertainty recorded."}`,
  ].join("\n");
}

export function runExample(): string {
  const store = createExampleStore();
  const output = EXAMPLE_ALERTS.map((alert) => {
    const decision = evaluateAlert(alert, alert.observedAt);
    storeDecision(store, decision);
    const replay = replayCapturedDecision(decision);
    return [
      describeDecision(decision),
      `Signal replay comparison: ${replay.signalComparison.replayResult}`,
      `Example replay result: ${replay.result}`,
    ].join("\n");
  });
  return output.join("\n\n---\n\n");
}

if (require.main === module) {
  process.stdout.write(`${runExample()}\n`);
}
