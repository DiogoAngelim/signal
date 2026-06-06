export type RegimeRisk = "low" | "moderate" | "high" | "unstable";

export type MarketRegimeClassification =
  | "orderly_trend"
  | "noisy_trend"
  | "unstable_chop"
  | "high_volatility"
  | "low_signal"
  | "transition";

export type CalibrationBias =
  | "overconfident"
  | "underconfident"
  | "balanced"
  | "insufficient_data";

export type CalibrationPrediction = {
  predictedProbability: number;
};

export type RealizedOutcome = {
  outcomeQuality?: number;
  success?: boolean;
  realizedReturn?: number;
};

export type CalibrationBucket = {
  lower: number;
  upper: number;
  count: number;
  predictedMean: number;
  accuracy: number;
};

export type CalibrationState = {
  sampleSize: number;
  rollingBrierScore: number;
  calibrationError: number;
  bucketAccuracy: CalibrationBucket[];
  bias: CalibrationBias;
  drift: number;
  confidenceMultiplier: number;
};

export type DiagnosticInputs = {
  trendQuality?: number;
  reliability?: number;
  breadth?: number;
  clarity?: number;
  calibration?: number;
  volatilityPressure?: number;
  regimeStability?: number;
  modelDurability?: number;
  holdingQuality?: number;
  errorControl?: number;
  survivalProbability?: number;
  residualInstability?: number;
  entropy?: number;
  drift?: number;
};

export type RegimeClassificationResult = {
  regime: MarketRegimeClassification;
  risk: RegimeRisk;
  allocationCapMultiplier: number;
  confidenceThreshold: number;
  holdingPeriodMultiplier: number;
  reasons: string[];
};

export type SurvivalForecast = {
  survivalProbability: number;
  estimatedHalfLifeMinutes: number;
  recommendedHoldingMinutes: number;
  breakdownRisk: RegimeRisk;
  reasons: string[];
};

export type SurvivalForecastInput = {
  diagnostics: DiagnosticInputs;
  signalAgeMinutes?: number;
  trendConsistency?: number;
  recentSignalReversals?: number;
};

export type MetaAllocationDecision = {
  exposureMultiplier: number;
  confidenceDiscount: number;
  holdingPeriodMultiplier: number;
  allocationCap: number;
  regimeRisk: RegimeRisk;
  reasons: string[];
};

export type MetaAllocationInput = {
  diagnostics: DiagnosticInputs;
  calibrationState?: CalibrationState;
  regime?: RegimeClassificationResult;
  survival?: SurvivalForecast;
};

type CalibrationObservation = {
  predictedProbability: number;
  realizedOutcomeQuality: number;
};

