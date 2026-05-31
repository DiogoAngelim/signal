import { clamp, mean } from "../math/statistics";
import type { CalibrationResult } from "../calibration/engine";
import type { PruningCandidateAssessment, PruningResult } from "../pruning/engine";
import type { ReflectionResult } from "../reflection/engine";

export type AgencyStatus =
  | "approved"
  | "denied"
  | "deferred"
  | "escalated"
  | "requires-review"
  | "limited"
  | "rollback"
  | string;

export type AuthorityLevelName =
  | "none"
  | "observer"
  | "operator"
  | "supervisor"
  | "autonomous"
  | string;

export type DecisionResult = {
  id?: string;
  type?: string;
  intent?: string;
  confidence?: number;
  uncertainty?: number;
  risk?: number;
  expectedValue?: number;
  impact?: number;
  metadata?: Record<string, unknown>;
};

export type AgencyAuthorityInput = {
  level?: AuthorityLevelName;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type AuthorityModel =
  | Record<AuthorityLevelName, number>
  | Array<{ level: AuthorityLevelName; score: number }>;

export type AgencyConstraint = {
  id: string;
  label?: string;
  type?:
    | "risk-budget"
    | "resource-budget"
    | "execution-limit"
    | "time-limit"
    | "rate-limit"
    | "quality-requirement"
    | string;
  value?: number;
  limit?: number;
  min?: number;
  max?: number;
  operator?: "<" | "<=" | ">" | ">=" | "==" | "!=";
  passed?: boolean;
  hard?: boolean;
  severity?: "low" | "medium" | "high" | "critical" | string;
  weight?: number;
  reason?: string;
  statusOnViolation?: AgencyStatus;
  metadata?: Record<string, unknown>;
};

export type HumanReviewPolicy = {
  mode?:
    | "always-review"
    | "review-above-threshold"
    | "review-when-confidence-low"
    | "review-when-uncertainty-high"
    | "fully-autonomous"
    | "never"
    | string;
  threshold?: number;
  confidenceThreshold?: number;
  uncertaintyThreshold?: number;
  statusWhenRequired?: AgencyStatus;
  reason?: string;
};

export type AgencyInput = {
  decision?: DecisionResult | null;
  calibration?: Partial<CalibrationResult> & {
    warnings?: string[];
  };
  pruning?: Partial<PruningResult> | PruningCandidateAssessment[];
  reflection?:
    | Partial<ReflectionResult>
    | { reflectionScore?: number; recommendedConfidenceCap?: number };
  authority?: AgencyAuthorityInput | AuthorityLevelName;
  requiredAuthority?: AuthorityLevelName | number;
  authorityModel?: AuthorityModel;
  constraints?: AgencyConstraint[];
  reviewPolicy?: HumanReviewPolicy;
  execution?: {
    readiness?: number;
    available?: boolean;
    blocked?: boolean;
    rollbackRequested?: boolean;
    reasons?: string[];
    metadata?: Record<string, unknown>;
  };
  thresholds?: {
    minDecisionConfidence?: number;
    maxUncertainty?: number;
    minReflectionScore?: number;
    minAgencyScore?: number;
  };
  statusOnInsufficientAuthority?: AgencyStatus;
  statusOnConstraintViolation?: AgencyStatus;
  statusOnLowConfidence?: AgencyStatus;
};

export type PruningGateEvaluation = {
  score: number;
  safeToAct: boolean;
  nonPrunedEvidenceScore: number;
  executionCap: number;
  ignoredCandidateIds: string[];
  reducedCandidateIds: string[];
  quarantinedCandidateIds: string[];
  preservedCandidateIds: string[];
  reasons: string[];
};

export type AuthorityEvaluation = {
  providedLevel: AuthorityLevelName;
  requiredLevel: AuthorityLevelName | number;
  providedScore: number;
  requiredScore: number;
  sufficient: boolean;
  score: number;
  reason: string;
};

export type ConstraintEvaluation = {
  score: number;
  passed: boolean;
  violations: Array<{
    id: string;
    label: string;
    type: string;
    severity: string;
    hard: boolean;
    reason: string;
    statusOnViolation?: AgencyStatus;
  }>;
  constraints: Array<{
    id: string;
    label: string;
    type: string;
    passed: boolean;
    severity: string;
    hard: boolean;
    score: number;
    reason: string;
  }>;
};

export type ReviewRequirement = {
  required: boolean;
  mode: string;
  status: AgencyStatus;
  reason: string;
};

export type AgencyResult = {
  agencyScore: number;
  commitmentConfidence: number;
  executionReadiness: number;
  status: AgencyStatus;
  rawConfidence: number;
  calibratedConfidence: number;
  trustworthiness: number;
  calibrationWarnings: string[];
  agency: {
    action: AgencyStatus;
    rawConfidence: number;
    calibratedConfidence: number;
    trustworthiness: number;
    calibrationWarnings: string[];
  };
  authorityEvaluation: AuthorityEvaluation;
  constraintEvaluation: ConstraintEvaluation;
  reviewRequirement: ReviewRequirement;
  pruningGate: PruningGateEvaluation;
  reasons: string[];
  audit: {
    componentScores: Record<string, number>;
    weights: Record<string, number>;
    thresholds: Record<string, number>;
    formulas: string[];
    statusResolution: string[];
  };
};

type EvaluatedConstraint = ConstraintEvaluation["constraints"][number] & {
  weight: number;
  statusOnViolation?: AgencyStatus;
};

const DEFAULT_AUTHORITY: Record<string, number> = {
  none: 0,
  observer: 25,
  operator: 50,
  supervisor: 75,
  autonomous: 100,
};

const DEFAULT_WEIGHTS = {
  authority: 0.18,
  constraints: 0.22,
  uncertaintyControl: 0.16,
  reflectionQuality: 0.18,
  decisionConfidence: 0.14,
  executionReadiness: 0.12,
};

export function authorize(input: AgencyInput): AgencyResult {
  const rawDecision = normalizeDecision(input.decision);
  const calibration = normalizeCalibration(input.calibration, rawDecision.confidence);
  const decision = {
    ...rawDecision,
    confidence: Math.min(rawDecision.confidence, calibration.calibratedConfidence),
  };
  const thresholds = normalizeThresholds(input.thresholds);
  const reflectionScore = normalizeReflectionScore(input.reflection);
  const uncertainty = normalizeScore(
    decision.uncertainty,
    Math.max(0, 100 - decision.confidence),
  );
  const authorityEvaluation = evaluateAuthority(
    input.authority,
    input.requiredAuthority,
    input.authorityModel,
  );
  const constraintEvaluation = evaluateConstraints(input.constraints);
  const reviewRequirement = evaluateReviewRequirement(
    input.reviewPolicy,
    decision,
    reflectionScore,
    uncertainty,
  );
  const pruningGate = evaluatePruningGate(input.pruning);
  const baseExecutionReadiness = normalizeScore(
    input.execution?.readiness,
    mean([
      authorityEvaluation.score,
      constraintEvaluation.score,
      reflectionScore,
      decision.confidence,
      100 - uncertainty,
      ...(input.pruning ? [pruningGate.score] : []),
    ]),
  );
  const executionReadiness = Math.min(
    pruningGate.executionCap,
    capReadiness(baseExecutionReadiness, {
      reviewRequired: reviewRequirement.required,
      constraintEvaluation,
      executionBlocked: input.execution?.blocked === true,
    }),
  );
  const componentScores = {
    authority: authorityEvaluation.score,
    constraints: constraintEvaluation.score,
    uncertaintyControl: clamp(100 - uncertainty),
    reflectionQuality: reflectionScore,
    decisionConfidence: decision.confidence,
    executionReadiness,
    pruningSafety: pruningGate.score,
  };
  const agencyScore = weightedScore(componentScores, DEFAULT_WEIGHTS);
  const commitmentConfidence = clamp(
    mean([
      decision.confidence,
      reflectionScore,
      authorityEvaluation.score,
      constraintEvaluation.score,
      100 - uncertainty,
      ...(input.pruning ? [pruningGate.score] : []),
    ]),
  );
  const statusResolution: string[] = [];
  const status = resolveStatus({
    input,
    decision,
    thresholds,
    reflectionScore,
    uncertainty,
    agencyScore,
    executionReadiness,
    authorityEvaluation,
    constraintEvaluation,
    reviewRequirement,
    pruningGate,
    statusResolution,
  });

  return {
    agencyScore,
    commitmentConfidence,
    executionReadiness,
    status,
    rawConfidence: calibration.rawConfidence,
    calibratedConfidence: decision.confidence,
    trustworthiness: calibration.trustworthiness,
    calibrationWarnings: calibration.warnings,
    agency: {
      action: status,
      rawConfidence: calibration.rawConfidence,
      calibratedConfidence: decision.confidence,
      trustworthiness: calibration.trustworthiness,
      calibrationWarnings: calibration.warnings,
    },
    authorityEvaluation,
    constraintEvaluation,
    reviewRequirement,
    pruningGate,
    reasons: reasonsFor({
      input,
      decision,
      thresholds,
      reflectionScore,
      uncertainty,
      agencyScore,
      executionReadiness,
      authorityEvaluation,
      constraintEvaluation,
      reviewRequirement,
      pruningGate,
      status,
    }),
    audit: {
      componentScores,
      weights: DEFAULT_WEIGHTS,
      thresholds,
      formulas: [
        "calibrated decision confidence = min(raw decision confidence, calibrated confidence)",
        "commitmentConfidence = mean(calibrated decision confidence, reflection quality, authority score, constraint compliance, uncertainty control)",
        "executionReadiness = readiness input or mean core governance components, capped by review and blocking conditions",
        "pruningSafety blocks quarantined decision drivers and caps execution when only reduced evidence remains",
        "agencyScore = weighted mean of authority, constraints, uncertainty control, reflection quality, calibrated decision confidence, and execution readiness",
      ],
      statusResolution,
    },
  };
}

export function commit(input: AgencyInput): AgencyResult {
  return authorize(input);
}

function normalizeDecision(decision: DecisionResult | null | undefined) {
  return {
    id: decision?.id ?? "decision",
    type: decision?.type ?? "generic",
    intent: decision?.intent ?? "",
    confidence: normalizeScore(decision?.confidence, 0),
    uncertainty: decision?.uncertainty,
    risk: normalizeScore(decision?.risk, 0),
    impact: normalizeScore(decision?.impact ?? decision?.expectedValue, 0),
    present: decision != null,
  };
}

function normalizeCalibration(
  calibration: AgencyInput["calibration"],
  fallbackConfidence: number,
) {
  const rawConfidence = normalizeScore(
    calibration?.rawConfidence,
    fallbackConfidence,
  );
  const calibratedConfidence = normalizeScore(
    calibration?.calibratedConfidence,
    rawConfidence,
  );
  return {
    rawConfidence,
    calibratedConfidence,
    trustworthiness: normalizeScore(calibration?.trustworthiness, 100),
    warnings: safeArray(calibration?.warnings),
  };
}

function normalizeThresholds(thresholds: AgencyInput["thresholds"] = {}) {
  return {
    minDecisionConfidence: normalizeScore(thresholds.minDecisionConfidence, 0),
    maxUncertainty: normalizeScore(thresholds.maxUncertainty, 100),
    minReflectionScore: normalizeScore(thresholds.minReflectionScore, 0),
    minAgencyScore: normalizeScore(thresholds.minAgencyScore, 0),
  };
}

function normalizeReflectionScore(reflection: AgencyInput["reflection"]) {
  return normalizeScore(reflection?.reflectionScore, 50);
}

function evaluateAuthority(
  authority: AgencyInput["authority"],
  requiredAuthority: AgencyInput["requiredAuthority"],
  authorityModel: AuthorityModel | undefined,
): AuthorityEvaluation {
  const model = normalizeAuthorityModel(authorityModel);
  const providedLevel =
    typeof authority === "string" ? authority : (authority?.level ?? "none");
  const providedScore = normalizeScore(
    typeof authority === "string"
      ? model[providedLevel]
      : (authority?.score ?? model[providedLevel]),
    model[providedLevel] ?? 0,
  );
  const requiredLevel = requiredAuthority ?? "observer";
  const requiredScore =
    typeof requiredLevel === "number"
      ? normalizeScore(requiredLevel, 0)
      : normalizeScore(model[requiredLevel], 0);
  const sufficient = providedScore >= requiredScore;
  const score =
    requiredScore === 0 ? 100 : clamp((providedScore / requiredScore) * 100);

  return {
    providedLevel,
    requiredLevel,
    providedScore,
    requiredScore,
    sufficient,
    score,
    reason: sufficient
      ? `Authority ${providedLevel} satisfies required authority ${String(requiredLevel)}.`
      : `Authority ${providedLevel} is below required authority ${String(requiredLevel)}.`,
  };
}

function normalizeAuthorityModel(authorityModel: AuthorityModel | undefined) {
  const model = { ...DEFAULT_AUTHORITY };
  if (Array.isArray(authorityModel)) {
    for (const entry of authorityModel)
      model[entry.level] = normalizeScore(entry.score, 0);
  } else if (authorityModel && typeof authorityModel === "object") {
    for (const [level, score] of Object.entries(authorityModel))
      model[level] = normalizeScore(score, 0);
  }
  return model;
}

function evaluateConstraints(
  constraints: AgencyConstraint[] = [],
): ConstraintEvaluation {
  const evaluated = safeArray(constraints).map(evaluateConstraint);
  if (evaluated.length === 0) {
    return {
      score: 100,
      passed: true,
      violations: [],
      constraints: [],
    };
  }

  const weightedTotal = evaluated.reduce((sum, item) => sum + item.weight, 0);
  const score = clamp(
    evaluated.reduce((sum, item) => sum + item.score * item.weight, 0) /
      weightedTotal,
  );
  const violations = evaluated
    .filter((item) => !item.passed)
    .map((item) => ({
      id: item.id,
      label: item.label,
      type: item.type,
      severity: item.severity,
      hard: item.hard,
      reason: item.reason,
      ...(item.statusOnViolation
        ? { statusOnViolation: item.statusOnViolation }
        : {}),
    }));

  return {
    score,
    passed: violations.length === 0,
    violations,
    constraints: evaluated.map(
      ({ weight: _weight, statusOnViolation: _statusOnViolation, ...item }) =>
        item,
    ),
  };
}

function evaluateConstraint(constraint: AgencyConstraint): EvaluatedConstraint {
  const id = String(constraint.id || "constraint");
  const label = constraint.label ?? id;
  const type = constraint.type ?? "custom";
  const severity = normalizeSeverity(constraint.severity);
  const hard =
    constraint.hard ?? (severity === "high" || severity === "critical");
  const passed = constraint.passed ?? compareConstraint(constraint);
  const score = passed ? 100 : violationScore(severity, hard);
  const reason =
    constraint.reason ?? (passed ? `${label} passed.` : `${label} failed.`);

  return {
    id,
    label,
    type,
    passed,
    severity,
    hard,
    score,
    reason,
    weight: Math.max(0.1, numeric(constraint.weight, severityWeight(severity))),
    ...(constraint.statusOnViolation
      ? { statusOnViolation: constraint.statusOnViolation }
      : {}),
  };
}

function compareConstraint(constraint: AgencyConstraint) {
  const hasValue = Number.isFinite(Number(constraint.value));
  const value = numeric(constraint.value, 0);
  const operator = constraint.operator ?? defaultOperator(constraint);

  if (
    !hasValue &&
    constraint.limit == null &&
    constraint.min == null &&
    constraint.max == null
  )
    return false;
  if (constraint.min != null && value < numeric(constraint.min, value))
    return false;
  if (constraint.max != null && value > numeric(constraint.max, value))
    return false;
  if (constraint.limit == null) return true;

  const limit = numeric(constraint.limit, value);
  if (operator === "<") return value < limit;
  if (operator === "<=") return value <= limit;
  if (operator === ">") return value > limit;
  if (operator === ">=") return value >= limit;
  if (operator === "==") return value === limit;
  if (operator === "!=") return value !== limit;
  return value <= limit;
}

function defaultOperator(constraint: AgencyConstraint) {
  return constraint.type === "quality-requirement" ? ">=" : "<=";
}

function evaluateReviewRequirement(
  policy: HumanReviewPolicy | undefined,
  decision: ReturnType<typeof normalizeDecision>,
  reflectionScore: number,
  uncertainty: number,
): ReviewRequirement {
  const mode = normalizeMode(policy?.mode ?? "review-when-confidence-low");
  const status = policy?.statusWhenRequired ?? "requires-review";
  const confidenceThreshold = normalizeScore(
    policy?.confidenceThreshold ?? policy?.threshold,
    50,
  );
  const uncertaintyThreshold = normalizeScore(
    policy?.uncertaintyThreshold ?? policy?.threshold,
    60,
  );
  const impactThreshold = normalizeScore(policy?.threshold, 80);
  const required =
    mode === "always-review" ||
    (mode === "review-above-threshold" &&
      Math.max(decision.risk, decision.impact) >= impactThreshold) ||
    (mode === "review-when-confidence-low" &&
      decision.confidence < confidenceThreshold) ||
    (mode === "review-when-uncertainty-high" &&
      uncertainty > uncertaintyThreshold) ||
    (mode === "default-review" &&
      (decision.confidence < confidenceThreshold ||
        uncertainty > uncertaintyThreshold ||
        reflectionScore < 50));

  return {
    required,
    mode,
    status,
    reason:
      policy?.reason ??
      (required
        ? `Human review required by ${mode}.`
        : `Human review not required by ${mode}.`),
  };
}

function normalizeMode(mode: string) {
  const normalized = mode
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (normalized === "always-review" || normalized === "always")
    return "always-review";
  if (
    normalized === "review-above-threshold" ||
    normalized === "above-threshold"
  )
    return "review-above-threshold";
  if (
    normalized === "review-when-confidence-low" ||
    normalized === "confidence-low" ||
    normalized === "low-confidence"
  )
    return "review-when-confidence-low";
  if (
    normalized === "review-when-uncertainty-high" ||
    normalized === "uncertainty-high" ||
    normalized === "high-uncertainty"
  )
    return "review-when-uncertainty-high";
  if (
    normalized === "fully-autonomous" ||
    normalized === "autonomous" ||
    normalized === "never"
  )
    return "fully-autonomous";
  return "default-review";
}

function capReadiness(
  readiness: number,
  input: {
    reviewRequired: boolean;
    constraintEvaluation: ConstraintEvaluation;
    executionBlocked: boolean;
  },
) {
  let capped = readiness;
  if (input.reviewRequired) capped = Math.min(capped, 70);
  if (input.constraintEvaluation.violations.some((violation) => violation.hard))
    capped = Math.min(capped, 35);
  if (input.executionBlocked) capped = 0;
  return clamp(capped);
}

function evaluatePruningGate(pruning: AgencyInput["pruning"]): PruningGateEvaluation {
  const candidates = Array.isArray(pruning)
    ? pruning
    : Array.isArray(pruning?.candidates)
      ? pruning.candidates
      : pruning && pruning.candidateId
        ? [pruning as PruningCandidateAssessment]
        : [];
  if (candidates.length === 0) {
    return {
      score: 100,
      safeToAct: true,
      nonPrunedEvidenceScore: 100,
      executionCap: 100,
      ignoredCandidateIds: [],
      reducedCandidateIds: [],
      quarantinedCandidateIds: [],
      preservedCandidateIds: [],
      reasons: ["No pruning restrictions were supplied."],
    };
  }

  const ignoredCandidateIds = idsForAction(candidates, "ignore");
  const reducedCandidateIds = idsForAction(candidates, "reduce");
  const quarantinedCandidateIds = idsForAction(candidates, "quarantine");
  const preservedCandidateIds = candidates
    .filter((candidate) => candidate.recommendedAction === "keep" || candidate.survivalContribution >= 75)
    .map((candidate) => candidate.candidateId);
  const nonPrunedEvidenceScore = clamp(
    mean(
      candidates
        .filter((candidate) => !["ignore", "quarantine"].includes(candidate.recommendedAction))
        .map((candidate) => mean([candidate.keepScore, candidate.evidenceConfidence, candidate.utilityContribution])),
    ),
  );
  const ignoredPressure = ignoredCandidateIds.length > 0 ? 18 : 0;
  const quarantinePressure = quarantinedCandidateIds.length > 0 ? 34 : 0;
  const reducedPressure = reducedCandidateIds.length > 0 ? 8 : 0;
  const score = clamp(nonPrunedEvidenceScore - ignoredPressure - quarantinePressure - reducedPressure);
  const safeToAct = quarantinedCandidateIds.length === 0 && !(ignoredCandidateIds.length > 0 && nonPrunedEvidenceScore < 65);
  const executionCap = quarantinedCandidateIds.length > 0
    ? 0
    : ignoredCandidateIds.length > 0
      ? Math.min(55, score)
      : reducedCandidateIds.length > 0
        ? Math.min(78, score)
        : 100;
  const reasons = [
    ...(quarantinedCandidateIds.length
      ? [`Avoid acting on quarantined pruning candidate(s): ${quarantinedCandidateIds.join(", ")}.`]
      : []),
    ...(ignoredCandidateIds.length
      ? [`Ignored pruning candidate(s) cannot carry the decision: ${ignoredCandidateIds.join(", ")}.`]
      : []),
    ...(reducedCandidateIds.length
      ? [`Reduced pruning candidate(s) lower execution size or confidence: ${reducedCandidateIds.join(", ")}.`]
      : []),
    ...(preservedCandidateIds.length
      ? [`Preserved candidate(s) remain available as non-pruned evidence: ${preservedCandidateIds.join(", ")}.`]
      : []),
  ];

  return {
    score,
    safeToAct,
    nonPrunedEvidenceScore,
    executionCap,
    ignoredCandidateIds,
    reducedCandidateIds,
    quarantinedCandidateIds,
    preservedCandidateIds,
    reasons: reasons.length ? reasons : ["Pruning found no action blockers."],
  };
}

function idsForAction(candidates: Array<Partial<PruningCandidateAssessment>>, action: string) {
  return candidates
    .filter((candidate) => candidate.recommendedAction === action)
    .map((candidate) => String(candidate.candidateId ?? "unknown-candidate"));
}

function resolveStatus(input: {
  input: AgencyInput;
  decision: ReturnType<typeof normalizeDecision>;
  thresholds: ReturnType<typeof normalizeThresholds>;
  reflectionScore: number;
  uncertainty: number;
  agencyScore: number;
  executionReadiness: number;
  authorityEvaluation: AuthorityEvaluation;
  constraintEvaluation: ConstraintEvaluation;
  reviewRequirement: ReviewRequirement;
  pruningGate: PruningGateEvaluation;
  statusResolution: string[];
}): AgencyStatus {
  if (input.input.execution?.rollbackRequested === true) {
    input.statusResolution.push("Execution requested rollback.");
    return "rollback";
  }

  if (!input.decision.present) {
    input.statusResolution.push("No decision was supplied.");
    return "deferred";
  }

  if (!input.authorityEvaluation.sufficient) {
    const status = input.input.statusOnInsufficientAuthority ?? "denied";
    input.statusResolution.push("Authority is insufficient.");
    return status;
  }

  const overrideViolation = input.constraintEvaluation.violations.find(
    (violation) => violation.statusOnViolation,
  );
  if (overrideViolation?.statusOnViolation) {
    input.statusResolution.push(
      `Constraint ${overrideViolation.id} requested ${overrideViolation.statusOnViolation}.`,
    );
    return overrideViolation.statusOnViolation;
  }

  const hardViolation = input.constraintEvaluation.violations.find(
    (violation) => violation.hard,
  );
  if (hardViolation) {
    const status = input.input.statusOnConstraintViolation ?? "denied";
    input.statusResolution.push(`Hard constraint ${hardViolation.id} failed.`);
    return status;
  }

  if (input.decision.confidence < input.thresholds.minDecisionConfidence) {
    const status = input.input.statusOnLowConfidence ?? "deferred";
    input.statusResolution.push("Decision confidence is below threshold.");
    return status;
  }

  if (
    input.uncertainty > input.thresholds.maxUncertainty ||
    input.reflectionScore < input.thresholds.minReflectionScore
  ) {
    input.statusResolution.push("Uncertainty or reflection threshold failed.");
    return "deferred";
  }

  if (input.reviewRequirement.required) {
    input.statusResolution.push("Human review policy requires review.");
    return input.reviewRequirement.status;
  }

  if (!input.pruningGate.safeToAct) {
    input.statusResolution.push("Pruning blocked action because evidence depends on ignored or quarantined drivers.");
    return input.pruningGate.quarantinedCandidateIds.length > 0 ? "denied" : "requires-review";
  }

  if (!input.constraintEvaluation.passed) {
    input.statusResolution.push(
      "Only non-hard constraints failed; proceeding with limits.",
    );
    return "limited";
  }

  if (
    input.executionReadiness <= 0 ||
    input.agencyScore < input.thresholds.minAgencyScore
  ) {
    input.statusResolution.push(
      "Execution readiness or agency score is insufficient.",
    );
    return "deferred";
  }

  input.statusResolution.push("All agency gates passed.");
  return "approved";
}

function reasonsFor(input: {
  input: AgencyInput;
  decision: ReturnType<typeof normalizeDecision>;
  thresholds: ReturnType<typeof normalizeThresholds>;
  reflectionScore: number;
  uncertainty: number;
  agencyScore: number;
  executionReadiness: number;
  authorityEvaluation: AuthorityEvaluation;
  constraintEvaluation: ConstraintEvaluation;
  reviewRequirement: ReviewRequirement;
  pruningGate: PruningGateEvaluation;
  status: AgencyStatus;
}) {
  const reasons = [
    input.authorityEvaluation.reason,
    input.reviewRequirement.reason,
    `Decision confidence is ${formatPercent(input.decision.confidence)} after calibration.`,
    `Reflection quality is ${formatPercent(input.reflectionScore)}.`,
    `Uncertainty is ${formatPercent(input.uncertainty)}.`,
    `Execution readiness is ${formatPercent(input.executionReadiness)}.`,
    `Pruning safety is ${formatPercent(input.pruningGate.score)}.`,
  ];

  if (input.input.calibration) {
    const rawConfidence = normalizeScore(
      input.input.calibration.rawConfidence,
      input.decision.confidence,
    );
    const calibratedConfidence = input.decision.confidence;
    if (rawConfidence - calibratedConfidence >= 10) {
      reasons.push(
        "Agency became more conservative because calibrated confidence is materially below raw confidence.",
      );
    }
    for (const warning of safeArray(input.input.calibration.warnings))
      reasons.push(`Calibration warning: ${warning}.`);
  }

  for (const violation of input.constraintEvaluation.violations)
    reasons.push(violation.reason);
  for (const reason of input.input.execution?.reasons ?? [])
    reasons.push(reason);
  for (const reason of input.pruningGate.reasons) reasons.push(reason);
  if (input.status === "approved") reasons.push("Agency approved commitment.");
  if (input.status === "limited")
    reasons.push("Agency limited commitment due to non-hard constraints.");
  if (input.status === "denied") reasons.push("Agency denied commitment.");
  if (input.status === "deferred") reasons.push("Agency deferred commitment.");
  if (input.status === "escalated")
    reasons.push("Agency escalated commitment.");
  if (input.status === "rollback") reasons.push("Agency requested rollback.");
  return unique(reasons);
}

function weightedScore(
  scores: Record<keyof typeof DEFAULT_WEIGHTS, number>,
  weights: Record<keyof typeof DEFAULT_WEIGHTS, number>,
) {
  const entries = Object.entries(weights) as Array<
    [keyof typeof DEFAULT_WEIGHTS, number]
  >;
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return clamp(
    entries.reduce((sum, [key, weight]) => sum + scores[key] * weight, 0) /
      totalWeight,
  );
}

function normalizeSeverity(value: unknown) {
  const severity = String(value ?? "medium").toLowerCase();
  if (
    severity === "low" ||
    severity === "medium" ||
    severity === "high" ||
    severity === "critical"
  )
    return severity;
  return "medium";
}

function severityWeight(severity: string) {
  if (severity === "critical") return 1.5;
  if (severity === "high") return 1.25;
  if (severity === "low") return 0.75;
  return 1;
}

function violationScore(severity: string, hard: boolean) {
  if (hard && (severity === "critical" || severity === "high")) return 0;
  if (severity === "critical") return 10;
  if (severity === "high") return 35;
  if (severity === "low") return 75;
  return 55;
}

function normalizeScore(value: unknown, fallback: number) {
  const numberValue = numeric(value, fallback);
  return clamp(
    numberValue >= 0 && numberValue <= 1 ? numberValue * 100 : numberValue,
  );
}

function numeric(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function safeArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function formatPercent(value: number) {
  return `${Math.round(clamp(value))}%`;
}
