import { clamp, mean, numeric } from "../math/statistics";

export type PruningCandidateType =
  | "raw-signal"
  | "derived-metric"
  | "module-output"
  | "rule"
  | "policy"
  | "explanation"
  | "recommendation-contributor"
  | "scoring-input"
  | "historical-pattern"
  | "frontend-insight"
  | string;

export type PruningRecommendedAction =
  | "keep"
  | "reduce"
  | "isolate"
  | "quarantine"
  | "ignore"
  | "review";

export type PruningGovernanceFlag =
  | "survival-critical"
  | "regulatory"
  | "requires-review"
  | "do-not-ignore"
  | "frontend-primary"
  | string;

export type PruningCandidateInput = {
  candidateId?: string;
  candidateType?: PruningCandidateType;
  sourceModule?: string;
  currentWeight?: number;
  historicalUtility?: number;
  predictiveContribution?: number;
  decisionContribution?: number;
  redundancyScore?: number;
  noiseScore?: number;
  volatilitySensitivity?: number;
  regimeStability?: number;
  evidenceQuality?: number;
  sampleSize?: number;
  staleDataRisk?: number;
  contradictionRate?: number;
  falsePositiveRate?: number;
  falseNegativeRate?: number;
  complexityCost?: number;
  maintenanceCost?: number;
  latencyCost?: number;
  userClarityCost?: number;
  overfitRisk?: number;
  explainabilityValue?: number;
  survivalValue?: number;
  recentOutcomeImpact?: number;
  counterfactualImpact?: number;
  governanceFlags?: PruningGovernanceFlag[];
  selfModelWarnings?: string[];
  confidenceImpact?: number;
  trustImpact?: number;
  uncertainty?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type PruningInput = PruningCandidateInput & {
  candidates?: PruningCandidateInput[];
  now?: string | number | Date;
  strictValidation?: boolean;
};

export type PruningTraceEntry = {
  id: string;
  label: string;
  value: number | string | boolean | null;
  score: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type PruningContributingFactor = {
  id: string;
  label: string;
  score: number;
  reason: string;
};

export type PruningValidationIssue = {
  field: string;
  severity: "warning" | "error";
  reason: string;
};

export type PruningCandidateAssessment = {
  candidateId: string;
  candidateType: PruningCandidateType;
  sourceModule: string;
  pruningScore: number;
  ignoranceEffectivenessScore: number;
  keepScore: number;
  ignoreScore: number;
  reduceScore: number;
  quarantineScore: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  noisePenalty: number;
  clarityPenalty: number;
  survivalContribution: number;
  utilityContribution: number;
  evidenceConfidence: number;
  recommendedAction: PruningRecommendedAction;
  reason: string;
  explanation: string;
  warnings: string[];
  missingInputs: string[];
  degradedMode: boolean;
  trace: PruningTraceEntry[];
  contributingFactors: PruningContributingFactor[];
  opposingFactors: PruningContributingFactor[];
  validationIssues: PruningValidationIssue[];
  evidenceUsed: Record<string, number | string | boolean | string[] | null>;
  frontendHidden: boolean;
  markedRedundant: boolean;
  backupEvidence: boolean;
  timestamp: string;
};

export type PruningResult = PruningCandidateAssessment & {
  module: "pruning";
  version: "v1";
  candidates: PruningCandidateAssessment[];
  keptSignals: string[];
  ignoredSignals: string[];
  reducedSignals: string[];
  quarantinedSignals: string[];
  preservedSignals: string[];
  survivalCriticalSignals: string[];
  frontendHiddenSignals: string[];
};

export type PruningDecisionRecord = PruningCandidateAssessment;

export type MaybePromise<T> = T | Promise<T>;

export interface PruningStore {
  record(assessment: PruningDecisionRecord): MaybePromise<void>;
  list?(): MaybePromise<PruningDecisionRecord[]>;
}

export interface SignalUtilityStore {
  utilityFor(candidateId: string): MaybePromise<Partial<PruningCandidateInput> | null>;
}

export interface CandidateHistoryStore {
  historyFor(candidateId: string): MaybePromise<PruningCandidateInput[]>;
}

export interface PruningTraceStore {
  recordTrace(candidateId: string, trace: PruningTraceEntry[]): MaybePromise<void>;
}

export class InMemoryPruningStore implements PruningStore {
  private records: PruningDecisionRecord[];

  constructor(records: PruningDecisionRecord[] = []) {
    this.records = records.map(copy);
  }

  record(assessment: PruningDecisionRecord) {
    this.records = [...this.records, copy(assessment)];
  }

  list() {
    return this.records.map(copy);
  }

  clear() {
    this.records = [];
  }
}

type ScoreField =
  | "currentWeight"
  | "historicalUtility"
  | "predictiveContribution"
  | "decisionContribution"
  | "redundancyScore"
  | "noiseScore"
  | "volatilitySensitivity"
  | "regimeStability"
  | "evidenceQuality"
  | "staleDataRisk"
  | "contradictionRate"
  | "falsePositiveRate"
  | "falseNegativeRate"
  | "complexityCost"
  | "maintenanceCost"
  | "latencyCost"
  | "userClarityCost"
  | "overfitRisk"
  | "explainabilityValue"
  | "survivalValue"
  | "uncertainty";

type SignedImpactField =
  | "recentOutcomeImpact"
  | "counterfactualImpact"
  | "confidenceImpact"
  | "trustImpact";

export const PRUNING_CANDIDATE_SCHEMA = {
  requiredIdentity: ["candidateId", "candidateType", "sourceModule"],
  scoreFields: [
    "currentWeight",
    "historicalUtility",
    "predictiveContribution",
    "decisionContribution",
    "redundancyScore",
    "noiseScore",
    "volatilitySensitivity",
    "regimeStability",
    "evidenceQuality",
    "staleDataRisk",
    "contradictionRate",
    "falsePositiveRate",
    "falseNegativeRate",
    "complexityCost",
    "maintenanceCost",
    "latencyCost",
    "userClarityCost",
    "overfitRisk",
    "explainabilityValue",
    "survivalValue",
    "uncertainty",
  ] satisfies ScoreField[],
  signedImpactFields: [
    "recentOutcomeImpact",
    "counterfactualImpact",
    "confidenceImpact",
    "trustImpact",
  ] satisfies SignedImpactField[],
  nullableData: true,
} as const;

export const PRUNING_SCORING_WEIGHTS = {
  utility: {
    historicalUtility: 0.2,
    predictiveContribution: 0.18,
    decisionContribution: 0.22,
    recentOutcomeImpact: 0.14,
    counterfactualImpact: 0.12,
    confidenceImpact: 0.07,
    trustImpact: 0.07,
  },
  evidenceConfidence: {
    evidenceQuality: 0.38,
    sampleAdequacy: 0.24,
    regimeStability: 0.2,
    freshness: 0.18,
  },
  pressure: {
    noise: 0.18,
    overfit: 0.18,
    redundancy: 0.14,
    complexity: 0.12,
    contradiction: 0.13,
    volatility: 0.08,
    staleData: 0.08,
    falseOutcomes: 0.09,
  },
  decision: {
    keepUtility: 0.5,
    keepSurvival: 0.28,
    keepEvidence: 0.22,
    reduceRedundancy: 0.3,
    reduceUtility: 0.22,
    reduceNoise: 0.18,
    reduceCost: 0.16,
    reduceSafety: 0.14,
    ignoreHarm: 0.42,
    ignoreLowUtility: 0.26,
    ignoreCost: 0.18,
    ignoreEvidence: 0.14,
    quarantineOverfit: 0.32,
    quarantineContradiction: 0.22,
    quarantineStale: 0.16,
    quarantineNoise: 0.15,
    quarantineWeakEvidence: 0.15,
  },
} as const;

export class PruningValidationError extends Error {
  readonly issues: PruningValidationIssue[];

  constructor(issues: PruningValidationIssue[]) {
    super(`Invalid pruning input: ${issues.map((issue) => `${issue.field} ${issue.reason}`).join("; ")}`);
    this.name = "PruningValidationError";
    this.issues = issues;
  }
}

export function evaluatePruning(input: PruningInput = {}): PruningResult {
  const timestamp = toIsoTimestamp(input.now);
  const candidates = normalizeCandidates(input);
  const assessments = candidates.map((candidate, index) =>
    evaluateCandidate(candidate, {
      index,
      timestamp,
      strictValidation: input.strictValidation === true,
    }),
  );
  const aggregate = aggregateAssessments(assessments, timestamp);
  return {
    module: "pruning",
    version: "v1",
    ...aggregate,
    candidates: assessments,
    keptSignals: idsFor(assessments, "keep"),
    ignoredSignals: idsFor(assessments, "ignore"),
    reducedSignals: idsFor(assessments, "reduce"),
    quarantinedSignals: idsFor(assessments, "quarantine"),
    preservedSignals: assessments
      .filter((item) => item.recommendedAction === "keep" && item.survivalContribution >= 70)
      .map((item) => item.candidateId),
    survivalCriticalSignals: assessments
      .filter((item) => item.survivalContribution >= 80 || item.evidenceUsed.governanceFlagsIncludesSurvivalCritical === true)
      .map((item) => item.candidateId),
    frontendHiddenSignals: assessments.filter((item) => item.frontendHidden).map((item) => item.candidateId),
  };
}

export const prune = evaluatePruning;
export const evaluateIgnoranceEffectiveness = evaluatePruning;

export function validatePruningCandidate(candidate: PruningCandidateInput): PruningValidationIssue[] {
  const issues: PruningValidationIssue[] = [];
  for (const field of PRUNING_CANDIDATE_SCHEMA.requiredIdentity) {
    if (!isPresent(candidate[field])) {
      issues.push({ field, severity: "error", reason: "is required for auditable pruning." });
    }
  }
  for (const field of PRUNING_CANDIDATE_SCHEMA.scoreFields) {
    const value = candidate[field];
    if (value == null) continue;
    if (!Number.isFinite(Number(value))) {
      issues.push({ field, severity: "error", reason: "must be numeric when provided." });
    } else if (!isPctLike(Number(value))) {
      issues.push({ field, severity: "warning", reason: "is outside the expected 0-100 score range and will be clamped." });
    }
  }
  for (const field of PRUNING_CANDIDATE_SCHEMA.signedImpactFields) {
    const value = candidate[field];
    if (value == null) continue;
    if (!Number.isFinite(Number(value))) {
      issues.push({ field, severity: "error", reason: "must be numeric when provided." });
    } else if (Number(value) < -100 || Number(value) > 100) {
      issues.push({ field, severity: "warning", reason: "is outside the expected -100 to 100 impact range and will be clamped." });
    }
  }
  return issues;
}

function evaluateCandidate(
  candidate: PruningCandidateInput,
  options: { index: number; timestamp: string; strictValidation: boolean },
): PruningCandidateAssessment {
  const validationIssues = validatePruningCandidate(candidate);
  if (options.strictValidation && validationIssues.some((issue) => issue.severity === "error")) {
    throw new PruningValidationError(validationIssues);
  }

  const missingInputs = missingInputsFor(candidate);
  const identityMissing = validationIssues.some(
    (issue) => issue.severity === "error" && PRUNING_CANDIDATE_SCHEMA.requiredIdentity.includes(issue.field as never),
  );
  const candidateId = normalizedId(candidate.candidateId, `unknown-candidate-${options.index + 1}`);
  const candidateType = candidate.candidateType ?? "raw-signal";
  const sourceModule = normalizedId(candidate.sourceModule, "unknown-module");
  const governanceFlags = safeStrings(candidate.governanceFlags);
  const selfModelWarnings = safeStrings(candidate.selfModelWarnings);
  const score = scoreReader(candidate);
  const sampleAdequacy = sampleScore(candidate.sampleSize);
  const staleDataRisk = score("staleDataRisk", missingInputs.includes("staleDataRisk") ? 35 : 0);
  const freshness = clamp(100 - staleDataRisk);
  const evidenceConfidence = roundScore(
    weightedMean([
      weighted("evidenceQuality", score("evidenceQuality", 35), PRUNING_SCORING_WEIGHTS.evidenceConfidence.evidenceQuality),
      weighted("sampleAdequacy", sampleAdequacy, PRUNING_SCORING_WEIGHTS.evidenceConfidence.sampleAdequacy),
      weighted("regimeStability", score("regimeStability", 50), PRUNING_SCORING_WEIGHTS.evidenceConfidence.regimeStability),
      weighted("freshness", freshness, PRUNING_SCORING_WEIGHTS.evidenceConfidence.freshness),
    ]) - missingInputs.length * 1.2,
  );
  const survivalCritical = governanceFlags.includes("survival-critical") || governanceFlags.includes("do-not-ignore");
  const survivalContribution = roundScore(
    Math.max(score("survivalValue", survivalCritical ? 88 : 35), survivalCritical ? 88 : 0),
  );
  const utilityContribution = roundScore(
    weightedMean([
      weighted("historicalUtility", score("historicalUtility", 35), PRUNING_SCORING_WEIGHTS.utility.historicalUtility),
      weighted("predictiveContribution", score("predictiveContribution", 35), PRUNING_SCORING_WEIGHTS.utility.predictiveContribution),
      weighted("decisionContribution", score("decisionContribution", 35), PRUNING_SCORING_WEIGHTS.utility.decisionContribution),
      weighted("recentOutcomeImpact", signedImpact(candidate.recentOutcomeImpact, 50), PRUNING_SCORING_WEIGHTS.utility.recentOutcomeImpact),
      weighted("counterfactualImpact", signedImpact(candidate.counterfactualImpact, 50), PRUNING_SCORING_WEIGHTS.utility.counterfactualImpact),
      weighted("confidenceImpact", signedImpact(candidate.confidenceImpact, 50), PRUNING_SCORING_WEIGHTS.utility.confidenceImpact),
      weighted("trustImpact", signedImpact(candidate.trustImpact, 50), PRUNING_SCORING_WEIGHTS.utility.trustImpact),
    ]),
  );
  const redundancyPenalty = roundScore(score("redundancyScore", 0) * evidenceScale(evidenceConfidence, 0.7));
  const complexityPenalty = roundScore(
    mean([
      score("complexityCost", 0),
      score("maintenanceCost", 0),
      score("latencyCost", 0),
    ]),
  );
  const overfitPenalty = roundScore(score("overfitRisk", 0) * evidenceScale(evidenceConfidence, 0.78));
  const noisePenalty = roundScore(score("noiseScore", 0) * evidenceScale(evidenceConfidence, 0.82));
  const clarityPenalty = roundScore(score("userClarityCost", 0));
  const contradictionPenalty = roundScore(score("contradictionRate", 0) * evidenceScale(evidenceConfidence, 0.8));
  const falseOutcomePenalty = roundScore(mean([score("falsePositiveRate", 0), score("falseNegativeRate", 0)]));
  const volatilityPenalty = roundScore(score("volatilitySensitivity", 0));
  const uncertaintyPenalty = roundScore(score("uncertainty", Math.max(0, 100 - evidenceConfidence)));
  const weakEvidence = clamp(100 - evidenceConfidence);
  const harmPressure = roundScore(
    weightedMean([
      weighted("noise", noisePenalty, PRUNING_SCORING_WEIGHTS.pressure.noise),
      weighted("overfit", overfitPenalty, PRUNING_SCORING_WEIGHTS.pressure.overfit),
      weighted("redundancy", redundancyPenalty, PRUNING_SCORING_WEIGHTS.pressure.redundancy),
      weighted("complexity", complexityPenalty, PRUNING_SCORING_WEIGHTS.pressure.complexity),
      weighted("contradiction", contradictionPenalty, PRUNING_SCORING_WEIGHTS.pressure.contradiction),
      weighted("volatility", volatilityPenalty, PRUNING_SCORING_WEIGHTS.pressure.volatility),
      weighted("staleData", staleDataRisk, PRUNING_SCORING_WEIGHTS.pressure.staleData),
      weighted("falseOutcomes", falseOutcomePenalty, PRUNING_SCORING_WEIGHTS.pressure.falseOutcomes),
    ]),
  );
  const lowUtility = clamp(100 - utilityContribution);
  const keepScore = roundScore(
    utilityContribution * PRUNING_SCORING_WEIGHTS.decision.keepUtility +
      survivalContribution * PRUNING_SCORING_WEIGHTS.decision.keepSurvival +
      evidenceConfidence * PRUNING_SCORING_WEIGHTS.decision.keepEvidence -
      harmPressure * 0.24 -
      redundancyPenalty * 0.12 -
      clarityPenalty * 0.08,
  );
  const reduceScore = roundScore(
    redundancyPenalty * PRUNING_SCORING_WEIGHTS.decision.reduceRedundancy +
      utilityContribution * PRUNING_SCORING_WEIGHTS.decision.reduceUtility +
      noisePenalty * PRUNING_SCORING_WEIGHTS.decision.reduceNoise +
      complexityPenalty * PRUNING_SCORING_WEIGHTS.decision.reduceCost +
      Math.max(survivalContribution, evidenceConfidence) * PRUNING_SCORING_WEIGHTS.decision.reduceSafety -
      weakEvidence * 0.08,
  );
  const ignoreEvidenceBonus = evidenceConfidence >= 50 ? evidenceConfidence : evidenceConfidence * 0.45;
  const rawIgnoreScore =
    harmPressure * PRUNING_SCORING_WEIGHTS.decision.ignoreHarm +
    lowUtility * PRUNING_SCORING_WEIGHTS.decision.ignoreLowUtility +
    complexityPenalty * PRUNING_SCORING_WEIGHTS.decision.ignoreCost +
    ignoreEvidenceBonus * PRUNING_SCORING_WEIGHTS.decision.ignoreEvidence -
    survivalContribution * 0.36 -
    utilityContribution * 0.18;
  const ignoreScore = roundScore(evidenceConfidence < 35 ? Math.min(55, rawIgnoreScore) : rawIgnoreScore);
  const quarantineScore = roundScore(
    overfitPenalty * PRUNING_SCORING_WEIGHTS.decision.quarantineOverfit +
      contradictionPenalty * PRUNING_SCORING_WEIGHTS.decision.quarantineContradiction +
      staleDataRisk * PRUNING_SCORING_WEIGHTS.decision.quarantineStale +
      noisePenalty * PRUNING_SCORING_WEIGHTS.decision.quarantineNoise +
      weakEvidence * PRUNING_SCORING_WEIGHTS.decision.quarantineWeakEvidence -
      survivalContribution * 0.12,
  );
  const pruningScore = roundScore(
    harmPressure * 0.44 +
      lowUtility * 0.18 +
      complexityPenalty * 0.12 +
      weakEvidence * 0.12 +
      clarityPenalty * 0.08 -
      survivalContribution * 0.16,
  );
  const recommendedAction = resolveRecommendedAction({
    identityMissing,
    governanceFlags,
    utilityContribution,
    survivalContribution,
    evidenceConfidence,
    redundancyPenalty,
    complexityPenalty,
    overfitPenalty,
    noisePenalty,
    staleDataRisk,
    contradictionPenalty,
    clarityPenalty,
    keepScore,
    ignoreScore,
    reduceScore,
    quarantineScore,
  });
  const ignoranceEffectivenessScore = roundScore(
    ignoranceEffectivenessFor({
      recommendedAction,
      harmPressure,
      lowUtility,
      redundancyPenalty,
      complexityPenalty,
      overfitPenalty,
      clarityPenalty,
      utilityContribution,
      survivalContribution,
      evidenceConfidence,
      weakEvidence,
      traceable: !identityMissing,
    }),
  );
  const markedRedundant = redundancyPenalty >= 65;
  const backupEvidence = markedRedundant && utilityContribution >= 45 && recommendedAction === "reduce";
  const frontendHidden =
    recommendedAction === "ignore" ||
    recommendedAction === "quarantine" ||
    recommendedAction === "isolate" ||
    (clarityPenalty >= 70 && utilityContribution < 70);
  const warnings = warningMessages({
    missingInputs,
    validationIssues,
    evidenceConfidence,
    overfitPenalty,
    noisePenalty,
    staleDataRisk,
    contradictionPenalty,
    survivalContribution,
    recommendedAction,
    selfModelWarnings,
  });
  const degradedMode =
    missingInputs.length > 0 ||
    evidenceConfidence < 45 ||
    staleDataRisk >= 55 ||
    validationIssues.some((issue) => issue.severity === "error");
  const trace = buildTrace({
    utilityContribution,
    survivalContribution,
    evidenceConfidence,
    redundancyPenalty,
    complexityPenalty,
    overfitPenalty,
    noisePenalty,
    clarityPenalty,
    contradictionPenalty,
    staleDataRisk,
    falseOutcomePenalty,
    pruningScore,
    keepScore,
    reduceScore,
    ignoreScore,
    quarantineScore,
  });
  const contributingFactors = contributingFactorsFor({
    recommendedAction,
    utilityContribution,
    survivalContribution,
    evidenceConfidence,
    redundancyPenalty,
    complexityPenalty,
    overfitPenalty,
    noisePenalty,
    clarityPenalty,
    contradictionPenalty,
    staleDataRisk,
    weakEvidence,
  });
  const opposingFactors = opposingFactorsFor({
    recommendedAction,
    utilityContribution,
    survivalContribution,
    evidenceConfidence,
    redundancyPenalty,
    complexityPenalty,
    overfitPenalty,
    noisePenalty,
    weakEvidence,
  });
  const reason = reasonFor({
    recommendedAction,
    utilityContribution,
    survivalContribution,
    evidenceConfidence,
    redundancyPenalty,
    complexityPenalty,
    overfitPenalty,
    noisePenalty,
    clarityPenalty,
    contradictionPenalty,
    staleDataRisk,
  });

  return {
    candidateId,
    candidateType,
    sourceModule,
    pruningScore,
    ignoranceEffectivenessScore,
    keepScore,
    ignoreScore,
    reduceScore,
    quarantineScore,
    redundancyPenalty,
    complexityPenalty,
    overfitPenalty,
    noisePenalty,
    clarityPenalty,
    survivalContribution,
    utilityContribution,
    evidenceConfidence,
    recommendedAction,
    reason,
    explanation: `${candidateId} should ${recommendedAction}: ${reason}`,
    warnings,
    missingInputs,
    degradedMode,
    trace,
    contributingFactors,
    opposingFactors,
    validationIssues,
    evidenceUsed: {
      currentWeight: score("currentWeight", 0),
      historicalUtility: score("historicalUtility", 35),
      predictiveContribution: score("predictiveContribution", 35),
      decisionContribution: score("decisionContribution", 35),
      evidenceQuality: score("evidenceQuality", 35),
      sampleSize: Number.isFinite(Number(candidate.sampleSize)) ? Number(candidate.sampleSize) : null,
      regimeStability: score("regimeStability", 50),
      staleDataRisk,
      contradictionRate: score("contradictionRate", 0),
      falsePositiveRate: score("falsePositiveRate", 0),
      falseNegativeRate: score("falseNegativeRate", 0),
      governanceFlags,
      governanceFlagsIncludesSurvivalCritical: survivalCritical,
      selfModelWarnings,
    },
    frontendHidden,
    markedRedundant,
    backupEvidence,
    timestamp: toIsoTimestamp(candidate.timestamp, options.timestamp),
  };
}

function resolveRecommendedAction(input: {
  identityMissing: boolean;
  governanceFlags: string[];
  utilityContribution: number;
  survivalContribution: number;
  evidenceConfidence: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  noisePenalty: number;
  staleDataRisk: number;
  contradictionPenalty: number;
  clarityPenalty: number;
  keepScore: number;
  ignoreScore: number;
  reduceScore: number;
  quarantineScore: number;
}): PruningRecommendedAction {
  if (input.identityMissing) return "review";
  if (input.governanceFlags.includes("requires-review")) return "review";
  if (input.evidenceConfidence < 28) {
    if (input.survivalContribution >= 70 || input.utilityContribution >= 55) return "isolate";
    return "review";
  }
  if (input.survivalContribution >= 80) {
    const extremeUnsafe =
      input.evidenceConfidence >= 85 &&
      input.overfitPenalty >= 92 &&
      (input.contradictionPenalty >= 85 || input.noisePenalty >= 90);
    if (extremeUnsafe) return "quarantine";
    if (input.redundancyPenalty >= 75 || input.clarityPenalty >= 80) return "reduce";
    return "keep";
  }
  if (input.utilityContribution >= 55 && input.redundancyPenalty >= 65 && input.evidenceConfidence >= 40) {
    return "reduce";
  }
  if (input.overfitPenalty >= 75 && input.evidenceConfidence >= 45) return "quarantine";
  if (input.contradictionPenalty >= 72 && input.evidenceConfidence >= 45) {
    return input.quarantineScore >= input.reduceScore ? "quarantine" : "reduce";
  }
  if (input.noisePenalty >= 75 && input.utilityContribution <= 38 && input.evidenceConfidence >= 45) {
    return input.ignoreScore >= input.quarantineScore ? "ignore" : "quarantine";
  }
  if (input.complexityPenalty >= 75 && input.utilityContribution <= 42 && input.evidenceConfidence >= 45) {
    return input.ignoreScore >= input.reduceScore ? "ignore" : "reduce";
  }
  if (input.clarityPenalty >= 75 && input.utilityContribution >= 45) return "isolate";
  if (input.staleDataRisk >= 70) return input.utilityContribution >= 45 ? "reduce" : "review";
  if (input.evidenceConfidence < 45) return input.utilityContribution >= 45 ? "isolate" : "review";

  const ranked = [
    ["keep", input.keepScore],
    ["reduce", input.reduceScore],
    ["quarantine", input.quarantineScore],
    ["ignore", input.ignoreScore],
  ] as const;
  const [action] = [...ranked].sort((left, right) => right[1] - left[1])[0] ?? ["review", 0];
  return action;
}

function ignoranceEffectivenessFor(input: {
  recommendedAction: PruningRecommendedAction;
  harmPressure: number;
  lowUtility: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  clarityPenalty: number;
  utilityContribution: number;
  survivalContribution: number;
  evidenceConfidence: number;
  weakEvidence: number;
  traceable: boolean;
}) {
  let score = input.evidenceConfidence * 0.28;
  if (input.recommendedAction === "ignore") {
    score += input.harmPressure * 0.52 + input.lowUtility * 0.32 + input.complexityPenalty * 0.18;
    score -= input.utilityContribution * 0.16 + input.survivalContribution * 0.3;
  } else if (input.recommendedAction === "reduce") {
    score += input.redundancyPenalty * 0.28 + input.complexityPenalty * 0.18 + input.harmPressure * 0.16;
    score += input.utilityContribution * 0.12 + input.survivalContribution * 0.12;
  } else if (input.recommendedAction === "quarantine") {
    score += input.overfitPenalty * 0.34 + input.harmPressure * 0.2;
    score -= input.survivalContribution * 0.18;
  } else if (input.recommendedAction === "isolate") {
    score += input.clarityPenalty * 0.22 + input.weakEvidence * 0.18 + input.utilityContribution * 0.1;
  } else if (input.recommendedAction === "review") {
    score += input.weakEvidence * 0.22;
    score -= Math.max(0, input.harmPressure - input.evidenceConfidence) * 0.12;
  } else {
    score += input.utilityContribution * 0.22 + input.survivalContribution * 0.28;
    score -= input.harmPressure * 0.18;
  }
  if (!input.traceable) score -= 18;
  if (input.evidenceConfidence < 35 && input.recommendedAction === "ignore") score -= 24;
  return score;
}

function aggregateAssessments(assessments: PruningCandidateAssessment[], timestamp: string): PruningCandidateAssessment {
  if (assessments.length === 0) {
    return evaluateCandidate(
      {
        candidateId: "no-candidates",
        candidateType: "module-output",
        sourceModule: "pruning",
        evidenceQuality: 0,
      },
      { index: 0, timestamp, strictValidation: false },
    );
  }
  const priority = [...assessments].sort(actionSeveritySort);
  const representative = priority[0] ?? assessments[0];
  const warnings = unique(assessments.flatMap((item) => item.warnings));
  const missingInputs = unique(assessments.flatMap((item) => item.missingInputs));
  const contributingFactors = assessments
    .flatMap((item) => item.contributingFactors.map((factor) => ({ ...factor, id: `${item.candidateId}:${factor.id}` })))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
  const opposingFactors = assessments
    .flatMap((item) => item.opposingFactors.map((factor) => ({ ...factor, id: `${item.candidateId}:${factor.id}` })))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
  const recommendedAction = aggregateAction(assessments);
  const actionCount = assessments.filter((item) => item.recommendedAction === recommendedAction).length;
  return {
    candidateId: "pruning:aggregate",
    candidateType: "module-output",
    sourceModule: "pruning",
    pruningScore: roundScore(mean(assessments.map((item) => item.pruningScore))),
    ignoranceEffectivenessScore: roundScore(mean(assessments.map((item) => item.ignoranceEffectivenessScore))),
    keepScore: roundScore(mean(assessments.map((item) => item.keepScore))),
    ignoreScore: roundScore(mean(assessments.map((item) => item.ignoreScore))),
    reduceScore: roundScore(mean(assessments.map((item) => item.reduceScore))),
    quarantineScore: roundScore(mean(assessments.map((item) => item.quarantineScore))),
    redundancyPenalty: roundScore(mean(assessments.map((item) => item.redundancyPenalty))),
    complexityPenalty: roundScore(mean(assessments.map((item) => item.complexityPenalty))),
    overfitPenalty: roundScore(mean(assessments.map((item) => item.overfitPenalty))),
    noisePenalty: roundScore(mean(assessments.map((item) => item.noisePenalty))),
    clarityPenalty: roundScore(mean(assessments.map((item) => item.clarityPenalty))),
    survivalContribution: roundScore(Math.max(...assessments.map((item) => item.survivalContribution))),
    utilityContribution: roundScore(mean(assessments.map((item) => item.utilityContribution))),
    evidenceConfidence: roundScore(mean(assessments.map((item) => item.evidenceConfidence))),
    recommendedAction,
    reason: `${actionCount} of ${assessments.length} candidate(s) require ${recommendedAction}; highest-risk candidate is ${representative.candidateId}.`,
    explanation: `Pruning reviewed ${assessments.length} candidate(s). Recommended module action is ${recommendedAction}.`,
    warnings,
    missingInputs,
    degradedMode: assessments.some((item) => item.degradedMode),
    trace: aggregateTrace(assessments),
    contributingFactors,
    opposingFactors,
    validationIssues: assessments.flatMap((item) => item.validationIssues),
    evidenceUsed: {
      candidateCount: assessments.length,
      action: recommendedAction,
      ignoredCount: idsFor(assessments, "ignore").length,
      reducedCount: idsFor(assessments, "reduce").length,
      quarantinedCount: idsFor(assessments, "quarantine").length,
    },
    frontendHidden: assessments.some((item) => item.frontendHidden),
    markedRedundant: assessments.some((item) => item.markedRedundant),
    backupEvidence: assessments.some((item) => item.backupEvidence),
    timestamp,
  };
}

function aggregateAction(assessments: PruningCandidateAssessment[]): PruningRecommendedAction {
  const counts = new Map<PruningRecommendedAction, number>();
  for (const assessment of assessments) {
    counts.set(assessment.recommendedAction, (counts.get(assessment.recommendedAction) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((left, right) => {
    const severityDelta = actionSeverity(right[0]) - actionSeverity(left[0]);
    if (severityDelta !== 0) return severityDelta;
    return right[1] - left[1];
  });
  return sorted[0]?.[0] ?? "review";
}

function actionSeveritySort(left: PruningCandidateAssessment, right: PruningCandidateAssessment) {
  return actionSeverity(right.recommendedAction) - actionSeverity(left.recommendedAction) || right.pruningScore - left.pruningScore;
}

function actionSeverity(action: PruningRecommendedAction) {
  if (action === "ignore") return 6;
  if (action === "quarantine") return 5;
  if (action === "review") return 4;
  if (action === "isolate") return 3;
  if (action === "reduce") return 2;
  return 1;
}

function normalizeCandidates(input: PruningInput): PruningCandidateInput[] {
  if (Array.isArray(input.candidates) && input.candidates.length > 0) {
    return input.candidates;
  }
  const hasCandidateFields = PRUNING_CANDIDATE_SCHEMA.requiredIdentity.some((field) => input[field] != null) ||
    PRUNING_CANDIDATE_SCHEMA.scoreFields.some((field) => input[field] != null) ||
    PRUNING_CANDIDATE_SCHEMA.signedImpactFields.some((field) => input[field] != null);
  if (hasCandidateFields) return [input];
  return [
    {
      candidateId: "no-candidates",
      candidateType: "module-output",
      sourceModule: "pruning",
      evidenceQuality: 0,
      sampleSize: 0,
      uncertainty: 100,
    },
  ];
}

function scoreReader(candidate: PruningCandidateInput) {
  return (field: ScoreField, fallback: number) => toScore(candidate[field], fallback);
}

function toScore(value: unknown, fallback: number) {
  if (value == null) return clamp(fallback);
  const numberValue = numeric(value, fallback);
  if (numberValue >= 0 && numberValue <= 1) return roundScore(numberValue * 100);
  return roundScore(numberValue);
}

function signedImpact(value: unknown, fallback: number) {
  if (value == null) return clamp(fallback);
  const numberValue = numeric(value, 0);
  if (numberValue >= -1 && numberValue <= 1) return roundScore(50 + numberValue * 50);
  return roundScore(50 + clamp(numberValue, -100, 100) / 2);
}

function sampleScore(value: unknown) {
  if (value == null) return 20;
  const samples = Math.max(0, numeric(value, 0));
  if (samples >= 80) return 100;
  if (samples >= 30) return roundScore(65 + ((samples - 30) / 50) * 35);
  if (samples >= 10) return roundScore(35 + ((samples - 10) / 20) * 30);
  return roundScore(samples * 3.5);
}

function weighted(id: string, score: number, weight: number) {
  return { id, score, weight };
}

function weightedMean(values: Array<{ id: string; score: number; weight: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
}

function evidenceScale(evidenceConfidence: number, floor: number) {
  return floor + (1 - floor) * (evidenceConfidence / 100);
}

function missingInputsFor(candidate: PruningCandidateInput) {
  return [
    ...PRUNING_CANDIDATE_SCHEMA.requiredIdentity.filter((field) => !isPresent(candidate[field])),
    ...PRUNING_CANDIDATE_SCHEMA.scoreFields.filter((field) => candidate[field] == null),
    ...PRUNING_CANDIDATE_SCHEMA.signedImpactFields.filter((field) => candidate[field] == null),
  ];
}

function isPresent(value: unknown) {
  return value != null && String(value).trim().length > 0;
}

function isPctLike(value: number) {
  return value >= 0 && value <= 100;
}

function normalizedId(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

function safeStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value)).filter((value) => value.length > 0);
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function roundSigned(value: number) {
  return Math.round(clamp(value, -100, 100) * 100) / 100;
}

function toIsoTimestamp(value?: string | number | Date, fallback = "1970-01-01T00:00:00.000Z") {
  if (value == null) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function idsFor(assessments: PruningCandidateAssessment[], action: PruningRecommendedAction) {
  return assessments.filter((item) => item.recommendedAction === action).map((item) => item.candidateId);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function warningMessages(input: {
  missingInputs: string[];
  validationIssues: PruningValidationIssue[];
  evidenceConfidence: number;
  overfitPenalty: number;
  noisePenalty: number;
  staleDataRisk: number;
  contradictionPenalty: number;
  survivalContribution: number;
  recommendedAction: PruningRecommendedAction;
  selfModelWarnings: string[];
}) {
  const warnings = [...input.selfModelWarnings];
  if (input.missingInputs.length > 0) warnings.push("Pruning ran in degraded mode because some inputs were missing.");
  if (input.validationIssues.length > 0) warnings.push("Pruning sanitized invalid inputs before scoring.");
  if (input.evidenceConfidence < 40) warnings.push("Evidence is weak; pruning must not increase confidence.");
  if (input.overfitPenalty >= 70) warnings.push("High overfit risk requires cross-regime validation before restoration.");
  if (input.noisePenalty >= 70) warnings.push("High noise is reducing decision trust.");
  if (input.staleDataRisk >= 60) warnings.push("Stale data risk is high.");
  if (input.contradictionPenalty >= 60) warnings.push("Candidate contradicts better-validated evidence.");
  if (input.survivalContribution >= 80 && ["ignore", "quarantine"].includes(input.recommendedAction)) {
    warnings.push("Survival-critical information is protected from irreversible pruning.");
  }
  return unique(warnings);
}

function reasonFor(input: {
  recommendedAction: PruningRecommendedAction;
  utilityContribution: number;
  survivalContribution: number;
  evidenceConfidence: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  noisePenalty: number;
  clarityPenalty: number;
  contradictionPenalty: number;
  staleDataRisk: number;
}) {
  if (input.recommendedAction === "keep") {
    if (input.survivalContribution >= 80) return "Kept because it protects survival.";
    return "Kept because useful evidence outweighs pruning pressure.";
  }
  if (input.recommendedAction === "reduce") {
    if (input.redundancyPenalty >= 65) return "Reduced because it is too similar to stronger evidence while still useful as backup.";
    return "Reduced because cost or noise should lower its weight without deleting it.";
  }
  if (input.recommendedAction === "ignore") return "Ignored because it is too noisy or weak to improve decisions.";
  if (input.recommendedAction === "quarantine") {
    if (input.overfitPenalty >= input.contradictionPenalty) return "Quarantined because it looks overfit and needs cross-regime validation.";
    return "Quarantined because it contradicts better-validated evidence.";
  }
  if (input.recommendedAction === "isolate") {
    if (input.clarityPenalty >= 70) return "Hidden from the main view because it adds confusion without enough decision value.";
    return "Isolated because evidence is incomplete and should not dominate decisions.";
  }
  if (input.staleDataRisk >= 60) return "Needs review because stale evidence makes the value uncertain.";
  return "Needs review because Signal does not know enough to prune with confidence.";
}

function buildTrace(scores: {
  utilityContribution: number;
  survivalContribution: number;
  evidenceConfidence: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  noisePenalty: number;
  clarityPenalty: number;
  contradictionPenalty: number;
  staleDataRisk: number;
  falseOutcomePenalty: number;
  pruningScore: number;
  keepScore: number;
  reduceScore: number;
  ignoreScore: number;
  quarantineScore: number;
}) {
  return [
    trace("utility", "Utility contribution", scores.utilityContribution, 0.2, "Decision value preserved by the candidate."),
    trace("survival", "Survival contribution", scores.survivalContribution, 0.18, "Long-term protection supplied by the candidate."),
    trace("evidence", "Evidence confidence", scores.evidenceConfidence, 0.18, "Quality, sample size, regime stability, and freshness."),
    trace("redundancy", "Redundancy penalty", scores.redundancyPenalty, 0.1, "Duplicated value already supplied by stronger evidence."),
    trace("complexity", "Complexity penalty", scores.complexityPenalty, 0.08, "Maintenance, latency, and complexity cost."),
    trace("overfit", "Overfit penalty", scores.overfitPenalty, 0.1, "Narrow historical fit or regime fragility."),
    trace("noise", "Noise penalty", scores.noisePenalty, 0.08, "Observed noise and false outcome pressure."),
    trace("clarity", "Clarity penalty", scores.clarityPenalty, 0.05, "Frontend or explanation overload."),
    trace("contradiction", "Contradiction penalty", scores.contradictionPenalty, 0.08, "Disagreement with better evidence."),
    trace("staleness", "Stale data risk", scores.staleDataRisk, 0.05, "Age or degradation of the evidence."),
    trace("false-outcomes", "False outcome penalty", scores.falseOutcomePenalty, 0.05, "False positive and false negative pressure."),
    trace("pruning-score", "Pruning score", scores.pruningScore, 1, "Overall pressure to ignore, reduce, isolate, or quarantine."),
    trace("keep-score", "Keep score", scores.keepScore, 1, "Pressure to preserve the candidate."),
    trace("reduce-score", "Reduce score", scores.reduceScore, 1, "Pressure to lower weight while retaining backup evidence."),
    trace("ignore-score", "Ignore score", scores.ignoreScore, 1, "Pressure to ignore."),
    trace("quarantine-score", "Quarantine score", scores.quarantineScore, 1, "Pressure to quarantine pending validation."),
  ];
}

function trace(id: string, label: string, score: number, weight: number, reason: string): PruningTraceEntry {
  return {
    id,
    label,
    value: roundScore(score),
    score: roundScore(score),
    weight,
    contribution: roundSigned(score * weight),
    reason,
  };
}

function aggregateTrace(assessments: PruningCandidateAssessment[]) {
  const byId = new Map<string, PruningTraceEntry[]>();
  for (const assessment of assessments) {
    for (const item of assessment.trace) {
      byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
    }
  }
  return Array.from(byId.entries()).map(([id, items]) => {
    const first = items[0];
    return {
      id,
      label: first?.label ?? id,
      value: roundScore(mean(items.map((item) => Number(item.value)))),
      score: roundScore(mean(items.map((item) => item.score))),
      weight: first?.weight ?? 1,
      contribution: roundSigned(mean(items.map((item) => item.contribution))),
      reason: first?.reason ?? "Aggregate trace.",
    };
  });
}

function contributingFactorsFor(input: {
  recommendedAction: PruningRecommendedAction;
  utilityContribution: number;
  survivalContribution: number;
  evidenceConfidence: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  noisePenalty: number;
  clarityPenalty: number;
  contradictionPenalty: number;
  staleDataRisk: number;
  weakEvidence: number;
}) {
  const factors: PruningContributingFactor[] = [];
  const add = (id: string, label: string, score: number, reason: string) => {
    if (score >= 45) factors.push({ id, label, score: roundScore(score), reason });
  };
  if (input.recommendedAction === "keep") {
    add("utility", "Useful", input.utilityContribution, "Useful evidence should be preserved.");
    add("survival", "Survival protective", input.survivalContribution, "Survival-critical value resists pruning.");
    add("evidence", "Well supported", input.evidenceConfidence, "Evidence quality supports preservation.");
  } else if (input.recommendedAction === "reduce") {
    add("redundancy", "Too similar", input.redundancyPenalty, "Candidate is useful but overlaps stronger evidence.");
    add("utility", "Backup value", input.utilityContribution, "Candidate still has enough value to keep as backup.");
    add("complexity", "Complexity cost", input.complexityPenalty, "Lowering weight reduces cost.");
  } else if (input.recommendedAction === "ignore") {
    add("noise", "Too noisy", input.noisePenalty, "Noise overwhelms decision value.");
    add("low-utility", "Too weak", input.weakEvidence, "Weak value cannot justify primary influence.");
    add("complexity", "Complexity cost", input.complexityPenalty, "Complexity is not paying for itself.");
  } else if (input.recommendedAction === "quarantine") {
    add("overfit", "Overfit risk", input.overfitPenalty, "Candidate needs cross-regime validation.");
    add("contradiction", "Contradictory", input.contradictionPenalty, "Candidate conflicts with better evidence.");
    add("stale", "Stale", input.staleDataRisk, "Candidate may be stale.");
  } else if (input.recommendedAction === "isolate") {
    add("clarity", "Hidden from main view", input.clarityPenalty, "Candidate adds frontend or explanation overload.");
    add("weak-evidence", "Incomplete evidence", input.weakEvidence, "Candidate should not dominate decisions.");
  } else {
    add("weak-evidence", "Needs evidence", input.weakEvidence, "Unknown value should be reviewed.");
  }
  return factors.sort((left, right) => right.score - left.score);
}

function opposingFactorsFor(input: {
  recommendedAction: PruningRecommendedAction;
  utilityContribution: number;
  survivalContribution: number;
  evidenceConfidence: number;
  redundancyPenalty: number;
  complexityPenalty: number;
  overfitPenalty: number;
  noisePenalty: number;
  weakEvidence: number;
}) {
  const factors: PruningContributingFactor[] = [];
  const add = (id: string, label: string, score: number, reason: string) => {
    if (score >= 45) factors.push({ id, label, score: roundScore(score), reason });
  };
  if (["ignore", "quarantine"].includes(input.recommendedAction)) {
    add("utility", "Useful evidence", input.utilityContribution, "Useful signals should not be removed casually.");
    add("survival", "Survival value", input.survivalContribution, "Survival-critical evidence resists pruning.");
    add("weak-evidence", "Weak evidence", input.weakEvidence, "Weak evidence cannot justify confident pruning.");
  } else if (input.recommendedAction === "keep") {
    add("noise", "Noise pressure", input.noisePenalty, "Kept signals can still be noisy.");
    add("overfit", "Overfit pressure", input.overfitPenalty, "Kept signals may still need monitoring.");
    add("redundancy", "Redundancy", input.redundancyPenalty, "Kept signals may duplicate stronger evidence.");
  } else if (input.recommendedAction === "reduce") {
    add("survival", "Survival value", input.survivalContribution, "Reduction must not hide protective evidence.");
    add("evidence", "Evidence support", input.evidenceConfidence, "Evidence may still justify stronger preservation.");
  } else {
    add("utility", "Possible value", input.utilityContribution, "There may be value that should be preserved.");
  }
  return factors.sort((left, right) => right.score - left.score);
}

function copy<T>(value: T): T {
  return structuredClone(value);
}
