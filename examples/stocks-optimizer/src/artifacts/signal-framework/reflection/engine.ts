import { clamp, mean, stdev } from "../math/statistics";

export type ReflectionOutcomeLabel = string;

export type ReflectionScalar = number | string | boolean | null | undefined;

export type ReflectionStateVector = Record<string, ReflectionScalar>;

export type ReflectionPrediction = {
  id?: string;
  decisionId?: string;
  timestamp?: number;
  label?: string;
  expectedOutcome?: ReflectionOutcomeLabel;
  confidence?: number;
  correct?: boolean | null;
  metadata?: Record<string, unknown>;
};

export type ReflectionDecision = {
  id?: string;
  timestamp?: number;
  type?: string;
  confidence?: number;
  uncertainty?: number;
  metadata?: Record<string, unknown>;
};

export type ReflectionOutcome = {
  id?: string;
  predictionId?: string;
  decisionId?: string;
  timestamp?: number;
  label?: ReflectionOutcomeLabel;
  success?: boolean | null;
  correct?: boolean | null;
  value?: number;
  metadata?: Record<string, unknown>;
};

export type ReflectionHistoryRecord = {
  id?: string;
  timestamp?: number;
  state?: ReflectionStateVector;
  prediction?: ReflectionPrediction;
  decision?: ReflectionDecision;
  outcome?: ReflectionOutcome;
  metadata?: Record<string, unknown>;
};

export type ReflectionLayerInput = {
  key?: string;
  score?: number;
  value?: number;
  confidence?: number;
  uncertainty?: number;
  metadata?: Record<string, unknown>;
};

export type KnowledgeInput = {
  key: string;
  value?: unknown;
  required?: boolean;
  known?: boolean;
  quality?: number;
  timestamp?: number;
  staleAfterMs?: number;
  status?: "known" | "unknown" | "missing" | "stale" | "low-quality" | string;
  metadata?: Record<string, unknown>;
};

export type CounterfactualCandidate = {
  id: string;
  label?: string;
  confidence?: number;
  expectedUtility?: number;
  expectedAdvantage?: number;
  expectedDownside?: number;
  uncertainty?: number;
  metadata?: Record<string, unknown>;
};

export type ReflectionInput = {
  predictions?: ReflectionPrediction[];
  decisions?: ReflectionDecision[];
  outcomes?: ReflectionOutcome[];
  history?: ReflectionHistoryRecord[];
  currentState?: ReflectionStateVector;
  perceptionLayers?:
    | Record<string, number | ReflectionLayerInput | null | undefined>
    | ReflectionLayerInput[];
  inputs?: KnowledgeInput[];
  requiredInputs?: string[];
  candidateDecisions?: CounterfactualCandidate[];
  now?: number;
  options?: {
    nearestStateLimit?: number;
    similarityThreshold?: number;
    staleAfterMs?: number;
    lowQualityThreshold?: number;
  };
};

export type ReflectionCalibrationResult = {
  score: number;
  sampleSize: number;
  averageConfidence: number;
  observedAccuracy: number;
  calibrationError: number;
  confidenceAdjustment: number;
  recommendedConfidenceCap: number;
  overconfidenceDetected: boolean;
  underconfidenceDetected: boolean;
  status: "insufficient-data" | "overconfident" | "underconfident" | "aligned";
};

export type HistoricalReliabilityResult = {
  score: number;
  sampleSize: number;
  predictionCount: number;
  decisionCount: number;
  outcomeCount: number;
  evaluatedPredictionCount: number;
  historicalAccuracy: number;
  reliabilityTrend: {
    firstWindowAccuracy: number;
    recentWindowAccuracy: number;
    delta: number;
    direction: "improving" | "weakening" | "flat" | "insufficient-data";
  };
  outcomeDistribution: Record<string, number>;
};

