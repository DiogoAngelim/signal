/**
 * Reproducible, source-labeled evaluation of binary forecasts and decision
 * policies. Outputs are diagnostics, never automatic certification or causal
 * proof. In particular, missing counterfactual outcomes must not be imputed.
 */

export type EvaluationSplit = "temporal_holdout" | "random_holdout" | "in_sample" | "unknown";

export interface BinaryForecastRecord {
  id: string;
  probability: number;
  outcome: 0 | 1;
}

export interface BinaryForecastEvaluationInput {
  datasetVersion: string;
  modelVersion: string;
  /** Exact binary event being forecast, specified prior to labeling. */
  eventDefinition: string;
  /** Evaluation protocol must declare sampling and label provenance. */
  samplingFrame: string;
  split: EvaluationSplit;
  independentLabels: boolean;
  records: readonly BinaryForecastRecord[];
  /** Baseline fixed using data outside the evaluated set. */
  precommittedBaselineProbability?: number;
  bucketCount?: number;
}

export interface ForecastBucket {
  lower: number;
  upper: number;
  count: number;
  meanProbability: number;
  observedRate: number;
}

export interface BinaryForecastEvaluationResult {
  datasetVersion: string;
  modelVersion: string;
  sampleSize: number;
  positives: number;
  status: "insufficient_data" | "descriptive_only" | "eligible_for_independent_review";
  brierScore: number | null;
  logLoss: number | null;
  aucRoc: number | null;
  expectedCalibrationError: number | null;
  baselineBrier: number | null;
  brierImprovementVsBaseline: number | null;
  buckets: ForecastBucket[];
  limitations: string[];
}

/** A decision's alternatives must be fully evaluated, not guessed from the chosen result. */
export interface FullFeedbackDecisionRecord {
  id: string;
  baselineActionId: string;
  signalActionId: string;
  actionUtilities: readonly { actionId: string; utility: number }[];
}

export type FeedbackProvenance =
  | "synthetic"
  | "modeled_counterfactual"
  | "independently_verified_full_feedback";

export interface PolicyComparisonInput {
  datasetVersion: string;
  commonUtilityUnit: string;
  split: EvaluationSplit;
  provenance: FeedbackProvenance;
  records: readonly FullFeedbackDecisionRecord[];
  /** Deterministic paired bootstrap for independent units only. */
  bootstrapIterations?: number;
  bootstrapSeed?: number;
}

export interface PolicyComparisonResult {
  datasetVersion: string;
  provenance: FeedbackProvenance;
  sampleSize: number;
  status: "insufficient_data" | "descriptive_only" | "eligible_for_independent_review";
  meanBaselineUtility: number | null;
  meanSignalUtility: number | null;
  /** Positive means that the Signal action had higher full-feedback utility. */
  meanPairedDifference: number | null;
  /** Unadjusted percentile interval; assumes independent sampling units. */
  pairedDifferenceInterval95: { lower: number; upper: number } | null;
  improvedCount: number;
  worsenedCount: number;
  tiedCount: number;
  limitations: string[];
}

const MAX_RECORDS = 100_000;
const MIN_ASSESSABLE_FORECASTS = 100;
const MIN_ASSESSABLE_COMPARISONS = 30;

