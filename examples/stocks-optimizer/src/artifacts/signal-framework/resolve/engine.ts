export type ResolveDecision =
  | "commit"
  | "wait"
  | "escalate"
  | "reject"
  | "invalidate";

export type CommitmentLevel =
  | "none"
  | "watch"
  | "limited"
  | "graduated"
  | "full";

export interface ResolveThresholds {
  minCommitScore: number;
  minAgencyTrust: number;
  minTrustScore: number;
  minCalibratedConfidence: number;
  minJudgementReliability: number;
  maxOverfitRisk: number;
  maxBeliefFragility: number;
  minDataReliability: number;
  minSimilarSamples: number;
  maxRiskScore: number;
}

export interface ResolveInput {
  actionName?: string;
  agencyRecommendation?: string;
  agencyTrust?: number;
  trustScore?: number;
  calibratedConfidence?: number;
  rawConfidence?: number;
  judgementReliability?: number;
  outcomeStability?: number;
  overfitRisk?: number;
  riskScore?: number;
  dataReliability?: number;
  beliefConfidence?: number;
  beliefFragility?: number;
  wisdomScore?: number;
  decisionQuality?: number;
  opportunityCost?: number;
  restrictionValue?: number;
  sizingMode?: string;
  suggestedExposure?: number;
  maxTrustedExposure?: number;
  blockedActions?: number;
  missingOutcomes?: number;
  similarSamples?: number;
  positiveOutcomes?: number;
  negativeOutcomes?: number;
  evidence?: Record<string, unknown>;
  thresholds?: Partial<ResolveThresholds>;
  createdAt?: string;
}

export type ResolveTrace = {
  id: string;
  label: string;
  value: number | string | null;
  score: number;
  weight: number;
  passed: boolean;
  threshold?: number;
  reason: string;
};

export interface ResolveOutput {
  decision: ResolveDecision;
  commitmentLevel: CommitmentLevel;
  resolveScore: number;
  requiredScore: number;
  humanReviewRequired: boolean;
  missingEvidence: string[];
  unlockConditions: string[];
  invalidationConditions: string[];
  explanation: string;
  traces: ResolveTrace[];
  metadata: {
    module: "resolve";
    version: "v1";
    createdAt: string;
  };
}

type NormalizedResolveInput = {
  agencyRecommendation: string;
  agencyTrust: number | null;
  trustScore: number | null;
  calibratedConfidence: number | null;
  rawConfidence: number | null;
  judgementReliability: number | null;
  outcomeStability: number | null;
  overfitRisk: number | null;
  riskScore: number | null;
  dataReliability: number | null;
  beliefConfidence: number | null;
  beliefFragility: number | null;
  wisdomScore: number | null;
  decisionQuality: number | null;
  opportunityCost: number | null;
  restrictionValue: number | null;
  suggestedExposure: number | null;
  maxTrustedExposure: number | null;
  blockedActions: number;
  missingOutcomes: number;
  similarSamples: number | null;
  positiveOutcomes: number;
  negativeOutcomes: number;
};

type ResolveContext = {
  input: ResolveInput;
  normalized: NormalizedResolveInput;
  thresholds: ResolveThresholds;
  resolveScore: number;
  requiredScore: number;
  traces: ResolveTrace[];
  missingEvidence: string[];
  unlockConditions: string[];
  invalidationConditions: string[];
  humanReviewRequired: boolean;
};

const DEFAULT_THRESHOLDS: ResolveThresholds = {
  minCommitScore: 75,
  minAgencyTrust: 70,
  minTrustScore: 70,
  minCalibratedConfidence: 65,
  minJudgementReliability: 65,
  maxOverfitRisk: 35,
  maxBeliefFragility: 55,
  minDataReliability: 70,
  minSimilarSamples: 8,
  maxRiskScore: 70,
};

const TRACE_WEIGHTS = {
  agency: 0.16,
  trust: 0.16,
  confidence: 0.14,
  judgement: 0.12,
  stability: 0.1,
  data: 0.12,
  risk: 0.08,
  overfit: 0.06,
  belief: 0.06,
  wisdom: 0.1,
};

const REVIEW_RECOMMENDATIONS = new Set([
  "requires-human-review",
  "requires-review",
  "human-review",
  "review",
  "escalate",
  "defer",
  "deferred",
]);

