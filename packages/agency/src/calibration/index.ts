import type {
  AgencyTrace,
  CalibrationBucket,
  CalibrationInterval,
  CalibrationConfig,
  CalibrationMetrics,
  CalibrationReliability,
  CalibrationResult,
  CalibrationDriftConfig,
  CalibrationDriftResult,
  CalibrationDriftWindow,
} from "../types";

const DEFAULT_MINIMUM_SAMPLES = 100;
const DEFAULT_MINIMUM_EVALUATION_SAMPLES = 100;
const DEFAULT_MINIMUM_BUCKET_SAMPLES = 10;
const DEFAULT_BUCKET_COUNT = 10;
const DEFAULT_ALIGNMENT_TOLERANCE = 0.1;
const DEFAULT_ADJUSTMENT_RATE = 0.5;
const MAX_BUCKET_COUNT = 100;

const DEFAULT_DRIFT_WINDOW_COUNT = 4;
const DEFAULT_MINIMUM_WINDOW_SAMPLES = 30;
const DEFAULT_DRIFT_TOLERANCE = 0.1;
const MAX_DRIFT_WINDOW_COUNT = 100;

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
  const minimumBucketSamples = positiveInteger(
    config.minimumBucketSamples ?? DEFAULT_MINIMUM_BUCKET_SAMPLES,
    "minimumBucketSamples",
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
      brierScoreInterval: null,
      expectedCalibrationError: null,
      maximumCalibrationError: null,
      calibrationBias: null,
      calibrationBiasInterval: null,
      calibrationBiasSignificance: "insufficient_data",
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
  const brierLosses: number[] = [];
  const calibrationDifferences: number[] = [];

  for (const sample of samples) {
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.floor(sample.confidence * bucketCount),
    );
    bins[bucketIndex].samples.push(sample);
    const difference = sample.confidence - sample.outcome;
    const brierLoss = difference ** 2;
    brierLosses.push(brierLoss);
    calibrationDifferences.push(difference);
    brierTotal += brierLoss;
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
      const observedRateInterval = wilsonInterval(
        bin.samples.filter((sample) => sample.outcome === 1).length,
        bin.samples.length,
      );
      return {
        lowerBound: round(bin.lowerBound),
        upperBound: round(bin.upperBound),
        sampleSize: bin.samples.length,
        meanConfidence: round(meanConfidence),
        observedRate: round(observedRate),
        absoluteError: round(Math.abs(meanConfidence - observedRate)),
        observedRateInterval,
        calibrationErrorInterval: {
          lowerBound: round(meanConfidence - observedRateInterval.upperBound),
          upperBound: round(meanConfidence - observedRateInterval.lowerBound),
          confidenceLevel: 0.95,
          method: "wilson_score",
        },
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
  const hasSparseBuckets = reliabilityBuckets.some(
    (bucket) => bucket.sampleSize < minimumBucketSamples,
  );
  const status =
    sampleSize < minimumEvaluationSamples || hasSparseBuckets
      ? "insufficient_data"
      : expectedCalibrationError <= alignmentTolerance
        ? "calibrated"
        : "miscalibrated";

  const brierScore = round(brierTotal / sampleSize);
  const brierScoreInterval = normalMeanInterval(brierLosses, 0, 1);
  const calibrationBiasInterval = normalMeanInterval(
    calibrationDifferences,
    -1,
    1,
  );

  return {
    sampleSize,
    brierScore,
    brierScoreInterval,
    expectedCalibrationError: round(expectedCalibrationError),
    maximumCalibrationError: round(maximumCalibrationError),
    calibrationBias: round(calibrationBias),
    calibrationBiasInterval,
    calibrationBiasSignificance: significanceFromInterval(
      calibrationBiasInterval,
    ),
    status,
    reliabilityBuckets,
  };
}


export function evaluateCalibrationDrift(
  history: readonly AgencyTrace[],
  config: CalibrationDriftConfig = {},
): CalibrationDriftResult {
  const windowCount = positiveInteger(
    config.windowCount ?? DEFAULT_DRIFT_WINDOW_COUNT,
    "windowCount",
  );
  if (windowCount < 2) {
    throw new Error("windowCount must be at least 2.");
  }
  if (windowCount > MAX_DRIFT_WINDOW_COUNT) {
    throw new Error(`windowCount must not exceed ${MAX_DRIFT_WINDOW_COUNT}.`);
  }
  const minimumWindowSamples = positiveInteger(
    config.minimumWindowSamples ?? DEFAULT_MINIMUM_WINDOW_SAMPLES,
    "minimumWindowSamples",
  );
  const driftTolerance = unitValue(
    config.driftTolerance ?? DEFAULT_DRIFT_TOLERANCE,
  );
  const completed = history.filter(
    (trace) => typeof trace.outcome?.success === "boolean",
  );
  const timestamped = completed
    .map((trace) => ({ trace, timestamp: Date.parse(trace.timestamp) }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const excludedInvalidTimestampCount = completed.length - timestamped.length;
  const sampleSize = timestamped.length;

  if (sampleSize < windowCount * minimumWindowSamples) {
    return {
      status: "insufficient_data",
      sampleSize,
      excludedInvalidTimestampCount,
      errorDelta: null,
      windows: [],
      explanation: [
        `At least ${windowCount * minimumWindowSamples} timestamped completed outcomes are required.`,
      ],
    };
  }

  const baseWindowSize = Math.floor(sampleSize / windowCount);
  const windows: CalibrationDriftWindow[] = [];
  for (let index = 0; index < windowCount; index += 1) {
    const start = index * baseWindowSize;
    const end = index === windowCount - 1 ? sampleSize : start + baseWindowSize;
    const entries = timestamped.slice(start, end);
    const traces = entries.map((entry) => entry.trace);
    const metrics = evaluateCalibrationMetrics(traces, {
      ...config,
      minimumEvaluationSamples: minimumWindowSamples,
      minimumBucketSamples: config.minimumBucketSamples ?? 1,
    });
    windows.push({
      startAt: new Date(entries[0].timestamp).toISOString(),
      endAt: new Date(entries[entries.length - 1].timestamp).toISOString(),
      sampleSize: entries.length,
      expectedCalibrationError: metrics.expectedCalibrationError,
      calibrationBias: metrics.calibrationBias,
      status: metrics.status,
    });
  }

  if (
    windows.some(
      (window) =>
        window.expectedCalibrationError === null ||
        window.status === "insufficient_data",
    )
  ) {
    return {
      status: "insufficient_data",
      sampleSize,
      excludedInvalidTimestampCount,
      errorDelta: null,
      windows,
      explanation: [
        "Every time window must meet its evaluation and bucket sample thresholds before drift is classified.",
      ],
    };
  }

  const firstError = windows[0].expectedCalibrationError as number;
  const lastError = windows[windows.length - 1].expectedCalibrationError as number;
  const errorDelta = round(lastError - firstError);
  const status =
    errorDelta > driftTolerance
      ? "degrading"
      : errorDelta < -driftTolerance
        ? "improving"
        : "stable";

  return {
    status,
    sampleSize,
    excludedInvalidTimestampCount,
    errorDelta,
    windows,
    explanation: [
      `ECE changed by ${errorDelta} from the earliest to latest time window.`,
      "This is a descriptive drift signal, not a statistical significance test or causal diagnosis.",
      ...(excludedInvalidTimestampCount
        ? [`${excludedInvalidTimestampCount} completed outcomes with invalid timestamps were excluded.`]
        : []),
    ],
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
    sampleSize < minimumSamples || metrics.status === "insufficient_data"
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


function wilsonInterval(successes: number, sampleSize: number): CalibrationInterval {
  const z = 1.96;
  const proportion = successes / sampleSize;
  const zSquared = z ** 2;
  const denominator = 1 + zSquared / sampleSize;
  const center =
    (proportion + zSquared / (2 * sampleSize)) / denominator;
  const margin =
    (z *
      Math.sqrt(
        (proportion * (1 - proportion)) / sampleSize +
          zSquared / (4 * sampleSize ** 2),
      )) /
    denominator;
  return {
    lowerBound: round(Math.max(0, center - margin)),
    upperBound: round(Math.min(1, center + margin)),
    confidenceLevel: 0.95,
    method: "wilson_score",
  };
}

function normalMeanInterval(
  values: readonly number[],
  minimum: number,
  maximum: number,
): CalibrationInterval | null {
  if (values.length < 30) return null;
  const mean = average([...values]);
  const squaredDeviations = values.reduce(
    (total, value) => total + (value - mean) ** 2,
    0,
  );
  const sampleVariance = squaredDeviations / (values.length - 1);
  const margin = 1.96 * Math.sqrt(sampleVariance / values.length);
  return {
    lowerBound: round(Math.max(minimum, mean - margin)),
    upperBound: round(Math.min(maximum, mean + margin)),
    confidenceLevel: 0.95,
    method: "normal_approximation",
  };
}

function significanceFromInterval(
  interval: CalibrationInterval | null,
): "positive" | "negative" | "not_significant" | "insufficient_data" {
  if (!interval) return "insufficient_data";
  if (interval.lowerBound > 0) return "positive";
  if (interval.upperBound < 0) return "negative";
  return "not_significant";
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
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
