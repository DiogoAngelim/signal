/* c8 ignore next */
import { clamp, mean, stdev } from "../math/statistics";

export type JudgementStatus = "trusted" | "cautious" | "review_required" | "blocked";

export type JudgementOutcome = {
  id?: string;
  state?: Record<string, unknown>;
  currentState?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  proposedDecision?: Record<string, unknown>;
  action?: Record<string, unknown>;
  proposedAction?: Record<string, unknown>;
  context?: Record<string, unknown>;
  outcome?: unknown;
  result?: unknown;
  value?: number;
  score?: number;
  returnPct?: number;
  confidence?: number;
  rawConfidence?: number;
  calibratedConfidence?: number;
  adjustedConfidence?: number;
  success?: boolean | null;
  weight?: number;
  timestamp?: number | string | Date;
  metadata?: Record<string, unknown>;
};

export type JudgementTrace = {
  id?: string;
  currentState?: Record<string, unknown>;
  state?: Record<string, unknown>;
  perception?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  proposedDecision?: Record<string, unknown>;
  action?: Record<string, unknown>;
  proposedAction?: Record<string, unknown>;
  context?: Record<string, unknown>;
  outcome?: unknown;
  result?: unknown;
  confidence?: number;
  rawConfidence?: number;
  adjustedConfidence?: number;
  metadata?: Record<string, unknown>;
};

export type JudgementInput = {
  currentState: Record<string, unknown>;
  proposedDecision?: Record<string, unknown>;
  proposedAction?: Record<string, unknown>;
  historicalOutcomes?: JudgementOutcome[];
  traces?: JudgementTrace[];
  context?: Record<string, unknown>;
};

export type JudgementResult = {
  status: JudgementStatus;
  rawConfidence: number;
  adjustedConfidence: number;
  trust: number;
  calibration: number;
  reliability: number;
  overfitRisk: number;
  outcomeStability: number;
  similarSampleSize: number;
  expectedOutcome?: number;
  confidenceDelta: number;
  reasons: string[];
  warnings: string[];
  evidence: {
    similarStates: number;
    positiveOutcomes: number;
    negativeOutcomes: number;
    neutralOutcomes: number;
    averageOutcome?: number;
    winRate?: number;
    consistency?: number;
  };
};

type FeatureValue = number | string | boolean | string[];

type HistoricalRecord = {
  index: number;
  profile: Map<string, FeatureValue>;
  outcome?: number;
  confidence?: number;
};

type SimilarRecord = HistoricalRecord & {
  similarity: number;
};

type JudgementOptions = {
  minimumSimilarSamples: number;
  strongSampleSize: number;
  similarityThreshold: number;
};

const DEFAULT_MINIMUM_SIMILAR_SAMPLES = 5;
const DEFAULT_STRONG_SAMPLE_SIZE = 12;
const DEFAULT_SIMILARITY_THRESHOLD = 0.52;
const OUTCOME_EPSILON = 0.000001;