const REJECT_RECOMMENDATIONS = new Set([
  "reject",
  "rejected",
  "deny",
  "denied",
  "block",
  "blocked",
]);

const COMMIT_RECOMMENDATIONS = new Set([
  "act",
  "act-with-reduced-size",
  "approve",
  "approved",
  "allow",
  "allowed",
  "commit",
  "open",
  "execute",
]);

const WAIT_RECOMMENDATIONS = new Set([
  "",
  "wait",
  "watch",
  "observe",
  "hold",
  "paper",
  "paper-trade",
]);

export function resolveCommitment(input: ResolveInput = {}): ResolveOutput {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const normalized = normalizeInput(input);
  const traces = buildTraces(normalized, thresholds);
  const resolveScore = roundScore(weightedScore(traces));
  const requiredScore = roundScore(clamp(thresholds.minCommitScore));
  const missingEvidence = missingEvidenceFor(input, normalized, thresholds);
  const unlockConditions = unlockConditionsFor(input, normalized, thresholds);
  const invalidationConditions = invalidationConditionsFor(input, normalized, thresholds);
  const humanReviewRequired = humanReviewRequiredFor(input, normalized);
  const context: ResolveContext = {
    input,
    normalized,
    thresholds,
    resolveScore,
    requiredScore,
    traces,
    missingEvidence,
    unlockConditions,
    invalidationConditions,
    humanReviewRequired,
  };
  const decision = decisionFor(context);
  const commitmentLevel = commitmentLevelFor(input, decision, resolveScore, requiredScore);

  return {
    decision,
    commitmentLevel,
    resolveScore,
    requiredScore,
    humanReviewRequired,
    missingEvidence,
    unlockConditions,
    invalidationConditions,
    explanation: explanationFor(input, decision, commitmentLevel, context),
    traces,
    metadata: {
      module: "resolve",
      version: "v1",
      createdAt: createdAtFor(input),
    },
  };
}

export const evaluateResolve = resolveCommitment;
export const resolveActionCommitment = resolveCommitment;

function buildTraces(input: NormalizedResolveInput, thresholds: ResolveThresholds): ResolveTrace[] {
  const recommendationScore = recommendationScoreFor(input.agencyRecommendation);
  const agencyTrust = valueOrFallback(input.agencyTrust, 40);
  const agencyScore = Math.min(agencyTrust, recommendationScore);
  const overfitSafety = 100 - valueOrFallback(input.overfitRisk, thresholds.maxOverfitRisk);
  const riskSafety = 100 - valueOrFallback(input.riskScore, thresholds.maxRiskScore);
  const beliefStability = 100 - valueOrFallback(input.beliefFragility, thresholds.maxBeliefFragility);

  const traces = [
    trace("agency", "Agency approval", input.agencyTrust, agencyScore, TRACE_WEIGHTS.agency, thresholds.minAgencyTrust, agencyScore >= thresholds.minAgencyTrust, input.agencyRecommendation || "missing"),
    trace("trust", "Trust score", input.trustScore, valueOrFallback(input.trustScore, 40), TRACE_WEIGHTS.trust, thresholds.minTrustScore, valueOrFallback(input.trustScore, 0) >= thresholds.minTrustScore, "Trust must already permit commitment."),
    trace("confidence", "Calibrated confidence", input.calibratedConfidence, confidenceScore(input), TRACE_WEIGHTS.confidence, thresholds.minCalibratedConfidence, valueOrFallback(input.calibratedConfidence, 0) >= thresholds.minCalibratedConfidence, "Raw confidence cannot outrun calibrated confidence."),
    trace("judgement", "Judgement reliability", input.judgementReliability, valueOrFallback(input.judgementReliability, 40), TRACE_WEIGHTS.judgement, thresholds.minJudgementReliability, valueOrFallback(input.judgementReliability, 0) >= thresholds.minJudgementReliability, "Similar states must justify the action."),
    trace("stability", "Outcome stability", input.outcomeStability, valueOrFallback(input.outcomeStability, 40), TRACE_WEIGHTS.stability, 60, valueOrFallback(input.outcomeStability, 0) >= 60, "Outcomes should be stable enough to rely on."),
    trace("data", "Data reliability", input.dataReliability, valueOrFallback(input.dataReliability, 40), TRACE_WEIGHTS.data, thresholds.minDataReliability, valueOrFallback(input.dataReliability, 0) >= thresholds.minDataReliability, "Weak data cannot support commitment."),
    trace("risk", "Risk safety", input.riskScore, riskSafety, TRACE_WEIGHTS.risk, 100 - thresholds.maxRiskScore, valueOrFallback(input.riskScore, 100) <= thresholds.maxRiskScore, "Risk must stay inside the commitment boundary."),
    trace("overfit", "Overfit safety", input.overfitRisk, overfitSafety, TRACE_WEIGHTS.overfit, 100 - thresholds.maxOverfitRisk, valueOrFallback(input.overfitRisk, 100) <= thresholds.maxOverfitRisk, "Overfit risk must stay below the policy cap."),
    trace("belief", "Belief stability", input.beliefFragility, beliefStability, TRACE_WEIGHTS.belief, 100 - thresholds.maxBeliefFragility, valueOrFallback(input.beliefFragility, 100) <= thresholds.maxBeliefFragility, "Fragile belief should not be treated as commitment."),
  ];

  if (input.wisdomScore != null || input.decisionQuality != null || input.restrictionValue != null) {
    const wisdomScore = valueOrFallback(input.wisdomScore, mean([
      valueOrFallback(input.decisionQuality, 50),
      valueOrFallback(input.restrictionValue, 50),
      Math.max(0, 100 - valueOrFallback(input.opportunityCost, 0)),
    ]));
    traces.push(trace("wisdom", "Wisdom quality", input.wisdomScore, wisdomScore, TRACE_WEIGHTS.wisdom, 60, wisdomScore >= 60, "Wisdom checks decision quality, restriction value, and opportunity cost before Resolve commits."));
  }

  return traces;
}

