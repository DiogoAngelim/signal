import type {
  JudgementResult,
  SizingConstraint,
  SizingMode,
  SizingResult,
  ViabilityResult,
  ViabilityVerdict,
} from "../../../signal-framework";
import {
  calibrate,
  type CalibrationInput,
  type CalibrationResult,
} from "../../../signal-framework/calibration/engine";
import {
  planReadinessRemediation,
  type ReadinessRemediationPlan,
} from "../../../signal-framework/readiness-remediation/engine";
import {
  evaluateRecovery,
  type RecoveryResult,
} from "../../../signal-framework/recovery/engine";
import {
  evaluateTrustGovernor,
  type TrustGovernorResult,
} from "../../../signal-framework/trust/engine";
import {
  evaluateTradeCandidateBelief,
  type TradeBeliefDiagnostic,
} from "./belief-adapter";
import {
  buildStockExecutiveArchitecture,
  type StockExecutiveArchitecture,
} from "./executive-signal-adapter";
import { sizeFinancialExposure, type FinancialExposureViabilityInput } from "./financial-sizing";
import {
  evaluateStockJudgement,
  judgementExposureGate,
  judgementTrustForAgency,
} from "./stock-judgement";
import {
  buildStockSurvivalMemory,
  type StockSurvivalMemoryDiagnostic,
} from "./survival-memory-adapter";

export type StrategyReadinessStage =
  | "Research only"
  | "Shadow test"
  | "Paper trade"
  | "Limited live"
  | "Production eligible";

export type StrategyReadinessComponent = {
  score: number;
  passed: boolean;
  reasons: string[];
};

export type StrategyReadinessResult = {
  stage: StrategyReadinessStage;
  blocked: boolean;
  productionEligible: boolean;
  readinessScore: number;
  maxConfidence: number;
  rawConfidence: number;
  calibratedConfidence: number;
  trustworthiness: number;
  trustGovernor: TrustGovernorResult;
  recovery: RecoveryResult;
  readinessRemediation: ReadinessRemediationPlan;
  participationMode: TrustGovernorResult["participationMode"];
  participationBlocked: boolean;
  calibration: CalibrationResult & {
    status: "trusted" | "insufficient-history" | "poor-calibration" | "unstable-outcomes";
    explanation: string;
  };
  maxPositionPct: number;
  failureFlags: string[];
  reasons: string[];
  components: {
    dataReliability: StrategyReadinessComponent;
    modelConfidence: StrategyReadinessComponent;
    strategyEdge: StrategyReadinessComponent;
    benchmarkEdge: StrategyReadinessComponent;
    riskControl: StrategyReadinessComponent;
    walkForwardRobustness: StrategyReadinessComponent;
    liveSignalConsistency: StrategyReadinessComponent;
    robustness: StrategyReadinessComponent;
    parameterRobustness: StrategyReadinessComponent;
    concentrationControl: StrategyReadinessComponent;
  };
  benchmarks: {
    strategyReturnPct: number;
    equalWeightReturnPct: number;
    buyHoldReturnPct: number;
    cashReturnPct: number;
    bestBaselineReturnPct: number;
    costPenaltyPct: number;
    excessReturnAfterCostsPct: number;
    safetyMarginPct: number;
    passed: boolean;
  };
  walkForward: {
    segmentCount: number;
    positiveSegmentCount: number;
    weakestPeriod: { index: number; returnPct: number } | null;
    bestPeriodContributionPct: number;
    effectivePositiveSegmentCount?: number;
    stable: boolean;
  };
  parameterStability: {
    stable: boolean;
    passRate: number;
    benchmarkSurvivalRate: number;
    variantCount: number;
    variants: any[];
  };
  concentration: {
    top1TradeContributionPct: number;
    top5TradeContributionPct: number;
    bestPeriodContributionPct: number;
    medianTradeReturnPct: number;
    returnSkew: number;
    outlierDependent: boolean;
  };
  robustnessDiagnostics?: any;
  survivalMemory?: StockSurvivalMemoryDiagnostic;
};

type StrategyReadinessInput = {
  market?: string;
  summary?: Record<string, any>;
  trades?: any[];
  walkForwardSegments?: any[];
  parameterRobustness?: any;
  dataQualityReport?: any;
  forwardShadow?: any;
  config?: any;
  robustnessDiagnostics?: any;
  survivalMemory?: StockSurvivalMemoryDiagnostic;
};

export type StrategySignalInput = {
  readiness: StrategyReadinessResult;
  symbol?: string;
  market?: string;
  rawAction: string;
  expectedEdgePct: number;
  rawSuggestedExposurePct: number;
  setupQuality: number;
  riskPressure: number;
  volatilityPct: number;
  liquidityScore?: number;
  signalConfidence: number;
  previousTrades?: any[];
  strategyHistory?: any[];
  forwardShadow?: any;
  opportunityCandidates?: any[];
  agencyResult?: any;
  survivalMemory?: StockSurvivalMemoryDiagnostic | null;
};

export type StrategySignalDecision = {
  signalAction: "Buy" | "Hold" | "Sell";
  allocationAction: "Buy" | "Hold" | "Sell" | "Watch" | "Blocked";
  signalStatus: "confirmed" | "provided" | "watch" | "blocked" | "risk-exit";
  suggestedExposure: number;
  maxPositionPct: number;
  signalConfidence: number;
  rawConfidence: number;
  calibratedConfidence: number;
  trustworthiness: number;
  calibrationWarnings: string[];
  judgement?: JudgementResult;
  belief: TradeBeliefDiagnostic;
  rejectionReason: string | null;
  sizingMode: SizingMode;
  sizingReasons: string[];
  sizingConstraints: SizingConstraint[];
  sizingResult: SizingResult;
  trustGovernor?: TrustGovernorResult;
  recovery?: RecoveryResult;
  executionQuality?: StockExecutiveArchitecture["executionQuality"];
  counterfactual?: StockExecutiveArchitecture["counterfactual"];
  discoveryAccountability?: StockExecutiveArchitecture["discoveryAccountability"];
  discoveryIntelligence?: StockExecutiveArchitecture["discoveryIntelligence"];
  wisdom?: StockExecutiveArchitecture["wisdom"];
  executiveDecision?: StockExecutiveArchitecture["executiveDecision"];
  decisionStates?: StockExecutiveArchitecture["decisionStates"];
  viabilityVerdict?: ViabilityVerdict;
  viabilityReason?: string;
  viabilityWarnings?: string[];
  viabilityBlockers?: string[];
  viabilityMarginOfSafety?: number;
  viabilityResult?: ViabilityResult;
  survivalMemory?: StockSurvivalMemoryDiagnostic;
  sizingDiagnostics: {
    volatilityMultiplier: number;
    drawdownMultiplier: number;
    liquidityMultiplier: number;
    confidenceMultiplier: number;
    benchmarkMultiplier: number;
    liveSignalMultiplier: number;
  };
};

const PRODUCTION_STAGES: StrategyReadinessStage[] = [
  "Research only",
  "Shadow test",
  "Paper trade",
  "Limited live",
  "Production eligible",
];

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrZero(value: unknown) {
  return numberOrNull(value) ?? 0;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n != null) return n;
  }
  return null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function skew(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 3) return 0;
  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  const deviation = Math.sqrt(variance);
  if (deviation === 0) return 0;
  return average(clean.map((value) => ((value - mean) / deviation) ** 3));
}

function contributionForTrade(trade: any) {
  const returnPct = numberOrZero(trade?.returnPct ?? trade?.return_pct ?? trade?.profitPct);
  const exposurePct = firstNumber(trade?.entryExposure, trade?.exposurePct, trade?.weightPct) ?? 100;
  return returnPct * Math.max(0, exposurePct) / 100;
}

type TradeCalibrationProfile = {
  count: number;
  winRatePct: number;
  averageReturnPct: number;
  payoffSharePct: number;
  expectancyScorePct: number;
  outcomeQualityPct: number;
  hasMixedOutcomes: boolean;
  hasPositiveEdge: boolean;
};

function tradeCalibrationProfile(trades: any[]): TradeCalibrationProfile | null {
  const returns = trades
    .map((trade) => numberOrNull(trade?.returnPct ?? trade?.return_pct ?? trade?.profitPct))
    .filter((value: number | null): value is number => value != null);

  if (!returns.length) return null;

  const positiveReturns = returns.filter((value) => value > 0);
  const negativeReturns = returns.filter((value) => value < 0);
  const grossProfit = positiveReturns.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(negativeReturns.reduce((sum, value) => sum + value, 0));
  const totalMagnitude = grossProfit + grossLoss;
  const averageReturnPct = average(returns);
  const averageAbsoluteReturnPct = average(returns.map((value) => Math.abs(value)));
  const winRatePct = positiveReturns.length / returns.length * 100;
  const payoffSharePct = totalMagnitude > 0 ? grossProfit / totalMagnitude * 100 : 50;
  const expectancyScorePct = clamp(
    50 + averageReturnPct / Math.max(1, averageAbsoluteReturnPct) * 75,
  );
  const outcomeQualityPct = clamp(
    payoffSharePct * 0.45 + expectancyScorePct * 0.4 + winRatePct * 0.15,
  );

  return {
    count: returns.length,
    winRatePct,
    averageReturnPct,
    payoffSharePct,
    expectancyScorePct,
    outcomeQualityPct,
    hasMixedOutcomes: positiveReturns.length > 0 && negativeReturns.length > 0,
    hasPositiveEdge: averageReturnPct > 0 && payoffSharePct >= 58 && outcomeQualityPct >= 58,
  };
}

function calibrationCorrectnessForTrade(trade: any, profile: TradeCalibrationProfile | null) {
  const contribution = contributionForTrade(trade);
  if (!profile) {
    return 0.5;
  }

  const individualScore = contribution > 0 ? 1 : contribution < 0 ? 0 : 0.5;
  return clamp(
    individualScore * 0.25 + profile.outcomeQualityPct / 100 * 0.75,
    0,
    1,
  );
}

function calibrationWarningsForTradeProfile(profile: TradeCalibrationProfile | null) {
  if (
    profile &&
    profile.count >= 12 &&
    profile.hasMixedOutcomes &&
    !profile.hasPositiveEdge
  ) {
    return ["unstable outcomes"];
  }

  return [];
}