/** Proper scoring rules, ROC AUC and descriptive fixed-width reliability bins. */
export function evaluateBinaryForecasts(
  input: BinaryForecastEvaluationInput,
): BinaryForecastEvaluationResult {
  for (const value of [input.datasetVersion, input.modelVersion, input.eventDefinition, input.samplingFrame]) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("Forecast provenance and event definition must be non-empty.");
    }
  }
  validateSplit(input.split);
  if (typeof input.independentLabels !== "boolean") {
    throw new Error("independentLabels must be boolean.");
  }
  validateRecordCount(input.records.length);
  validateIds(input.records);
  const bucketCount = input.bucketCount ?? 10;
  if (!Number.isInteger(bucketCount) || bucketCount < 2 || bucketCount > 100) {
    throw new Error("bucketCount must be an integer from 2 to 100.");
  }
  if (input.precommittedBaselineProbability !== undefined) {
    validateProbability(input.precommittedBaselineProbability, "precommittedBaselineProbability");
  }
  const bins = Array.from({ length: bucketCount }, () => ({ count: 0, ps: 0, ys: 0 }));
  let brier = 0;
  let logLoss = 0;
  let baselineBrier = 0;
  let positives = 0;
  const eps = 1e-15;
  for (const record of input.records) {
    validateProbability(record.probability, `probability for ${record.id}`);
    if (record.outcome !== 0 && record.outcome !== 1) {
      throw new Error(`outcome for ${record.id} must be 0 or 1.`);
    }
    positives += record.outcome;
    brier += (record.probability - record.outcome) ** 2;
    const safe = Math.min(1 - eps, Math.max(eps, record.probability));
    logLoss -= record.outcome ? Math.log(safe) : Math.log(1 - safe);
    if (input.precommittedBaselineProbability !== undefined) {
      baselineBrier += (input.precommittedBaselineProbability - record.outcome) ** 2;
    }
    const bucket = bins[Math.min(bucketCount - 1, Math.floor(record.probability * bucketCount))];
    bucket.count += 1;
    bucket.ps += record.probability;
    bucket.ys += record.outcome;
  }
  const n = input.records.length;
  const buckets: ForecastBucket[] = bins.flatMap((bin, index) =>
    bin.count ? [{
      lower: index / bucketCount,
      upper: (index + 1) / bucketCount,
      count: bin.count,
      meanProbability: bin.ps / bin.count,
      observedRate: bin.ys / bin.count,
    }] : [],
  );
  const ece = n ? buckets.reduce((sum, bin) => sum +
    bin.count / n * Math.abs(bin.meanProbability - bin.observedRate), 0) : null;
  const brierScore = n ? brier / n : null;
  const baseline = n && input.precommittedBaselineProbability !== undefined ? baselineBrier / n : null;
  const holdout = input.split === "temporal_holdout" || input.split === "random_holdout";
  const sufficientlyPopulated = n >= MIN_ASSESSABLE_FORECASTS &&
    buckets.every((bucket) => bucket.count >= 10);
  const status = !n || n < MIN_ASSESSABLE_FORECASTS || !sufficientlyPopulated
    ? "insufficient_data" as const
    : holdout && input.independentLabels
      ? "eligible_for_independent_review" as const
      : "descriptive_only" as const;
  return {
    datasetVersion: input.datasetVersion,
    modelVersion: input.modelVersion,
    sampleSize: n,
    positives,
    status,
    brierScore,
    logLoss: n ? logLoss / n : null,
    aucRoc: auc(input.records, positives),
    expectedCalibrationError: ece,
    baselineBrier: baseline,
    brierImprovementVsBaseline: brierScore === null || baseline === null
      ? null : baseline - brierScore,
    buckets,
    limitations: [
      "Eligibility for independent review is not statistical certification; split and label provenance are caller declarations.",
      "AUC and reliability bins do not establish representative sampling, leakage-free labels, subgroup fairness or temporal stability.",
      "Log loss uses probability clipping at 1e-15; ECE depends on the selected bin count.",
      ...(!holdout ? ["The declared split is not an independent holdout."] : []),
      ...(!input.independentLabels ? ["Independent labels were not declared."] : []),
      ...(n < MIN_ASSESSABLE_FORECASTS ? ["Fewer than 100 labeled cases."] : []),
      ...(buckets.some((bucket) => bucket.count < 10) ? ["At least one populated reliability bucket has fewer than 10 cases."] : []),
    ],
  };
}

/**
 * Paired difference over cases with full, action-specific feedback.
 * Does not compare factual outcomes for different historical treatments,
 * and does not claim that full-feedback reconstruction proves causation.
 */
