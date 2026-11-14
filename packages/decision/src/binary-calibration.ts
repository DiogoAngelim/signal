/**
 * Optional, observation-trained binary forecast calibration.
 *
 * Fits only on caller-designated CALIBRATION records, never on evaluated labels.
 * Ordinary monotone pooled-adjacent-violators (PAV), with an explicit
 * Bayesian-style shrinkage toward the supplied raw probabilities.
 * This is an audit-friendly probability postprocessor, NOT a native Signal
 * permission override or an empirical claim of better-than-baseline accuracy.
 */
export interface BinaryCalibrationObservation {
  id: string;
  rawProbability: number;
  observedOutcome: 0 | 1;
}

export interface BinaryCalibrationFitOptions {
  modelVersion: string;
  calibrationDatasetVersion: string;
  /** The caller must verify independence from training and final test data. */
  split: "calibration_only";
  /** Immutable researcher-selected non-outcome bins; range [2, 100]. */
  targetBins?: number;
  /** Number of reference pseudo-observations shrunk toward raw forecast. */
  priorEffectiveCount?: number;
}

export interface BinaryCalibrationKnot {
  /** Inclusive upper limit of input raw probability. */
  maxRawProbability: number;
  calibratedProbability: number;
  recordCount: number;
  observedEvents: number;
}

export interface FittedBinaryIsotonicCalibrator {
  method: "shrunken_isotonic_pav_v1";
  modelVersion: string;
  calibrationDatasetVersion: string;
  trainingSplit: "calibration_only";
  calibrationRecordCount: number;
  calibrationEvents: number;
  targetBins: number;
  priorEffectiveCount: number;
  knots: BinaryCalibrationKnot[];
  /** Source provenance remains a caller assertion; never auto-certified. */
  independentDataProvenanceVerifiedByLibrary: false;
  causalProfitEffectProven: false;
}

const MIN_RECORDS = 200;
const MIN_OUTCOMES_PER_CLASS = 20;
const MAX_RECORDS = 100_000;

function assertProbability(p: number, label: string): void {
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error(`${label} must be a finite probability in [0,1].`);
  }
}
function assertInteger(v: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(v) || v < min || v > max) {
    throw new Error(`${label} must be an integer in [${min},${max}].`);
  }
}

interface Pool {
  maxRaw: number;
  count: number;
  events: number;
  rawSum: number;
}
function level(pool: Pool, shrinkage: number): number {
  return (pool.events + shrinkage * pool.rawSum / pool.count) /
    (pool.count + shrinkage);
}
function merged(a: Pool, b: Pool): Pool {
  return {
    maxRaw: b.maxRaw,
    count: a.count + b.count,
    events: a.events + b.events,
    rawSum: a.rawSum + b.rawSum,
  };
}

/**
 * Inputs must be a truly separate calibration split with observed 0/1 labels.
 * Duplicate IDs, degenerate outcomes, small cohorts and invalid probabilities
 * fail closed. No random partition or leakage-prone resampling occurs here.
 */