export function evaluateJudgement(input: JudgementInput): JudgementResult {
  const warnings: string[] = [];
  const source = input ?? ({} as JudgementInput);
  const currentState = recordOrEmpty(source.currentState, "currentState", warnings);
  const proposedDecision = optionalRecord(source.proposedDecision, "proposedDecision", warnings);
  const proposedAction = optionalRecord(source.proposedAction, "proposedAction", warnings);
  const context = optionalRecord(source.context, "context", warnings);
  const options = optionsFromContext(context);
  const rawConfidence = confidenceFrom(currentState, proposedDecision, proposedAction, context);
  const currentProfile = profileFor({
    state: currentState,
    decision: proposedDecision,
    action: proposedAction,
    context: filterContextForSimilarity(context),
  });
  const records = collectHistoricalRecords(source, warnings);
  const similar = records
    .map((record) => ({ ...record, similarity: similarityBetween(currentProfile, record.profile) }))
    .filter((record) => record.similarity >= options.similarityThreshold)
    .sort((left, right) => right.similarity - left.similarity || left.index - right.index);
  const outcomes = similar
    .map((record) => record.outcome)
    .filter((value): value is number => Number.isFinite(value));
  const similarSampleSize = outcomes.length;
  const evidence = evidenceFrom(similar.length, outcomes);
  const expectedOutcome = outcomes.length ? evidence.averageOutcome : undefined;
  const expectedScore = expectedScoreFromEvidence(evidence);
  const calibrationGap = calibrationGapFor(rawConfidence, expectedScore, similar);
  const calibration = roundScore(100 - calibrationGap * 1.15);
  const outcomeStability = stabilityFor(outcomes, evidence.consistency ?? 0);
  const overfitRisk = overfitRiskFor({
    context,
    rawConfidence,
    expectedScore,
    calibration,
    outcomeStability,
    similar,
    similarSampleSize,
    strongSampleSize: options.strongSampleSize,
  });
  const reliability = reliabilityFor({
    similarSampleSize,
    strongSampleSize: options.strongSampleSize,
    outcomeStability,
    calibration,
    consistency: evidence.consistency ?? 0,
    overfitRisk,
  });
  const trust = trustFor({
    reliability,
    calibration,
    overfitRisk,
    outcomeStability,
    outcomeDirectionScore: evidence.winRate ?? expectedScore,
  });
  const status = classifyJudgement({
    similarSampleSize,
    minimumSimilarSamples: options.minimumSimilarSamples,
    rawConfidence,
    expectedScore,
    calibration,
    reliability,
    overfitRisk,
    outcomeStability,
    positiveOutcomes: evidence.positiveOutcomes,
    negativeOutcomes: evidence.negativeOutcomes,
    winRate: evidence.winRate ?? 0,
  });
  const adjustedConfidence = adjustedConfidenceFor({
    status,
    rawConfidence,
    expectedScore,
    calibration,
    outcomeStability,
    overfitRisk,
    similarSampleSize,
    minimumSimilarSamples: options.minimumSimilarSamples,
    strongSampleSize: options.strongSampleSize,
    winRate: evidence.winRate ?? 0,
  });
  const reasons = reasonsFor({
    status,
    rawConfidence,
    adjustedConfidence,
    evidence,
    expectedScore,
    similarSampleSize,
    minimumSimilarSamples: options.minimumSimilarSamples,
    calibration,
    calibrationGap,
    reliability,
    overfitRisk,
    outcomeStability,
  });
  const judgementWarnings = warningsFor({
    warnings,
    similarSampleSize,
    minimumSimilarSamples: options.minimumSimilarSamples,
    calibration,
    overfitRisk,
    outcomeStability,
    status,
    similarStates: similar.length,
    outcomeCount: outcomes.length,
  });

  return {
    status,
    rawConfidence,
    adjustedConfidence,
    trust,
    calibration,
    reliability,
    overfitRisk,
    outcomeStability,
    similarSampleSize,
    ...(expectedOutcome == null ? {} : { expectedOutcome }),
    confidenceDelta: roundSigned(adjustedConfidence - rawConfidence),
    reasons,
    warnings: judgementWarnings,
    evidence,
  };
}

export const judge = evaluateJudgement;
export const judgeDecision = evaluateJudgement;

function collectHistoricalRecords(input: JudgementInput, warnings: string[]): HistoricalRecord[] {
  const outcomes = arrayOrEmpty(input?.historicalOutcomes, "historicalOutcomes", warnings);
  const traces = arrayOrEmpty(input?.traces, "traces", warnings);
  const outcomeRecords = outcomes.map((outcome, index) => recordFromOutcome(outcome, index));
  const traceRecords = traces.map((trace, index) => recordFromTrace(trace, outcomes.length + index));
  return [...outcomeRecords, ...traceRecords].filter((record) => record.profile.size > 0);
}

