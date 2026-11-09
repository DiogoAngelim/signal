import type {
  AgencyTrace,
  CalibrationBucket,
  CalibrationConfig,
  CalibrationMetrics,
  CalibrationReliability,
  CalibrationResult,
} from "../types";

const DEFAULT_MINIMUM_SAMPLES = 3;
const DEFAULT_MINIMUM_EVALUATION_SAMPLES = 30;
const DEFAULT_BUCKET_COUNT = 10;
const DEFAULT_ALIGNMENT_TOLERANCE = 0.1;
const DEFAULT_ADJUSTMENT_RATE = 0.5;
const MAX_BUCKET_COUNT = 100;

type CalibrationSample = {
  confidence: number;
  outcome: 0 | 1;
};

export function evaluateCalibrationMetrics(
  history: readonly AgencyTrace[],
  config: CalibrationConfig = {},
): CalibrationMetrics {
  const samples = calibrationSamples(history);
  const sampleSize = samples.length;
  const minimumEvaluationSamples = positiveInteger(
    config.minimumEvaluationSamples ?? DEFAULT_MINIMUM_EVALUATION_SAMPLES,
    "minimumEvaluationSamples",
  );
  const bucketCount = positiveInteger(
    config.bucketCount ?? DEFAULT_BUCKET_COUNT,
    "bucketCount",
  );
  if (bucketCount > MAX_BUCKET_COUNT) {
    throw new Error(`bucketCount must not exceed ${MAX_BUCKET_COUNT}.`);
  }
  const alignmentTolerance = unitValue(
    config.alignmentTolerance ?? DEFAULT_ALIGNMENT_TOLERANCE,
  );

  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      brierScore: null,
      expectedCalibrationError: null,
      maximumCalibrationError: null,
      calibrationBias: null,
      status: "insufficient_data",
      reliabilityBuckets: [],
    };
  }

  const bins = Array.from({ length: bucketCount }, (_, index) => ({
    lowerBound: index / bucketCount,
    upperBound: (index + 1) / bucketCount,
    samples: [] as CalibrationSample[],
  }));

  let brierTotal = 0;
  let confidenceTotal = 0;
  let outcomeTotal = 0;

  for (const sample of samples) {
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.floor(sample.confidence * bucketCount),
    );
    bins[bucketIndex].samples.push(sample);
    brierTotal += (sample.confidence - sample.outcome) ** 2;
    confidenceTotal += sample.confidence;
    outcomeTotal += sample.outcome;
  }

  const reliabilityBuckets: CalibrationBucket[] = bins
    .filter((bin) => bin.samples.length > 0)
    .map((bin) => {
      const meanConfidence = average(
        bin.samples.map((sample) => sample.confidence),
      );
      const observedRate = average(
        bin.samples.map((sample) => sample.outcome),
      );
      return {
        lowerBound: round(bin.lowerBound),
        upperBound: round(bin.upperBound),
        sampleSize: bin.samples.length,
        meanConfidence: round(meanConfidence),
        observedRate: round(observedRate),
        absoluteError: round(Math.abs(meanConfidence - observedRate)),
      };
    });

  const expectedCalibrationError = reliabilityBuckets.reduce(
    (total, bucket) =>
      total + (bucket.sampleSize / sampleSize) * bucket.absoluteError,
    0,
  );
  const maximumCalibrationError = Math.max(
    ...reliabilityBuckets.map((bucket) => bucket.absoluteError),
  );
  const calibrationBias = confidenceTotal / sampleSize - outcomeTotal / sampleSize;
  const status =
    sampleSize < minimumEvaluationSamples
      ? "insufficient_data"
      : expectedCalibrationError <= alignmentTolerance
        ? "calibrated"
        : "miscalibrated";

  return {
    sampleSize,
    brierScore: round(brierTotal / sampleSize),
    expectedCalibrationError: round(expectedCalibrationError),
    maximumCalibrationError: round(maximumCalibrationError),
    calibrationBias: round(calibrationBias),
    status,
    reliabilityBuckets,
  };
}

export function calibrateConfidence(
  history: readonly AgencyTrace[],
  config: CalibrationConfig = {},
): CalibrationResult {
  const completed = calibrationSamples(history);
  const sampleSize = completed.length;
  if (sampleSize === 0) {
    return {
      calibratedConfidence: 0.5,
      calibrationError: 0,
      reliability: "insufficient_data",
      sampleSize,
    };
  }

  const metrics = evaluateCalibrationMetrics(history, config);
  const calibrationError = metrics.calibrationBias ?? 0;
  const minimumSamples = positiveInteger(
    config.minimumSamples ?? DEFAULT_MINIMUM_SAMPLES,
    "minimumSamples",
  );
  const adjustmentRate = unitValue(
    config.adjustmentRate ?? DEFAULT_ADJUSTMENT_RATE,
  );
  const reliability =
    sampleSize < minimumSamples
      ? "insufficient_data"
      : reliabilityFromError(
          calibrationError,
          unitValue(config.alignmentTolerance ?? DEFAULT_ALIGNMENT_TOLERANCE),
        );

  const averageConfidence = average(
    completed.map((sample) => sample.confidence),
  );

  return {
    calibratedConfidence: round(
      clamp(averageConfidence - calibrationError * adjustmentRate),
    ),
    calibrationError,
    reliability,
    sampleSize,
    metrics,
  };
}

function calibrationSamples(
  history: readonly AgencyTrace[],
): CalibrationSample[] {
  return history
    .filter((trace) => typeof trace.outcome?.success === "boolean")
    .map((trace) => ({
      confidence: unitValue(trace.decision.confidence),
      outcome: trace.outcome?.success === true ? 1 : 0,
    }));
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