function normalizeInput(input: ResolveInput): NormalizedResolveInput {
  return {
    agencyRecommendation: normalizeToken(input.agencyRecommendation),
    agencyTrust: optionalScore(input.agencyTrust),
    trustScore: optionalScore(input.trustScore),
    calibratedConfidence: optionalScore(input.calibratedConfidence),
    rawConfidence: optionalScore(input.rawConfidence),
    judgementReliability: optionalScore(input.judgementReliability),
    outcomeStability: optionalScore(input.outcomeStability),
    overfitRisk: optionalScore(input.overfitRisk),
    riskScore: optionalScore(input.riskScore),
    dataReliability: optionalScore(input.dataReliability),
    beliefConfidence: optionalScore(input.beliefConfidence),
    beliefFragility: optionalScore(input.beliefFragility),
    wisdomScore: optionalScore(input.wisdomScore),
    decisionQuality: optionalScore(input.decisionQuality),
    opportunityCost: optionalScore(input.opportunityCost),
    restrictionValue: optionalScore(input.restrictionValue),
    suggestedExposure: optionalNonNegative(input.suggestedExposure),
    maxTrustedExposure: optionalNonNegative(input.maxTrustedExposure),
    blockedActions: Math.max(0, Math.round(optionalNonNegative(input.blockedActions) ?? 0)),
    missingOutcomes: Math.max(0, Math.round(optionalNonNegative(input.missingOutcomes) ?? 0)),
    similarSamples: optionalNonNegative(input.similarSamples),
    positiveOutcomes: Math.max(0, Math.round(optionalNonNegative(input.positiveOutcomes) ?? 0)),
    negativeOutcomes: Math.max(0, Math.round(optionalNonNegative(input.negativeOutcomes) ?? 0)),
  };
}

function confidenceScore(input: NormalizedResolveInput) {
  const calibrated = valueOrFallback(input.calibratedConfidence, 40);
  const raw = valueOrFallback(input.rawConfidence, calibrated);
  const gapPenalty = Math.max(0, raw - calibrated) * 0.35;
  return clamp(calibrated - gapPenalty);
}

function recommendationScoreFor(recommendation: string) {
  if (COMMIT_RECOMMENDATIONS.has(recommendation)) return 100;
  if (REVIEW_RECOMMENDATIONS.has(recommendation)) return 45;
  if (REJECT_RECOMMENDATIONS.has(recommendation)) return 0;
  if (WAIT_RECOMMENDATIONS.has(recommendation)) return 60;
  return 50;
}