function recordFromOutcome(outcome: JudgementOutcome, index: number): HistoricalRecord {
  const metadata = optionalPlainRecord(outcome?.metadata);
  return {
    index,
    profile: profileFor({
      state: firstRecord(outcome?.state, outcome?.currentState, metadata?.state),
      decision: firstRecord(outcome?.decision, outcome?.proposedDecision, metadata?.decision),
      action: firstRecord(outcome?.action, outcome?.proposedAction, metadata?.action),
      context: firstRecord(outcome?.context, metadata?.context),
    }),
    outcome: outcomeValueFor(outcome),
    confidence: confidenceValueFor(outcome),
  };
}

function recordFromTrace(trace: JudgementTrace, index: number): HistoricalRecord {
  const metadata = optionalPlainRecord(trace?.metadata);
  return {
    index,
    profile: profileFor({
      state: firstRecord(trace?.currentState, trace?.state, trace?.perception, metadata?.state),
      decision: firstRecord(trace?.decision, trace?.proposedDecision, metadata?.decision),
      action: firstRecord(trace?.action, trace?.proposedAction, metadata?.action),
      context: firstRecord(trace?.context, metadata?.context),
    }),
    outcome: outcomeValueFor(trace),
    confidence: confidenceValueFor(trace),
  };
}

function profileFor(input: {
  state?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  action?: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  const features = new Map<string, FeatureValue>();
  flattenInto(features, "state", input.state);
  flattenInto(features, "decision", input.decision);
  flattenInto(features, "action", input.action);
  flattenInto(features, "context", input.context);
  return features;
}

function flattenInto(features: Map<string, FeatureValue>, prefix: string, value: unknown) {
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) {
    const path = `${prefix}.${key}`;
    if (isPlainRecord(child)) {
      flattenInto(features, path, child);
      continue;
    }

    const normalized = featureValue(child);
    if (normalized !== undefined) features.set(path, normalized);
  }
}

function featureValue(value: unknown): FeatureValue | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean)
      .sort();
    return items.length ? Array.from(new Set(items)) : undefined;
  }
  return undefined;
}

function similarityBetween(current: Map<string, FeatureValue>, historical: Map<string, FeatureValue>) {
  let totalWeight = 0;
  let weightedSimilarity = 0;

  for (const [key, currentValue] of current) {
    if (!historical.has(key)) continue;

    const itemSimilarity = valueSimilarity(currentValue, historical.get(key) as FeatureValue);
    const weight = featureWeight(key);
    totalWeight += weight;
    weightedSimilarity += itemSimilarity * weight;
  }

  return totalWeight > 0 ? roundRatio(weightedSimilarity / totalWeight) : 0;
}

function valueSimilarity(left: FeatureValue, right: FeatureValue) {
  if (typeof left === "number" && typeof right === "number") {
    const denominator = Math.max(1, Math.abs(left), Math.abs(right));
    return clamp(1 - Math.abs(left - right) / denominator, 0, 1);
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return jaccard(left, right);
  }

  if (typeof left === "string" && typeof right === "string") {
    if (left === right) return 1;
    return jaccard(tokens(left), tokens(right)) * 0.75;
  }

  return Object.is(left, right) ? 1 : 0;
}

function featureWeight(path: string) {
  if (path.startsWith("state.")) return 1.35;
  if (path.startsWith("decision.")) return 1.15;
  if (path.startsWith("action.")) return 1.1;
  return 0.85;
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (!union.size) return 0;

  let overlap = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) overlap += 1;
  }

  return overlap / union.size;
}

function tokens(value: string) {
  return value.split(/[^a-z0-9]+/i).filter(Boolean);
}