function confidenceForTradeCalibration(trade: any, fallback: number) {
  const explicitConfidence = firstNumber(
    trade?.confidence,
    trade?.signalConfidence,
    trade?.finalConfidenceScore,
    trade?.calibratedConfidence,
  );

  if (explicitConfidence != null) {
    return clamp(explicitConfidence);
  }

  const setupQuality = firstNumber(
    trade?.setupQuality,
    trade?.trendQuality,
    trade?.qualityScore,
  );
  const riskPressure = firstNumber(
    trade?.riskPressure,
    trade?.riskScore,
    trade?.volatilityPressure,
  );

  if (setupQuality == null && riskPressure == null) {
    return fallback;
  }

  const setupScore = clamp(setupQuality ?? fallback);
  const riskAdjustedScore = clamp(100 - clamp(riskPressure ?? (100 - fallback)));

  return clamp(setupScore * 0.64 + riskAdjustedScore * 0.36);
}

function component(score: number, passed: boolean, reasons: string[]): StrategyReadinessComponent {
  return {
    score: Math.round(clamp(score)),
    passed,
    reasons: unique(reasons),
  };
}

function evaluateDataReliability(dataQuality: any) {
  const quality = String(dataQuality?.quality ?? dataQuality?.sourceStatus ?? "").toLowerCase();
  const syntheticSymbols = numberOrZero(dataQuality?.syntheticSymbols);
  const fallbackSymbols = numberOrZero(dataQuality?.fallbackSymbols);
  const duplicateTimestampSymbols = numberOrZero(dataQuality?.duplicateTimestampSymbols);
  const promotionEligibleData = dataQuality?.promotionEligibleData === true;
  const passed =
    promotionEligibleData &&
    quality !== "synthetic" &&
    quality !== "fallback" &&
    syntheticSymbols === 0 &&
    fallbackSymbols === 0 &&
    duplicateTimestampSymbols === 0;
  const reasons: string[] = [];

  if (!promotionEligibleData) reasons.push("Historical data is not promotable.");
  if (quality === "synthetic") reasons.push("Synthetic data cannot support live testing.");
  if (quality === "fallback") reasons.push("Fallback data cannot support live testing.");
  if (syntheticSymbols > 0 || fallbackSymbols > 0) reasons.push("Some symbols came from non-real data sources.");
  if (duplicateTimestampSymbols > 0) reasons.push("Duplicate timestamps reduce bar reliability.");

  return component(passed ? 100 : quality === "real" ? 65 : 25, passed, reasons);
}

function evaluateBenchmarks(summary: any, config: any) {
  const strategyReturnPct = numberOrZero(
    firstNumber(summary?.totalReturnPct, summary?.portfolioReturnPct, summary?.returnPct),
  );
  const equalWeightReturnPct = numberOrZero(
    firstNumber(summary?.equalWeightReturnPct, summary?.benchmarkReturnPct),
  );
  const buyHoldReturnPct = numberOrZero(
    firstNumber(summary?.buyHoldReturnPct, summary?.buyAndHoldReturnPct, summary?.buyHoldBenchmarkReturnPct, equalWeightReturnPct),
  );
  const costPenaltyPct = Math.max(0.25, numberOrZero(firstNumber(summary?.slippageBps, summary?.commissionBps, config?.costBps)) / 100);
  const safetyMarginPct = Math.max(
    2,
    numberOrZero(firstNumber(config?.benchmarkSafetyMarginPct, summary?.benchmarkMarginRequiredPct)),
  );
  const bestBaselineReturnPct = Math.max(equalWeightReturnPct, buyHoldReturnPct, 0);
  const excessReturnAfterCostsPct = strategyReturnPct - bestBaselineReturnPct - costPenaltyPct;
  const passed = excessReturnAfterCostsPct >= safetyMarginPct;
  const reasons: string[] = [];

  if (!passed) {
    reasons.push("Strategy does not beat the strongest benchmark by the required safety margin after costs.");
  }

  return {
    component: component(
      passed ? 100 : clamp(45 + excessReturnAfterCostsPct * 4),
      passed,
      reasons,
    ),
    benchmarks: {
      strategyReturnPct,
      equalWeightReturnPct,
      buyHoldReturnPct,
      cashReturnPct: 0,
      bestBaselineReturnPct,
      costPenaltyPct,
      excessReturnAfterCostsPct,
      safetyMarginPct,
      passed,
    },
  };
}

function evaluateStrategyEdge(summary: any, config: any) {
  const sharpe = firstNumber(summary?.annualizedSharpe, summary?.sharpeRatio);
  const totalReturnPct = numberOrZero(firstNumber(summary?.totalReturnPct, summary?.portfolioReturnPct));
  const tradeCount = numberOrZero(firstNumber(summary?.tradeCount, summary?.closedTrades));
  const minimumTrades = Math.max(1, numberOrZero(config?.minimumTrades) || 30);
  const reasons: string[] = [];
  const passed =
    sharpe != null &&
    sharpe >= 1 &&
    totalReturnPct > 0 &&
    tradeCount >= minimumTrades;

  if (sharpe == null || sharpe < 1) reasons.push("Sharpe ratio is below the production threshold.");
  if (totalReturnPct <= 0) reasons.push("Strategy return is not positive.");
  if (tradeCount < minimumTrades) reasons.push("Trade sample is too small for promotion.");

  return component(
    clamp((sharpe ?? 0) * 35 + Math.min(totalReturnPct, 35) + Math.min(20, tradeCount / minimumTrades * 20)),
    passed,
    reasons,
  );
}

function evaluateRiskControl(summary: any) {
  const drawdown = firstNumber(summary?.maxDrawdownPct, summary?.max_drawdown_pct);
  const maxAllowedDrawdownPct = 25;
  const reasons: string[] = [];
  const passed = drawdown != null && drawdown > 0 && drawdown <= maxAllowedDrawdownPct;

  if (drawdown == null) reasons.push("Drawdown is unavailable.");
  if (drawdown === 0) reasons.push("Drawdown is suspiciously zero.");
  if (drawdown != null && drawdown > maxAllowedDrawdownPct) reasons.push("Max drawdown is above the risk limit.");

  return component(
    drawdown == null ? 10 : clamp(100 - drawdown * 3),
    passed,
    reasons,
  );
}

function evaluateWalkForward(summary: any, inputSegments: any[], config: any) {
  const rawSegments = inputSegments.length ? inputSegments : Array.isArray(summary?.walkForwardSegments) ? summary.walkForwardSegments : [];
  const returns = rawSegments
    .map((segment: any) => numberOrNull(segment?.returnPct ?? segment?.return_pct))
    .filter((value: number | null): value is number => value != null);
  const minimumSegments = Math.max(3, numberOrZero(config?.minimumWalkForwardSegments) || 3);
  const positiveSegmentCount = returns.filter((value) => value > 0).length;
  const positiveReturns = returns.filter((value) => value > 0);
  const positiveTotal = positiveReturns.reduce((sum, value) => sum + value, 0);
  const positiveShares = positiveReturns.map((value) => value / Math.max(0.000001, positiveTotal));
  const effectivePositiveSegmentCount = positiveShares.length
    ? 1 / positiveShares.reduce((sum, value) => sum + value ** 2, 0)
    : 0;
  const bestPeriodContributionPct =
    positiveReturns.length && positiveTotal > 0
      ? Math.max(...positiveReturns) / positiveTotal * 100
      : 0;
  const periodContributionLimitPct = Math.max(
    60,
    numberOrZero(config?.maxWalkForwardPeriodContributionPct) || 60,
  );
  const weakestReturn = returns.length ? Math.min(...returns) : 0;
  const weakestIndex = returns.length ? returns.indexOf(weakestReturn) : -1;
  const contributionDistributed =
    bestPeriodContributionPct <= periodContributionLimitPct &&
    effectivePositiveSegmentCount >= Math.min(2, Math.max(1, returns.length * 0.6));
  const stable =
    returns.length >= minimumSegments &&
    positiveSegmentCount >= Math.ceil(returns.length * 0.67) &&
    weakestReturn > -10 &&
    contributionDistributed;
  const reasons: string[] = [];

  if (returns.length < minimumSegments) reasons.push("Not enough chronological walk-forward windows.");
  if (positiveSegmentCount < Math.ceil(Math.max(returns.length, minimumSegments) * 0.67)) {
    reasons.push("Too few walk-forward windows are profitable.");
  }
  if (weakestReturn <= -10) reasons.push("Weakest walk-forward window breaches the loss limit.");
  if (!contributionDistributed) reasons.push("One period contributes too much of the return.");

  return {
    component: component(
      clamp((positiveSegmentCount / Math.max(1, returns.length)) * 70 + (100 - bestPeriodContributionPct) * 0.3),
      stable,
      reasons,
    ),
    walkForward: {
      segmentCount: returns.length,
      positiveSegmentCount,
      weakestPeriod: weakestIndex >= 0 ? { index: weakestIndex, returnPct: weakestReturn } : null,
      bestPeriodContributionPct,
      stable,
      effectivePositiveSegmentCount,
    },
  };
}

function evaluateParameterRobustness(parameterRobustness: any) {
  const variants = Array.isArray(parameterRobustness?.variants) ? parameterRobustness.variants : [];
  const passRate = numberOrZero(parameterRobustness?.passRate);
  const benchmarkSurvivalRate = numberOrZero(parameterRobustness?.benchmarkSurvivalRate);
  const stable =
    parameterRobustness?.stable === true &&
    variants.length > 0 &&
    passRate >= 60 &&
    benchmarkSurvivalRate >= 70;
  const reasons: string[] = [];

  if (!variants.length) reasons.push("Nearby parameter variants have not been evaluated.");
  if (passRate < 60) reasons.push("Too few nearby variants preserve the edge.");
  if (benchmarkSurvivalRate < 70) reasons.push("Nearby variants do not consistently beat the benchmark.");
  if (parameterRobustness?.stable === false) reasons.push("Parameter robustness audit marked the setup unstable.");

  return {
    component: component(
      stable ? 100 : clamp(passRate * 0.6 + benchmarkSurvivalRate * 0.4),
      stable,
      reasons,
    ),
    parameterStability: {
      stable,
      passRate,
      benchmarkSurvivalRate,
      variantCount: variants.length,
      variants,
    },
  };
}