function missingEvidenceFor(input: ResolveInput, normalized: NormalizedResolveInput, thresholds: ResolveThresholds) {
  const missing: string[] = [];

  if (normalized.agencyRecommendation === "") missing.push("Agency recommendation");
  if (normalized.agencyTrust == null || normalized.agencyTrust < thresholds.minAgencyTrust) missing.push("Agency trust");
  if (normalized.trustScore == null) missing.push("Trust score");
  if (normalized.calibratedConfidence == null) missing.push("Calibrated confidence");
  if (normalized.judgementReliability == null) missing.push("Judgement reliability");
  if (normalized.outcomeStability == null) missing.push("Outcome stability");
  if (normalized.dataReliability == null) missing.push("Data reliability");
  if (normalized.similarSamples == null || normalized.similarSamples < thresholds.minSimilarSamples) {
    missing.push("Similar outcome sample");
  }
  if (normalized.missingOutcomes > 0) missing.push("Closed outcomes");
  if (normalized.blockedActions > 0) missing.push("Unblocked agency action");
  if (sizingBlocksCommitment(input, normalized)) missing.push("Trusted sizing capacity");

  return unique([...missing, ...stringArray(input.evidence?.missingEvidence)]);
}

function unlockConditionsFor(input: ResolveInput, normalized: NormalizedResolveInput, thresholds: ResolveThresholds) {
  const conditions: string[] = [];

  if (humanReviewRequiredFor(input, normalized)) conditions.push("Resolve the human review requirement before commitment.");
  if (normalized.agencyTrust == null || normalized.agencyTrust < thresholds.minAgencyTrust) conditions.push(`Raise agency trust to at least ${formatScore(thresholds.minAgencyTrust)}.`);
  if (normalized.trustScore == null || normalized.trustScore < thresholds.minTrustScore) conditions.push(`Raise trust score to at least ${formatScore(thresholds.minTrustScore)}.`);
  if (normalized.calibratedConfidence == null || normalized.calibratedConfidence < thresholds.minCalibratedConfidence) conditions.push(`Raise calibrated confidence to at least ${formatScore(thresholds.minCalibratedConfidence)}.`);
  if (normalized.judgementReliability == null || normalized.judgementReliability < thresholds.minJudgementReliability) conditions.push(`Raise judgement reliability to at least ${formatScore(thresholds.minJudgementReliability)}.`);
  if (normalized.dataReliability == null || normalized.dataReliability < thresholds.minDataReliability) conditions.push(`Restore data reliability to at least ${formatScore(thresholds.minDataReliability)}.`);
  if (normalized.riskScore != null && normalized.riskScore > thresholds.maxRiskScore) conditions.push(`Reduce risk score to ${formatScore(thresholds.maxRiskScore)} or lower.`);
  if (normalized.overfitRisk != null && normalized.overfitRisk > thresholds.maxOverfitRisk) conditions.push(`Reduce overfit risk to ${formatScore(thresholds.maxOverfitRisk)} or lower.`);
  if (normalized.beliefFragility != null && normalized.beliefFragility > thresholds.maxBeliefFragility) conditions.push(`Reduce belief fragility to ${formatScore(thresholds.maxBeliefFragility)} or lower.`);
  if (normalized.wisdomScore != null && normalized.wisdomScore < 45) conditions.push("Improve Wisdom decision quality, restriction value, or opportunity cost before commitment.");
  if (normalized.similarSamples == null || normalized.similarSamples < thresholds.minSimilarSamples) conditions.push(`Observe at least ${thresholds.minSimilarSamples} similar outcome samples.`);
  if (normalized.missingOutcomes > 0) conditions.push("Close or evaluate missing outcomes before raising commitment.");
  if (normalized.blockedActions > 0) conditions.push("Clear blocked agency actions before commitment.");
  if (sizingBlocksCommitment(input, normalized)) conditions.push("Restore positive trusted sizing capacity.");

  return unique([...conditions, ...stringArray(input.evidence?.unlockConditions)]);
}