export function compareFullFeedbackPolicies(
  input: PolicyComparisonInput,
): PolicyComparisonResult {
  if (!input.datasetVersion?.trim() || !input.commonUtilityUnit?.trim()) {
    throw new Error("datasetVersion and commonUtilityUnit must be non-empty.");
  }
  validateSplit(input.split);
  if (!["synthetic", "modeled_counterfactual", "independently_verified_full_feedback"].includes(input.provenance)) {
    throw new Error("Invalid feedback provenance.");
  }
  validateRecordCount(input.records.length);
  validateIds(input.records);
  const iterations = input.bootstrapIterations ?? 1000;
  const seed = input.bootstrapSeed ?? 20261113;
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 10000) {
    throw new Error("bootstrapIterations must be between 100 and 10000.");
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("bootstrapSeed must be a non-negative 32-bit integer.");
  }
  let baselineTotal = 0;
  let signalTotal = 0;
  let improvedCount = 0;
  let worsenedCount = 0;
  let tiedCount = 0;
  const differences: number[] = [];
  for (const record of input.records) {
    if (!record.baselineActionId || !record.signalActionId || !Array.isArray(record.actionUtilities)) {
      throw new Error(`Incomplete full feedback for ${record.id}.`);
    }
    const seen = new Set<string>();
    for (const outcome of record.actionUtilities) {
      if (!outcome.actionId || seen.has(outcome.actionId)) throw new Error(`Duplicate or missing action for ${record.id}.`);
      seen.add(outcome.actionId);
      assertFinite(outcome.utility, `utility ${record.id}/${outcome.actionId}`);
    }
    const baseline = record.actionUtilities.find((x) => x.actionId === record.baselineActionId);
    const signal = record.actionUtilities.find((x) => x.actionId === record.signalActionId);
    if (!baseline || !signal) throw new Error(`Full feedback for both policies is required: ${record.id}.`);
    const difference = signal.utility - baseline.utility;
    assertFinite(difference, `difference for ${record.id}`);
    baselineTotal += baseline.utility;
    signalTotal += signal.utility;
    differences.push(difference);
    if (difference > 0) improvedCount += 1;
    else if (difference < 0) worsenedCount += 1;
    else tiedCount += 1;
  }
  const n = input.records.length;
  const holdout = input.split === "temporal_holdout" || input.split === "random_holdout";
  const status = n < MIN_ASSESSABLE_COMPARISONS
    ? "insufficient_data" as const
    : holdout && input.provenance === "independently_verified_full_feedback"
      ? "eligible_for_independent_review" as const
      : "descriptive_only" as const;
  return {
    datasetVersion: input.datasetVersion,
    provenance: input.provenance,
    sampleSize: n,
    status,
    meanBaselineUtility: n ? baselineTotal / n : null,
    meanSignalUtility: n ? signalTotal / n : null,
    meanPairedDifference: n ? (signalTotal - baselineTotal) / n : null,
    pairedDifferenceInterval95: n >= MIN_ASSESSABLE_COMPARISONS
      ? pairedBootstrapInterval(differences, iterations, seed) : null,
    improvedCount, worsenedCount, tiedCount,
    limitations: [
      "Both action outcomes must be genuinely available or explicitly modeled; do not fill unobserved counterfactuals with realized outcomes.",
      "Paired bootstrap assumes independent cases; clustered/time-dependent observations require an appropriately clustered evaluation.",
      "A positive difference, even with an interval excluding zero, does not prove causal benefit without a defensible identification design.",
      ...(input.provenance !== "independently_verified_full_feedback" ? [
        "Synthetic or modeled counterfactual utilities cannot support claims of measured business improvement.",
      ] : []),
      ...(!holdout ? ["The declared split is not an independent holdout."] : []),
      ...(n < MIN_ASSESSABLE_COMPARISONS ? ["Fewer than 30 paired full-feedback cases."] : []),
    ],
  };
}

function auc(records: readonly BinaryForecastRecord[], positives: number): number | null {
  const negatives = records.length - positives;
  if (!positives || !negatives) return null;
  const ordered = [...records].sort((a, b) => a.probability - b.probability);
  let concordant = 0;
  let previousNegatives = 0;
  let index = 0;
  while (index < ordered.length) {
    let end = index;
    let positiveTies = 0;
    let negativeTies = 0;
    while (end < ordered.length && ordered[end].probability === ordered[index].probability) {
      if (ordered[end].outcome === 1) positiveTies += 1;
      else negativeTies += 1;
      end += 1;
    }
    concordant += positiveTies * (previousNegatives + negativeTies * 0.5);
    previousNegatives += negativeTies;
    index = end;
  }
  return concordant / (positives * negatives);
}

function pairedBootstrapInterval(values: readonly number[], iterations: number, seed: number): {lower: number; upper: number} {
  const next = random(seed);
  const estimates: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < values.length; j += 1) {
      sum += values[Math.floor(next() * values.length)];
    }
    estimates.push(sum / values.length);
  }
  estimates.sort((a, b) => a - b);
  return {
    lower: percentile(estimates, 0.025),
    upper: percentile(estimates, 0.975),
  };
}

function percentile(values: readonly number[], q: number): number {
  const x = (values.length - 1) * q;
  const lower = Math.floor(x);
  const upper = Math.ceil(x);
  return values[lower] + (values[upper] - values[lower]) * (x - lower);
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function validateSplit(value: EvaluationSplit): void {
  if (!["temporal_holdout", "random_holdout", "in_sample", "unknown"].includes(value)) {
    throw new Error("Invalid evaluation split.");
  }
}

function validateRecordCount(count: number): void {
  if (count > MAX_RECORDS) throw new Error(`At most ${MAX_RECORDS} records are supported.`);
}

function validateIds(entries: readonly {id: string}[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.id !== "string" || !entry.id.trim() || seen.has(entry.id)) {
      throw new Error("Every record requires a unique, non-empty ID.");
    }
    seen.add(entry.id);
  }
}

function assertFinite(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
}

function validateProbability(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0 || value > 1) throw new Error(`${name} must lie in [0,1].`);
}