function evaluateConcentration(trades: any[], bestPeriodContributionPct: number, walkForwardStable: boolean) {
  const tradeReturns = trades
    .map((trade) => numberOrNull(trade?.returnPct ?? trade?.return_pct))
    .filter((value: number | null): value is number => value != null);
  const contributions = trades.map(contributionForTrade).filter(Number.isFinite);
  const positiveContributions = contributions.filter((value) => value > 0).sort((a, b) => b - a);
  const positiveContributionTotal = positiveContributions.reduce((sum, value) => sum + value, 0);
  const top1Contribution = positiveContributions.slice(0, 1).reduce((sum, value) => sum + value, 0);
  const top5Contribution = positiveContributions.slice(0, 5).reduce((sum, value) => sum + value, 0);
  const top1TradeContributionPct = positiveContributionTotal > 0 ? top1Contribution / positiveContributionTotal * 100 : 0;
  const top5TradeContributionPct = positiveContributionTotal > 0 ? top5Contribution / positiveContributionTotal * 100 : 0;
  const medianTradeReturnPct = median(tradeReturns);
  const returnSkew = skew(tradeReturns);
  const outlierDependent =
    top1TradeContributionPct > 45 ||
    top5TradeContributionPct > 80 ||
    !walkForwardStable ||
    (returnSkew > 4 && top1TradeContributionPct > 35);
  const reasons: string[] = [];

  if (top1TradeContributionPct > 45) reasons.push("Top trade contributes too much of positive PnL.");
  if (top5TradeContributionPct > 80) reasons.push("Top five trades contribute too much of positive PnL.");
  if (!walkForwardStable) reasons.push("Best period contributes too much of total return.");
  if (returnSkew > 4 && top1TradeContributionPct > 35) reasons.push("Return skew indicates outlier dependence.");

  return {
    component: component(
      outlierDependent ? clamp(100 - Math.max(top1TradeContributionPct, top5TradeContributionPct, bestPeriodContributionPct)) : 100,
      !outlierDependent,
      reasons,
    ),
    concentration: {
      top1TradeContributionPct,
      top5TradeContributionPct,
      bestPeriodContributionPct,
      medianTradeReturnPct,
      returnSkew,
      outlierDependent,
    },
  };
}

function evaluateLiveSignalConsistency(forwardShadow: any, config: any) {
  const evaluated = numberOrZero(forwardShadow?.evaluatedSignalCount);
  const required = Math.max(1, numberOrZero(forwardShadow?.requiredSignals) || numberOrZero(config?.minimumForwardSignals) || 20);
  const hitRate = firstNumber(forwardShadow?.hitRatePct, forwardShadow?.hitRate) ?? 0;
  const averageReturnPct = firstNumber(forwardShadow?.averageReturnPct, forwardShadow?.meanReturnPct) ?? 0;
  const passed = forwardShadow?.passed === true && evaluated >= required && averageReturnPct >= 0;
  const reasons: string[] = [];

  if (evaluated < required) reasons.push("Forward shadow evidence has not reached the required sample.");
  if (averageReturnPct < 0) reasons.push("Forward shadow average return is negative.");
  if (forwardShadow?.passed === false) reasons.push("Forward shadow audit is marked failed.");

  return component(
    clamp((evaluated / required) * 55 + Math.max(0, hitRate - 40) + Math.max(0, averageReturnPct) * 4),
    passed,
    reasons,
  );
}

function evaluateRobustnessGate(summary: any, diagnostics: any) {
  const robustness = diagnostics ?? summary?.robustnessDiagnostics ?? summary?.signalRobustness;

  if (!robustness) {
    return component(100, true, []);
  }

  const overfitRisk = firstNumber(robustness?.overfitRisk, robustness?.overfitRiskPct) ?? 100;
  const deploymentReadiness = firstNumber(robustness?.deploymentReadiness, robustness?.deploymentReadinessScore) ?? 0;
  const robustnessScore = firstNumber(robustness?.robustnessScore) ?? Math.max(0, 100 - overfitRisk);
  const safetyGate = String(robustness?.safetyGate ?? "").toLowerCase();
  const passed =
    overfitRisk <= 30 &&
    deploymentReadiness >= 60 &&
    safetyGate !== "block";
  const reasons: string[] = [];

  if (overfitRisk > 30) reasons.push("Robustness overfit risk is above the production threshold.");
  if (deploymentReadiness < 60) reasons.push("Deployment readiness is below the robustness floor.");
  if (safetyGate === "block") reasons.push("Robustness safety gate blocks execution.");

  return component(
    clamp(Math.min(robustnessScore, 100 - overfitRisk * 0.35, deploymentReadiness + 10)),
    passed,
    reasons,
  );
}

function confidenceCapFromFailures(flags: string[]) {
  let cap = 100;
  if (flags.includes("HIGH_DRAWDOWN")) cap = Math.min(cap, 25);
  if (flags.includes("LOW_SHARPE")) cap = Math.min(cap, 35);
  if (flags.includes("BENCHMARK_FAILED")) cap = Math.min(cap, 40);
  if (flags.includes("WALK_FORWARD_UNSTABLE")) cap = Math.min(cap, 45);
  if (flags.includes("PARAMETER_INSTABILITY")) cap = Math.min(cap, 45);
  if (flags.includes("OUTLIER_DEPENDENCY")) cap = Math.min(cap, 45);
  if (flags.includes("LIVE_SIGNAL_MISMATCH")) cap = Math.min(cap, 55);
  if (flags.includes("ROBUSTNESS_OVERFIT_RISK")) cap = Math.min(cap, 55);
  if (flags.includes("ROBUSTNESS_EXECUTION_BLOCKED")) cap = Math.min(cap, 35);
  if (flags.includes("SURVIVAL_NEAR_RUIN")) cap = Math.min(cap, 35);
  if (flags.includes("DATA_QUALITY_NOT_PROMOTABLE") || flags.includes("SYNTHETIC_DATA_FOR_PROMOTION")) cap = Math.min(cap, 20);
  return cap;
}

function evaluateModelConfidence(
  summary: any,
  componentScores: StrategyReadinessComponent[],
  flags: string[],
  trades: any[],
) {
  const rawConfidence = clamp(
    numberOrZero(firstNumber(summary?.modelConfidence, summary?.promotionConfidence, summary?.survivalScore, 50)),
  );
  const nonDataCaps = componentScores.map((item) => item.score);
  const readinessScore = Math.round(average(nonDataCaps));
  const calibration = readinessCalibration({
    rawConfidence,
    componentScores,
    flags,
    trades,
  });
  const maxConfidence = Math.round(
    Math.min(
      rawConfidence,
      calibration.calibratedConfidence,
      readinessScore,
      confidenceCapFromFailures(flags),
    ),
  );
  const passed = maxConfidence >= 70 && flags.length === 0;
  const reasons = passed
    ? []
    : [
        "Model confidence is capped by strategy readiness gates.",
        ...(rawConfidence - calibration.calibratedConfidence >= 10
          ? ["The system sees a signal, but historical calibration does not yet support acting aggressively."]
          : []),
      ];

  return {
    component: component(maxConfidence, passed, reasons),
    readinessScore,
    maxConfidence,
    rawConfidence,
    calibratedConfidence: calibration.calibratedConfidence,
    trustworthiness: calibration.trustworthiness,
    calibration,
  };
}

function readinessCalibration(input: {
  rawConfidence: number;
  componentScores: StrategyReadinessComponent[];
  flags: string[];
  trades: any[];
}) {
  const tradeProfile = tradeCalibrationProfile(input.trades);
  const history: CalibrationInput[] = [
    ...input.componentScores.map((item, index) => ({
      id: `readiness-component-${index}`,
      prediction: { expectedOutcome: "pass", component: index },
      confidence: input.rawConfidence,
      outcome: { label: item.passed ? "success" : "failure", correct: item.passed },
      metadata: { source: "strategy-readiness" },
    })),
    ...input.trades.map((trade, index) => {
      const contribution = contributionForTrade(trade);
      const correctness = calibrationCorrectnessForTrade(trade, tradeProfile);
      return {
        id: String(trade?.id ?? trade?.symbol ?? `trade-${index}`),
        timestamp: typeof trade?.exitDate === "string" ? trade.exitDate : typeof trade?.entryDate === "string" ? trade.entryDate : undefined,
        prediction: { expectedOutcome: "positive" },
        confidence: confidenceForTradeCalibration(trade, input.rawConfidence),
        outcome: {
          label: contribution > 0 ? "success" : contribution < 0 ? "failure" : "partial",
          correct: correctness,
        },
        metadata: {
          source: "strategy-trade",
          calibrationOutcomeQuality: tradeProfile?.outcomeQualityPct,
          calibrationPayoffShare: tradeProfile?.payoffSharePct,
        },
      };
    }),
    ...input.flags.map((flag, index) => ({
      id: `readiness-flag-${index}`,
      prediction: { expectedOutcome: "no-failure-flag", flag },
      confidence: input.rawConfidence,
      outcome: { label: "failure", correct: false },
      metadata: { source: "strategy-readiness-flag", flag },
    })),
  ];
  const result = calibrate({
    current: {
      id: "strategy-readiness",
      prediction: { expectedOutcome: "ready" },
      confidence: input.rawConfidence,
      metadata: { source: "strategy-readiness" },
    },
    history,
    options: { minimumSamples: 12, sufficientSamples: 30, overconfidenceThreshold: 20 },
  });
  const calibrationWarnings = result.warnings.filter((warning) => {
    const conservativeCalibration =
      warning === "poor calibration" &&
      result.calibrationError < 0 &&
      result.historicalAccuracy >= 70 &&
      result.trustworthiness >= 70;

    return !conservativeCalibration;
  });
  const warnings = unique([
    ...calibrationWarnings,
    ...calibrationWarningsForTradeProfile(tradeProfile),
  ]);
  const poorCalibrationWarnings = new Set(["poor calibration", "overconfidence", "low trustworthiness"]);
  const status: StrategyReadinessResult["calibration"]["status"] =
    warnings.includes("insufficient history")
      ? "insufficient-history"
      : warnings.includes("unstable outcomes")
        ? "unstable-outcomes"
      : warnings.some((warning) => poorCalibrationWarnings.has(warning))
        ? "poor-calibration"
        : "trusted";
  const explanation =
    status === "insufficient-history"
      ? "Calibration history is still insufficient."
      : status === "unstable-outcomes"
        ? "Calibration has enough history, but outcomes are unstable. Keep this review-gated until outcomes become more consistent."
      : status === "poor-calibration"
        ? "The system sees a signal, but historical calibration does not yet support acting aggressively."
        : "Calibration checks show past confidence has been reliable enough for this readiness level.";

  return { ...result, warnings, status, explanation };
}