const DEFAULT_CALIBRATION_STATE: CalibrationState = {
  sampleSize: 0,
  rollingBrierScore: 0.25,
  calibrationError: 0.18,
  bucketAccuracy: [],
  bias: "insufficient_data",
  drift: 35,
  confidenceMultiplier: 0.82,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampUnit(value: number) {
  return clamp(value, 0, 1);
}

function metric(value: number | undefined, fallback = 50) {
  return clamp(value ?? fallback);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normalizeProbability(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return clampUnit(value > 1 ? value / 100 : value);
}

function normalizeOutcome(outcome: RealizedOutcome | number) {
  if (typeof outcome === "number") return normalizeProbability(outcome);
  if (typeof outcome.success === "boolean") return outcome.success ? 1 : 0;
  if (outcome.outcomeQuality != null) return normalizeProbability(outcome.outcomeQuality);
  if (outcome.realizedReturn != null) return clampUnit(0.5 + outcome.realizedReturn / 12);
  return 0.5;
}

function missingDiagnosticsCount(diagnostics: DiagnosticInputs) {
  const keys: Array<keyof DiagnosticInputs> = [
    "calibration",
    "volatilityPressure",
    "regimeStability",
    "survivalProbability",
    "residualInstability",
    "entropy",
    "drift",
    "breadth",
  ];
  return keys.filter((key) => diagnostics[key] == null).length;
}

export class RollingCalibrationTracker {
  private observations: CalibrationObservation[] = [];

  constructor(private readonly windowSize = 200) {}

  updateCalibration(prediction: CalibrationPrediction | number, realizedOutcome: RealizedOutcome | number) {
    const predictedProbability =
      typeof prediction === "number"
        ? normalizeProbability(prediction)
        : normalizeProbability(prediction.predictedProbability);
    const realizedOutcomeQuality = normalizeOutcome(realizedOutcome);

    this.observations.push({ predictedProbability, realizedOutcomeQuality });
    if (this.observations.length > this.windowSize) {
      this.observations = this.observations.slice(-this.windowSize);
    }
    return this.getCalibrationState();
  }

  getCalibrationState(): CalibrationState {
    return buildCalibrationState(this.observations);
  }
}

const defaultTracker = new RollingCalibrationTracker();

export function updateCalibration(
  prediction: CalibrationPrediction | number,
  realizedOutcome: RealizedOutcome | number,
) {
  return defaultTracker.updateCalibration(prediction, realizedOutcome);
}

export function getCalibrationState() {
  return defaultTracker.getCalibrationState();
}

export function buildCalibrationState(
  observations: Array<CalibrationObservation | { predictedProbability: number; realizedOutcomeQuality: number }>,
): CalibrationState {
  const clean = observations
    .map((item) => ({
      predictedProbability: normalizeProbability(item.predictedProbability),
      realizedOutcomeQuality: normalizeOutcome(item.realizedOutcomeQuality),
    }))
    .filter((item) => Number.isFinite(item.predictedProbability) && Number.isFinite(item.realizedOutcomeQuality));

  if (!clean.length) return DEFAULT_CALIBRATION_STATE;

  const brierScores = clean.map((item) => (item.predictedProbability - item.realizedOutcomeQuality) ** 2);
  const calibrationError = mean(clean.map((item) => Math.abs(item.predictedProbability - item.realizedOutcomeQuality)));
  const predictedMean = mean(clean.map((item) => item.predictedProbability));
  const realizedMean = mean(clean.map((item) => item.realizedOutcomeQuality));
  const biasDelta = predictedMean - realizedMean;
  const recent = clean.slice(-Math.max(8, Math.ceil(clean.length / 3)));
  const previous = clean.slice(0, Math.max(0, clean.length - recent.length));
  const recentError = mean(recent.map((item) => Math.abs(item.predictedProbability - item.realizedOutcomeQuality)));
  const previousError = previous.length
    ? mean(previous.map((item) => Math.abs(item.predictedProbability - item.realizedOutcomeQuality)))
    : calibrationError;
  const drift = clamp(Math.abs(recentError - previousError) * 220 + Math.max(0, recentError - previousError) * 120);

  const buckets = [0, 0.2, 0.4, 0.6, 0.8].map((lower) => {
    const upper = lower + 0.2;
    const items = clean.filter((item) =>
      lower === 0.8
        ? item.predictedProbability >= lower && item.predictedProbability <= upper
        : item.predictedProbability >= lower && item.predictedProbability < upper,
    );
    return {
      lower,
      upper,
      count: items.length,
      predictedMean: mean(items.map((item) => item.predictedProbability)),
      accuracy: mean(items.map((item) => item.realizedOutcomeQuality)),
    };
  });

  const bias: CalibrationBias =
    clean.length < 8
      ? "insufficient_data"
      : biasDelta > 0.08
        ? "overconfident"
        : biasDelta < -0.08
          ? "underconfident"
          : "balanced";

  return {
    sampleSize: clean.length,
    rollingBrierScore: mean(brierScores),
    calibrationError,
    bucketAccuracy: buckets,
    bias,
    drift,
    confidenceMultiplier: clampUnit(1 - calibrationError * 0.9 - (bias === "overconfident" ? 0.08 : 0) - drift / 500),
  };
}

export function classifyMarketRegime(diagnostics: DiagnosticInputs): RegimeClassificationResult {
  const volatilityPressure = metric(diagnostics.volatilityPressure ?? diagnostics.drift, 58);
  const entropy = metric(diagnostics.entropy ?? diagnostics.clarity, 58);
  const drift = metric(diagnostics.drift, 55);
  const residualInstability = metric(diagnostics.residualInstability, 52);
  const breadth = metric(diagnostics.breadth, 42);
  const regimeStability = metric(diagnostics.regimeStability, 45);
  const reasons: string[] = [];

  let regime: MarketRegimeClassification = "transition";
  if (breadth < 32 && entropy > 62) {
    regime = "low_signal";
    reasons.push("Low breadth and high entropy weaken signal quality.");
  } else if (volatilityPressure > 72 || residualInstability > 72) {
    regime = "high_volatility";
    reasons.push("Volatility or residual instability is elevated.");
  } else if (regimeStability < 38 && drift > 58) {
    regime = "unstable_chop";
    reasons.push("Regime stability is weak while drift is rising.");
  } else if (breadth >= 64 && regimeStability >= 64 && entropy < 56 && drift < 45) {
    regime = "orderly_trend";
    reasons.push("Breadth and regime stability support an orderly trend.");
  } else if (breadth >= 52 && volatilityPressure <= 66) {
    regime = "noisy_trend";
    reasons.push("Trend evidence exists, but noise still requires sizing discipline.");
  } else {
    reasons.push("Market state is transitional; keep governors conservative.");
  }

  const risk: RegimeRisk =
    regime === "orderly_trend"
      ? "low"
      : regime === "noisy_trend" || regime === "transition"
        ? "moderate"
        : regime === "high_volatility" || regime === "unstable_chop"
          ? "unstable"
          : "high";

  return {
    regime,
    risk,
    allocationCapMultiplier:
      regime === "orderly_trend" ? 1.08 : regime === "noisy_trend" ? 0.92 : regime === "transition" ? 0.78 : 0.55,
    confidenceThreshold:
      regime === "orderly_trend" ? 56 : regime === "noisy_trend" ? 62 : regime === "transition" ? 66 : 72,
    holdingPeriodMultiplier:
      regime === "orderly_trend" ? 1.18 : regime === "noisy_trend" ? 0.96 : regime === "transition" ? 0.82 : 0.58,
    reasons,
  };
}

export function forecastSignalSurvival(input: SurvivalForecastInput): SurvivalForecast {
  const diagnostics = input.diagnostics;
  const holdingQuality = metric(diagnostics.holdingQuality ?? diagnostics.survivalProbability, 44);
  const modelDurability = metric(diagnostics.modelDurability, 45);
  const trendConsistency = metric(input.trendConsistency ?? diagnostics.trendQuality, 48);
  const volatilityPressure = metric(diagnostics.volatilityPressure ?? diagnostics.drift, 58);
  const residualInstability = metric(diagnostics.residualInstability, 52);
  const signalAgeMinutes = Math.max(0, input.signalAgeMinutes ?? 0);
  const recentSignalReversals = Math.max(0, input.recentSignalReversals ?? 0);
  const agePenalty = clamp(signalAgeMinutes / 12, 0, 18);
  const reversalPenalty = clamp(recentSignalReversals * 9, 0, 24);

  const survivalProbability = clamp(
    holdingQuality * 0.3 +
      modelDurability * 0.22 +
      trendConsistency * 0.2 +
      metric(diagnostics.regimeStability, 45) * 0.14 +
      metric(diagnostics.breadth, 42) * 0.08 -
      volatilityPressure * 0.12 -
      residualInstability * 0.11 -
      agePenalty -
      reversalPenalty +
      18,
  );
  const estimatedHalfLifeMinutes = Math.round(clamp(20 + survivalProbability * 1.9 - volatilityPressure * 0.45 - recentSignalReversals * 8, 15, 240));
  const recommendedHoldingMinutes = Math.round(clamp(estimatedHalfLifeMinutes * (survivalProbability >= 68 ? 1.25 : survivalProbability >= 45 ? 0.86 : 0.55), 10, 300));
  const breakdownRisk: RegimeRisk =
    survivalProbability < 34 || residualInstability > 76
      ? "unstable"
      : survivalProbability < 48
        ? "high"
        : survivalProbability < 66
          ? "moderate"
          : "low";
  const reasons: string[] = [];
  if (survivalProbability < 45) reasons.push("Survival forecast is weak; shorten the holding horizon.");
  if (volatilityPressure > 65) reasons.push("Volatility pressure reduces expected signal half-life.");
  if (residualInstability > 62) reasons.push("Residual instability raises breakdown risk.");
  if (survivalProbability >= 66) reasons.push("Durability evidence supports a longer holding window.");

  return {
    survivalProbability,
    estimatedHalfLifeMinutes,
    recommendedHoldingMinutes,
    breakdownRisk,
    reasons,
  };
}

export function decideMetaAllocation(input: MetaAllocationInput): MetaAllocationDecision {
  const diagnostics = input.diagnostics;
  const calibrationState = input.calibrationState ?? DEFAULT_CALIBRATION_STATE;
  const regime = input.regime ?? classifyMarketRegime(diagnostics);
  const survival = input.survival ?? forecastSignalSurvival({ diagnostics });
  const entropy = metric(diagnostics.entropy, 58);
  const drift = metric(diagnostics.drift, 56);
  const breadth = metric(diagnostics.breadth, 42);
  const residualInstability = metric(diagnostics.residualInstability, 54);
  const regimeStability = metric(diagnostics.regimeStability, 45);
  const missingPenalty = missingDiagnosticsCount(diagnostics) * 0.025;
  const reasons = [...regime.reasons, ...survival.reasons];

  const entropyPenalty = clamp((entropy - 48) / 100, 0, 0.22);
  const driftPenalty = clamp((drift - 42) / 100, 0, 0.22);
  const breadthPenalty = clamp((52 - breadth) / 100, 0, 0.18);
  const residualPenalty = clamp((residualInstability - 48) / 100, 0, 0.24);
  const calibrationPenalty = clamp(calibrationState.calibrationError * 0.6 + calibrationState.drift / 450, 0, 0.24);
  const survivalBoost = clamp((survival.survivalProbability - 55) / 220, -0.14, 0.14);
  const stabilityBoost = clamp((regimeStability - 58) / 260, -0.08, 0.1);

  if (calibrationState.bias === "overconfident") reasons.push("Recent predictions are overconfident; discount confidence.");
  if (entropy > 64) reasons.push("High entropy reduces allocation.");
  if (drift > 62) reasons.push("Feature drift shortens the holding horizon.");
  if (breadth < 45) reasons.push("Weak breadth reduces conviction.");
  if (residualInstability > 64) reasons.push("Residual instability caps exposure.");
  if (missingDiagnosticsCount(diagnostics) > 0) reasons.push("Missing diagnostics trigger conservative defaults.");

  const rawExposureMultiplier =
    (1 - entropyPenalty - driftPenalty - breadthPenalty - residualPenalty - calibrationPenalty - missingPenalty + survivalBoost + stabilityBoost) *
    regime.allocationCapMultiplier;
  const exposureMultiplier = clamp(rawExposureMultiplier, 0.25, 1.18);
  const confidenceDiscount = clampUnit(
    calibrationState.confidenceMultiplier -
      entropyPenalty * 0.45 -
      driftPenalty * 0.35 -
      residualPenalty * 0.45 -
      missingPenalty,
  );
  const rawHoldingPeriodMultiplier =
    regime.holdingPeriodMultiplier *
      (survival.recommendedHoldingMinutes / Math.max(30, survival.estimatedHalfLifeMinutes)) *
      (1 - clamp((drift - 50) / 160, 0, 0.28)) *
    (1 + clamp((regimeStability - 62) / 260, 0, 0.12));
  const holdingPeriodMultiplier = clamp(rawHoldingPeriodMultiplier, 0.38, 1.32);
  const allocationCap = clamp(
    5.2 * regime.allocationCapMultiplier * (1 - residualPenalty) * (survival.survivalProbability < 42 ? 0.62 : 1) * (1 - missingPenalty),
    0.8,
    6.2,
  );
  const regimeRisk: RegimeRisk =
    regime.risk === "unstable" || survival.breakdownRisk === "unstable"
      ? "unstable"
      : regime.risk === "high" || survival.breakdownRisk === "high"
        ? "high"
        : regime.risk === "moderate" || survival.breakdownRisk === "moderate"
          ? "moderate"
          : "low";

  return {
    exposureMultiplier,
    confidenceDiscount: clamp(confidenceDiscount, 0.45, 1),
    holdingPeriodMultiplier,
    allocationCap,
    regimeRisk,
    reasons: Array.from(new Set(reasons)).slice(0, 6),
  };
}
