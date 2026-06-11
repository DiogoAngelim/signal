import type {
  AgencyTrace,
  CalibrationConfig,
  CalibrationReliability,
  CalibrationResult,
} from "../types";

const DEFAULT_MINIMUM_SAMPLES = 3;
const DEFAULT_ALIGNMENT_TOLERANCE = 0.1;
const DEFAULT_ADJUSTMENT_RATE = 0.5;

export function calibrateConfidence(
  history: readonly AgencyTrace[],
  config: CalibrationConfig = {},
): CalibrationResult {
  const completed = history.filter(
    (trace) => typeof trace.outcome?.success === "boolean",
  );
  const sampleSize = completed.length;
  if (sampleSize === 0) {
    return {
      calibratedConfidence: 0.5,
      calibrationError: 0,
      reliability: "insufficient_data",
      sampleSize,
    };
  }

  const averageConfidence = average(
    completed.map((trace) => unitValue(trace.decision.confidence)),
  );
  const successRate = average(
    completed.map((trace) => (trace.outcome?.success === true ? 1 : 0)),
  );
  const calibrationError = round(averageConfidence - successRate);
  const minimumSamples = positiveInteger(
    config.minimumSamples ?? DEFAULT_MINIMUM_SAMPLES,
    "minimumSamples",
  );
  const alignmentTolerance = unitValue(
    config.alignmentTolerance ?? DEFAULT_ALIGNMENT_TOLERANCE,
  );
  const adjustmentRate = unitValue(
    config.adjustmentRate ?? DEFAULT_ADJUSTMENT_RATE,
  );
  const reliability =
    sampleSize < minimumSamples
      ? "insufficient_data"
      : reliabilityFromError(calibrationError, alignmentTolerance);

  return {
    calibratedConfidence: round(
      clamp(averageConfidence - calibrationError * adjustmentRate),
    ),
    calibrationError,
    reliability,
    sampleSize,
  };
}

function reliabilityFromError(
  error: number,
  tolerance: number,
): CalibrationReliability {
  if (error > tolerance) {
    return "overconfident";
  }

  if (error < -tolerance) {
    return "underconfident";
  }

  return "aligned";
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

function unitValue(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("confidence values must be numbers between 0 and 1.");
  }

  return value;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