function evidenceFrom(similarStates: number, outcomes: number[]): JudgementResult["evidence"] {
  const positiveOutcomes = outcomes.filter((value) => value > OUTCOME_EPSILON).length;
  const negativeOutcomes = outcomes.filter((value) => value < -OUTCOME_EPSILON).length;
  const neutralOutcomes = outcomes.length - positiveOutcomes - negativeOutcomes;
  const averageOutcome = outcomes.length ? roundSigned(mean(outcomes)) : undefined;
  const winRate = outcomes.length ? roundScore((positiveOutcomes / outcomes.length) * 100) : undefined;
  const consistency = outcomes.length
    ? roundScore((Math.max(positiveOutcomes, negativeOutcomes, neutralOutcomes) / outcomes.length) * 100)
    : undefined;

  return {
    similarStates,
    positiveOutcomes,
    negativeOutcomes,
    neutralOutcomes,
    ...(averageOutcome == null ? {} : { averageOutcome }),
    ...(winRate == null ? {} : { winRate }),
    ...(consistency == null ? {} : { consistency }),
  };
}

function expectedScoreFromEvidence(evidence: JudgementResult["evidence"]) {
  const outcomeScore = evidence.averageOutcome == null ? 50 : clamp(50 + evidence.averageOutcome / 2, 0, 100);
  const winRate = evidence.winRate ?? 50;
  return roundScore(mean([outcomeScore, winRate]));
}

function calibrationGapFor(rawConfidence: number, expectedScore: number, similar: SimilarRecord[]) {
  const currentGap = Math.abs(rawConfidence - expectedScore);
  const historicalGaps = similar
    .filter((record) => record.confidence != null && record.outcome != null)
    .map((record) => Math.abs((record.confidence as number) - clamp(50 + (record.outcome as number) / 2, 0, 100)));

  return roundScore(historicalGaps.length ? mean([currentGap, mean(historicalGaps)]) : currentGap);
}

function stabilityFor(outcomes: number[], consistency: number) {
  if (!outcomes.length) return 0;
  const dispersionSafety = clamp(100 - stdev(outcomes), 0, 100);
  return roundScore(consistency * 0.65 + dispersionSafety * 0.35);
}

function overfitRiskFor(input: {
  context: Record<string, unknown>;
  rawConfidence: number;
  expectedScore: number;
  calibration: number;
  outcomeStability: number;
  similar: SimilarRecord[];
  similarSampleSize: number;
  strongSampleSize: number;
}) {
  const sampleScore = clamp((input.similarSampleSize / input.strongSampleSize) * 100, 0, 100);
  const sampleRisk = 100 - sampleScore;
  const instabilityRisk = 100 - input.outcomeStability;
  const calibrationRisk = 100 - input.calibration;
  const highConfidenceRisk = clamp(Math.max(0, input.rawConfidence - input.expectedScore) * 1.15, 0, 100);
  const concentrationRisk = similarityConcentrationRisk(input.similar);
  const estimated = roundScore(
    sampleRisk * 0.28 +
      instabilityRisk * 0.25 +
      calibrationRisk * 0.22 +
      highConfidenceRisk * 0.15 +
      concentrationRisk * 0.1,
  );
  const explicit = explicitOverfitRisk(input.context);

  return explicit == null ? estimated : roundScore(Math.max(explicit, estimated * 0.5 + explicit * 0.5));
}

function similarityConcentrationRisk(similar: SimilarRecord[]) {
  if (similar.length < 2) return 80;
  const total = similar.reduce((sum, record) => sum + record.similarity, 0);
  if (total <= 0) return 80;
  const topShare = similar.slice(0, 3).reduce((sum, record) => sum + record.similarity, 0) / total * 100;
  return roundScore(clamp((topShare - 45) * 1.5, 0, 100));
}

function reliabilityFor(input: {
  similarSampleSize: number;
  strongSampleSize: number;
  outcomeStability: number;
  calibration: number;
  consistency: number;
  overfitRisk: number;
}) {
  const sampleScore = clamp((input.similarSampleSize / input.strongSampleSize) * 100, 0, 100);
  return roundScore(
    sampleScore * 0.28 +
      input.outcomeStability * 0.28 +
      input.calibration * 0.22 +
      input.consistency * 0.12 +
      (100 - input.overfitRisk) * 0.1,
  );
}