function flagsForEvaluation(
  dataReliability: StrategyReadinessComponent,
  strategyEdge: StrategyReadinessComponent,
  benchmarkEdge: StrategyReadinessComponent,
  riskControl: StrategyReadinessComponent,
  walkForwardRobustness: StrategyReadinessComponent,
  liveSignalConsistency: StrategyReadinessComponent,
  parameterRobustness: StrategyReadinessComponent,
  concentrationControl: StrategyReadinessComponent,
  robustnessGate: StrategyReadinessComponent,
  summary: any,
) {
  const flags: string[] = Array.isArray(summary?.failureFlags) ? [...summary.failureFlags] : [];

  if (!dataReliability.passed) flags.push(summary?.dataQualityReport?.quality === "synthetic" ? "SYNTHETIC_DATA_FOR_PROMOTION" : "DATA_QUALITY_NOT_PROMOTABLE");
  if (!strategyEdge.passed) {
    const sharpe = firstNumber(summary?.annualizedSharpe, summary?.sharpeRatio);
    flags.push(sharpe == null || sharpe < 1 ? "LOW_SHARPE" : "INSUFFICIENT_STRATEGY_EDGE");
  }
  if (!benchmarkEdge.passed) {
    flags.push("BENCHMARK_FAILED", "WEAK_BENCHMARK_MARGIN");
  }
  if (!riskControl.passed) flags.push("HIGH_DRAWDOWN");
  if (!walkForwardRobustness.passed) flags.push("WALK_FORWARD_UNSTABLE", "OVERFIT_WALK_FORWARD_INSTABILITY");
  if (!liveSignalConsistency.passed) flags.push("LIVE_SIGNAL_MISMATCH");
  if (!parameterRobustness.passed) flags.push("PARAMETER_INSTABILITY");
  if (!concentrationControl.passed) flags.push("OUTLIER_DEPENDENCY", "OVERFIT_TOP_WINNER_DEPENDENCY");
  if (!robustnessGate.passed) {
    const gate = String(summary?.robustnessDiagnostics?.safetyGate ?? "").toLowerCase();
    flags.push(gate === "block" ? "ROBUSTNESS_EXECUTION_BLOCKED" : "ROBUSTNESS_OVERFIT_RISK");
  }

  return unique(flags);
}

function chooseStage(corePassed: boolean, livePassed: boolean, readinessScore: number, maxConfidence: number): StrategyReadinessStage {
  if (!corePassed) return "Research only";
  if (!livePassed) return "Shadow test";
  if (readinessScore < 70 || maxConfidence < 60) return "Paper trade";
  if (readinessScore < 85 || maxConfidence < 75) return "Limited live";
  return "Production eligible";
}

function riskFirstMaxPositionPct(stage: StrategyReadinessStage, result: {
  configMaxPositionPct: number;
  readinessScore: number;
  benchmarkExcessPct: number;
  drawdownPct: number;
  liveSignalScore: number;
  overfitRiskPct: number;
}) {
  if (stage === "Research only") return 0;
  const stageMultiplier = stage === "Production eligible" ? 1 : stage === "Limited live" ? 0.45 : 0.18;
  const confidenceMultiplier = clamp(result.readinessScore, 0, 100) / 100;
  const benchmarkMultiplier = clamp(result.benchmarkExcessPct / 12, 0.2, 1);
  const drawdownMultiplier = clamp(1 - result.drawdownPct / 50, 0.2, 1);
  const liveMultiplier = clamp(result.liveSignalScore / 100, 0.25, 1);
  const robustnessMultiplier = clamp(1 - result.overfitRiskPct / 120, 0.2, 1);

  return Number((result.configMaxPositionPct * stageMultiplier * confidenceMultiplier * benchmarkMultiplier * drawdownMultiplier * liveMultiplier * robustnessMultiplier).toFixed(2));
}

export class StrategyReadinessEvaluator {
  evaluate(input: StrategyReadinessInput): StrategyReadinessResult {
    const summary = input.summary ?? {};
    const trades = Array.isArray(input.trades) ? input.trades : [];
    const config = input.config ?? {};
    const dataReliability = evaluateDataReliability(input.dataQualityReport ?? summary.dataQualityReport ?? summary.dataQuality);
    const benchmarkEvaluation = evaluateBenchmarks(summary, config);
    const strategyEdge = evaluateStrategyEdge(summary, config);
    const riskControl = evaluateRiskControl(summary);
    const walkForwardEvaluation = evaluateWalkForward(
      summary,
      Array.isArray(input.walkForwardSegments) ? input.walkForwardSegments : [],
      config,
    );
    const parameterEvaluation = evaluateParameterRobustness(input.parameterRobustness ?? summary.parameterRobustness);
    const concentrationEvaluation = evaluateConcentration(
      trades,
      walkForwardEvaluation.walkForward.bestPeriodContributionPct,
      walkForwardEvaluation.walkForward.stable,
    );
    const liveSignalConsistency = evaluateLiveSignalConsistency(input.forwardShadow ?? summary.forwardShadow, config);
    const robustnessDiagnostics = input.robustnessDiagnostics ?? summary.robustnessDiagnostics;
    const robustnessGate = evaluateRobustnessGate(summary, robustnessDiagnostics);
    const survivalMemory = input.survivalMemory ?? buildStockSurvivalMemory({
      market: input.market,
      rawAction: "Buy",
      setupQuality: firstNumber(summary?.modelConfidence, summary?.promotionConfidence, summary?.survivalScore, 50)!,
      riskPressure: Math.min(100, numberOrZero(firstNumber(summary?.maxDrawdownPct, summary?.max_drawdown_pct)) * 3),
      rawSuggestedExposurePct: numberOrZero(config.maxPositionPct) || 20,
      maxPositionPct: numberOrZero(config.maxPositionPct) || 20,
      readiness: {
        ...summary,
        robustnessDiagnostics,
        walkForward: walkForwardEvaluation.walkForward,
        parameterStability: parameterEvaluation.parameterStability,
        concentration: concentrationEvaluation.concentration,
      },
      trades,
      strategyHistory: Array.isArray(summary?.walkForwardSegments) ? summary.walkForwardSegments : [],
      requireExplicitSurvivalFields: true,
    });
    const flags = flagsForEvaluation(
      dataReliability,
      strategyEdge,
      benchmarkEvaluation.component,
      riskControl,
      walkForwardEvaluation.component,
      liveSignalConsistency,
      parameterEvaluation.component,
      concentrationEvaluation.component,
      robustnessGate,
      summary,
    );
    const survivalFlags = survivalMemory.status === "near_ruin" ? ["SURVIVAL_NEAR_RUIN"] : [];
    const allFlags = unique([...flags, ...survivalFlags]);
    const confidenceEvaluation = evaluateModelConfidence(
      summary,
      [
        strategyEdge,
        benchmarkEvaluation.component,
        riskControl,
        walkForwardEvaluation.component,
        liveSignalConsistency,
        parameterEvaluation.component,
        concentrationEvaluation.component,
        robustnessGate,
      ],
      allFlags,
      trades,
    );
    const corePassed =
      dataReliability.passed &&
      strategyEdge.passed &&
      benchmarkEvaluation.component.passed &&
      riskControl.passed &&
      walkForwardEvaluation.component.passed &&
      parameterEvaluation.component.passed &&
      concentrationEvaluation.component.passed &&
      robustnessGate.passed;
    const stage = chooseStage(
      corePassed,
      liveSignalConsistency.passed,
      confidenceEvaluation.readinessScore,
      confidenceEvaluation.maxConfidence,
    );
    const readinessMaxPositionPct = riskFirstMaxPositionPct(stage, {
      configMaxPositionPct: numberOrZero(config.maxPositionPct) || 20,
      readinessScore: confidenceEvaluation.readinessScore,
      benchmarkExcessPct: benchmarkEvaluation.benchmarks.excessReturnAfterCostsPct,
      drawdownPct: numberOrZero(firstNumber(summary?.maxDrawdownPct, summary?.max_drawdown_pct)),
      liveSignalScore: liveSignalConsistency.score,
      overfitRiskPct: firstNumber(robustnessDiagnostics?.overfitRisk, robustnessDiagnostics?.overfitRiskPct) ?? 0,
    });
    const maxPositionPct = Number((readinessMaxPositionPct * survivalMemory.exposureMultiplier).toFixed(2));
    const readinessSurvivalMemory = {
      ...survivalMemory,
      maxExposurePct: maxPositionPct,
    };
    const components = {
      dataReliability,
      modelConfidence: confidenceEvaluation.component,
      strategyEdge,
      benchmarkEdge: benchmarkEvaluation.component,
      riskControl,
      walkForwardRobustness: walkForwardEvaluation.component,
      liveSignalConsistency,
      robustness: robustnessGate,
      parameterRobustness: parameterEvaluation.component,
      concentrationControl: concentrationEvaluation.component,
    };
    const reasons = unique(Object.values(components).flatMap((item) => item.reasons));
    const readinessBlocked = stage === "Research only";
    const trustGovernor = evaluateTrustGovernor({
      rawConfidence: confidenceEvaluation.rawConfidence,
      calibratedConfidence: confidenceEvaluation.calibratedConfidence,
      requestedExposure: maxPositionPct,
      maxExposure: maxPositionPct,
      opensNewExposure: true,
      calibration: confidenceEvaluation.calibration,
      reliability: {
        score: dataReliability.score,
        status: dataReliability.passed ? "healthy" : "degraded",
        confidenceCap: dataReliability.score,
      },
      strategy: {
        blocked: readinessBlocked,
        productionEligible: stage === "Production eligible",
        stage,
        readinessScore: confidenceEvaluation.readinessScore,
        maxConfidence: confidenceEvaluation.maxConfidence,
        maxPositionPct,
        failureFlags: allFlags,
      },
      survivalMemory: readinessSurvivalMemory,
    });
    const tradeContributions = trades.map(contributionForTrade).filter(Number.isFinite);
    const recovery = evaluateRecovery({
      survivalConfidence: readinessSurvivalMemory.survivalConfidence,
      scarCount: readinessSurvivalMemory.scarCount,
      nearRuinCount: readinessSurvivalMemory.nearRuinCount,
      currentStateSimilarity: readinessSurvivalMemory.currentStateSimilarity,
      recoveryExposureCap: readinessSurvivalMemory.maxExposurePct,
      trustScore: trustGovernor.trustScore,
      confidenceCap: trustGovernor.confidenceCap,
      calibratedConfidence: confidenceEvaluation.calibratedConfidence,
      rawConfidence: confidenceEvaluation.rawConfidence,
      judgementReliability: confidenceEvaluation.trustworthiness,
      similarSampleCount: Math.max(confidenceEvaluation.calibration.sampleSize, tradeContributions.length),
      positiveSimilarOutcomes: tradeContributions.filter((value) => value > 0).length,
      negativeSimilarOutcomes: tradeContributions.filter((value) => value < 0).length,
      neutralSimilarOutcomes: tradeContributions.filter((value) => value === 0).length,
      outcomeStability: confidenceEvaluation.trustworthiness,
      overfitRisk: firstNumber(robustnessDiagnostics?.overfitRisk, robustnessDiagnostics?.overfitRiskPct) ?? 0,
      beliefFragility: firstNumber(summary?.beliefFragility, summary?.opportunityFragility) ?? 0,
      evidenceAgreement: firstNumber(summary?.evidenceAgreement, summary?.signalAgreement) ?? confidenceEvaluation.trustworthiness,
      dataReliability: dataReliability.score,
      blockedAgencyActionCount: trustGovernor.blockedActions.length,
      discoveryConfidence: firstNumber(summary?.discoveryConfidence, summary?.opportunityDiscovery?.confidence) ?? 0,
      discoveryMaturity: firstNumber(summary?.discoveryMaturity, summary?.opportunityDiscovery?.maturity) ?? 0,
      novelty: firstNumber(summary?.novelty, summary?.opportunityNovelty) ?? 50,
      currentSizingMode: trustGovernor.participationMode,
      currentMaxExposure: trustGovernor.maxExposure,
      targetNormalExposure: readinessMaxPositionPct,
    });
    const readinessRemediation = planReadinessRemediation({
      gates: [
        { id: "dataReliability", label: "Data reliability", category: "data_reliability", passed: dataReliability.passed, score: dataReliability.score, reason: dataReliability.reasons[0] },
        { id: "strategyEdge", label: "Strategy edge", category: "strategy_edge", passed: strategyEdge.passed, score: strategyEdge.score, reason: strategyEdge.reasons[0], targetScore: 70 },
        { id: "benchmarkEdge", label: "Benchmark edge", category: "benchmark", passed: benchmarkEvaluation.component.passed, score: benchmarkEvaluation.component.score, reason: benchmarkEvaluation.component.reasons[0], targetScore: 70 },
        { id: "riskControl", label: "Risk control", category: "risk_control", passed: riskControl.passed, score: riskControl.score, reason: riskControl.reasons[0], targetScore: 75 },
        { id: "walkForwardRobustness", label: "Walk-forward stability", category: "walk_forward", passed: walkForwardEvaluation.component.passed, score: walkForwardEvaluation.component.score, reason: walkForwardEvaluation.component.reasons[0], targetScore: 70 },
        { id: "liveSignalConsistency", label: "Live signal consistency", category: "live_signal", passed: liveSignalConsistency.passed, score: liveSignalConsistency.score, reason: liveSignalConsistency.reasons[0], targetScore: 70 },
        { id: "robustness", label: "Robustness risk", category: "robustness", passed: robustnessGate.passed, score: robustnessGate.score, reason: robustnessGate.reasons[0], targetScore: 70 },
        { id: "parameterRobustness", label: "Parameter robustness", category: "parameter_stability", passed: parameterEvaluation.component.passed, score: parameterEvaluation.component.score, reason: parameterEvaluation.component.reasons[0], targetScore: 70 },
        { id: "concentrationControl", label: "Return concentration", category: "concentration", passed: concentrationEvaluation.component.passed, score: concentrationEvaluation.component.score, reason: concentrationEvaluation.component.reasons[0], targetScore: 70 },
        { id: "modelConfidence", label: "Model confidence", category: "strategy_edge", passed: confidenceEvaluation.component.passed, score: confidenceEvaluation.component.score, reason: confidenceEvaluation.component.reasons[0], targetScore: 70 },
      ],
      failureFlags: allFlags,
      calibration: {
        status: confidenceEvaluation.calibration.status,
        sampleSize: confidenceEvaluation.calibration.sampleSize,
        rawConfidence: confidenceEvaluation.rawConfidence,
        calibratedConfidence: confidenceEvaluation.calibratedConfidence,
        trustworthiness: confidenceEvaluation.trustworthiness,
        warnings: confidenceEvaluation.calibration.warnings,
      },
      robustness: robustnessDiagnostics,
      trust: {
        trustScore: trustGovernor.trustScore,
        confidenceCap: trustGovernor.confidenceCap,
        participationMode: trustGovernor.participationMode,
        primaryBlocker: trustGovernor.primaryBlocker,
        blockers: trustGovernor.blockers,
        unlockCriteria: trustGovernor.unlockCriteria,
      },
      context: {
        readinessScore: confidenceEvaluation.readinessScore,
        maxConfidence: confidenceEvaluation.maxConfidence,
        currentStage: stage,
        targetStage: "Production eligible",
        allowsNewExposure: trustGovernor.allowsNewExposure,
      },
    });

    return {
      stage,
      blocked: readinessBlocked,
      productionEligible: stage === "Production eligible",
      readinessScore: confidenceEvaluation.readinessScore,
      maxConfidence: confidenceEvaluation.maxConfidence,
      rawConfidence: confidenceEvaluation.rawConfidence,
      calibratedConfidence: confidenceEvaluation.calibratedConfidence,
      trustworthiness: confidenceEvaluation.trustworthiness,
      trustGovernor,
      recovery,
      readinessRemediation,
      participationMode: trustGovernor.participationMode,
      participationBlocked: !trustGovernor.allowsNewExposure,
      calibration: confidenceEvaluation.calibration,
      maxPositionPct,
      failureFlags: allFlags,
      reasons,
      components,
      benchmarks: benchmarkEvaluation.benchmarks,
      walkForward: walkForwardEvaluation.walkForward,
      parameterStability: parameterEvaluation.parameterStability,
      concentration: concentrationEvaluation.concentration,
      robustnessDiagnostics,
      survivalMemory: readinessSurvivalMemory,
    };
  }
}

