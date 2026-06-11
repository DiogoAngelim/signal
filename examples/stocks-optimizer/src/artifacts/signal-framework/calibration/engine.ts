import { clamp, stdev } from "../math/statistics";

export type CalibrationInput = {
  id?: string;
  timestamp?: string;
  prediction: unknown;
  confidence: number;
  outcome?: unknown;
  metadata?: Record<string, unknown>;
};

export type ReliabilityBucket = {
  minConfidence: number;
  maxConfidence: number;
  sampleSize: number;
  averageConfidence: number;
  actualAccuracy: number;
  calibrationGap: number;
};

export type CalibrationResult = {
  rawConfidence: number;
  calibratedConfidence: number;
  historicalAccuracy: number;
  calibrationError: number;
  brierScore?: number;
  trustworthiness: number;
  sampleSize: number;
  reliabilityBuckets: ReliabilityBucket[];
  warnings: string[];
};

export type CalibrationOptions = {
  minimumSamples?: number;
  sufficientSamples?: number;
  poorCalibrationThreshold?: number;
  overconfidenceThreshold?: number;
  lowTrustworthinessThreshold?: number;
  recencyHalfLifeDays?: number;
  now?: string | number | Date;
};

export type CalibrationRunInput = {
  current: CalibrationInput;
  history?: CalibrationInput[];
  options?: CalibrationOptions;
};

type EvaluatedRecord = {
  confidence: number;
  correctness: number;
  weight: number;
  binaryOutcome?: number;
};

const DEFAULT_OPTIONS = {
  minimumSamples: 5,
  sufficientSamples: 20,
  poorCalibrationThreshold: 20,
  overconfidenceThreshold: 10,
  lowTrustworthinessThreshold: 50,
};

const POSITIVE_LABELS = new Set([
  "success",
  "succeeded",
  "true",
  "correct",
  "positive",
  "passed",
  "pass",
  "approved",
  "yes",
  "win",
  "winning",
]);

const NEGATIVE_LABELS = new Set([
  "failure",
  "failed",
  "false",
  "incorrect",
  "negative",
  "denied",
  "rejected",
  "no",
  "loss",
  "losing",
]);

const PARTIAL_LABELS = new Set(["partial", "mixed", "neutral"]);

export function calibrate(input: CalibrationRunInput): CalibrationResult {
  const options = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };
  const rawConfidence = normalizeConfidence(input.current.confidence);
  const evaluated = safeArray(input.history).flatMap((record) =>
    evaluateRecord(record, options),
  );
  const sampleSize = evaluated.length;
  const effectiveSampleSize = weightedSampleSize(evaluated);
  const historicalAccuracy = roundScore(
    sampleSize
      ? weightedMean(
          evaluated.map((record) => [record.correctness, record.weight]),
        ) * 100
      : 50,
  );
  const averageConfidence = roundScore(
    sampleSize
      ? weightedMean(
          evaluated.map((record) => [record.confidence, record.weight]),
        )
      : 50,
  );
  const calibrationError = roundSignedScore(
    averageConfidence - historicalAccuracy,
  );
  const binaryOutcomes = evaluated.filter(
    (record): record is EvaluatedRecord & { binaryOutcome: number } =>
      record.binaryOutcome === 0 || record.binaryOutcome === 1,
  );
  const brierScore = binaryOutcomes.length
    ? roundRatio(
        weightedMean(
          binaryOutcomes.map((record) => [
            (record.confidence / 100 - record.binaryOutcome) ** 2,
            record.weight,
          ]),
        ),
      )
    : undefined;
  const reliabilityBuckets = buildReliabilityBuckets(evaluated);
  const trustworthiness = trustworthinessScore({
    evaluated,
    historicalAccuracy,
    calibrationError,
    brierScore,
    sufficientSamples: options.sufficientSamples,
    effectiveSampleSize,
  });
  const calibratedConfidence = calibratedScore({
    rawConfidence,
    historicalAccuracy,
    calibrationError,
    trustworthiness,
    sampleSize,
    effectiveSampleSize,
    minimumSamples: options.minimumSamples,
    sufficientSamples: options.sufficientSamples,
  });
  const warnings = warningsFor({
    evaluated,
    sampleSize,
    calibrationError,
    trustworthiness,
    minimumSamples: options.minimumSamples,
    poorCalibrationThreshold: options.poorCalibrationThreshold,
    overconfidenceThreshold: options.overconfidenceThreshold,
    lowTrustworthinessThreshold: options.lowTrustworthinessThreshold,
  });

  return {
    rawConfidence,
    calibratedConfidence,
    historicalAccuracy,
    calibrationError,
    ...(brierScore == null ? {} : { brierScore }),
    trustworthiness,
    sampleSize,
    reliabilityBuckets,
    warnings,
  };
}