function trustFor(input: {
  reliability: number;
  calibration: number;
  overfitRisk: number;
  outcomeStability: number;
  outcomeDirectionScore: number;
}) {
  return roundScore(
    input.reliability * 0.34 +
      input.calibration * 0.24 +
      (100 - input.overfitRisk) * 0.22 +
      input.outcomeStability * 0.12 +
      input.outcomeDirectionScore * 0.08,
  );
}

function classifyJudgement(input: {
  similarSampleSize: number;
  minimumSimilarSamples: number;
  rawConfidence: number;
  expectedScore: number;
  calibration: number;
  reliability: number;
  overfitRisk: number;
  outcomeStability: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  winRate: number;
}): JudgementStatus {
  if (input.similarSampleSize < input.minimumSimilarSamples) return "review_required";
  if (
    input.overfitRisk >= 85 ||
    (input.overfitRisk >= 75 && input.reliability < 45) ||
    (input.rawConfidence >= 75 && input.expectedScore <= 35 && input.calibration < 50)
  ) {
    return "blocked";
  }
  if (
    input.overfitRisk >= 65 ||
    input.calibration < 45 ||
    input.outcomeStability < 45 ||
    input.reliability < 45
  ) {
    return "review_required";
  }
  if (
    input.reliability >= 70 &&
    input.calibration >= 65 &&
    input.outcomeStability >= 65 &&
    input.overfitRisk < 40 &&
    input.winRate >= 70 &&
    input.positiveOutcomes >= input.negativeOutcomes
  ) {
    return "trusted";
  }
  return "cautious";
}

function adjustedConfidenceFor(input: {
  status: JudgementStatus;
  rawConfidence: number;
  expectedScore: number;
  calibration: number;
  outcomeStability: number;
  overfitRisk: number;
  similarSampleSize: number;
  minimumSimilarSamples: number;
  strongSampleSize: number;
  winRate: number;
}) {
  if (input.status === "blocked") return 0;

  const evidencePenalty = Math.max(0, input.rawConfidence - input.expectedScore) * 0.55;
  let adjusted = input.rawConfidence - evidencePenalty;

  if (input.outcomeStability < 60) {
    adjusted *= clamp(0.55 + input.outcomeStability / 200, 0.45, 0.85);
  }
  if (input.calibration < 60) {
    adjusted -= (60 - input.calibration) * 0.35;
  }
  if (input.overfitRisk > 45) {
    adjusted *= clamp(1 - (input.overfitRisk - 45) / 160, 0.35, 1);
  }
  if (input.similarSampleSize < input.minimumSimilarSamples) {
    adjusted = Math.min(adjusted, input.rawConfidence * 0.7);
  }
  if (input.status === "review_required") {
    adjusted = Math.min(adjusted, input.rawConfidence * 0.65);
  }

  const strongPositiveEvidence =
    input.similarSampleSize >= input.strongSampleSize &&
    input.winRate >= 70 &&
    input.outcomeStability >= 75 &&
    input.calibration >= 70 &&
    input.overfitRisk <= 35 &&
    input.expectedScore > input.rawConfidence + 5;

  if (strongPositiveEvidence) {
    return roundScore(Math.min(100, input.rawConfidence + Math.min(8, (input.expectedScore - input.rawConfidence) * 0.25)));
  }

  return roundScore(Math.min(input.rawConfidence, Math.max(0, adjusted)));
}