export function applyStrategyReadinessToSummary(summary: any, readiness: StrategyReadinessResult) {
  const next = { ...(summary ?? {}) };
  const flags = unique(readiness.failureFlags);
  const blockedFromReadiness = readiness.blocked || flags.length > 0;

  next.strategyReadiness = readiness;
  next.robustnessDiagnostics = readiness.robustnessDiagnostics ?? next.robustnessDiagnostics;
  next.robustnessScore = firstNumber(next.robustnessDiagnostics?.robustnessScore) ?? next.robustnessScore;
  next.overfitRiskScore = firstNumber(next.robustnessDiagnostics?.overfitRisk) ?? next.overfitRiskScore;
  next.deploymentReadinessScore = firstNumber(next.robustnessDiagnostics?.deploymentReadiness) ?? next.deploymentReadinessScore;
  next.readinessStage = readiness.stage;
  next.lifecycleStage = readiness.stage;
  next.promotionState = readiness.stage;
  next.promotionLabel = readiness.blocked ? "Blocked" : readiness.stage;
  next.readinessLabel = readiness.blocked ? "Blocked" : readiness.stage;
  next.productionReadinessStatus = readiness.stage;
  next.productionEligible = readiness.productionEligible;
  next.promotionBlocked = blockedFromReadiness;
  next.forwardTestEligible = readiness.stage !== "Research only";
  next.forwardEligible = next.forwardTestEligible;
  next.isForwardTestEligible = next.forwardTestEligible;
  next.failureFlags = flags;
  next.automaticFailureDetected = blockedFromReadiness;
  next.automaticFailureReasons = readiness.reasons;
  next.survivalScore = Math.min(numberOrZero(next.survivalScore), readiness.maxConfidence);
  next.promotionConfidence = Math.min(numberOrZero(next.promotionConfidence ?? next.survivalScore), readiness.maxConfidence);
  next.modelConfidence = readiness.maxConfidence;
  next.rawConfidence = readiness.rawConfidence;
  next.calibratedConfidence = readiness.calibratedConfidence;
  next.trustworthiness = readiness.trustworthiness;
  next.trustGovernor = readiness.trustGovernor;
  next.recovery = readiness.recovery;
  next.recoveryStatus = readiness.recovery.status;
  next.recoveryMode = readiness.recovery.mode;
  next.recoveryScore = readiness.recovery.recoveryScore;
  next.recoveryTrustedCapacity = readiness.recovery.trustedCapacity;
  next.recoveryConfidenceCapLift = readiness.recovery.confidenceCapLift;
  next.recoveryRecommendedExposureCap = readiness.recovery.recommendedExposureCap;
  next.recoveryCanRestoreSizing = readiness.recovery.canRestoreSizing;
  next.recoveryHumanReviewRequired = readiness.recovery.shouldEscalateHumanReview;
  next.readinessRemediation = readiness.readinessRemediation;
  next.remediationPlan = readiness.readinessRemediation;
  next.remediationStatus = readiness.readinessRemediation.status;
  next.remediationTopAction = readiness.readinessRemediation.topAction;
  next.remediationExpectedTrustLift = readiness.readinessRemediation.totalExpectedTrustLift;
  next.participationMode = readiness.participationMode;
  next.participationBlocked = readiness.participationBlocked;
  next.trustedMaxExposurePct = readiness.trustGovernor.maxExposure;
  next.trustScore = readiness.trustGovernor.trustScore;
  next.trustConfidenceCap = readiness.trustGovernor.confidenceCap;
  next.allowedActions = readiness.trustGovernor.allowedActions;
  next.blockedActions = readiness.trustGovernor.blockedActions;
  next.primaryTrustBlocker = readiness.trustGovernor.primaryBlocker;
  next.trustUnlockCriteria = readiness.trustGovernor.unlockCriteria;
  next.trustContradictions = readiness.trustGovernor.contradictions;
  next.calibrationStatus = readiness.calibration.status;
  next.calibrationWarnings = readiness.calibration.warnings;
  next.calibrationExplanation = readiness.calibration.explanation;
  next.maxPositionPct = readiness.maxPositionPct;
  next.benchmarkPassed = readiness.components.benchmarkEdge.passed;
  next.benchmarkStatus = readiness.components.benchmarkEdge.passed ? "Pass" : "Failed";
  next.benchmarkComparison = next.benchmarkStatus;
  next.benchmarkReturnPct = readiness.benchmarks.equalWeightReturnPct;
  next.buyHoldBenchmarkReturnPct = readiness.benchmarks.buyHoldReturnPct;
  next.cashBenchmarkReturnPct = readiness.benchmarks.cashReturnPct;
  next.excessReturnAfterCostsPct = readiness.benchmarks.excessReturnAfterCostsPct;
  next.benchmarkMarginRequiredPct = readiness.benchmarks.safetyMarginPct;
  next.robustnessPassed = readiness.components.robustness.passed;
  next.survivalMemory = readiness.survivalMemory;
  next.survivalMemoryStatus = readiness.survivalMemory?.status;
  next.survivalScarCount = readiness.survivalMemory?.scarCount ?? 0;
  next.survivalNearRuinCount = readiness.survivalMemory?.nearRuinCount ?? 0;
  next.averageSurvivalCost = readiness.survivalMemory?.averageSurvivalCost ?? 0;
  next.survivalRecoveryBurden = readiness.survivalMemory?.recoveryBurden ?? 0;
  next.survivalConfidence = readiness.survivalMemory?.survivalConfidence ?? readiness.maxConfidence;
  if (readiness.survivalMemory) {
    next.survivalScore = Math.min(numberOrZero(next.survivalScore), readiness.survivalMemory.survivalConfidence);
    next.promotionConfidence = Math.min(numberOrZero(firstNumber(next.promotionConfidence, next.survivalScore)), readiness.survivalMemory.survivalConfidence);
  }
  next.walkForwardPassed = readiness.components.walkForwardRobustness.passed;
  next.weakestWalkForwardPeriod = readiness.walkForward.weakestPeriod;
  next.parameterRobustness = {
    ...(next.parameterRobustness ?? {}),
    ...readiness.parameterStability,
  };
  next.concentrationRisk = readiness.concentration;

  return next;
}