export const calibrateConfidence = calibrate;

function evaluateRecord(
  record: CalibrationInput,
  options: CalibrationOptions,
): EvaluatedRecord[] {
  const correctness = correctnessFor(record);
  if (correctness == null) return [];
  const binaryOutcome = binaryOutcomeFor(record.outcome);
  return [
    {
      confidence: normalizeConfidence(record.confidence),
      correctness,
      weight: recencyWeightFor(record, options),
      ...(binaryOutcome == null ? {} : { binaryOutcome }),
    },
  ];
}

function correctnessFor(record: CalibrationInput): number | null {
  const explicit = explicitCorrectness(record.outcome);
  if (explicit != null) return explicit;

  const predictionLabel = labelFor(record.prediction);
  const outcomeLabel = labelFor(record.outcome);
  if (predictionLabel && outcomeLabel) {
    if (predictionLabel === outcomeLabel) return 1;
    if (PARTIAL_LABELS.has(outcomeLabel)) return 0.5;
    return 0;
  }

  if (record.outcome !== undefined && primitive(record.prediction)) {
    return Object.is(record.prediction, record.outcome) ? 1 : 0;
  }

  return null;
}

function explicitCorrectness(outcome: unknown): number | null {
  if (typeof outcome === "boolean") return outcome ? 1 : 0;
  if (!outcome || typeof outcome !== "object") return null;
  const object = outcome as Record<string, unknown>;
  const value = object.correct ?? object.success;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value))
    return clamp(value, 0, 1);
  return null;
}

function binaryOutcomeFor(outcome: unknown): number | null {
  if (typeof outcome === "boolean") return outcome ? 1 : 0;
  const label = labelFor(outcome);
  if (!label) return null;
  if (POSITIVE_LABELS.has(label)) return 1;
  if (NEGATIVE_LABELS.has(label)) return 0;
  return null;
}

function labelFor(value: unknown): string | null {
  if (typeof value === "string") return normalizeLabel(value);
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const candidate =
    object.label ??
    object.outcomeLabel ??
    object.expectedOutcome ??
    object.value ??
    object.kind;
  return typeof candidate === "string" ? normalizeLabel(candidate) : null;
}

function normalizeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