function reasonsFor(input: {
  status: JudgementStatus;
  rawConfidence: number;
  adjustedConfidence: number;
  evidence: JudgementResult["evidence"];
  expectedScore: number;
  similarSampleSize: number;
  minimumSimilarSamples: number;
  calibration: number;
  calibrationGap: number;
  reliability: number;
  overfitRisk: number;
  outcomeStability: number;
}) {
  const reasons = [
    `Judgement compared the current state with ${input.evidence.similarStates} similar historical state(s).`,
  ];

  if (input.similarSampleSize < input.minimumSimilarSamples) {
    reasons.push(`Only ${input.similarSampleSize} similar outcome(s) were usable; minimum is ${input.minimumSimilarSamples}.`);
  } else {
    reasons.push(`Similar outcomes show ${input.evidence.positiveOutcomes} positive, ${input.evidence.negativeOutcomes} negative, and ${input.evidence.neutralOutcomes} neutral result(s).`);
  }

  if ((input.evidence.winRate ?? 0) >= 70 && input.outcomeStability >= 70) {
    reasons.push("Similar historical outcomes were consistently positive.");
  }
  if (input.rawConfidence >= 75 && input.outcomeStability < 60) {
    reasons.push("Raw confidence is high, but similar outcomes are not stable enough to trust fully.");
  }
  if (input.calibration < 60) {
    reasons.push(`Calibration is weak: expected evidence score ${formatPercent(input.expectedScore)} differs from raw confidence by ${formatPercent(input.calibrationGap)}.`);
  }
  if (input.overfitRisk >= 65) {
    reasons.push(`Overfit risk is elevated at ${formatPercent(input.overfitRisk)}.`);
  }

  reasons.push(`Reliability is ${formatPercent(input.reliability)} and outcome stability is ${formatPercent(input.outcomeStability)}.`);
  reasons.push(`Status is ${input.status}; confidence adjusted from ${formatPercent(input.rawConfidence)} to ${formatPercent(input.adjustedConfidence)}.`);

  return unique(reasons);
}

function warningsFor(input: {
  warnings: string[];
  similarSampleSize: number;
  minimumSimilarSamples: number;
  calibration: number;
  overfitRisk: number;
  outcomeStability: number;
  status: JudgementStatus;
  similarStates: number;
  outcomeCount: number;
}) {
  const warnings = [...input.warnings];

  if (input.similarSampleSize < input.minimumSimilarSamples) {
    warnings.push("low sample size");
  }
  if (input.similarStates > input.outcomeCount) {
    warnings.push("some similar states have no usable outcome");
  }
  if (input.outcomeStability < 55 && input.outcomeCount > 0) {
    warnings.push("unstable outcomes");
  }
  if (input.calibration < 55 && input.outcomeCount > 0) {
    warnings.push("poor calibration");
  }
  if (input.overfitRisk >= 65) {
    warnings.push("high overfit risk");
  }
  if (input.status === "blocked") {
    warnings.push("judgement blocked action");
  }
  if (input.status === "review_required") {
    warnings.push("human review required");
  }

  return unique(warnings);
}

function outcomeValueFor(value: unknown): number | undefined {
  const object = isPlainRecord(value) ? value : {};
  const direct = firstNumber(
    object.outcome,
    object.result,
    object.value,
    object.score,
    object.returnPct,
    object.metadata && isPlainRecord(object.metadata) ? object.metadata.outcome : undefined,
  );

  if (direct != null) return normalizeOutcomeNumber(direct);

  const nested = firstRecord(object.outcome, object.result);
  const nestedNumber = firstNumber(nested?.value, nested?.score, nested?.returnPct, nested?.reward);
  if (nestedNumber != null) return normalizeOutcomeNumber(nestedNumber);

  const success = firstBoolean(object.success, nested?.success, nested?.correct, nested?.passed);
  if (success != null) return success ? 100 : -100;

  const label = String(nested?.label ?? nested?.outcomeLabel ?? object.outcome ?? object.result ?? "").toLowerCase();
  if (["success", "win", "positive", "passed", "correct", "true"].includes(label)) return 100;
  if (["failure", "loss", "negative", "failed", "incorrect", "false"].includes(label)) return -100;
  if (["neutral", "mixed", "partial", "flat"].includes(label)) return 0;

  return undefined;
}

function confidenceValueFor(value: unknown) {
  const object = isPlainRecord(value) ? value : {};
  return firstScore(object.confidence, object.rawConfidence, object.calibratedConfidence, object.adjustedConfidence);
}

