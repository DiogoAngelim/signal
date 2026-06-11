import { clamp, mean, numeric, signRatio, stdev } from "../math/statistics";
import { type MeaningResult, evaluateMeaning } from "../meaning/engine";
import { MetricRegistry } from "../metrics/registry";
import {
  type PruningCandidateInput,
  type PruningInput,
  type PruningResult,
  evaluatePruning,
} from "../pruning/engine";
import {
  type PurposeBehaviorObservation,
  type PurposeExpectationRecord,
  type PurposeFrictionRecord,
  type PurposeInput,
  type PurposeResult,
  evaluatePurpose,
} from "../purpose/engine";
import type {
  MetricInput,
  ObservationPoint,
  SynchronizationInput,
  VenueState,
} from "../types";

export type StocksOptimizerMetricSource = {
  marketStatus: "Open" | "Closed";
  stocks: Array<Record<string, any>>;
  avgRisk: number | null;
  avgQuality: number | null;
  breadth: number;
  confidence: number | null;
  targetExposure: number;
  survivalScore: number;
  failureFlags: string[];
  staleData: boolean;
  hasBacktestData: boolean;
  hasProvidedSignals: boolean;
  backtestTradeCount: number;
  backtestSharpe: number | null | undefined;
  backtestMaxDrawdownPct: number | null | undefined;
  backtestProfitFactor: number | null | undefined;
  backtestWinRatePct: number | null | undefined;
  backtestReturnPct: number | null | undefined;
  robustnessScore?: number | null;
  robustnessOverfitRisk?: number | null;
  deploymentReadinessScore?: number | null;
  calibrationRawConfidence?: number | null;
  calibrationCalibratedConfidence?: number | null;
  calibrationHistoricalAccuracy?: number | null;
  calibrationError?: number | null;
  calibrationTrustworthiness?: number | null;
  calibrationSampleSize?: number | null;
  calibrationStatus?: string | null;
  calibrationWarnings?: string[];
  lastSuccessfulSync?: number | null;
  expectedAssetCount?: number;
  exchangeSynchronized?: boolean;
  partialApiFailures?: number;
  fallbackMode?: boolean;
  now?: number;
  executionProfile?: {
    name?: string;
    profile?: string;
    spreadBps?: number;
    slippageBps?: number;
    rebalanceThresholdBps?: number;
    totalExposureCap?: number;
    riskAversion?: number;
  };
  ambition?: number | null;
  meaningText?: string | null;
  meaning?: Partial<MeaningResult> | null;
  behavioralEvents?: PurposeBehaviorObservation[];
  expectationRecords?: PurposeExpectationRecord[];
  frictionRecords?: PurposeFrictionRecord[];
};

export type StocksPruningViewModel = {
  mode: "legacy" | "enhanced" | "degraded";
  pruningScore: number;
  ignoranceEffectivenessScore: number;
  recommendedAction: string;
  ignoredSignals: string[];
  reducedSignals: string[];
  quarantinedSignals: string[];
  preservedSignals: string[];
  survivalCriticalSignals: string[];
  frontendHiddenSignals: string[];
  explanation: string;
  warnings: string[];
};

export type StocksPurposeViewModel = {
  mode: "legacy" | "enhanced" | "degraded";
  ambition: number;
  behavioralAmbition: number;
  purposeStatement: string;
  purposeScore: number;
  satisfactionScore: number;
  alignmentTrustScore: number;
  retentionScore: number;
  advocacyScore: number;
  goalProgressScore: number;
  purposeConfidence: number;
  primaryFocus: string;
  explanation: string;
  warnings: string[];
};

export type StocksMeaningViewModel = {
  mode: "legacy" | "enhanced" | "degraded";
  whatYouSeemToWant: string;
  whatThisReallyPointsTo: string;
  saferGoal: string;
  whyAdjusted: string;
  whatWeWillProtect: string[];
  gravityScore: number;
  gravityLabel: string;
  confidence: number;
  warnings: string[];
};

export function createStocksMetricRegistry() {
  const registry = new MetricRegistry();
  const register = (
    key: string,
    label: string,
    description: string,
    layer: Parameters<
      MetricRegistry["register"]
    >[0]["layerMappings"][number]["layer"],
    weight: number,
    unit = "%",
    polarity: "direct" | "inverse" = "direct",
  ) =>
    registry.register({
      key,
      label,
      description,
      unit,
      layerMappings: [{ layer, weight, polarity }],
    });

  register(
    "liquidityStress",
    "Liquidity stress",
    "Execution pressure inferred from risk, sell pressure, and stale data.",
    "survival",
    1.2,
  );
  register(
    "tailRisk",
    "Tail risk",
    "Drawdown pressure and negative breadth risk.",
    "survival",
    1.15,
  );
  register(
    "volatilityExpansion",
    "Volatility expansion",
    "Return dispersion and recent absolute movement.",
    "survival",
    1,
  );
  register(
    "spreadInstability",
    "Spread instability",
    "Execution friction from venue profile and coverage gaps.",
    "survival",
    0.8,
  );
  register(
    "emotionalVelocity",
    "Emotional velocity",
    "Rate of crowd movement across returns and directional imbalance.",
    "emotion",
    1.1,
  );
  register(
    "momentumOverextension",
    "Momentum overextension",
    "Excessive expected moves and stretched quality.",
    "emotion",
    1,
  );
  register(
    "narrativeConcentration",
    "Narrative concentration",
    "How much opportunity is concentrated in a small set of assets.",
    "emotion",
    0.85,
  );
  register(
    "crowdInstability",
    "Crowd instability",
    "Sell pressure, negative breadth, and elevated risk.",
    "emotion",
    1,
  );
  register(
    "signalConsensus",
    "Signal consensus",
    "Dominant agreement among directional signals.",
    "conviction",
    1.15,
  );
  register(
    "signalStability",
    "Signal stability",
    "Low dispersion across setup, timing, and trend quality.",
    "conviction",
    1,
  );
  register(
    "trendStrength",
    "Trend strength",
    "Average trend and setup quality across covered assets.",
    "conviction",
    1.1,
  );
  register(
    "weightedConfidence",
    "Weighted confidence",
    "Blended market and strategy confidence.",
    "conviction",
    0.9,
  );
  register(
    "breadthHealth",
    "Breadth health",
    "Participation and positive breadth across the covered universe.",
    "harmony",
    1.2,
  );
  register(
    "crossAssetAlignment",
    "Cross-asset alignment",
    "Whether returns move coherently without destructive dispersion.",
    "harmony",
    1,
  );
  register(
    "portfolioSymmetry",
    "Portfolio symmetry",
    "Exposure balance and low concentration risk.",
    "harmony",
    0.85,
  );
  register(
    "informationShock",
    "Information shock",
    "Abrupt movement, dispersion, and stale-data penalties.",
    "information",
    0.9,
  );
  register(
    "informationEfficiency",
    "Information efficiency",
    "Quote coverage, signal coverage, and freshness.",
    "information",
    1.15,
  );
  register(
    "volumeConfirmation",
    "Volume confirmation",
    "Data confirmation through live quotes and signal-backed trend.",
    "information",
    0.9,
  );
  register(
    "regimeTransitionProbability",
    "Regime transition probability",
    "Conflict between risk, breadth, trend, and macro posture.",
    "intuition",
    1.15,
  );
  register(
    "anomalyScore",
    "Anomaly score",
    "Extreme moves, failed checks, and dispersion spikes.",
    "intuition",
    1,
  );
  register(
    "latentStructureDetection",
    "Latent structure detection",
    "Emergent structure from stability, alignment, and high-quality clusters.",
    "intuition",
    0.85,
  );
  register(
    "macroPressure",
    "Macro pressure",
    "Risk, drawdown, and low target exposure as environment pressure.",
    "macroContext",
    1.15,
  );
  register(
    "capitalRotation",
    "Capital rotation",
    "Rotation pressure from buy/sell imbalance and return dispersion.",
    "macroContext",
    1,
  );
  register(
    "regimeEnvironment",
    "Regime environment",
    "Longer-cycle favorability inferred from exposure, quality, and risk.",
    "macroContext",
    0.95,
  );
  register(
    "modelConfidence",
    "Model confidence",
    "Strategy readiness and signal confidence.",
    "selfAwareness",
    1.2,
  );
  register(
    "dataReliability",
    "Data reliability",
    "Fresh quotes, signals, and validation evidence.",
    "selfAwareness",
    1.05,
  );
  register(
    "historicalAccuracy",
    "Historical accuracy",
    "How often prior calibrated confidence matched realized outcomes.",
    "selfAwareness",
    0.95,
  );
  register(
    "calibrationQuality",
    "Calibration quality",
    "How closely predicted confidence matches observed accuracy.",
    "selfAwareness",
    1.05,
  );
  register(
    "trustworthiness",
    "Trustworthiness",
    "Evidence-backed confidence after calibration, consistency, and uncertainty checks.",
    "selfAwareness",
    1.05,
  );
  register(
    "memoryDepth",
    "Memory depth",
    "How much evaluated history supports the current confidence estimate.",
    "selfAwareness",
    0.75,
  );
  register(
    "decisionConsistency",
    "Decision consistency",
    "Whether current decisions remain coherent after readiness and calibration gates.",
    "selfAwareness",
    0.8,
  );
  register(
    "outcomeAlignment",
    "Outcome alignment",
    "How well calibrated outcomes align with the current decision posture.",
    "selfAwareness",
    0.8,
  );
  register(
    "overfitRisk",
    "Overfit risk",
    "Residual overfit risk above the production tolerance.",
    "selfAwareness",
    0.9,
    "%",
    "inverse",
  );
  return registry;
}