export type StateSimilarityResult = {
  score: number;
  nearestStates: Array<{
    id: string;
    similarity: number;
    outcomeLabel?: string;
    correctness?: number;
  }>;
  outcomeDistribution: Record<string, number>;
  reliabilityByStateCluster: Record<
    string,
    { count: number; reliability: number }
  >;
};

export type MetaCoherenceResult = {
  score: number;
  coherence: number;
  disagreement: number;
  dispersion: number;
  consistency: number;
  layerCount: number;
  contradictions: Array<{ a: string; b: string; gap: number }>;
};

export type KnowledgeCompletenessResult = {
  score: number;
  completenessScore: number;
  knownUnknowns: string[];
  missingInputs: string[];
  staleInputs: string[];
  lowQualityInputs: string[];
  unknownInputs: string[];
};

export type CounterfactualEvaluation = {
  candidateId: string;
  label?: string;
  expectedAdvantage: number;
  expectedDownside: number;
  uncertainty: number;
  confidence: number;
  score: number;
  reasons: string[];
};

export type CounterfactualResult = {
  candidates: CounterfactualEvaluation[];
  bestCandidateId?: string;
  spread: number;
  confidence: number;
};

export type ReflectionResult = {
  reflectionScore: number;
  calibration: ReflectionCalibrationResult;
  stateSimilarity: StateSimilarityResult;
  metaCoherence: MetaCoherenceResult;
  knowledgeCompleteness: KnowledgeCompletenessResult;
  counterfactuals: CounterfactualResult;
  historicalReliability: HistoricalReliabilityResult;
  confidenceAdjustment: number;
  recommendedConfidenceCap: number;
  knownUnknowns: string[];
  reasons: string[];
  audit: {
    componentScores: Record<string, number>;
    weights: Record<string, number>;
    formulas: string[];
    counts: Record<string, number>;
  };
};

type EvaluatedPrediction = {
  id: string;
  timestamp: number;
  confidence: number;
  correctness: number;
  outcomeLabel: string;
};

type NormalizedHistory = {
  predictions: ReflectionPrediction[];
  decisions: ReflectionDecision[];
  outcomes: ReflectionOutcome[];
  records: ReflectionHistoryRecord[];
  evaluated: EvaluatedPrediction[];
};

const DEFAULT_UNKNOWN = "unknown";

const REFLECTION_WEIGHTS = {
  calibration: 0.2,
  stateSimilarity: 0.14,
  historicalReliability: 0.18,
  metaCoherence: 0.16,
  knowledgeCompleteness: 0.2,
  uncertaintyControl: 0.12,
};