export function classifyStrategySignal(input: StrategySignalInput): StrategySignalDecision {
  const rawConfidence = clamp(input.signalConfidence);
  const calibrationStatus = input.readiness.calibration?.status;
  const calibrationReviewRequired =
    calibrationStatus === "insufficient-history" ||
    calibrationStatus === "poor-calibration" ||
    calibrationStatus === "unstable-outcomes";
  const calibratedConfidence = Math.round(
    Math.min(
      rawConfidence,
      input.readiness.maxConfidence,
      input.readiness.calibration?.calibratedConfidence ?? rawConfidence,
    ),
  );
  const cappedConfidence = calibratedConfidence;
  const sellRequested = input.rawAction === "Sell" || input.expectedEdgePct < 0 || input.riskPressure >= 82;
  const riskPassed = input.riskPressure < 72 && input.volatilityPct <= 12;
  const opensNewExposure = input.rawAction === "Buy" && input.expectedEdgePct > 0;
  const survivalMemory = input.survivalMemory ?? buildStockSurvivalMemory({
    market: input.market,
    symbol: input.symbol,
    rawAction: input.rawAction,
    setupQuality: input.setupQuality,
    riskPressure: input.riskPressure,
    volatilityPct: input.volatilityPct,
    liquidityScore: input.liquidityScore,
    expectedEdgePct: input.expectedEdgePct,
    rawSuggestedExposurePct: input.rawSuggestedExposurePct,
    maxPositionPct: input.readiness.maxPositionPct,
    readiness: input.readiness,
    trades: input.previousTrades,
    strategyHistory: input.strategyHistory,
    requireExplicitSurvivalFields: true,
  });
  const maxPositionPct = opensNewExposure
    ? Math.min(input.readiness.maxPositionPct, survivalMemory.maxExposurePct || input.readiness.maxPositionPct)
    : input.readiness.maxPositionPct;
  const survivalAdjustedConfidence = opensNewExposure && survivalMemory.scarCount > 0
    ? Math.min(cappedConfidence, survivalMemory.survivalConfidence)
    : cappedConfidence;
  const belief = evaluateTradeCandidateBelief(
    {
      symbol: input.symbol,
      market: input.market,
      rawAction: input.rawAction,
      expectedEdgePct: input.expectedEdgePct,
      rawSuggestedExposurePct: input.rawSuggestedExposurePct,
      setupQuality: input.setupQuality,
      riskPressure: input.riskPressure,
      volatilityPct: input.volatilityPct,
      liquidityScore: input.liquidityScore,
      signalConfidence: survivalAdjustedConfidence,
      maxPositionPct,
    },
    {
      market: input.market,
      maxPositionPct,
      benchmarkExcessPct: input.readiness.benchmarks.excessReturnAfterCostsPct,
      overfitRisk: firstNumber(
        input.readiness.robustnessDiagnostics?.overfitRisk,
        input.readiness.robustnessDiagnostics?.overfitRiskPct,
        0,
      ),
      maxDrawdownPct: input.readiness.benchmarks.strategyReturnPct < 0
        ? Math.abs(input.readiness.benchmarks.strategyReturnPct)
        : undefined,
      top1TradeContributionPct: input.readiness.concentration.top1TradeContributionPct,
      concentrationRisk: input.readiness.concentration.outlierDependent
        ? Math.max(
            input.readiness.concentration.top1TradeContributionPct,
            input.readiness.concentration.top5TradeContributionPct,
          )
        : 0,
      lifecycleStage: input.readiness.stage,
      staleData: input.readiness.components.dataReliability.passed === false,
    },
    input.readiness.calibration,
    {
      trendStrength: input.setupQuality,
      candidateQuality: input.setupQuality,
      opportunityDensity: maxPositionPct > 0
        ? (input.rawSuggestedExposurePct / maxPositionPct) * 100
        : 0,
      liquidityScore: input.liquidityScore,
      volatilityPct: input.volatilityPct,
      riskPressure: input.riskPressure,
      dataReliability: input.readiness.components.dataReliability.score,
      walkForwardRobustness: input.readiness.components.walkForwardRobustness,
      parameterRobustness: input.readiness.components.parameterRobustness,
      similarMarketMatch: clamp(50 + input.readiness.benchmarks.excessReturnAfterCostsPct * 2.5),
      lifecycleStage: input.readiness.stage,
    },
  );
  const beliefPreventsNewExposure = opensNewExposure && belief.verdict !== "justified";
  const beliefBlocksNewExposure =
    opensNewExposure &&
    (belief.verdict === "uncertain" || belief.verdict === "contradicted");
  const beliefRequiresReview = opensNewExposure && belief.verdict === "weak";
  const beliefAdjustedConfidence = opensNewExposure
    ? Math.min(survivalAdjustedConfidence, belief.confidence, belief.trustworthiness)
    : survivalAdjustedConfidence;
  const volatilityMultiplier = clamp(1 - input.volatilityPct / 18, 0.2, 1);
  const drawdownMultiplier = clamp(1 - numberOrZero(input.readiness.concentration.bestPeriodContributionPct) / 160, 0.35, 1);
  const liquidityMultiplier = clamp(numberOrZero(input.liquidityScore ?? 70) / 100, 0.25, 1);
  const confidenceMultiplier = clamp(beliefAdjustedConfidence / 100, 0.25, 1);
  const benchmarkMultiplier = clamp(input.readiness.benchmarks.excessReturnAfterCostsPct / 14, 0.2, 1);
  const liveSignalMultiplier = clamp(input.readiness.components.liveSignalConsistency.score / 100, 0.25, 1);
  const rawSizedExposure = Math.min(input.rawSuggestedExposurePct, maxPositionPct) *
    volatilityMultiplier *
    drawdownMultiplier *
    liquidityMultiplier *
    confidenceMultiplier *
    benchmarkMultiplier *
    liveSignalMultiplier;
  const sizingConstraints = buildSignalSizingConstraints(input, riskPassed, beliefAdjustedConfidence, belief);
  const financialSizing = sizeFinancialExposure({
    targetRef: "strategy-signal",
    actionRef: input.rawAction,
    decisionRef: `${input.rawAction}:${input.expectedEdgePct.toFixed(2)}`,
    confidence: beliefAdjustedConfidence,
    riskPressure: Math.max(input.riskPressure, input.volatilityPct * 6),
    requestedExposurePct: rawSizedExposure,
    availableExposurePct: maxPositionPct,
    maxExposurePct: maxPositionPct,
    constraints: sizingConstraints,
    survivalMemory,
    viability: buildSignalViabilityInput(input, sizingConstraints, beliefAdjustedConfidence, riskPassed, belief),
  });
  const judgement = hasJudgementEvidence(input)
    ? evaluateStockJudgement({
        market: input.market,
        symbol: input.symbol,
        rawAction: input.rawAction,
        expectedEdgePct: input.expectedEdgePct,
        rawSuggestedExposurePct: input.rawSuggestedExposurePct,
        setupQuality: input.setupQuality,
        riskPressure: input.riskPressure,
        volatilityPct: input.volatilityPct,
        liquidityScore: input.liquidityScore,
        rawConfidence,
        calibratedConfidence: beliefAdjustedConfidence,
        readiness: input.readiness,
        sizingResult: financialSizing.sizingResult,
        previousTrades: input.previousTrades,
        strategyHistory: input.strategyHistory,
        forwardShadow: input.forwardShadow,
        opportunityCandidates: input.opportunityCandidates,
        agencyResult: input.agencyResult,
        survivalMemory,
      })
    : undefined;
  const judgementGate = judgementExposureGate(judgement, financialSizing.suggestedExposurePct);
  const judgementBlocksNewExposure = opensNewExposure && !judgementGate.allowsNewExposure;
  const judgementRequiresReviewForNewExposure = judgement != null && !judgementGate.allowsNewExposure;
  const judgementAdjustedConfidence = judgement
    ? Math.min(beliefAdjustedConfidence, judgement.adjustedConfidence)
    : beliefAdjustedConfidence;
  const judgementTrustworthiness = judgementTrustForAgency(input.readiness.trustworthiness, judgement);
  const trustGovernor = evaluateTrustGovernor({
    rawConfidence,
    calibratedConfidence,
    requestedExposure: financialSizing.suggestedExposurePct,
    maxExposure: maxPositionPct,
    opensNewExposure,
    calibration: input.readiness.calibration,
    judgement,
    belief,
    reliability: {
      score: input.readiness.components.dataReliability.score,
      status: input.readiness.components.dataReliability.passed ? "healthy" : "degraded",
      confidenceCap: input.readiness.components.dataReliability.score,
    },
    strategy: {
      blocked: input.readiness.blocked,
      productionEligible: input.readiness.productionEligible,
      stage: input.readiness.stage,
      readinessScore: input.readiness.readinessScore,
      maxConfidence: input.readiness.maxConfidence,
      maxPositionPct,
      failureFlags: input.readiness.failureFlags,
    },
    survivalMemory,
  });
  const primaryOpportunity = Array.isArray(input.opportunityCandidates) ? input.opportunityCandidates[0] ?? {} : {};
  const agencyBlockedCount =
    Array.isArray(input.agencyResult?.blockedActions)
      ? input.agencyResult.blockedActions.length
      : Array.isArray(input.agencyResult?.violations)
        ? input.agencyResult.violations.length
        : Number(firstNumber(
            input.agencyResult?.blockedActions,
            input.agencyResult?.summary?.blockedActions,
            input.agencyResult?.blocked,
            trustGovernor.blockedActions.length,
          ));
  const recovery = evaluateRecovery({
    survivalConfidence: survivalMemory.survivalConfidence,
    scarCount: survivalMemory.scarCount,
    nearRuinCount: survivalMemory.nearRuinCount,
    currentStateSimilarity: survivalMemory.currentStateSimilarity,
    recoveryExposureCap: survivalMemory.maxExposurePct,
    trustScore: trustGovernor.trustScore,
    confidenceCap: trustGovernor.confidenceCap,
    calibratedConfidence: judgementAdjustedConfidence,
    rawConfidence,
    judgementReliability: judgement?.reliability ?? judgementTrustworthiness,
    similarSampleCount: judgement?.similarSampleSize ?? input.readiness.calibration?.sampleSize,
    positiveSimilarOutcomes: judgement?.evidence?.positiveOutcomes,
    negativeSimilarOutcomes: judgement?.evidence?.negativeOutcomes,
    neutralSimilarOutcomes: judgement?.evidence?.neutralOutcomes,
    outcomeStability: judgement?.outcomeStability ?? input.readiness.trustworthiness,
    overfitRisk: judgement?.overfitRisk ??
      firstNumber(input.readiness.robustnessDiagnostics?.overfitRisk, input.readiness.robustnessDiagnostics?.overfitRiskPct) ??
      0,
    beliefFragility: belief.fragility,
    evidenceAgreement: belief.evidenceAgreement,
    dataReliability: input.readiness.components.dataReliability.score,
    blockedAgencyActionCount: agencyBlockedCount,
    discoveryConfidence: firstNumber(
      primaryOpportunity?.discovery?.confidence,
      primaryOpportunity?.opportunityDiscovery?.confidence,
      primaryOpportunity?.confidence,
      primaryOpportunity?.candidateScore,
    ) ?? 0,
    discoveryMaturity: firstNumber(
      primaryOpportunity?.discovery?.maturity,
      primaryOpportunity?.opportunityDiscovery?.maturity,
      primaryOpportunity?.maturity,
    ) ?? 0,
    novelty: firstNumber(
      primaryOpportunity?.discovery?.novelty,
      primaryOpportunity?.opportunityDiscovery?.novelty,
      primaryOpportunity?.novelty,
    ) ?? 50,
    currentSizingMode: trustGovernor.participationMode,
    currentMaxExposure: trustGovernor.maxExposure,
    targetNormalExposure: maxPositionPct,
  });
  const trustBlocksNewExposure =
    opensNewExposure &&
    trustGovernor.blockers.some((blocker) => blocker.severity === "high" || blocker.severity === "critical");
  const calibrationBlocksNewExposure = calibrationReviewRequired && opensNewExposure;
  const survivalBlocksNewExposure = opensNewExposure && survivalMemory.recommendation === "wait";
  const buyEligible =
    input.rawAction === "Buy" &&
    input.expectedEdgePct > 0 &&
    riskPassed &&
    !input.readiness.blocked &&
    !calibrationBlocksNewExposure &&
    !trustBlocksNewExposure &&
    !survivalBlocksNewExposure &&
    !beliefPreventsNewExposure &&
    !judgementBlocksNewExposure &&
    maxPositionPct > 0 &&
    financialSizing.sizingDecision === "allowed" &&
    financialSizing.suggestedExposurePct > 0;
  const suggestedExposure = buyEligible ? Math.min(
    judgementGate.adjustedExposurePct,
    trustGovernor.maxExposure,
    recovery.recommendedExposureCap,
  ) : 0;
  const calibrationReasons = calibrationBlocksNewExposure
    ? [
        calibrationStatus === "unstable-outcomes"
          ? "Calibration outcomes are unstable; review similar signals before opening new exposure."
          : calibrationStatus === "insufficient-history"
            ? "Calibration history is still insufficient; keep new exposure under review."
            : "The system sees a signal, but historical calibration does not yet support acting aggressively.",
      ]
    : rawConfidence - cappedConfidence >= 10 && opensNewExposure
      ? ["The system sees a signal, but historical calibration does not yet support acting aggressively."]
      : [];
  const readinessReasons = input.readiness.blocked && !calibrationBlocksNewExposure
    ? ["Strategy readiness is blocked; calibrated confidence does not support acting aggressively."]
    : [];
  const beliefReasons = beliefPreventsNewExposure
    ? [`Belief ${belief.verdict}: ${belief.reason}`]
    : [];
  const judgementReasons = opensNewExposure ? judgementGate.reasons : [];
  const trustReasons = opensNewExposure && trustGovernor.reasons.length
    ? trustGovernor.reasons
    : [];
  const recoveryReasons = opensNewExposure && recovery.reasons.length
    ? recovery.reasons
    : [];
  const survivalReasons = opensNewExposure && survivalMemory.scarCount > 0
    ? survivalMemory.reasons
    : [];
  const commitmentBlocked =
    input.readiness.blocked ||
    maxPositionPct <= 0 ||
    calibrationBlocksNewExposure ||
    survivalBlocksNewExposure ||
    beliefBlocksNewExposure ||
    judgementBlocksNewExposure ||
    trustBlocksNewExposure;
  const effectiveSizingResult = applyJudgementToSizingResult(
    financialSizing.sizingResult,
    judgement,
    judgementGate,
    opensNewExposure,
  );
  const trustAdjustedSizingResult = applyTrustGovernorToSizingResult(
    effectiveSizingResult,
    trustGovernor,
    opensNewExposure,
  );
  const recoveryAdjustedSizingResult = applyRecoveryToSizingResult(
    trustAdjustedSizingResult,
    recovery,
    opensNewExposure,
  );
  const sizingFields = {
    sizingMode: recoveryAdjustedSizingResult.mode,
    sizingReasons: unique([...readinessReasons, ...calibrationReasons, ...survivalReasons, ...beliefReasons, ...trustReasons, ...recoveryReasons, ...financialSizing.sizingReasons, ...judgementReasons]),
    sizingConstraints: financialSizing.sizingConstraints,
    sizingResult: recoveryAdjustedSizingResult,
    trustGovernor,
    recovery,
    viabilityVerdict: financialSizing.viabilityVerdict,
    viabilityReason: financialSizing.viabilityReason,
    viabilityWarnings: financialSizing.viabilityWarnings,
    viabilityBlockers: financialSizing.viabilityBlockers,
    viabilityMarginOfSafety: financialSizing.viabilityMarginOfSafety,
    viabilityResult: financialSizing.viabilityResult,
    survivalMemory,
  };
  const withExecutiveArchitecture = (decision: StrategySignalDecision): StrategySignalDecision => ({
    ...decision,
    ...buildStockExecutiveArchitecture({
      signalInput: input,
      decision,
    }),
  });

  if (sellRequested) {
    const sellSizingReasons = unique([
      belief.verdict !== "justified"
        ? "Risk-reducing exits remain allowed while Belief is not justified."
        : "",
      judgementRequiresReviewForNewExposure
        ? "Risk-reducing exits remain allowed while Judgement blocks or requires review for new exposure."
        : "",
      calibrationReviewRequired
        ? "Risk-reducing exits remain allowed while calibration blocks new exposure."
        : survivalBlocksNewExposure
          ? "Risk-reducing exits remain allowed while Survival Memory blocks new exposure."
        : trustGovernor.participationMode === "exits_only"
          ? "Risk-reducing exits remain allowed while the Signal Trust Governor blocks new exposure."
        : "Risk exit or negative edge; no new exposure is opened.",
      ...readinessReasons,
      ...financialSizing.sizingReasons,
    ]);

    return withExecutiveArchitecture({
      signalAction: "Sell",
      allocationAction: "Sell",
      signalStatus: "risk-exit",
      suggestedExposure: 0,
      maxPositionPct,
      signalConfidence: beliefAdjustedConfidence,
      rawConfidence,
      calibratedConfidence: judgementAdjustedConfidence,
      trustworthiness: judgementTrustworthiness,
      calibrationWarnings: input.readiness.calibration?.warnings ?? [],
      judgement,
      belief,
      rejectionReason: "Negative edge or risk exit",
      ...sizingFields,
      sizingReasons: sellSizingReasons,
      sizingDiagnostics: {
        volatilityMultiplier,
        drawdownMultiplier,
        liquidityMultiplier,
        confidenceMultiplier,
        benchmarkMultiplier,
        liveSignalMultiplier,
      },
    });
  }

  if (!buyEligible || suggestedExposure <= 0) {
    return withExecutiveArchitecture({
      signalAction: "Hold",
      allocationAction: commitmentBlocked ? "Blocked" : "Watch",
      signalStatus: commitmentBlocked ? "blocked" : "watch",
      suggestedExposure: 0,
      maxPositionPct,
      signalConfidence: beliefAdjustedConfidence,
      rawConfidence,
      calibratedConfidence: judgementAdjustedConfidence,
      trustworthiness: judgementTrustworthiness,
      calibrationWarnings: input.readiness.calibration?.warnings ?? [],
      judgement,
      belief,
      rejectionReason: calibrationReviewRequired
        ? "Calibration requires review"
        : survivalBlocksNewExposure
          ? "Survival memory blocks new exposure"
        : input.readiness.blocked
          ? "Strategy readiness is blocked"
          : judgement?.status === "blocked"
            ? "Judgement blocks new exposure"
          : judgement?.status === "review_required"
            ? "Judgement requires review"
          : beliefBlocksNewExposure
            ? `Belief ${belief.verdict} blocks new exposure`
          : beliefRequiresReview
            ? "Belief requires review"
          : trustBlocksNewExposure
            ? trustGovernor.blockers[0]!.label
          : !riskPassed
            ? "Risk checks did not pass"
            : "Viability checks did not pass",
      ...sizingFields,
      sizingDiagnostics: {
        volatilityMultiplier,
        drawdownMultiplier,
        liquidityMultiplier,
        confidenceMultiplier,
        benchmarkMultiplier,
        liveSignalMultiplier,
      },
    });
  }

  return withExecutiveArchitecture({
    signalAction: "Buy",
    allocationAction: "Buy",
    signalStatus: "confirmed",
    suggestedExposure,
    maxPositionPct,
    signalConfidence: beliefAdjustedConfidence,
    rawConfidence,
    calibratedConfidence: judgementAdjustedConfidence,
    trustworthiness: judgementTrustworthiness,
    calibrationWarnings: input.readiness.calibration?.warnings ?? [],
    judgement,
    belief,
    rejectionReason: null,
    ...sizingFields,
    sizingDiagnostics: {
      volatilityMultiplier,
      drawdownMultiplier,
      liquidityMultiplier,
      confidenceMultiplier,
      benchmarkMultiplier,
      liveSignalMultiplier,
    },
  });
}