export function buildStocksOptimizerMetrics(
  input: StocksOptimizerMetricSource,
): MetricInput[] {
  const stocks = Array.isArray(input.stocks) ? input.stocks : [];
  const count = Math.max(1, stocks.length);
  const changes = stocks.map(latestChange);
  const absChanges = changes.map((value) => Math.abs(value));
  const expectedMoves = stocks.map((stock) =>
    numeric(stock.expectedMove, latestChange(stock)),
  );
  const setupQualities = stocks.map((stock) =>
    numeric(stock.setupQuality, input.avgQuality ?? 50),
  );
  const trendQualities = stocks.map((stock) =>
    numeric(stock.trendQuality, input.avgQuality ?? 50),
  );
  const timingQualities = stocks.map((stock) =>
    numeric(stock.timingQuality, input.avgQuality ?? 50),
  );
  const riskPressures = stocks.map((stock) =>
    numeric(stock.riskPressure, input.avgRisk ?? 50),
  );
  const exposures = stocks.map((stock) => numeric(stock.suggestedExposure));
  const historyVolatility = stocks.map((stock) =>
    stdev(historyReturns(stock.history).slice(-30)),
  );
  const avgRisk = numeric(input.avgRisk, mean(riskPressures));
  const avgQuality = numeric(input.avgQuality, mean(setupQualities));
  const confidence = numeric(input.confidence, 50);
  const avgChange = mean(changes);
  const avgAbsChange = mean(absChanges);
  const returnDispersion = stdev(changes);
  const avgVolatility = mean(historyVolatility);
  const positiveRatio = signRatio(changes, "positive");
  const negativeRatio = signRatio(changes, "negative");
  const quoteCoverage =
    (stocks.filter(
      (stock) =>
        stock.quoteStatus === "available" ||
        numeric(stock.price, Number.NaN) > 0,
    ).length /
      count) *
    100;
  const signalCoverage =
    (stocks.filter(
      (stock) =>
        stock.signalStatus === "provided" || Boolean(stock.signalAction),
    ).length /
      count) *
    100;
  const buyRatio =
    stocks.filter(
      (stock) =>
        stock.signalAction === "Buy" || stock.allocationAction === "Buy",
    ).length / count;
  const sellRatio =
    stocks.filter(
      (stock) =>
        stock.signalAction === "Sell" || stock.allocationAction === "Sell",
    ).length / count;
  const holdRatio = Math.max(0, 1 - buyRatio - sellRatio);
  const signalConsensusRatio = Math.max(buyRatio, sellRatio, holdRatio);
  const exposureConcentration = concentrationScore(exposures);
  const qualityDispersion = stdev([
    ...setupQualities,
    ...trendQualities,
    ...timingQualities,
  ]);
  const maxAbsChange = absChanges.length ? Math.max(...absChanges) : 0;
  const spreadBps = numeric(input.executionProfile?.spreadBps, 4);
  const slippageBps = numeric(input.executionProfile?.slippageBps, 2);
  const rebalanceThresholdBps = numeric(
    input.executionProfile?.rebalanceThresholdBps,
    50,
  );
  const drawdown = numeric(input.backtestMaxDrawdownPct, avgRisk / 2);
  const sharpe = numeric(input.backtestSharpe, 0);
  const profitFactor = numeric(input.backtestProfitFactor, 0);
  const winRate = numeric(input.backtestWinRatePct, 0);
  const totalReturn = numeric(input.backtestReturnPct, 0);
  const validationPenalty = input.failureFlags.length * 8;
  const freshnessScore = input.staleData ? 25 : 100;
  const backtestEvidence = input.hasBacktestData
    ? clamp(Math.min(input.backtestTradeCount, 120) / 1.2)
    : 0;
  const fallbackOverfitRisk = clamp(
    100 -
      backtestEvidence * 0.72 +
      validationPenalty +
      (profitFactor > 4 ? 12 : 0) +
      (winRate > 92 ? 10 : 0) +
      (totalReturn === 0 ? 6 : 0),
  );
  const robustnessScore = numeric(
    input.robustnessScore,
    100 - fallbackOverfitRisk,
  );
  const deploymentReadinessScore = numeric(
    input.deploymentReadinessScore,
    robustnessScore,
  );
  const reportedOverfitRisk = numeric(
    input.robustnessOverfitRisk,
    fallbackOverfitRisk,
  );
  const robustnessImpliedRisk = clamp(
    100 - Math.max(robustnessScore, deploymentReadinessScore),
  );
  const diagnosticOverfitRisk = clamp(
    Math.min(reportedOverfitRisk, fallbackOverfitRisk, robustnessImpliedRisk),
  );
  const overfitRiskTolerance = 30;
  const residualOverfitRisk = clamp(
    Math.max(0, diagnosticOverfitRisk - overfitRiskTolerance),
  );
  const favorableRegime = clamp(
    avgQuality * 0.42 + (100 - avgRisk) * 0.34 + input.targetExposure * 0.24,
  );
  const transitionConflict =
    Math.abs(avgRisk - avgQuality) * 0.45 +
    Math.abs(input.breadth - input.targetExposure) * 0.35;
  const dataConfidence = clamp(
    (quoteCoverage + signalCoverage + freshnessScore + backtestEvidence) / 4,
  );
  const calibrationSampleSize = Math.max(
    0,
    numeric(input.calibrationSampleSize, 0),
  );
  const calibrationCoverage = clamp((calibrationSampleSize / 30) * 100);
  const calibrationRawConfidence = numeric(
    input.calibrationRawConfidence,
    confidence,
  );
  const calibrationCalibratedConfidence = numeric(
    input.calibrationCalibratedConfidence,
    calibrationRawConfidence,
  );
  const calibrationHistoricalAccuracy = numeric(
    input.calibrationHistoricalAccuracy,
    input.hasBacktestData ? winRate : 50,
  );
  const calibrationError = numeric(
    input.calibrationError,
    calibrationRawConfidence - calibrationHistoricalAccuracy,
  );
  const calibrationQuality = clamp(100 - Math.abs(calibrationError));
  const calibrationTrustworthiness = numeric(
    input.calibrationTrustworthiness,
    calibrationHistoricalAccuracy * 0.34 +
      calibrationQuality * 0.34 +
      calibrationCoverage * 0.18 +
      (100 - residualOverfitRisk) * 0.14,
  );
  const calibrationDataConfidence =
    calibrationSampleSize >= 12
      ? dataConfidence
      : Math.min(dataConfidence, 40 + calibrationCoverage * 0.5);
  const decisionConsistency = clamp(
    100 -
      validationPenalty -
      residualOverfitRisk * 0.45 -
      Math.max(0, calibrationRawConfidence - calibrationCalibratedConfidence) *
        0.35,
  );
  const outcomeAlignment = clamp(
    calibrationHistoricalAccuracy * 0.62 + calibrationQuality * 0.38,
  );

  return [
    metric(
      "liquidityStress",
      avgRisk * 0.58 +
        (sellRatio * 2800) / 100 +
        (input.staleData ? 12 : 0) +
        (input.marketStatus === "Closed" ? 4 : 0),
      avgRisk,
      `Risk pressure ${pct(avgRisk)}, sell pressure ${pct(sellRatio * 100)}, freshness ${input.staleData ? "stale" : "fresh"}.`,
      dataConfidence,
    ),
    metric(
      "tailRisk",
      drawdown * 2.2 + negativeRatio * 24 + Math.max(0, -avgChange) * 3,
      drawdown,
      `Drawdown ${drawdown.toFixed(1)}%, negative breadth ${pct(negativeRatio * 100)}, average change ${avgChange.toFixed(2)}%.`,
      input.hasBacktestData ? dataConfidence : dataConfidence * 0.72,
    ),
    metric(
      "volatilityExpansion",
      avgVolatility * 12 + returnDispersion * 7 + avgAbsChange * 3,
      avgVolatility.toFixed(2),
      `30-sample volatility ${avgVolatility.toFixed(2)}, dispersion ${returnDispersion.toFixed(2)}, absolute move ${avgAbsChange.toFixed(2)}%.`,
      dataConfidence,
    ),
    metric(
      "spreadInstability",
      (spreadBps + slippageBps) * 5 +
        rebalanceThresholdBps * 0.24 +
        (100 - quoteCoverage) * 0.22,
      `${spreadBps + slippageBps} bps`,
      `Execution cost ${spreadBps + slippageBps} bps, rebalance threshold ${rebalanceThresholdBps} bps, quote coverage ${pct(quoteCoverage)}.`,
      dataConfidence,
    ),
    metric(
      "emotionalVelocity",
      avgAbsChange * 8 +
        returnDispersion * 4 +
        Math.abs(buyRatio - sellRatio) * 24,
      avgAbsChange.toFixed(2),
      `Absolute move ${avgAbsChange.toFixed(2)}%, dispersion ${returnDispersion.toFixed(2)}, buy/sell imbalance ${pct(Math.abs(buyRatio - sellRatio) * 100)}.`,
      dataConfidence,
    ),
    metric(
      "momentumOverextension",
      mean(expectedMoves.map(Math.abs)) * 9 +
        Math.max(0, avgQuality - 75) * 1.4 +
        avgAbsChange * 4,
      mean(expectedMoves.map(Math.abs)).toFixed(2),
      `Expected-move stretch ${mean(expectedMoves.map(Math.abs)).toFixed(2)}%, quality stretch ${Math.max(0, avgQuality - 75).toFixed(1)}.`,
      dataConfidence,
    ),
    metric(
      "narrativeConcentration",
      exposureConcentration * 100 +
        concentrationScore(setupQualities.slice(0, 12)) * 30,
      exposureConcentration.toFixed(2),
      `Exposure concentration ${exposureConcentration.toFixed(2)} across suggested positions.`,
      dataConfidence,
    ),
    metric(
      "crowdInstability",
      sellRatio * 48 + negativeRatio * 35 + avgRisk * 0.25,
      sellRatio * 100,
      `Sell pressure ${pct(sellRatio * 100)}, negative breadth ${pct(negativeRatio * 100)}, risk pressure ${pct(avgRisk)}.`,
      dataConfidence,
    ),
    metric(
      "signalConsensus",
      signalConsensusRatio * 75 + signalCoverage * 0.25,
      signalConsensusRatio * 100,
      `Dominant signal share ${pct(signalConsensusRatio * 100)} with signal coverage ${pct(signalCoverage)}.`,
      dataConfidence,
    ),
    metric(
      "signalStability",
      100 - qualityDispersion * 1.35 - returnDispersion * 1.4,
      qualityDispersion.toFixed(2),
      `Quality dispersion ${qualityDispersion.toFixed(2)} and return dispersion ${returnDispersion.toFixed(2)}.`,
      dataConfidence,
    ),
    metric(
      "trendStrength",
      mean(trendQualities) * 0.62 + avgQuality * 0.38,
      mean(trendQualities),
      `Trend quality ${pct(mean(trendQualities))}, setup quality ${pct(avgQuality)}.`,
      dataConfidence,
    ),
    metric(
      "weightedConfidence",
      confidence * 0.7 + input.survivalScore * 0.3,
      confidence,
      `Live confidence ${pct(confidence)}, strategy reliability ${pct(input.survivalScore)}.`,
      dataConfidence,
    ),
    metric(
      "breadthHealth",
      input.breadth * 0.68 + positiveRatio * 32,
      input.breadth,
      `Participation ${pct(input.breadth)}, positive breadth ${pct(positiveRatio * 100)}.`,
      dataConfidence,
    ),
    metric(
      "crossAssetAlignment",
      positiveRatio * 52 + Math.max(0, 100 - returnDispersion * 8) * 0.48,
      positiveRatio * 100,
      `Positive alignment ${pct(positiveRatio * 100)}, dispersion control ${pct(Math.max(0, 100 - returnDispersion * 8))}.`,
      dataConfidence,
    ),
    metric(
      "portfolioSymmetry",
      100 - exposureConcentration * 120,
      exposureConcentration.toFixed(2),
      `Suggested exposure concentration ${exposureConcentration.toFixed(2)}.`,
      dataConfidence,
    ),
    metric(
      "informationShock",
      avgAbsChange * 10 + returnDispersion * 6 + (input.staleData ? 22 : 0),
      avgAbsChange.toFixed(2),
      `Absolute move ${avgAbsChange.toFixed(2)}%, dispersion ${returnDispersion.toFixed(2)}, freshness ${input.staleData ? "stale" : "fresh"}.`,
      dataConfidence,
    ),
    metric(
      "informationEfficiency",
      quoteCoverage * 0.46 + signalCoverage * 0.3 + freshnessScore * 0.24,
      quoteCoverage,
      `Quote coverage ${pct(quoteCoverage)}, signal coverage ${pct(signalCoverage)}, freshness ${pct(freshnessScore)}.`,
      dataConfidence,
    ),
    metric(
      "volumeConfirmation",
      quoteCoverage * 0.42 +
        signalCoverage * 0.24 +
        mean(trendQualities) * 0.34,
      quoteCoverage,
      `Quote confirmation ${pct(quoteCoverage)}, signal coverage ${pct(signalCoverage)}, trend quality ${pct(mean(trendQualities))}.`,
      dataConfidence,
    ),
    metric(
      "regimeTransitionProbability",
      transitionConflict +
        Math.max(0, avgRisk - input.breadth) * 0.35 +
        returnDispersion * 5,
      transitionConflict.toFixed(2),
      `Risk/quality conflict ${Math.abs(avgRisk - avgQuality).toFixed(1)}, breadth/exposure conflict ${Math.abs(input.breadth - input.targetExposure).toFixed(1)}.`,
      dataConfidence,
    ),
    metric(
      "anomalyScore",
      maxAbsChange * 6 + returnDispersion * 8 + validationPenalty,
      maxAbsChange.toFixed(2),
      `Largest move ${maxAbsChange.toFixed(2)}%, dispersion ${returnDispersion.toFixed(2)}, validation flags ${input.failureFlags.length}.`,
      dataConfidence,
    ),
    metric(
      "latentStructureDetection",
      Math.max(0, 100 - qualityDispersion) * 0.28 +
        positiveRatio * 26 +
        avgQuality * 0.32 +
        signalConsensusRatio * 14,
      avgQuality,
      `Quality coherence ${pct(Math.max(0, 100 - qualityDispersion))}, alignment ${pct(positiveRatio * 100)}, consensus ${pct(signalConsensusRatio * 100)}.`,
      dataConfidence,
    ),
    metric(
      "macroPressure",
      avgRisk * 0.34 +
        (100 - input.targetExposure) * 0.24 +
        drawdown * 1.15 +
        validationPenalty * 0.55,
      avgRisk,
      `Risk ${pct(avgRisk)}, target exposure ${pct(input.targetExposure)}, drawdown ${drawdown.toFixed(1)}%, flags ${input.failureFlags.length}.`,
      dataConfidence,
    ),
    metric(
      "capitalRotation",
      Math.abs(buyRatio - sellRatio) * 45 +
        returnDispersion * 5 +
        exposureConcentration * 28,
      Math.abs(buyRatio - sellRatio) * 100,
      `Buy/sell rotation ${pct(Math.abs(buyRatio - sellRatio) * 100)}, dispersion ${returnDispersion.toFixed(2)}, concentration ${exposureConcentration.toFixed(2)}.`,
      dataConfidence,
    ),
    metric(
      "regimeEnvironment",
      favorableRegime,
      favorableRegime,
      `Environment blend: quality ${pct(avgQuality)}, risk control ${pct(100 - avgRisk)}, target exposure ${pct(input.targetExposure)}.`,
      dataConfidence,
    ),
    metric(
      "modelConfidence",
      input.survivalScore * 0.42 +
        confidence * 0.34 +
        deploymentReadinessScore * 0.16 +
        Math.max(0, sharpe) * 5 -
        validationPenalty * 0.6,
      input.survivalScore,
      `Reliability ${pct(input.survivalScore)}, confidence ${pct(confidence)}, Sharpe ${sharpe.toFixed(2)}, deployment readiness ${pct(deploymentReadinessScore)}, flags ${input.failureFlags.length}.`,
      dataConfidence,
    ),
    metric(
      "dataReliability",
      quoteCoverage * 0.34 +
        signalCoverage * 0.24 +
        freshnessScore * 0.22 +
        backtestEvidence * 0.2,
      quoteCoverage,
      `Quote ${pct(quoteCoverage)}, signal ${pct(signalCoverage)}, freshness ${pct(freshnessScore)}, backtest evidence ${pct(backtestEvidence)}.`,
      dataConfidence,
    ),
    metric(
      "historicalAccuracy",
      calibrationHistoricalAccuracy,
      calibrationHistoricalAccuracy,
      `Historical accuracy ${pct(calibrationHistoricalAccuracy)} from ${Math.round(calibrationSampleSize)} calibrated samples.`,
      calibrationDataConfidence,
    ),
    metric(
      "calibrationQuality",
      calibrationQuality,
      calibrationError,
      `Calibration error ${calibrationError.toFixed(1)} points; raw confidence ${pct(calibrationRawConfidence)}, calibrated confidence ${pct(calibrationCalibratedConfidence)}.`,
      calibrationDataConfidence,
    ),
    metric(
      "trustworthiness",
      calibrationTrustworthiness,
      calibrationTrustworthiness,
      `Trustworthiness ${pct(calibrationTrustworthiness)} after calibration, consistency, and uncertainty checks.`,
      calibrationDataConfidence,
    ),
    metric(
      "memoryDepth",
      calibrationCoverage,
      calibrationSampleSize,
      `Calibration memory contains ${Math.round(calibrationSampleSize)} evaluated samples.`,
      calibrationDataConfidence,
    ),
    metric(
      "decisionConsistency",
      decisionConsistency,
      decisionConsistency,
      "Decision consistency after readiness flags, residual overfit risk, and confidence calibration.",
      dataConfidence,
    ),
    metric(
      "outcomeAlignment",
      outcomeAlignment,
      outcomeAlignment,
      `Outcome alignment combines historical accuracy ${pct(calibrationHistoricalAccuracy)} and calibration quality ${pct(calibrationQuality)}.`,
      calibrationDataConfidence,
    ),
    metric(
      "overfitRisk",
      residualOverfitRisk,
      residualOverfitRisk,
      `Residual risk ${pct(residualOverfitRisk)} after ${pct(overfitRiskTolerance)} production tolerance. Diagnostic risk ${pct(diagnosticOverfitRisk)}; reported risk ${pct(reportedOverfitRisk)}, trades ${input.backtestTradeCount}, flags ${input.failureFlags.length}, profit factor ${profitFactor.toFixed(2)}, win rate ${winRate.toFixed(1)}%, robustness ${pct(robustnessScore)}.`,
      dataConfidence,
    ),
  ];
}