export function reflect(input: ReflectionInput): ReflectionResult {
  const history = normalizeHistory(input);
  const calibration = evaluateCalibration(history.evaluated);
  const historicalReliability = evaluateHistoricalReliability(history);
  const stateSimilarity = evaluateStateSimilarity(
    input.currentState,
    history.records,
    input.options,
  );
  const metaCoherence = evaluateMetaCoherence(input.perceptionLayers);
  const knowledgeCompleteness = evaluateKnowledgeCompleteness(
    input.inputs,
    input.requiredInputs,
    input.now,
    input.options,
  );
  const counterfactuals = evaluateCounterfactuals(input.candidateDecisions);
  const uncertainty = mean([
    100 - calibration.score,
    100 - stateSimilarity.score,
    100 - historicalReliability.score,
    100 - metaCoherence.score,
    100 - knowledgeCompleteness.score,
    counterfactuals.candidates.length ? 100 - counterfactuals.confidence : 50,
  ]);
  const componentScores = {
    calibration: calibration.score,
    stateSimilarity: stateSimilarity.score,
    historicalReliability: historicalReliability.score,
    metaCoherence: metaCoherence.score,
    knowledgeCompleteness: knowledgeCompleteness.score,
    uncertaintyControl: clamp(100 - uncertainty),
  };
  const reflectionScore = weightedScore(componentScores, REFLECTION_WEIGHTS);
  const knownUnknowns = unique([
    ...knowledgeCompleteness.knownUnknowns,
    ...(history.evaluated.length === 0
      ? ["No evaluated prediction history is available."]
      : []),
    ...(stateSimilarity.nearestStates.length === 0
      ? ["No similar historical states are available."]
      : []),
  ]);

  return {
    reflectionScore,
    calibration,
    stateSimilarity,
    metaCoherence,
    knowledgeCompleteness,
    counterfactuals,
    historicalReliability,
    confidenceAdjustment: calibration.confidenceAdjustment,
    recommendedConfidenceCap: calibration.recommendedConfidenceCap,
    knownUnknowns,
    reasons: reflectionReasons({
      calibration,
      historicalReliability,
      stateSimilarity,
      metaCoherence,
      knowledgeCompleteness,
      counterfactuals,
      reflectionScore,
    }),
    audit: {
      componentScores,
      weights: REFLECTION_WEIGHTS,
      formulas: [
        "calibration = 100 - mean(abs(predicted confidence - observed correctness))",
        "state similarity = mean nearest historical similarity adjusted by evaluated outcome coverage",
        "meta-coherence = 100 - normalized dispersion across supplied perception layers",
        "knowledge completeness = mean required-input availability, freshness, and quality",
        "reflectionScore = weighted mean of calibration, similarity, reliability, coherence, completeness, and uncertainty control",
      ],
      counts: {
        predictions: history.predictions.length,
        decisions: history.decisions.length,
        outcomes: history.outcomes.length,
        evaluatedPredictions: history.evaluated.length,
        candidateDecisions: input.candidateDecisions?.length ?? 0,
        knownUnknowns: knownUnknowns.length,
      },
    },
  };
}

function normalizeHistory(input: ReflectionInput): NormalizedHistory {
  const records = Array.isArray(input.history)
    ? (input.history.filter(isRecord) as ReflectionHistoryRecord[])
    : [];
  const predictions = [
    ...safeArray(input.predictions),
    ...(records
      .map((record) => record.prediction)
      .filter(Boolean) as ReflectionPrediction[]),
  ];
  const decisions = [
    ...safeArray(input.decisions),
    ...(records
      .map((record) => record.decision)
      .filter(Boolean) as ReflectionDecision[]),
  ];
  const outcomes = [
    ...safeArray(input.outcomes),
    ...(records
      .map((record) => record.outcome)
      .filter(Boolean) as ReflectionOutcome[]),
  ];

  return {
    predictions,
    decisions,
    outcomes,
    records,
    evaluated: evaluatePredictions(predictions, outcomes, records),
  };
}

function evaluatePredictions(
  predictions: ReflectionPrediction[],
  outcomes: ReflectionOutcome[],
  records: ReflectionHistoryRecord[],
): EvaluatedPrediction[] {
  const evaluated: EvaluatedPrediction[] = [];
  const outcomeByPrediction = new Map<string, ReflectionOutcome>();
  const outcomeByDecision = new Map<string, ReflectionOutcome>();

  for (const outcome of outcomes) {
    if (outcome.predictionId)
      outcomeByPrediction.set(outcome.predictionId, outcome);
    if (outcome.decisionId) outcomeByDecision.set(outcome.decisionId, outcome);
    if (outcome.id) outcomeByPrediction.set(outcome.id, outcome);
  }

  for (const record of records) {
    if (record.prediction && record.outcome) {
      const correctness = correctnessFor(record.prediction, record.outcome);
      if (correctness != null) {
        evaluated.push(
          evaluatedPrediction(
            record.prediction,
            record.outcome,
            record.id,
            record.timestamp,
            correctness,
          ),
        );
      }
    }
  }

  for (const prediction of predictions) {
    const predictionId = prediction.id;
    const matchedOutcome =
      (predictionId ? outcomeByPrediction.get(predictionId) : undefined) ??
      (prediction.decisionId
        ? outcomeByDecision.get(prediction.decisionId)
        : undefined);
    const correctness = correctnessFor(prediction, matchedOutcome);
    if (correctness != null) {
      evaluated.push(
        evaluatedPrediction(
          prediction,
          matchedOutcome,
          predictionId,
          prediction.timestamp,
          correctness,
        ),
      );
    }
  }

  return dedupeEvaluated(evaluated);
}