function confidenceFrom(
  currentState: Record<string, unknown>,
  proposedDecision: Record<string, unknown>,
  proposedAction: Record<string, unknown>,
  context: Record<string, unknown>,
) {
  return firstScore(
    proposedDecision.rawConfidence,
    proposedDecision.confidence,
    context.rawConfidence,
    context.confidence,
    currentState.rawConfidence,
    currentState.confidence,
    proposedAction.rawConfidence,
    proposedAction.confidence,
    proposedDecision.calibratedConfidence,
    context.calibratedConfidence,
    50,
  ) as number;
}

function optionsFromContext(context: Record<string, unknown>): JudgementOptions {
  return {
    minimumSimilarSamples: Math.max(
      1,
      Math.round(firstNumber(context.minimumSimilarSamples, context.minSimilarSamples, context.minimumSamples) ?? DEFAULT_MINIMUM_SIMILAR_SAMPLES),
    ),
    strongSampleSize: Math.max(
      1,
      Math.round(firstNumber(context.strongSampleSize, context.sufficientSamples) ?? DEFAULT_STRONG_SAMPLE_SIZE),
    ),
    similarityThreshold: clamp(
      firstNumber(context.similarityThreshold, context.judgementSimilarityThreshold) ?? DEFAULT_SIMILARITY_THRESHOLD,
      0,
      1,
    ),
  };
}

function explicitOverfitRisk(context: Record<string, unknown>) {
  const direct = firstScore(
    context.overfitRisk,
    context.overfitRiskPct,
    context.robustnessOverfitRisk,
    nestedScore(context.robustnessDiagnostics, "overfitRisk"),
    nestedScore(context.robustnessDiagnostics, "overfitRiskPct"),
    nestedScore(context.robustness, "overfitRisk"),
  );
  return direct == null ? undefined : direct;
}

function nestedScore(value: unknown, key: string) {
  return isPlainRecord(value) ? value[key] : undefined;
}

function filterContextForSimilarity(context: Record<string, unknown>) {
  const ignored = new Set([
    "minimumSimilarSamples",
    "minSimilarSamples",
    "minimumSamples",
    "strongSampleSize",
    "sufficientSamples",
    "similarityThreshold",
    "judgementSimilarityThreshold",
    "overfitRisk",
    "overfitRiskPct",
    "robustnessOverfitRisk",
    "robustnessDiagnostics",
    "robustness",
  ]);
  return Object.fromEntries(Object.entries(context).filter(([key]) => !ignored.has(key)));
}

function arrayOrEmpty<T>(value: T[] | undefined, field: string, warnings: string[]) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  warnings.push(`${field} was not an array`);
  return [];
}

function recordOrEmpty(value: unknown, field: string, warnings: string[]) {
  if (isPlainRecord(value)) return value;
  warnings.push(`${field} was not an object`);
  return {};
}

function optionalRecord(value: unknown, field: string, warnings: string[]) {
  if (value == null) return {};
  if (isPlainRecord(value)) return value;
  warnings.push(`${field} was not an object`);
  return {};
}

function optionalPlainRecord(value: unknown) {
  return isPlainRecord(value) ? value : {};
}

function firstRecord(...values: unknown[]) {
  return values.find(isPlainRecord) as Record<string, unknown> | undefined;
}

function firstScore(...values: unknown[]) {
  for (const value of values) {
    const numberValue = firstNumber(value);
    if (numberValue != null) return normalizeScore(numberValue);
  }
  return undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function normalizeScore(value: number) {
  const scaled = value >= 0 && value <= 1 ? value * 100 : value;
  return roundScore(scaled);
}

function normalizeOutcomeNumber(value: number) {
  const scaled = value > -1 && value < 1 && value !== 0 ? value * 100 : value;
  return roundSigned(clamp(scaled, -100, 100));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function roundScore(value: number) {
  return Math.round(clamp(value, 0, 100) * 100) / 100;
}

function roundSigned(value: number) {
  return Math.round(clamp(value, -100, 100) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(clamp(value, 0, 1) * 1_000_000) / 1_000_000;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

/* c8 ignore next 3 */
function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