export function buildStocksSynchronization(
  input: StocksOptimizerMetricSource,
): SynchronizationInput {
  const quoteAgeMs = input.staleData ? 15 * 60_000 : 10_000;
  const spreadBps =
    numeric(input.executionProfile?.spreadBps, 4) +
    numeric(input.executionProfile?.slippageBps, 2);
  const venueState: VenueState = input.staleData
    ? "STALE"
    : input.marketStatus === "Closed"
      ? "CLOSED"
      : "OPEN";
  return {
    venueState,
    quoteAgeMs,
    websocketLatencyMs: input.staleData ? 900 : 120,
    candleIntegrity: input.hasProvidedSignals ? 92 : 76,
    missingIntervals: input.staleData ? 2 : 0,
    staleTimestamps: input.staleData ? 1 : 0,
    spreadBps,
    liquidityScore: clamp(100 - spreadBps * 4),
  };
}

export function buildStocksLeadershipObservations(
  stocks: Array<Record<string, any>>,
  timestamp = Date.now(),
): ObservationPoint[] {
  return stocks.flatMap((stock) => {
    const id = String(stock.ticker ?? stock.symbol ?? stock.name ?? "unknown");
    const history = Array.isArray(stock.history)
      ? stock.history.slice(-20)
      : [numeric(stock.price, 0)];
    return history.map((value, index) => ({
      id,
      timestamp: timestamp - (history.length - index) * 60_000,
      value: numeric(value),
      dimensions: {
        volumeExpansion: numeric(stock.volumeExpansion, 50),
        liquidityQuality: stock.quoteStatus === "available" ? 82 : 48,
        breadthParticipation: numeric(stock.setupQuality, 50),
        sectorSynchronization: numeric(stock.trendQuality, 50),
      },
    }));
  });
}