function evaluatedPrediction(
  prediction: ReflectionPrediction,
  outcome: ReflectionOutcome | undefined,
  fallbackId: string | undefined,
  fallbackTimestamp: number | undefined,
  correctness: number,
): EvaluatedPrediction {
  return {
    id:
      prediction.id ??
      fallbackId ??
      prediction.decisionId ??
      `prediction-${stableString(prediction)}`,
    timestamp: numeric(
      prediction.timestamp ?? outcome?.timestamp ?? fallbackTimestamp,
      0,
    ),
    confidence: normalizeScore(prediction.confidence, 50),
    correctness: clamp(correctness * 100),
    outcomeLabel: normalizeOutcomeLabel(outcome),
  };
}

function dedupeEvaluated(evaluated: EvaluatedPrediction[]) {
  const seen = new Set<string>();
  const uniqueEvaluated: EvaluatedPrediction[] = [];
  for (const item of evaluated) {
    const key = item.id;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEvaluated.push(item);
    }
  }
  return uniqueEvaluated;
}

function correctnessFor(
  prediction: ReflectionPrediction,
  outcome?: ReflectionOutcome,
) {
  if (typeof prediction.correct === "boolean")
    return prediction.correct ? 1 : 0;
  if (typeof outcome?.correct === "boolean") return outcome.correct ? 1 : 0;
  if (typeof outcome?.success === "boolean") return outcome.success ? 1 : 0;
  if (prediction.expectedOutcome && outcome?.label) {
    return normalizeLabel(prediction.expectedOutcome) ===
      normalizeLabel(outcome.label)
      ? 1
      : 0;
  }

  const label = normalizeLabel(outcome?.label);
  if (["success", "positive", "correct", "passed"].includes(label)) return 1;
  if (["failure", "negative", "incorrect", "failed"].includes(label)) return 0;
  if (label === "partial") return 0.5;
  return null;
}

function evaluateCalibration(
  evaluated: EvaluatedPrediction[],
): ReflectionCalibrationResult {
  if (evaluated.length === 0) {
    return {
      score: 50,
      sampleSize: 0,
      averageConfidence: 0,
      observedAccuracy: 0,
      calibrationError: 0,
      confidenceAdjustment: -10,
      recommendedConfidenceCap: 70,
      overconfidenceDetected: false,
      underconfidenceDetected: false,
      status: "insufficient-data",
    };
  }

  const averageConfidence = mean(evaluated.map((item) => item.confidence));
  const observedAccuracy = mean(evaluated.map((item) => item.correctness));
  const calibrationError = averageConfidence - observedAccuracy;
  const score = clamp(
    100 -
      mean(
        evaluated.map((item) => Math.abs(item.confidence - item.correctness)),
      ),
  );
  const overconfidenceDetected = calibrationError > 10;
  const underconfidenceDetected = calibrationError < -10;
  const confidenceAdjustment = round(clamp(-calibrationError * 0.5, -35, 35));
  const recommendedConfidenceCap = clamp(
    overconfidenceDetected
      ? 100 - calibrationError * 0.7
      : 100 + confidenceAdjustment * 0.2,
  );

  return {
    score,
    sampleSize: evaluated.length,
    averageConfidence: round(averageConfidence),
    observedAccuracy: round(observedAccuracy),
    calibrationError: round(calibrationError),
    confidenceAdjustment,
    recommendedConfidenceCap,
    overconfidenceDetected,
    underconfidenceDetected,
    status: overconfidenceDetected
      ? "overconfident"
      : underconfidenceDetected
        ? "underconfident"
        : "aligned",
  };
}