function invalidationConditionsFor(input: ResolveInput, normalized: NormalizedResolveInput, thresholds: ResolveThresholds) {
  const conditions = [
    `Invalidate if data reliability falls below ${formatScore(thresholds.minDataReliability)}.`,
    `Invalidate if overfit risk rises above ${formatScore(thresholds.maxOverfitRisk)}.`,
    `Invalidate if belief fragility rises above ${formatScore(thresholds.maxBeliefFragility)}.`,
    "Invalidate if Agency denies the action.",
    "Invalidate if Trust or Judgement falls below the commitment threshold.",
  ];

  if (normalized.positiveOutcomes + normalized.negativeOutcomes >= thresholds.minSimilarSamples) {
    conditions.push("Invalidate if similar outcomes turn net negative.");
  }

  return unique([...conditions, ...stringArray(input.evidence?.invalidationConditions)]);
}

function decisionFor(context: ResolveContext): ResolveDecision {
  const input = context.normalized;

  if (isInvalidated(context.input, input, context.thresholds)) return "invalidate";
  if (isRejected(input, context)) return "reject";
  if (context.humanReviewRequired) return "escalate";
  if (shouldEscalate(input, context)) return "escalate";
  if (canCommit(input, context)) return "commit";
  return "wait";
}

function isInvalidated(input: ResolveInput, normalized: NormalizedResolveInput, thresholds: ResolveThresholds) {
  if (booleanEvidence(input.evidence?.invalidated) || normalized.agencyRecommendation === "invalidate") return true;
  const totalOutcomes = normalized.positiveOutcomes + normalized.negativeOutcomes;
  return totalOutcomes >= thresholds.minSimilarSamples &&
    normalized.negativeOutcomes > normalized.positiveOutcomes &&
    valueOrFallback(normalized.outcomeStability, 100) < 40;
}

function isRejected(normalized: NormalizedResolveInput, context: ResolveContext) {
  if (REJECT_RECOMMENDATIONS.has(normalized.agencyRecommendation)) return true;

  const trustProvided = normalized.trustScore != null;
  const confidenceProvided = normalized.calibratedConfidence != null;
  return trustProvided &&
    confidenceProvided &&
    valueOrFallback(normalized.trustScore, 0) < 25 &&
    valueOrFallback(normalized.calibratedConfidence, 0) < 40 &&
    context.resolveScore < context.requiredScore;
}

function shouldEscalate(normalized: NormalizedResolveInput, context: ResolveContext) {
  const thresholds = context.thresholds;
  const dataReliability = valueOrFallback(normalized.dataReliability, thresholds.minDataReliability);
  const overfitRisk = valueOrFallback(normalized.overfitRisk, 0);
  const beliefFragility = valueOrFallback(normalized.beliefFragility, 0);
  const wisdomScore = valueOrFallback(normalized.wisdomScore, 100);
  const strongJudgementWeakAgency =
    valueOrFallback(normalized.judgementReliability, 0) >= thresholds.minJudgementReliability &&
    valueOrFallback(normalized.outcomeStability, 0) >= 60 &&
    valueOrFallback(normalized.agencyTrust, 0) < thresholds.minAgencyTrust;

  return dataReliability < thresholds.minDataReliability - 20 ||
    overfitRisk > thresholds.maxOverfitRisk + 25 ||
    beliefFragility > thresholds.maxBeliefFragility + 25 ||
    wisdomScore < 25 ||
    strongJudgementWeakAgency;
}

function canCommit(normalized: NormalizedResolveInput, context: ResolveContext) {
  const thresholds = context.thresholds;
  return context.resolveScore >= context.requiredScore &&
    context.missingEvidence.length === 0 &&
    COMMIT_RECOMMENDATIONS.has(normalized.agencyRecommendation) &&
    valueOrFallback(normalized.agencyTrust, 0) >= thresholds.minAgencyTrust &&
    valueOrFallback(normalized.trustScore, 0) >= thresholds.minTrustScore &&
    valueOrFallback(normalized.calibratedConfidence, 0) >= thresholds.minCalibratedConfidence &&
    valueOrFallback(normalized.judgementReliability, 0) >= thresholds.minJudgementReliability &&
    valueOrFallback(normalized.dataReliability, 0) >= thresholds.minDataReliability &&
    valueOrFallback(normalized.riskScore, 100) <= thresholds.maxRiskScore &&
    valueOrFallback(normalized.overfitRisk, 100) <= thresholds.maxOverfitRisk &&
    valueOrFallback(normalized.beliefFragility, 100) <= thresholds.maxBeliefFragility &&
    valueOrFallback(normalized.wisdomScore, 60) >= 45 &&
    valueOrFallback(normalized.similarSamples, 0) >= thresholds.minSimilarSamples &&
    normalized.blockedActions === 0 &&
    !sizingBlocksCommitment(context.input, normalized);
}

