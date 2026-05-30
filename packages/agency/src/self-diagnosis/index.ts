import type {
  AgencyTrace,
  CalibrationResult,
  LearningResult,
  SelfDiagnosisConfig,
  SelfDiagnosisRecommendation,
  SelfDiagnosisResult,
} from "../types";

const DEFAULT_RECENT_WINDOW = 5;
const DEFAULT_MINIMUM_TRACE_COUNT = 3;

export type SelfDiagnosisInput = {
  history: readonly AgencyTrace[];
  calibration: CalibrationResult;
  learning?: LearningResult;
  config?: SelfDiagnosisConfig;
};

export function diagnoseAgencyState(input: SelfDiagnosisInput): SelfDiagnosisResult {
  const history = input.history;
  const total = history.length;
  const recentWindow = positiveInteger(input.config?.recentWindow ?? DEFAULT_RECENT_WINDOW, "recentWindow");
  const minimumTraceCount = positiveInteger(
    input.config?.minimumTraceCount ?? DEFAULT_MINIMUM_TRACE_COUNT,
    "minimumTraceCount",
  );
  const missingOutcomeRatio = total === 0 ? 1 : countMissingOutcomes(history) / total;
  const policyViolationRatio = total === 0 ? 0 : countPolicyViolations(history) / total;
  const dataReliability = calculateDataReliability(history);
  const calibrationHealth = calibrationHealthScore(input.calibration);
  const overfitRisk = calculateOverfitRisk(history, minimumTraceCount);
  const recentSuccessRate = calculateRecentSuccessRate(history, recentWindow);
  const trust = round(
    dataReliability * 0.25
      + calibrationHealth * 0.25
      + (1 - overfitRisk) * 0.2
      + recentSuccessRate * 0.2
      + (1 - policyViolationRatio) * 0.1,
  );

  return {
    trust,
    dataReliability,
    calibrationHealth,
    overfitRisk,
    recommendation: recommendationFor(trust, missingOutcomeRatio, policyViolationRatio, input.calibration),
    reasons: reasonsFor({
      dataReliability,
      calibration: input.calibration,
      overfitRisk,
      recentSuccessRate,
      policyViolationRatio,
      learning: input.learning,
    }),
  };
}

function calculateDataReliability(history: readonly AgencyTrace[]) {
  if (history.length === 0) {
    return 0.5;
  }

  const contextCompleteness = average(history.map((trace) => {
    const perceptionScore = trace.perception === undefined ? 0 : 1;
    const intelligenceScore = trace.intelligence === undefined ? 0 : 1;
    return (perceptionScore + intelligenceScore + 2) / 4;
  }));
  const outcomeCompleteness = 1 - countMissingOutcomes(history) / history.length;
  return round(contextCompleteness * 0.5 + outcomeCompleteness * 0.5);
}

function calculateOverfitRisk(history: readonly AgencyTrace[], minimumTraceCount: number) {
  if (history.length < minimumTraceCount) {
    return 0.8;
  }

  const uniqueKinds = new Set(history.map((trace) => trace.decision.kind)).size;
  if (uniqueKinds === 1) {
    return 0.6;
  }

  return round(Math.max(0, Math.min(1, 1 - uniqueKinds / history.length)));
}

function calculateRecentSuccessRate(history: readonly AgencyTrace[], recentWindow: number) {
  const known = history
    .filter((trace) => typeof trace.outcome?.success === "boolean")
    .slice(-recentWindow);

  if (known.length === 0) {
    return 0.5;
  }

  return round(known.filter((trace) => trace.outcome?.success === true).length / known.length);
}

function calibrationHealthScore(calibration: CalibrationResult) {
  if (calibration.reliability === "aligned") {
    return 1;
  }

  if (calibration.reliability === "underconfident") {
    return 0.75;
  }

  if (calibration.reliability === "overconfident") {
    return 0.4;
  }

  return 0.5;
}

function recommendationFor(
  trust: number,
  missingOutcomeRatio: number,
  policyViolationRatio: number,
  calibration: CalibrationResult,
): SelfDiagnosisRecommendation {
  if (missingOutcomeRatio > 0.5 || policyViolationRatio > 0.4) {
    return "requires_human_review";
  }

  if (calibration.reliability === "overconfident" && trust < 0.55) {
    return "requires_human_review";
  }

  if (trust >= 0.75) {
    return "act";
  }

  if (trust >= 0.55) {
    return "act_with_reduced_size";
  }

  return "wait";
}

function reasonsFor(input: {
  dataReliability: number;
  calibration: CalibrationResult;
  overfitRisk: number;
  recentSuccessRate: number;
  policyViolationRatio: number;
  learning?: LearningResult;
}) {
  const reasons: string[] = [];

  if (input.dataReliability < 0.6) {
    reasons.push("Outcome coverage or context capture is incomplete.");
  }

  if (input.calibration.reliability === "overconfident") {
    reasons.push("Confidence is higher than observed outcomes support.");
  }

  if (input.calibration.reliability === "underconfident") {
    reasons.push("Observed outcomes are stronger than predicted confidence.");
  }

  if (input.overfitRisk > 0.65) {
    reasons.push("Trace history is too narrow for strong autonomy.");
  }

  if (input.recentSuccessRate < 0.5) {
    reasons.push("Recent outcomes are below target.");
  }

  if (input.policyViolationRatio > 0.25) {
    reasons.push("Policy violations are frequent.");
  }

  if ((input.learning?.learnedPatterns.length ?? 0) === 0) {
    reasons.push("No reusable lessons have been learned yet.");
  }

  if (reasons.length === 0) {
    reasons.push("Agency state is healthy.");
  }

  return reasons;
}

function countMissingOutcomes(history: readonly AgencyTrace[]) {
  return history.filter((trace) => trace.outcome === undefined || trace.outcome.success === null).length;
}

function countPolicyViolations(history: readonly AgencyTrace[]) {
  return history.filter((trace) => trace.policy.violations.length > 0).length;
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