function evaluateHistoricalReliability(
  history: NormalizedHistory,
): HistoricalReliabilityResult {
  const evaluated = [...history.evaluated].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  const historicalAccuracy = evaluated.length
    ? mean(evaluated.map((item) => item.correctness))
    : 0;
  const sampleConfidence = clamp((evaluated.length / 12) * 100);
  const score = evaluated.length
    ? clamp(historicalAccuracy * 0.8 + sampleConfidence * 0.2)
    : 50;
  const midpoint = Math.floor(evaluated.length / 2);
  const firstWindow = evaluated.slice(0, midpoint);
  const recentWindow = evaluated.slice(midpoint);
  const firstWindowAccuracy = firstWindow.length
    ? mean(firstWindow.map((item) => item.correctness))
    : 0;
  const recentWindowAccuracy = recentWindow.length
    ? mean(recentWindow.map((item) => item.correctness))
    : 0;
  const delta = recentWindowAccuracy - firstWindowAccuracy;

  return {
    score,
    sampleSize: history.records.length,
    predictionCount: history.predictions.length,
    decisionCount: history.decisions.length,
    outcomeCount: history.outcomes.length,
    evaluatedPredictionCount: evaluated.length,
    historicalAccuracy: round(historicalAccuracy),
    reliabilityTrend: {
      firstWindowAccuracy: round(firstWindowAccuracy),
      recentWindowAccuracy: round(recentWindowAccuracy),
      delta: round(delta),
      direction:
        evaluated.length < 2
          ? "insufficient-data"
          : delta > 5
            ? "improving"
            : delta < -5
              ? "weakening"
              : "flat",
    },
    outcomeDistribution: distribution(
      history.outcomes.map(normalizeOutcomeLabel),
    ),
  };
}