function hasJudgementEvidence(input: StrategySignalInput) {
  return (
    Array.isArray(input.previousTrades) && input.previousTrades.length > 0
  ) || (
    Array.isArray(input.strategyHistory) && input.strategyHistory.length > 0
  ) || (
    input.forwardShadow != null && numberOrZero(firstNumber(input.forwardShadow.evaluatedSignalCount, input.forwardShadow.evaluatedSignals)) > 0
  ) || (
    Array.isArray(input.opportunityCandidates) && input.opportunityCandidates.length > 0
  ) || (
    input.agencyResult != null
  );
}

function applyJudgementToSizingResult(
  sizingResult: SizingResult,
  judgement: JudgementResult | undefined,
  gate: ReturnType<typeof judgementExposureGate>,
  opensNewExposure: boolean,
): SizingResult {
  if (!judgement || !opensNewExposure) return sizingResult;

  const reasons = unique([...sizingResult.reasons, ...gate.reasons]);

  if (!gate.allowsNewExposure) {
    return {
      ...sizingResult,
      decision: gate.blocksNewExposure ? "blocked" : "deferred",
      mode: "none",
      size: 0,
      normalizedSize: 0,
      reasons,
    };
  }

  if (gate.exposureMultiplier < 1) {
    return {
      ...sizingResult,
      size: roundSizing(sizingResult.size * gate.exposureMultiplier),
      normalizedSize: roundSizing(sizingResult.normalizedSize * gate.exposureMultiplier),
      reasons,
    };
  }

  return {
    ...sizingResult,
    reasons,
  };
}