export function fitBinaryIsotonicCalibrator(
  observations: readonly BinaryCalibrationObservation[],
  options: BinaryCalibrationFitOptions,
): FittedBinaryIsotonicCalibrator {
  if (!options || typeof options.modelVersion !== "string" ||
    !options.modelVersion.trim() || typeof options.calibrationDatasetVersion !== "string" ||
    !options.calibrationDatasetVersion.trim()) {
    throw new Error("Frozen model and calibration source versions are mandatory.");
  }
  if (options.split !== "calibration_only") {
    throw new Error("Calibration fitting is allowed only on a separate calibration_only split.");
  }
  const targetBins = options.targetBins ?? 20;
  const priorEffectiveCount = options.priorEffectiveCount ?? 20;
  assertInteger(targetBins, 2, 100, "targetBins");
  assertInteger(priorEffectiveCount, 0, 10_000, "priorEffectiveCount");
  assertInteger(observations.length, MIN_RECORDS, MAX_RECORDS, "calibration count");
  const seen = new Set<string>();
  let positives = 0;
  for (const record of observations) {
    if (typeof record.id !== "string" || !record.id.trim() || seen.has(record.id)) {
      throw new Error("Calibration record IDs must be unique and nonempty.");
    }
    seen.add(record.id);
    assertProbability(record.rawProbability, "rawProbability");
    if (record.observedOutcome !== 0 && record.observedOutcome !== 1) {
      throw new Error("Calibration observedOutcome must be 0 or 1.");
    }
    positives += record.observedOutcome;
  }
  if (positives < MIN_OUTCOMES_PER_CLASS ||
    observations.length - positives < MIN_OUTCOMES_PER_CLASS) {
    throw new Error("Calibration needs >=20 positive and >=20 negative independent labels.");
  }
  const ordered = [...observations].sort((a, b) =>
    a.rawProbability - b.rawProbability || a.id.localeCompare(b.id));
  const desired = Math.ceil(ordered.length / targetBins);
  const bins: Pool[] = [];
  let current: Pool | undefined;
  for (let i = 0; i < ordered.length; i += 1) {
    const record = ordered[i];
    if (current && current.count >= desired &&
      record.rawProbability > current.maxRaw && bins.length < targetBins - 1) {
      bins.push(current);
      current = undefined;
    }
    if (!current) {
      current = {
        maxRaw: record.rawProbability,
        count: 0, events: 0, rawSum: 0,
      };
    }
    current.count += 1;
    current.events += record.observedOutcome;
    current.rawSum += record.rawProbability;
    current.maxRaw = record.rawProbability;
  }
  if (current) bins.push(current);
  const stack: Pool[] = [];
  for (const candidate of bins) {
    stack.push(candidate);
    while (stack.length >= 2) {
      const right = stack[stack.length - 1];
      const left = stack[stack.length - 2];
      if (level(left, priorEffectiveCount) <=
        level(right, priorEffectiveCount) + 1e-15) break;
      stack.pop();
      stack.pop();
      stack.push(merged(left, right));
    }
  }
  const knots = stack.map(pool => ({
    maxRawProbability: pool.maxRaw,
    calibratedProbability: level(pool, priorEffectiveCount),
    recordCount: pool.count,
    observedEvents: pool.events,
  }));
  if (knots.reduce((sum, knot) => sum + knot.recordCount, 0) !==
    observations.length) {
    throw new Error("Calibration lost observations during bin pooling.");
  }
  return {
    method: "shrunken_isotonic_pav_v1",
    modelVersion: options.modelVersion,
    calibrationDatasetVersion: options.calibrationDatasetVersion,
    trainingSplit: "calibration_only",
    calibrationRecordCount: observations.length,
    calibrationEvents: positives,
    targetBins,
    priorEffectiveCount,
    knots,
    independentDataProvenanceVerifiedByLibrary: false,
    causalProfitEffectProven: false,
  };
}

/**
 * Inference-only application: no outcome labels are read.
 * Caller must pass only a previously frozen, externally approved calibrator.
 */
export function applyBinaryIsotonicCalibrator(
  calibrated: FittedBinaryIsotonicCalibrator,
  rawProbability: number,
): number {
  assertProbability(rawProbability, "rawProbability");
  if (!calibrated || calibrated.method !== "shrunken_isotonic_pav_v1" ||
    !Array.isArray(calibrated.knots) || !calibrated.knots.length) {
    throw new Error("Invalid fitted binary calibration object.");
  }
  let previous = -Infinity;
  let prevCalibrated = -Infinity;
  for (const knot of calibrated.knots) {
    assertProbability(knot.maxRawProbability, "calibration knot max");
    assertProbability(knot.calibratedProbability, "calibration knot probability");
    if (knot.maxRawProbability <= previous ||
      knot.calibratedProbability < prevCalibrated - 1e-12) {
      throw new Error("Calibration knots must be strictly sorted and monotone.");
    }
    previous = knot.maxRawProbability;
    prevCalibrated = knot.calibratedProbability;
    if (rawProbability <= knot.maxRawProbability) return knot.calibratedProbability;
  }
  return calibrated.knots[calibrated.knots.length - 1].calibratedProbability;
}