export function buildStocksPruningInput(
  input: StocksOptimizerMetricSource,
  options: {
    now?: string | number | Date;
    meaning?: Partial<MeaningResult> | null;
  } = {},
): PruningInput {
  const stocks = Array.isArray(input.stocks) ? input.stocks : [];
  const meaning =
    options.meaning === undefined
      ? evaluateStocksMeaning(input)
      : options.meaning;
  const actionCounts = stocks.reduce<Record<string, number>>(
    (counts, stock) => {
      const action = String(
        stock.signalAction ?? stock.allocationAction ?? "Hold",
      );
      counts[action] = (counts[action] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const candidates: PruningCandidateInput[] = [
    ...stocks.map((stock) => stockPruningCandidate(stock, input, actionCounts)),
    ...dashboardMetricPruningCandidates(input),
  ];

  return {
    now: options.now ?? input.now ?? "1970-01-01T00:00:00.000Z",
    meaning,
    candidates,
  };
}

export function evaluateStocksPruning(
  input: StocksOptimizerMetricSource,
  options: {
    now?: string | number | Date;
    meaning?: Partial<MeaningResult> | null;
  } = {},
): PruningResult {
  return evaluatePruning(buildStocksPruningInput(input, options));
}

export function evaluateStocksMeaning(
  input: StocksOptimizerMetricSource,
): MeaningResult | null {
  if (
    input.meaning &&
    typeof input.meaning === "object" &&
    input.meaning.module === "meaning"
  ) {
    return input.meaning as MeaningResult;
  }
  const text = String(input.meaningText ?? "").trim();
  if (!text) return null;
  return evaluateMeaning({
    text,
    context: {
      domain: "stocks-optimizer",
      currentGoal: "sustainable market progress",
      safetyConstraints: [
        "Protect risk of ruin before optimizing return.",
        "Do not let revenge, panic recovery, or speed pressure increase exposure.",
      ],
    },
  });
}

export function buildStocksPurposeInput(
  input: StocksOptimizerMetricSource,
  options: {
    now?: string | number | Date;
    pruning?: Partial<PruningResult> | null;
    meaning?: Partial<MeaningResult> | null;
  } = {},
): PurposeInput {
  const stocks = Array.isArray(input.stocks) ? input.stocks : [];
  const avgRisk = numeric(input.avgRisk, 50);
  const avgQuality = numeric(input.avgQuality, 50);
  const confidence = numeric(input.confidence, 50);
  const survivalScore = numeric(input.survivalScore, confidence);
  const calibrationTrust = numeric(
    input.calibrationTrustworthiness,
    survivalScore,
  );
  const calibrationAccuracy = numeric(
    input.calibrationHistoricalAccuracy,
    calibrationTrust,
  );
  const calibrationError = Math.abs(
    numeric(input.calibrationError, confidence - calibrationAccuracy),
  );
  const maxDrawdown = numeric(input.backtestMaxDrawdownPct, avgRisk / 2);
  const buyCount = stocks.filter(
    (stock) => stock.signalAction === "Buy" || stock.allocationAction === "Buy",
  ).length;
  const sellCount = stocks.filter(
    (stock) =>
      stock.signalAction === "Sell" || stock.allocationAction === "Sell",
  ).length;
  const actionCount = Math.max(1, buyCount + sellCount);
  const reversalPressure = sellCount / actionCount > 0.55;
  const ambition = score(input.ambition, 50);
  const meaning =
    options.meaning === undefined
      ? evaluateStocksMeaning(input)
      : options.meaning;
  const meaningSafetyPriority = numeric(
    meaning?.purposeInputs?.safetyPriority,
    55,
  );
  const meaningUnsafe = Boolean(meaning?.purposeInputs?.literalDesireUnsafe);
  const meaningSurvivalCap = meaningUnsafe
    ? clamp(95 - Math.max(0, -numeric(meaning?.gravityScore, 0)) * 5)
    : 100;
  const derivedBehavior: PurposeBehaviorObservation = {
    ambitionSignal: clamp(input.targetExposure * 1.35 + confidence * 0.35),
    patience: clamp(100 - avgRisk * 0.55 - (input.staleData ? 12 : 0)),
    discipline: clamp(calibrationTrust * 0.64 + survivalScore * 0.36),
    consistency: clamp(numeric(input.deploymentReadinessScore, survivalScore)),
    recovery: survivalScore,
    conviction: confidence,
    adaptation: clamp(input.breadth * 0.55 + avgQuality * 0.45),
    stressTolerance: clamp(100 - avgRisk - maxDrawdown * 0.6),
    confidenceCalibration: clamp(100 - calibrationError),
    panicExit: input.failureFlags.some((flag) =>
      /panic|kill|drift|blocked/i.test(flag),
    ),
    regret: clamp(maxDrawdown * 1.8 + calibrationError * 0.7),
    reversal: reversalPressure,
    sustainedProgress:
      numeric(input.backtestReturnPct, 0) > 0 && survivalScore >= 55,
    timestamp: options.now ?? input.now,
  };
  const derivedExpectation: PurposeExpectationRecord = {
    expectedExperience: confidence,
    expectedOutcome: numeric(input.backtestReturnPct, avgQuality),
    actualExperience: clamp(100 - avgRisk),
    actualOutcome: calibrationAccuracy,
    disappointment: clamp(
      Math.max(0, calibrationError - 8) +
        Math.max(0, -numeric(input.backtestReturnPct, 0)),
    ),
    surprise: clamp(input.staleData ? 35 : calibrationError),
    regret: derivedBehavior.regret,
    confidenceShock: clamp(
      Math.max(
        0,
        numeric(input.calibrationRawConfidence, confidence) -
          numeric(input.calibrationCalibratedConfidence, confidence),
      ),
    ),
    expectationShock: clamp(calibrationError),
    progress: clamp(
      avgQuality * 0.36 +
        confidence * 0.24 +
        Math.max(0, numeric(input.backtestReturnPct, 0)) * 0.8 +
        input.breadth * 0.2,
    ),
    timestamp: options.now ?? input.now,
  };
  const derivedFriction: PurposeFrictionRecord = {
    complexity: clamp(
      Math.min(100, stocks.length / 2) + input.failureFlags.length * 8,
    ),
    mentalEffort: clamp(
      input.failureFlags.length * 12 + (input.staleData ? 24 : 8),
    ),
    attentionRequired: clamp(
      Math.max(0, avgRisk - 45) +
        Math.abs(input.targetExposure - input.breadth) * 0.4,
    ),
    interactionBurden: clamp(
      input.partialApiFailures ? input.partialApiFailures * 14 : 10,
    ),
    cognitiveLoad: clamp(
      (input.hasBacktestData ? 18 : 42) + input.failureFlags.length * 6,
    ),
    clarity: clamp(
      100 - input.failureFlags.length * 12 - (input.staleData ? 24 : 0),
    ),
    simplicity: clamp(
      92 - stocks.length * 0.4 - input.failureFlags.length * 10,
    ),
    timestamp: options.now ?? input.now,
  };

  return {
    ambition,
    behavior: [derivedBehavior, ...safeArray(input.behavioralEvents)],
    expectations: [derivedExpectation, ...safeArray(input.expectationRecords)],
    friction: [derivedFriction, ...safeArray(input.frictionRecords)],
    currentPath: {
      desiredFuture: meaning?.transformedGoal ?? "sustainable market progress",
      alignment: clamp(
        avgQuality * 0.34 +
          confidence * 0.28 +
          input.breadth * 0.2 +
          survivalScore * 0.18,
      ),
      progress: derivedExpectation.progress,
      survivability: Math.min(survivalScore, meaningSurvivalCap),
      sustainability: clamp(
        survivalScore * 0.46 +
          (100 - avgRisk) * 0.22 +
          calibrationTrust * 0.18 +
          meaningSafetyPriority * 0.14,
      ),
      behaviorFit: clamp(
        calibrationTrust * 0.42 + survivalScore * 0.32 + (100 - avgRisk) * 0.26,
      ),
      clarity: derivedFriction.clarity,
      usefulness: clamp(
        avgQuality * 0.34 +
          confidence * 0.28 +
          input.breadth * 0.22 +
          survivalScore * 0.16,
      ),
      evidenceQuality: input.hasProvidedSignals
        ? input.hasBacktestData
          ? 82
          : 64
        : 42,
    },
    decision: {
      action: input.targetExposure > 0 ? "participate" : "wait",
      confidence,
      expectedReturn: numeric(input.backtestReturnPct, 0),
      expectedValue: clamp(
        avgQuality * 0.5 + confidence * 0.3 + input.targetExposure * 0.2,
      ),
      alignment: clamp(
        avgQuality * 0.34 +
          confidence * 0.28 +
          input.breadth * 0.2 +
          survivalScore * 0.18,
      ),
      survivability: Math.min(survivalScore, meaningSurvivalCap),
      priority: clamp(
        input.targetExposure * 1.2 +
          confidence * 0.35 +
          numeric(meaning?.purposeInputs?.ambitionAdjustment, 0) * 0.2,
      ),
      friction: 100 - numeric(derivedFriction.simplicity, 0),
      uncertainty: 100 - confidence,
    },
    survivalScore,
    pruning: options.pruning,
    meaning,
    evidenceQuality: input.hasProvidedSignals
      ? input.hasBacktestData
        ? 84
        : 62
      : 40,
    now: options.now ?? input.now,
  };
}

export function evaluateStocksPurpose(
  input: StocksOptimizerMetricSource,
  options: {
    now?: string | number | Date;
    pruning?: Partial<PruningResult> | null;
    meaning?: Partial<MeaningResult> | null;
  } = {},
): PurposeResult {
  const meaning =
    options.meaning === undefined
      ? evaluateStocksMeaning(input)
      : options.meaning;
  const pruning =
    options.pruning === undefined
      ? evaluateStocksPruning(input, { ...options, meaning })
      : options.pruning;
  return evaluatePurpose(
    buildStocksPurposeInput(input, { ...options, pruning, meaning }),
  );
}

export function buildStocksPurposeViewModel(
  purpose?: Partial<PurposeResult> | null,
): StocksPurposeViewModel {
  if (!purpose) {
    return {
      mode: "legacy",
      ambition: 50,
      behavioralAmbition: 50,
      purposeStatement:
        "I am willing to sacrifice unnecessary urgency to achieve meaningful progress within a steady adaptive pace while respecting survivability.",
      purposeScore: 0,
      satisfactionScore: 0,
      alignmentTrustScore: 0,
      retentionScore: 0,
      advocacyScore: 0,
      goalProgressScore: 0,
      purposeConfidence: 0,
      primaryFocus: "Building momentum",
      explanation:
        "Purpose is not available yet. Existing dashboard data remains usable.",
      warnings: [],
    };
  }

  return {
    mode: numeric(purpose.purposeConfidence, 0) < 45 ? "degraded" : "enhanced",
    ambition: clamp(numeric(purpose.ambition, 50)),
    behavioralAmbition: clamp(
      numeric(purpose.behavioralAmbition, purpose.ambition ?? 50),
    ),
    purposeStatement: String(
      purpose.purposeStatement ?? "Purpose statement is being calibrated.",
    ),
    purposeScore: clamp(numeric(purpose.purposeScore, 0)),
    satisfactionScore: clamp(numeric(purpose.satisfactionScore, 0)),
    alignmentTrustScore: clamp(numeric(purpose.alignmentTrustScore, 0)),
    retentionScore: clamp(numeric(purpose.retentionScore, 0)),
    advocacyScore: clamp(numeric(purpose.advocacyScore, 0)),
    goalProgressScore: clamp(numeric(purpose.goalProgressScore, 0)),
    purposeConfidence: clamp(numeric(purpose.purposeConfidence, 0)),
    primaryFocus: focusForPurpose(purpose),
    explanation: String(
      purpose.explanation ??
        "Purpose reviewed ambition, behavior, progress, trust, and sustainability.",
    ),
    warnings: safeStringArray(purpose.warnings),
  };
}

export function buildStocksMeaningViewModel(
  meaning?: Partial<MeaningResult> | null,
): StocksMeaningViewModel {
  if (!meaning) {
    return {
      mode: "legacy",
      whatYouSeemToWant: "No goal text yet",
      whatThisReallyPointsTo: "Purpose will use the existing market posture.",
      saferGoal: "Keep progress sustainable while protecting survival.",
      whyAdjusted: "Nothing was adjusted because no goal text was supplied.",
      whatWeWillProtect: [
        "Risk of ruin",
        "Recovery capacity",
        "Decision clarity",
      ],
      gravityScore: 0,
      gravityLabel: "neutral",
      confidence: 0,
      warnings: [],
    };
  }

  const confidence = clamp(numeric(meaning.needConfidence, 0) * 100);
  const adjusted =
    numeric(meaning.gravityScore, 0) < 0 ||
    meaning.purposeInputs?.literalDesireUnsafe;
  return {
    mode: confidence < 45 ? "degraded" : "enhanced",
    whatYouSeemToWant: String(meaning.surfaceDesire ?? "Clarify the goal."),
    whatThisReallyPointsTo: meaning.primaryNeed
      ? `A need for ${meaningNeedPhrase(meaning)}.`
      : "A need for sustainable progress.",
    saferGoal: String(
      meaning.transformedGoal ??
        meaning.positiveGoal ??
        "Keep progress sustainable while protecting survival.",
    ),
    whyAdjusted: adjusted
      ? "We adjusted the literal desire because the direct path could weaken safety or recovery."
      : "The goal is already constructive, so we kept it and added normal guardrails.",
    whatWeWillProtect: safeStringArray(meaning.safetyConstraints).slice(0, 4),
    gravityScore: numeric(meaning.gravityScore, 0),
    gravityLabel: String(meaning.gravityLabel ?? "neutral"),
    confidence,
    warnings: safeStringArray(meaning.riskWarnings),
  };
}

export function buildStocksPruningViewModel(
  pruning?: Partial<PruningResult> | null,
): StocksPruningViewModel {
  if (!pruning) {
    return {
      mode: "legacy",
      pruningScore: 0,
      ignoranceEffectivenessScore: 0,
      recommendedAction: "keep",
      ignoredSignals: [],
      reducedSignals: [],
      quarantinedSignals: [],
      preservedSignals: [],
      survivalCriticalSignals: [],
      frontendHiddenSignals: [],
      explanation:
        "Pruning is not available yet. Existing dashboard data remains usable.",
      warnings: [],
    };
  }

  return {
    mode: pruning.degradedMode ? "degraded" : "enhanced",
    pruningScore: clamp(numeric(pruning.pruningScore, 0)),
    ignoranceEffectivenessScore: clamp(
      numeric(pruning.ignoranceEffectivenessScore, 0),
    ),
    recommendedAction: String(pruning.recommendedAction ?? "review"),
    ignoredSignals: safeStringArray(pruning.ignoredSignals),
    reducedSignals: safeStringArray(pruning.reducedSignals),
    quarantinedSignals: safeStringArray(pruning.quarantinedSignals),
    preservedSignals: safeStringArray(pruning.preservedSignals),
    survivalCriticalSignals: safeStringArray(pruning.survivalCriticalSignals),
    frontendHiddenSignals: safeStringArray(pruning.frontendHiddenSignals),
    explanation: String(
      pruning.explanation ?? "Pruning reviewed signal quality.",
    ),
    warnings: safeStringArray(pruning.warnings),
  };
}

export function adjustStocksExposureForPruning(
  suggestedExposure: number,
  pruning?: Partial<PruningResult> | null,
) {
  const exposure = clamp(suggestedExposure);
  if (!pruning) return exposure;
  if (
    pruning.recommendedAction === "ignore" ||
    pruning.recommendedAction === "quarantine"
  )
    return 0;
  if (
    pruning.recommendedAction === "review" ||
    pruning.recommendedAction === "isolate"
  )
    return Math.min(exposure, 25);
  if (pruning.recommendedAction === "reduce")
    return Math.min(exposure, exposure * 0.5);
  return exposure;
}

export function adjustStocksExposureForMeaning(
  suggestedExposure: number,
  meaning?: Partial<MeaningResult> | null,
) {
  const exposure = clamp(suggestedExposure);
  if (!meaning) return exposure;
  const action = meaning.purposeInputs?.actionPermission;
  if (action === "block") return 0;
  if (action === "review") return Math.min(exposure, 20);
  if (action === "reduce") return Math.min(exposure, exposure * 0.5);
  if (numeric(meaning.gravityScore, 0) <= -5)
    return Math.min(exposure, exposure * 0.65);
  return exposure;
}

function focusForPurpose(purpose: Partial<PurposeResult>) {
  if (numeric(purpose.survivabilityScore, 100) < 55)
    return "Protecting progress";
  if (numeric(purpose.frictionScore, 100) < 55) return "Reducing stress";
  if (
    numeric(purpose.behavioralAmbition, 50) + 18 <
    numeric(purpose.ambition, 50)
  )
    return "Staying disciplined";
  if (numeric(purpose.goalProgressScore, 0) >= 72) return "Building momentum";
  if (numeric(purpose.purposeProfile?.opportunityPreference, 0) >= 72)
    return "Pursuing growth";
  return "Preserving flexibility";
}

function meaningNeedPhrase(meaning: Partial<MeaningResult>) {
  const needs = [
    meaning.primaryNeed,
    ...safeStringArray(meaning.secondaryNeeds),
  ].filter(Boolean);
  if (!needs.length) return "sustainable progress";
  if (needs.length === 1) return String(needs[0]);
  if (needs.length === 2) return `${needs[0]} and ${needs[1]}`;
  return `${needs.slice(0, -1).join(", ")}, and ${needs[needs.length - 1]}`;
}

function score(value: unknown, fallback = 0) {
  return clamp(numeric(value, fallback));
}

function stockPruningCandidate(
  stock: Record<string, any>,
  input: StocksOptimizerMetricSource,
  actionCounts: Record<string, number>,
): PruningCandidateInput {
  const id = String(stock.ticker ?? stock.symbol ?? stock.name ?? "unknown");
  const action = String(stock.signalAction ?? stock.allocationAction ?? "Hold");
  const setupQuality = numeric(stock.setupQuality, input.avgQuality ?? 50);
  const trendQuality = numeric(stock.trendQuality, input.avgQuality ?? 50);
  const timingQuality = numeric(stock.timingQuality, input.avgQuality ?? 50);
  const riskPressure = numeric(stock.riskPressure, input.avgRisk ?? 50);
  const expectedMove = numeric(stock.expectedMove, latestChange(stock));
  const historyVolatility = stdev(historyReturns(stock.history).slice(-30));
  const evidenceQuality = mean([
    stock.quoteStatus === "available" ? 95 : 35,
    stock.signalStatus === "provided" || stock.signalAction ? 90 : 35,
    input.hasBacktestData ? Math.min(100, input.backtestTradeCount * 1.2) : 30,
  ]);
  const winRate = numeric(input.backtestWinRatePct, 50);
  const overfitRisk = numeric(
    input.robustnessOverfitRisk,
    Math.max(0, 100 - numeric(input.robustnessScore, 65)) +
      (numeric(input.backtestProfitFactor, 0) > 4 ? 15 : 0) +
      (winRate > 90 ? 12 : 0),
  );
  const useful = mean([
    setupQuality,
    trendQuality,
    timingQuality,
    Math.min(100, Math.abs(expectedMove) * 18),
  ]);
  const duplicateActionCount = Math.max(0, (actionCounts[action] ?? 1) - 1);
  const survivalValue =
    action === "Sell" || action === "Blocked" || riskPressure >= 75
      ? Math.max(input.survivalScore, riskPressure)
      : input.survivalScore * 0.48;

  return {
    candidateId: id,
    candidateType: "raw-signal",
    sourceModule: "stocks-optimizer",
    currentWeight: numeric(stock.suggestedExposure, 0) * 10,
    historicalUtility: useful,
    predictiveContribution: Math.min(
      100,
      Math.abs(expectedMove) * 18 + trendQuality * 0.5,
    ),
    decisionContribution: Math.min(
      100,
      numeric(stock.suggestedExposure, 0) * 12 + setupQuality * 0.35,
    ),
    redundancyScore: Math.min(100, duplicateActionCount * 24),
    noiseScore: clamp(
      riskPressure * 0.48 + historyVolatility * 8 + (input.staleData ? 28 : 0),
    ),
    volatilitySensitivity: clamp(
      historyVolatility * 12 + Math.abs(expectedMove) * 4,
    ),
    regimeStability: clamp(
      mean([
        numeric(input.avgQuality, 50),
        100 - numeric(input.avgRisk, 50),
        input.breadth,
      ]),
    ),
    evidenceQuality,
    sampleSize: input.backtestTradeCount,
    staleDataRisk: input.staleData ? 85 : 0,
    contradictionRate:
      action === "Buy" && riskPressure >= 70
        ? 75
        : action === "Sell" && setupQuality >= 75
          ? 60
          : 0,
    falsePositiveRate: clamp(100 - winRate),
    falseNegativeRate: clamp(100 - winRate),
    complexityCost: 22,
    maintenanceCost: 14,
    latencyCost:
      numeric(input.executionProfile?.spreadBps, 0) +
      numeric(input.executionProfile?.slippageBps, 0),
    userClarityCost:
      action === "Hold" && Math.abs(expectedMove) < 0.5 ? 62 : 24,
    overfitRisk,
    explainabilityValue: stock.signalReason || stock.explanation ? 80 : 45,
    survivalValue,
    recentOutcomeImpact: numeric(stock.recentOutcomeImpact, 0),
    counterfactualImpact: numeric(stock.counterfactualImpact, 0),
    governanceFlags: survivalValue >= 80 ? ["survival-critical"] : [],
    selfModelWarnings: input.calibrationWarnings,
    confidenceImpact: numeric(input.confidence, 50) - 50,
    trustImpact:
      numeric(input.calibrationTrustworthiness, input.survivalScore) - 50,
    uncertainty: 100 - numeric(input.confidence, 50),
    timestamp: input.now,
    metadata: { action },
  };
}

function dashboardMetricPruningCandidates(
  input: StocksOptimizerMetricSource,
): PruningCandidateInput[] {
  const staleRisk = input.staleData ? 85 : 0;
  return [
    {
      candidateId: "dashboard:backtest-summary",
      candidateType: "frontend-insight",
      sourceModule: "stocks-optimizer",
      currentWeight: 50,
      historicalUtility: input.hasBacktestData ? 68 : 20,
      predictiveContribution: input.hasBacktestData ? 62 : 15,
      decisionContribution: input.hasBacktestData ? 56 : 10,
      redundancyScore: input.hasBacktestData ? 35 : 0,
      noiseScore: input.hasBacktestData ? 20 : 70,
      volatilitySensitivity: 20,
      regimeStability: numeric(input.robustnessScore, 50),
      evidenceQuality: input.hasBacktestData
        ? Math.min(100, input.backtestTradeCount * 1.2)
        : 20,
      sampleSize: input.backtestTradeCount,
      staleDataRisk: staleRisk,
      contradictionRate: numeric(input.robustnessOverfitRisk, 0) >= 70 ? 65 : 0,
      falsePositiveRate: clamp(100 - numeric(input.backtestWinRatePct, 50)),
      falseNegativeRate: clamp(100 - numeric(input.backtestWinRatePct, 50)),
      complexityCost: 46,
      maintenanceCost: 30,
      latencyCost: 0,
      userClarityCost: 68,
      overfitRisk: numeric(
        input.robustnessOverfitRisk,
        100 - numeric(input.robustnessScore, 50),
      ),
      explainabilityValue: 62,
      survivalValue: 35,
      recentOutcomeImpact: 0,
      counterfactualImpact: 0,
      confidenceImpact: numeric(input.confidence, 50) - 50,
      trustImpact:
        numeric(input.calibrationTrustworthiness, input.survivalScore) - 50,
      uncertainty: 100 - numeric(input.confidence, 50),
      timestamp: input.now,
    },
    {
      candidateId: "dashboard:survival-warning",
      candidateType: "frontend-insight",
      sourceModule: "stocks-optimizer",
      currentWeight: 100,
      historicalUtility: input.survivalScore,
      predictiveContribution: input.survivalScore,
      decisionContribution: Math.max(
        input.survivalScore,
        numeric(input.avgRisk, 50),
      ),
      redundancyScore: 0,
      noiseScore: 100 - input.survivalScore,
      volatilitySensitivity: numeric(input.avgRisk, 50),
      regimeStability: 100 - numeric(input.avgRisk, 50),
      evidenceQuality: input.hasProvidedSignals ? 80 : 45,
      sampleSize: input.expectedAssetCount ?? input.stocks.length,
      staleDataRisk: staleRisk,
      contradictionRate: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      complexityCost: 18,
      maintenanceCost: 8,
      latencyCost: 0,
      userClarityCost: 10,
      overfitRisk: 0,
      explainabilityValue: 90,
      survivalValue: Math.max(85, input.survivalScore),
      recentOutcomeImpact: 0,
      counterfactualImpact: 35,
      governanceFlags: ["survival-critical", "frontend-primary"],
      selfModelWarnings: input.failureFlags,
      confidenceImpact: 0,
      trustImpact: input.survivalScore - 50,
      uncertainty: input.staleData ? 55 : 15,
      timestamp: input.now,
    },
  ];
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function safeArray<T>(value: T[] | readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

function historyReturns(history: unknown) {
  if (!Array.isArray(history) || history.length < 2) return [];
  const returns: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = numeric(history[index - 1], Number.NaN);
    const current = numeric(history[index], Number.NaN);
    if (previous > 0 && current > 0)
      returns.push(((current - previous) / previous) * 100);
  }
  return returns;
}

function latestChange(stock: Record<string, any>) {
  const explicit = numeric(stock.changePercent, Number.NaN);
  if (Number.isFinite(explicit)) return explicit;
  const returns = historyReturns(stock.history);
  return returns.length ? returns[returns.length - 1] : 0;
}

function concentrationScore(values: number[]) {
  const positives = values
    .map((value) => Math.max(0, numeric(value)))
    .filter((value) => value > 0);
  const total = positives.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  return positives.reduce((sum, value) => sum + (value / total) ** 2, 0);
}

function pct(value: number) {
  return `${clamp(value).toFixed(0)}%`;
}

function metric(
  key: string,
  value: number,
  raw: number | string | null,
  detail: string,
  confidence = 100,
  unit?: string,
): MetricInput {
  return {
    key,
    value: clamp(value),
    raw,
    unit,
    confidence: clamp(confidence),
    detail,
  };
}