function primitive(value: unknown) {
  return (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function buildReliabilityBuckets(evaluated: EvaluatedRecord[]) {
  return Array.from({ length: 10 }, (_, index) => {
    const minConfidence = index * 10;
    const maxConfidence = index === 9 ? 100 : minConfidence + 10;
    const bucketRecords = evaluated.filter((record) =>
      index === 9
        ? record.confidence >= minConfidence &&
          record.confidence <= maxConfidence
        : record.confidence >= minConfidence &&
          record.confidence < maxConfidence,
    );
    const averageConfidence = roundScore(
      bucketRecords.length
        ? weightedMean(
            bucketRecords.map((record) => [record.confidence, record.weight]),
          )
        : 0,
    );
    const actualAccuracy = roundScore(
      bucketRecords.length
        ? weightedMean(
            bucketRecords.map((record) => [record.correctness, record.weight]),
          ) * 100
        : 0,
    );
    return {
      minConfidence,
      maxConfidence,
      sampleSize: bucketRecords.length,
      averageConfidence,
      actualAccuracy,
      calibrationGap: roundSignedScore(averageConfidence - actualAccuracy),
    };
  });
}

function trustworthinessScore(input: {
  evaluated: EvaluatedRecord[];
  historicalAccuracy: number;
  calibrationError: number;
  brierScore?: number;
  sufficientSamples: number;
  effectiveSampleSize: number;
}) {
  if (!input.evaluated.length) return 35;
  const sampleScore = clamp(
    (input.effectiveSampleSize / Math.max(1, input.sufficientSamples)) * 100,
  );
  const calibrationQuality = clamp(100 - Math.abs(input.calibrationError));
  const consistency = clamp(
    100 - stdev(input.evaluated.map((record) => record.correctness)) * 100,
  );
  const confidenceStability = clamp(
    100 - stdev(input.evaluated.map((record) => record.confidence)),
  );
  const brierQuality =
    input.brierScore == null
      ? calibrationQuality
      : clamp(100 - input.brierScore * 100);

  return roundScore(
    input.historicalAccuracy * 0.28 +
      calibrationQuality * 0.24 +
      sampleScore * 0.18 +
      consistency * 0.12 +
      confidenceStability * 0.08 +
      brierQuality * 0.1,
  );
}

function calibratedScore(input: {
  rawConfidence: number;
  historicalAccuracy: number;
  calibrationError: number;
  trustworthiness: number;
  sampleSize: number;
  effectiveSampleSize: number;
  minimumSamples: number;
  sufficientSamples: number;
}) {
  if (input.sampleSize === 0) return roundScore(input.rawConfidence * 0.85);
  const sampleScore = clamp(
    (input.effectiveSampleSize / Math.max(1, input.sufficientSamples)) * 100,
  );
  const evidenceCap = clamp(input.historicalAccuracy + sampleScore * 0.15);
  const overconfidencePenalty = Math.max(0, input.calibrationError) * 0.65;
  const weakHistoryPenalty = Math.max(0, 60 - input.historicalAccuracy) * 0.25;
  const trustPenalty = Math.max(0, 50 - input.trustworthiness) * 0.25;
  let adjusted =
    input.rawConfidence -
    overconfidencePenalty -
    weakHistoryPenalty -
    trustPenalty;
  adjusted = Math.min(adjusted, evidenceCap);
  if (input.sampleSize < input.minimumSamples) {
    adjusted = Math.min(adjusted, input.rawConfidence * 0.85);
  }
  return roundScore(Math.min(input.rawConfidence, clamp(adjusted)));
}

function warningsFor(input: {
  evaluated: EvaluatedRecord[];
  sampleSize: number;
  calibrationError: number;
  trustworthiness: number;
  minimumSamples: number;
  poorCalibrationThreshold: number;
  overconfidenceThreshold: number;
  lowTrustworthinessThreshold: number;
}) {
  const warnings: string[] = [];
  if (input.sampleSize < input.minimumSamples)
    warnings.push("insufficient history");
  if (Math.abs(input.calibrationError) >= input.poorCalibrationThreshold)
    warnings.push("poor calibration");
  if (input.calibrationError >= input.overconfidenceThreshold)
    warnings.push("overconfidence");
  if (
    input.evaluated.length > 1 &&
    stdev(input.evaluated.map((record) => record.correctness)) >= 0.4
  )
    warnings.push("unstable outcomes");
  if (input.trustworthiness < input.lowTrustworthinessThreshold)
    warnings.push("low trustworthiness");
  return warnings;
}

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return roundScore(value <= 1 ? clamp(value * 100) : clamp(value));
}

function safeArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

function recencyWeightFor(
  record: CalibrationInput,
  options: CalibrationOptions,
) {
  const halfLifeDays = Number(options.recencyHalfLifeDays);
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 1;

  const timestamp = timeValue(record.timestamp);
  if (timestamp == null) return 1;

  const now = timeValue(options.now) ?? Date.now();
  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  return clamp(0.5 ** (ageDays / halfLifeDays), 0.05, 1);
}

function timeValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function weightedSampleSize(records: EvaluatedRecord[]) {
  return records.reduce((sum, record) => sum + Math.max(0, record.weight), 0);
}

function weightedMean(values: Array<[number, number]>) {
  const usable = values.filter(
    ([value, weight]) =>
      Number.isFinite(value) && Number.isFinite(weight) && weight > 0,
  );
  const totalWeight = usable.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) return 0;
  return (
    usable.reduce((sum, [value, weight]) => sum + value * weight, 0) /
    totalWeight
  );
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function roundSignedScore(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}