function evaluateStateSimilarity(
  currentState: ReflectionStateVector | undefined,
  records: ReflectionHistoryRecord[],
  options: ReflectionInput["options"] = {},
): StateSimilarityResult {
  const limit = Math.max(1, Math.round(numeric(options.nearestStateLimit, 5)));
  const threshold = normalizeScore(options.similarityThreshold, 70);
  const states = records.filter((record) => isRecord(record.state));

  if (!isRecord(currentState) || states.length === 0) {
    return {
      score: 0,
      nearestStates: [],
      outcomeDistribution: {},
      reliabilityByStateCluster: {
        high: { count: 0, reliability: 0 },
        medium: { count: 0, reliability: 0 },
        low: { count: 0, reliability: 0 },
      },
    };
  }

  const nearestStates = states
    .map((record, index) => {
      const outcome = record.outcome;
      return {
        id: record.id ?? `state-${index + 1}`,
        similarity: similarity(
          currentState,
          record.state as ReflectionStateVector,
          states.map((item) => item.state as ReflectionStateVector),
        ),
        outcomeLabel: normalizeOutcomeLabel(outcome),
        correctness: outcome
          ? (correctnessFor({}, outcome) ?? undefined)
          : undefined,
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  const reliableNearest = nearestStates.filter(
    (item) => item.similarity >= threshold,
  );
  const reliabilityByStateCluster = clusterReliability(
    nearestStates,
    threshold,
  );
  const nearestReliability = reliableNearest
    .map((item) => item.correctness)
    .filter((value): value is number => Number.isFinite(value));
  const reliability = nearestReliability.length
    ? mean(nearestReliability.map((value) => value * 100))
    : 50;
  const score = clamp(
    mean(nearestStates.map((item) => item.similarity)) * 0.65 +
      reliability * 0.35,
  );

  return {
    score,
    nearestStates,
    outcomeDistribution: distribution(
      nearestStates.map((item) => item.outcomeLabel),
    ),
    reliabilityByStateCluster,
  };
}

function similarity(
  current: ReflectionStateVector,
  historical: ReflectionStateVector,
  population: ReflectionStateVector[],
) {
  const keys = unique([...Object.keys(current), ...Object.keys(historical)]);
  if (keys.length === 0) return 0;
  const distances = keys.map((key) =>
    dimensionDistance(current[key], historical[key], key, population),
  );
  return clamp(100 - mean(distances) * 100);
}

function dimensionDistance(
  a: ReflectionScalar,
  b: ReflectionScalar,
  key: string,
  population: ReflectionStateVector[],
) {
  if (a == null || b == null) return 1;
  if (
    typeof a === "number" &&
    typeof b === "number" &&
    Number.isFinite(a) &&
    Number.isFinite(b)
  ) {
    const values = population
      .map((state) => state[key])
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      );
    const range = Math.max(
      1,
      Math.max(a, b, ...values) - Math.min(a, b, ...values),
    );
    return Math.min(1, Math.abs(a - b) / range);
  }
  return stableString(a) === stableString(b) ? 0 : 1;
}

function clusterReliability(
  states: StateSimilarityResult["nearestStates"],
  threshold: number,
): Record<string, { count: number; reliability: number }> {
  const clusters = {
    high: states.filter((item) => item.similarity >= threshold),
    medium: states.filter(
      (item) =>
        item.similarity < threshold && item.similarity >= threshold * 0.7,
    ),
    low: states.filter((item) => item.similarity < threshold * 0.7),
  };

  return Object.fromEntries(
    Object.entries(clusters).map(([key, values]) => {
      const correctness = values
        .map((item) => item.correctness)
        .filter((value): value is number => Number.isFinite(value));
      return [
        key,
        {
          count: values.length,
          reliability: correctness.length ? round(mean(correctness) * 100) : 0,
        },
      ];
    }),
  );
}

function evaluateMetaCoherence(
  layers: ReflectionInput["perceptionLayers"],
): MetaCoherenceResult {
  const normalizedLayers = normalizeLayers(layers);
  if (normalizedLayers.length === 0) {
    return {
      score: 50,
      coherence: 50,
      disagreement: 50,
      dispersion: 0,
      consistency: 50,
      layerCount: 0,
      contradictions: [],
    };
  }

  const scores = normalizedLayers.map((layer) => layer.score);
  const dispersion = stdev(scores);
  const disagreement = clamp(dispersion * 1.35);
  const coherence = clamp(100 - disagreement);
  const contradictions: MetaCoherenceResult["contradictions"] = [];

  for (const [index, left] of normalizedLayers.entries()) {
    for (const right of normalizedLayers.slice(index + 1)) {
      const gap = Math.abs(left.score - right.score);
      if (gap >= 45)
        contradictions.push({ a: left.key, b: right.key, gap: round(gap) });
    }
  }

  return {
    score: coherence,
    coherence,
    disagreement,
    dispersion: round(dispersion),
    consistency: coherence,
    layerCount: normalizedLayers.length,
    contradictions,
  };
}

function normalizeLayers(layers: ReflectionInput["perceptionLayers"]) {
  if (Array.isArray(layers)) {
    return layers
      .map((layer, index) => normalizeLayer(layer, `layer-${index + 1}`))
      .filter(
        (layer): layer is { key: string; score: number } => layer != null,
      );
  }

  if (isRecord(layers)) {
    return Object.entries(layers)
      .map(([key, layer]) => normalizeLayer(layer, key))
      .filter(
        (layer): layer is { key: string; score: number } => layer != null,
      );
  }

  return [];
}

function normalizeLayer(
  layer: number | ReflectionLayerInput | null | undefined,
  fallbackKey: string,
) {
  if (typeof layer === "number")
    return { key: fallbackKey, score: normalizeScore(layer, 0) };
  if (!isRecord(layer)) return null;
  return {
    key: String(layer.key ?? fallbackKey),
    score: normalizeScore(layer.score ?? layer.value, 0),
  };
}

function evaluateKnowledgeCompleteness(
  inputs: KnowledgeInput[] | undefined,
  requiredInputs: string[] | undefined,
  now: number | undefined,
  options: ReflectionInput["options"] = {},
): KnowledgeCompletenessResult {
  const normalizedInputs = safeArray(inputs);
  const normalizedRequiredInputs = safeArray(requiredInputs);
  const inputMap = new Map(
    normalizedInputs
      .filter((item) => item && typeof item.key === "string")
      .map((item) => [item.key, item]),
  );
  const requiredKeys = unique([
    ...normalizedRequiredInputs,
    ...normalizedInputs
      .filter((item) => item.required === true)
      .map((item) => item.key),
  ]);
  const keys = requiredKeys.length
    ? requiredKeys
    : normalizedInputs.map((item) => item.key);
  const lowQualityThreshold = normalizeScore(options.lowQualityThreshold, 50);
  const knownUnknowns: string[] = [];
  const missingInputs: string[] = [];
  const staleInputs: string[] = [];
  const lowQualityInputs: string[] = [];
  const unknownInputs: string[] = [];

  if (keys.length === 0) {
    return {
      score: 50,
      completenessScore: 50,
      knownUnknowns: ["No knowledge inputs were supplied."],
      missingInputs,
      staleInputs,
      lowQualityInputs,
      unknownInputs,
    };
  }

  const scores = keys.map((key) => {
    const item = inputMap.get(key);
    if (!item || item.status === "missing" || item.value == null) {
      missingInputs.push(key);
      knownUnknowns.push(`${key}: missing`);
      return 0;
    }

    if (item.known === false || item.status === "unknown") {
      unknownInputs.push(key);
      knownUnknowns.push(`${key}: unknown`);
      return 0;
    }

    const stale = isStale(item, now, options.staleAfterMs);
    const quality = normalizeScore(item.quality, 100);
    if (stale || item.status === "stale") {
      staleInputs.push(key);
      knownUnknowns.push(`${key}: stale`);
    }
    if (quality < lowQualityThreshold || item.status === "low-quality") {
      lowQualityInputs.push(key);
      knownUnknowns.push(`${key}: low-quality`);
    }

    return clamp(Math.min(stale ? 55 : 100, quality));
  });
  const completenessScore = clamp(mean(scores));

  return {
    score: completenessScore,
    completenessScore,
    knownUnknowns: unique(knownUnknowns),
    missingInputs: unique(missingInputs),
    staleInputs: unique(staleInputs),
    lowQualityInputs: unique(lowQualityInputs),
    unknownInputs: unique(unknownInputs),
  };
}

function isStale(
  item: KnowledgeInput,
  now: number | undefined,
  defaultStaleAfterMs: number | undefined,
) {
  if (!Number.isFinite(item.timestamp) || !Number.isFinite(now)) return false;
  const staleAfterMs = numeric(
    item.staleAfterMs ?? defaultStaleAfterMs,
    Number.POSITIVE_INFINITY,
  );
  return (now as number) - (item.timestamp as number) > staleAfterMs;
}

function evaluateCounterfactuals(
  candidates: CounterfactualCandidate[] = [],
): CounterfactualResult {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { candidates: [], spread: 0, confidence: 50 };
  }

  const utilities = candidates.map((candidate) =>
    numeric(candidate.expectedUtility ?? candidate.expectedAdvantage, 0),
  );
  const baseline = mean(utilities);
  const evaluations = candidates
    .map((candidate) => {
      const confidence = normalizeScore(candidate.confidence, 50);
      const expectedDownside = normalizeScore(candidate.expectedDownside, 0);
      const uncertainty = normalizeScore(
        candidate.uncertainty,
        Math.max(0, 100 - confidence),
      );
      const expectedAdvantage = round(
        numeric(
          candidate.expectedAdvantage,
          numeric(candidate.expectedUtility, 0) - baseline,
        ),
      );
      const score = clamp(
        50 +
          expectedAdvantage +
          confidence * 0.25 -
          expectedDownside * 0.25 -
          uncertainty * 0.2,
      );
      const reasons = [
        `Confidence ${formatPercent(confidence)}.`,
        `Expected downside ${formatPercent(expectedDownside)}.`,
        `Uncertainty ${formatPercent(uncertainty)}.`,
      ];
      return {
        candidateId: candidate.id,
        ...(candidate.label ? { label: candidate.label } : {}),
        expectedAdvantage,
        expectedDownside,
        uncertainty,
        confidence,
        score,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
  const scores = evaluations.map((item) => item.score);
  const [bestCandidate] = evaluations as [
    CounterfactualEvaluation,
    ...CounterfactualEvaluation[],
  ];
  const bestCandidateId = bestCandidate.candidateId;
  return {
    candidates: evaluations,
    bestCandidateId,
    spread:
      scores.length > 1 ? round(Math.max(...scores) - Math.min(...scores)) : 0,
    confidence: clamp(
      mean(
        evaluations.map(
          (item) => (item.confidence + 100 - item.uncertainty) / 2,
        ),
      ),
    ),
  };
}

function reflectionReasons(input: {
  calibration: ReflectionCalibrationResult;
  historicalReliability: HistoricalReliabilityResult;
  stateSimilarity: StateSimilarityResult;
  metaCoherence: MetaCoherenceResult;
  knowledgeCompleteness: KnowledgeCompletenessResult;
  counterfactuals: CounterfactualResult;
  reflectionScore: number;
}) {
  const reasons: string[] = [];
  if (input.calibration.status === "insufficient-data")
    reasons.push("Calibration has no evaluated prediction history.");
  if (input.calibration.overconfidenceDetected)
    reasons.push("Predicted confidence is higher than observed correctness.");
  if (input.calibration.underconfidenceDetected)
    reasons.push("Observed correctness exceeds predicted confidence.");
  if (input.historicalReliability.evaluatedPredictionCount === 0)
    reasons.push("Historical reliability is not yet established.");
  if (input.stateSimilarity.nearestStates.length === 0)
    reasons.push("No similar prior state is available for comparison.");
  if (input.metaCoherence.contradictions.length > 0)
    reasons.push("Perception layers contain material contradictions.");
  if (input.knowledgeCompleteness.knownUnknowns.length > 0)
    reasons.push("Known unknowns reduce reflection quality.");
  if (input.counterfactuals.candidates.length === 0)
    reasons.push("No counterfactual candidates were supplied.");
  if (input.reflectionScore >= 75)
    reasons.push("Reflection quality supports higher self-awareness.");
  if (reasons.length === 0)
    reasons.push("Reflection signals are coherent and sufficiently evidenced.");
  return unique(reasons);
}

function weightedScore(
  scores: Record<keyof typeof REFLECTION_WEIGHTS, number>,
  weights: Record<keyof typeof REFLECTION_WEIGHTS, number>,
) {
  const entries = Object.entries(weights) as Array<
    [keyof typeof REFLECTION_WEIGHTS, number]
  >;
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return clamp(
    entries.reduce((sum, [key, weight]) => sum + scores[key] * weight, 0) /
      totalWeight,
  );
}

function distribution(labels: string[]) {
  const total = labels.length || 1;
  const counts: Record<string, number> = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [
      key,
      round((count / total) * 100),
    ]),
  );
}

function normalizeOutcomeLabel(outcome: ReflectionOutcome | undefined) {
  return outcome?.label ? normalizeLabel(outcome.label) : DEFAULT_UNKNOWN;
}

function normalizeLabel(value: unknown) {
  return (
    String(value ?? DEFAULT_UNKNOWN)
      .trim()
      .toLowerCase() || DEFAULT_UNKNOWN
  );
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

function round(value: number) {
  return Math.round(clamp(value, -10_000, 10_000) * 100) / 100;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function safeArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stableString(value: unknown) {
  
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  return JSON.stringify(
    value,
    Object.keys(value as Record<string, unknown>).sort(),
  );
}

function formatPercent(value: number) {
  return `${Math.round(clamp(value))}%`;
}
