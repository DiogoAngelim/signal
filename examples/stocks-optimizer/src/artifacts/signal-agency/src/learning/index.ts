import type {
  AgencyTrace,
  CalibrationResult,
  LearningConfig,
  LearningResult,
} from "../types";

const DEFAULT_HIGH_CONFIDENCE = 0.75;
const DEFAULT_SIMILAR_SUCCESS_THRESHOLD = 2;

export function learnFromTraces(
  history: readonly AgencyTrace[],
  calibration?: CalibrationResult,
  config: LearningConfig = {},
): LearningResult {
  const highConfidenceThreshold =
    config.highConfidenceThreshold ?? DEFAULT_HIGH_CONFIDENCE;
  const similarSuccessThreshold =
    config.similarSuccessThreshold ?? DEFAULT_SIMILAR_SUCCESS_THRESHOLD;
  const highConfidencePoor = history.filter(
    (trace) =>
      trace.decision.confidence >= highConfidenceThreshold &&
      trace.outcome?.success === false,
  );
  const blocked = history.filter((trace) => !trace.policy.allowed);
  const missingOutcomes = history.filter(
    (trace) => trace.outcome === undefined || trace.outcome.success === null,
  );
  const successfulKinds = successfulDecisionKinds(
    history,
    similarSuccessThreshold,
  );
  const learnedPatterns: string[] = [];
  const policySuggestions: string[] = [];

  if (highConfidencePoor.length > 0) {
    learnedPatterns.push(
      `${highConfidencePoor.length} high-confidence decision(s) had poor outcomes.`,
    );
    policySuggestions.push(
      "Review the confidence threshold for repeated poor outcomes.",
    );
  }

  if (blocked.length > 0) {
    learnedPatterns.push(
      `${blocked.length} decision(s) were blocked by policy.`,
    );
    policySuggestions.push(
      "Inspect recurring policy violations before widening action permissions.",
    );
  }

  for (const kind of successfulKinds) {
    learnedPatterns.push(
      `Decision kind "${kind}" has repeated successful outcomes.`,
    );
  }

  if (missingOutcomes.length > 0) {
    learnedPatterns.push(
      `${missingOutcomes.length} trace(s) are missing outcome data.`,
    );
    policySuggestions.push(
      "Improve outcome capture before increasing autonomy.",
    );
  }

  return {
    learnedPatterns,
    confidenceAdjustment: confidenceAdjustment(
      calibration,
      highConfidencePoor.length,
      successfulKinds.length,
    ),
    policySuggestions,
  };
}

function successfulDecisionKinds(
  history: readonly AgencyTrace[],
  threshold: number,
) {
  const counts = new Map<string, number>();
  for (const trace of history) {
    if (trace.outcome?.success === true) {
      counts.set(
        trace.decision.kind,
        (counts.get(trace.decision.kind) ?? 0) + 1,
      );
    }
  }

  return [...counts.entries()]
    .filter((entry) => entry[1] >= threshold)
    .map((entry) => entry[0])
    .sort();
}

function confidenceAdjustment(
  calibration: CalibrationResult | undefined,
  highConfidencePoorCount: number,
  successfulKindCount: number,
) {
  let adjustment = 0;

  if (calibration?.reliability === "overconfident") {
    adjustment -= 0.1;
  }

  if (calibration?.reliability === "underconfident") {
    adjustment += 0.05;
  }

  if (highConfidencePoorCount > 0) {
    adjustment -= 0.05;
  }

  if (successfulKindCount > 0) {
    adjustment += 0.03;
  }

  return (
    Math.round(Math.max(-0.25, Math.min(0.25, adjustment)) * 1_000_000) /
    1_000_000
  );
}