function applyTrustGovernorToSizingResult(
  sizingResult: SizingResult,
  trustGovernor: TrustGovernorResult,
  opensNewExposure: boolean,
): SizingResult {
  if (!opensNewExposure) return sizingResult;

  const reasons = unique([...trustGovernor.reasons, ...sizingResult.reasons]);

  if (!trustGovernor.allowsNewExposure) {
    return {
      ...sizingResult,
      decision: sizingResult.decision === "blocked" || trustGovernor.participationMode === "blocked" ? "blocked" : "deferred",
      mode: "none",
      size: 0,
      normalizedSize: 0,
      reasons,
    };
  }

  const cappedSize = Math.min(sizingResult.size, trustGovernor.maxExposure);
  if (cappedSize < sizingResult.size) {
    const ratio = cappedSize / sizingResult.size;
    return {
      ...sizingResult,
      size: roundSizing(cappedSize),
      normalizedSize: roundSizing(sizingResult.normalizedSize * ratio),
      reasons,
    };
  }

  return {
    ...sizingResult,
    reasons,
  };
}

function applyRecoveryToSizingResult(
  sizingResult: SizingResult,
  recovery: RecoveryResult,
  opensNewExposure: boolean,
): SizingResult {
  if (!opensNewExposure) return sizingResult;

  const reasons = unique([...sizingResult.reasons, ...recovery.reasons]);
  if (recovery.recommendedExposureCap <= 0) {
    return {
      ...sizingResult,
      decision: "blocked",
      mode: "none",
      size: 0,
      normalizedSize: 0,
      reasons,
    };
  }

  return {
    ...sizingResult,
    reasons,
  };
}

function roundSizing(value: number) {
  return Number(value.toFixed(2));
}

function buildSignalSizingConstraints(
  input: StrategySignalInput,
  riskPassed: boolean,
  cappedConfidence: number,
  belief: TradeBeliefDiagnostic,
): SizingConstraint[] {
  const liquidityScore = numberOrZero(input.liquidityScore ?? 70);
  const opensNewExposure = input.rawAction === "Buy" && input.expectedEdgePct > 0;
  return [
    {
      id: "signal-persistence",
      label: "Signal persistence",
      type: "soft",
      passed: input.readiness.components.liveSignalConsistency.passed,
      severity: "medium",
      reason: "Forward signal persistence is not strong enough for full position sizing.",
    },
    {
      id: "cross-timeframe-agreement",
      label: "Cross-timeframe agreement",
      type: "soft",
      passed:
        input.readiness.components.walkForwardRobustness.passed &&
        input.readiness.components.parameterRobustness.passed,
      severity: "high",
      reason: "Walk-forward or parameter evidence does not agree across tests.",
    },
    {
      id: "liquidity-data-availability",
      label: "Liquidity and data availability",
      type: "hard",
      passed: input.readiness.components.dataReliability.passed && liquidityScore >= 35,
      severity: "high",
      reason: "Liquidity or data completeness is insufficient for sizing.",
    },
    {
      id: "volatility-acceptance",
      label: "Volatility acceptance",
      type: "hard",
      passed: input.volatilityPct <= 12,
      severity: "high",
      reason: "Volatility exceeds the accepted range for position sizing.",
    },
    {
      id: "confidence-stability",
      label: "Confidence stability",
      type: "soft",
      passed: input.readiness.components.modelConfidence.passed && cappedConfidence >= 35,
      severity: "medium",
      reason: "Confidence is unstable or capped by readiness checks.",
    },
    {
      id: "opportunity-density",
      label: "Opportunity density",
      type: "hard",
      passed: input.rawAction === "Buy" && input.expectedEdgePct > 0 && input.rawSuggestedExposurePct > 0,
      severity: "high",
      reason: "Actionable opportunity density is too low for new exposure.",
    },
    {
      id: "risk-gate",
      label: "Risk gate",
      type: "hard",
      passed: riskPassed,
      severity: "high",
      reason: "Risk gates prevent position sizing.",
    },
    {
      id: "belief-justification",
      label: "Belief justification",
      type: "hard",
      passed: !opensNewExposure || belief.verdict === "justified",
      severity: belief.verdict === "weak" ? "high" : "critical",
      reason: `Belief ${belief.verdict}: ${belief.reason}`,
    },
    {
      id: "strategy-readiness",
      label: "Strategy readiness",
      type: "hard",
      passed: !input.readiness.blocked && input.readiness.maxPositionPct > 0,
      severity: "critical",
      reason: "Strategy readiness gates do not allow new exposure.",
    },
  ];
}

function buildSignalViabilityInput(
  input: StrategySignalInput,
  sizingConstraints: SizingConstraint[],
  cappedConfidence: number,
  riskPassed: boolean,
  belief: TradeBeliefDiagnostic,
): FinancialExposureViabilityInput {
  const liquidityScore = numberOrZero(input.liquidityScore ?? 70);
  const benchmarkExcess = numberOrZero(input.readiness.benchmarks.excessReturnAfterCostsPct);
  const expectedBenefit = clamp(
    input.setupQuality * 0.42 +
      input.readiness.components.strategyEdge.score * 0.22 +
      input.readiness.components.liveSignalConsistency.score * 0.14 +
      Math.max(0, input.expectedEdgePct) * 5 +
      Math.max(0, benchmarkExcess) * 1.5,
  );
  const expectedCost = clamp(
    input.volatilityPct * 4 +
      Math.max(0, 100 - liquidityScore) * 0.25 +
      Math.max(0, -benchmarkExcess) * 4,
  );
  const expectedRisk = Math.max(input.riskPressure, input.volatilityPct * 6);
  const uncertainty = clamp(
    Math.max(
      100 - cappedConfidence,
      100 - numberOrZero(input.readiness.trustworthiness),
    ),
  );

  return {
    expectedBenefit,
    expectedCost,
    expectedRisk,
    uncertainty,
    confidence: cappedConfidence,
    minMarginOfSafety: 0,
    thresholds: {
      minConfidence: 35,
      maxRisk: 72,
      maxUncertainty: 70,
      maxCost: 85,
    },
    constraints: [
      ...sizingConstraints.map((constraint) => ({
        id: constraint.id,
        label: constraint.label,
        type: constraint.type,
        hard: constraint.type === "hard",
        passed: constraint.passed,
        severity: constraint.severity,
        reason: constraint.reason,
        dimension: "sizing",
      })),
      {
        id: "belief-justification",
        label: "Belief justification",
        type: "hard",
        hard: true,
        passed: input.rawAction !== "Buy" || input.expectedEdgePct <= 0 || belief.verdict === "justified",
        severity: belief.verdict === "weak" ? "high" : "critical",
        reason: `Belief ${belief.verdict}: ${belief.reason}`,
        dimension: "belief",
      },
      {
        id: "positive-expected-edge",
        label: "Positive expected edge",
        type: "hard",
        hard: true,
        passed: input.rawAction !== "Buy" || input.expectedEdgePct > 0,
        severity: "high",
        reason: "Expected edge must be positive before opening new exposure.",
        dimension: "benefit",
      },
      {
        id: "readiness-commitment",
        label: "Readiness commitment",
        type: "hard",
        hard: true,
        passed: !input.readiness.blocked && input.readiness.maxPositionPct > 0,
        severity: "critical",
        reason: "Strategy readiness gates block new exposure.",
        dimension: "constraint",
      },
      {
        id: "risk-acceptance",
        label: "Risk acceptance",
        type: "hard",
        hard: true,
        passed: riskPassed,
        severity: "high",
        reason: "Risk and volatility must remain inside the accepted range.",
        dimension: "risk",
      },
    ],
    context: {
      expectedEdgePct: input.expectedEdgePct,
      setupQuality: input.setupQuality,
      riskPressure: input.riskPressure,
      volatilityPct: input.volatilityPct,
      liquidityScore,
      benchmarkExcess,
    },
  };
}

export function strategyReadinessStageRank(stage: StrategyReadinessStage) {
  return PRODUCTION_STAGES.indexOf(stage);
}