function humanReviewRequiredFor(input: ResolveInput, normalized: NormalizedResolveInput) {
  if (booleanEvidence(input.evidence?.humanReviewRequired)) return true;
  if (REVIEW_RECOMMENDATIONS.has(normalized.agencyRecommendation)) return true;
  return normalized.blockedActions > 0 && !COMMIT_RECOMMENDATIONS.has(normalized.agencyRecommendation);
}

function commitmentLevelFor(input: ResolveInput, decision: ResolveDecision, resolveScore: number, requiredScore: number): CommitmentLevel {
  if (decision === "reject" || decision === "invalidate" || decision === "escalate") return "none";
  if (decision === "wait") return "watch";

  const sizingMode = normalizeToken(input.sizingMode);
  if (["micro", "limited"].includes(sizingMode)) return "limited";
  if (resolveScore >= 90 && ["full", "normal", "large", "maxsafe", "max-safe"].includes(sizingMode)) return "full";
  if (resolveScore >= Math.max(82, requiredScore + 5)) return "graduated";
  return "limited";
}

function explanationFor(
  input: ResolveInput,
  decision: ResolveDecision,
  commitmentLevel: CommitmentLevel,
  context: ResolveContext,
) {
  const action = input.actionName?.trim() || "the proposed action";
  const primaryMissing = context.missingEvidence[0];
  const primaryUnlock = context.unlockConditions[0];

  if (decision === "commit") {
    return `Resolve can commit to ${action} at ${commitmentLevel} commitment because score ${formatScore(context.resolveScore)} meets the required ${formatScore(context.requiredScore)} and no upstream gate is blocking action.`;
  }

  if (decision === "invalidate") {
    return `Resolve invalidates ${action} because the thesis boundary failed: ${context.invalidationConditions[0]}`;
  }

  if (decision === "reject") {
    return `Resolve rejects ${action} because Agency, Trust, or calibrated confidence does not support commitment.`;
  }

  if (decision === "escalate") {
    return `Resolve escalates ${action} because ${primaryMissing ?? "an upstream review gate"} remains unresolved. ${primaryUnlock}`;
  }

  return `Resolve waits on ${action} because ${primaryMissing ?? "more evidence"} is still needed. ${primaryUnlock ?? "Keep observing until commitment thresholds are met."}`;
}

function sizingBlocksCommitment(input: ResolveInput, normalized: NormalizedResolveInput) {
  const sizingMode = normalizeToken(input.sizingMode);
  if (["none", "blocked", "deferred"].includes(sizingMode)) return true;
  if (normalized.suggestedExposure != null && normalized.suggestedExposure <= 0) return true;
  if (normalized.maxTrustedExposure != null && normalized.maxTrustedExposure <= 0) return true;
  return false;
}

function trace(
  id: string,
  label: string,
  value: number | string | null,
  score: number,
  weight: number,
  threshold: number,
  passed: boolean,
  reason: string,
): ResolveTrace {
  return {
    id,
    label,
    value,
    score: roundScore(score),
    weight,
    passed,
    threshold,
    reason,
  };
}

function weightedScore(traces: ResolveTrace[]) {
  const totalWeight = traces.reduce((sum, item) => sum + item.weight, 0);
  return traces.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
}

function mean(values: number[]) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function optionalScore(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.abs(n) <= 1 ? n * 100 : n);
}

function optionalNonNegative(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

function valueOrFallback(value: number | null, fallback: number) {
  return value == null ? fallback : value;
}

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function booleanEvidence(value: unknown) {
  return value === true || String(value).toLowerCase() === "true";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createdAtFor(input: ResolveInput) {
  const candidate = input.createdAt ?? (typeof input.evidence?.createdAt === "string" ? input.evidence.createdAt : undefined);
  if (candidate && !Number.isNaN(Date.parse(candidate))) return new Date(candidate).toISOString();
  return "1970-01-01T00:00:00.000Z";
}

function formatScore(value: number) {
  return `${Math.round(value)}/100`;
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
