import assert from "node:assert/strict";
import test from "node:test";
import {
  StrategyReadinessEvaluator,
  applyStrategyReadinessToSummary,
  classifyStrategySignal,
  strategyReadinessStageRank,
  type StrategyReadinessResult,
} from "./strategy-readiness";
import { financialExposureBandForSizingMode, sizeFinancialExposure } from "./financial-sizing";
import { buildRestorationProgress } from "./restoration-progress";

const evaluator = new StrategyReadinessEvaluator();

const config = {
  maxPositionPct: 20,
  minimumTrades: 30,
  minimumWalkForwardSegments: 3,
  benchmarkSafetyMarginPct: 2,
  costBps: 6,
  minimumForwardSignals: 20,
};

const dataQualityReport = {
  quality: "real",
  promotionEligibleData: true,
  syntheticSymbols: 0,
  fallbackSymbols: 0,
  duplicateTimestampSymbols: 0,
};

const parameterRobustness = {
  stable: true,
  passRate: 87.5,
  benchmarkSurvivalRate: 91,
  variants: [
    { configId: "lookback-80", excessReturnPct: 7.1, passed: true },
    { configId: "lookback-120", excessReturnPct: 6.5, passed: true },
    { configId: "holding-80", excessReturnPct: 4.3, passed: true },
    { configId: "holding-120", excessReturnPct: 3.4, passed: true },
  ],
};

const forwardShadow = {
  passed: true,
  evaluatedSignalCount: 24,
  requiredSignals: 20,
  hitRatePct: 62,
  averageReturnPct: 0.8,
};

const longHistoryDiagnostics = {
  historyCoverageYears: 15,
  historyDepthScore: 96,
  regimeCoverageScore: 94,
  regimeDiversityScore: 91,
  sampleDiversityScore: 89,
  temporalConcentrationScore: 10,
  coverageStatus: "full" as const,
  currentRegime: "recovery",
  keyRegimesCovered: ["bull", "bear", "crash", "recovery", "volatility_transition"],
  regimeCounts: { bull: 1000, bear: 700, crash: 100, recovery: 400, volatility_transition: 250 },
  explanation: "Extended history improves regime awareness and calibration. Recent outcomes still govern sizing restoration.",
};

function trades(count = 40, returnPct = 1.2) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: `T${index}`,
    returnPct: index % 5 === 0 ? returnPct * 0.5 : returnPct,
    entryExposure: 5,
  }));
}

function judgementTrades(returns: number[]) {
  return returns.map((returnPct, index) => ({
    symbol: `J${index}`,
    returnPct,
    entryExposure: 5,
    setupQuality: 84,
    riskPressure: 24,
    volatilityPct: 3,
    confidence: 70,
  }));
}

function walkForward(...returns: number[]) {
  return returns.map((returnPct, index) => ({
    index,
    returnPct,
    startDate: `2025-0${index + 1}-01`,
    endDate: `2025-0${index + 1}-28`,
  }));
}

function passingInput(overrides: any = {}) {
  const summary = {
    totalReturnPct: 36,
    portfolioReturnPct: 36,
    benchmarkReturnPct: 12,
    buyHoldBenchmarkReturnPct: 10,
    annualizedSharpe: 1.8,
    sharpeRatio: 1.8,
    maxDrawdownPct: 9,
    tradeCount: 42,
    promotionConfidence: 92,
    survivalScore: 90,
    slippageBps: 4,
    commissionBps: 2,
    walkForwardSegments: walkForward(8, 7, 5, 4),
  };

  return {
    market: "NASDAQ",
    summary: { ...summary, ...(overrides.summary ?? {}) },
    trades: overrides.trades ?? trades(),
    walkForwardSegments: overrides.walkForwardSegments ?? summary.walkForwardSegments,
    parameterRobustness: overrides.parameterRobustness ?? parameterRobustness,
    dataQualityReport: overrides.dataQualityReport ?? dataQualityReport,
    forwardShadow: overrides.forwardShadow ?? forwardShadow,
    config: { ...config, ...(overrides.config ?? {}) },
  };
}

function evaluate(overrides: any = {}) {
  return evaluator.evaluate(passingInput(overrides));
}

function survivalMemory(overrides: Record<string, unknown> = {}) {
  return {
    module: "stocks.survival-memory",
    name: "Survival Memory",
    status: "near_ruin",
    recommendation: "wait",
    recordCount: 4,
    matchedCount: 4,
    scarCount: 3,
    nearRuinCount: 1,
    averageSurvivalCost: 72,
    recoveryBurden: 60,
    survivalConfidence: 28,
    currentStateSimilarity: 82,
    exposureMultiplier: 0,
    confidencePenalty: 55,
    maxExposurePct: 0,
    stateFingerprint: "venue:nasdaq|action:buy",
    mainWarnings: ["Similar states include near-ruin survival patterns."],
    reasons: ["Wait because similar states had unacceptable survival cost."],
    missingEvidence: ["Survival memory clearance"],
    unlockConditions: ["Wait until similar states show survival cost below 35/100 and no near-ruin match."],
    invalidationConditions: ["Invalidate if liquidity or tail pressure remains elevated in the current state."],
    fragileMatches: [],
    records: [],
    ...overrides,
  } as any;
}

function cleanReducedSizeRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    timestamp: "2026-05-28T00:00:00.000Z",
    stateFingerprint: "venue:binance|action:buy",
    action: "buy",
    maxExposure: 1,
    realizedReturn: 1.2,
    maxDrawdown: 4,
    maxAdverseExcursion: 6,
    recoveryTimeBars: 2,
    volatilityExpansion: 8,
    tailRisk: 10,
    liquidityStress: 8,
    structuralDanger: 9,
    novelty: 12,
    opportunityDensity: 35,
    outcomeClass: "comfortable_survival",
    survivalCost: 10,
    scarWeight: 0,
    ...overrides,
  };
}

function cleanReducedSizeRecords(count = 3) {
  return Array.from({ length: count }, (_, index) => cleanReducedSizeRecord(`clean-${index + 1}`));
}

function hasFlag(result: StrategyReadinessResult, flag: string) {
  return result.failureFlags.includes(flag);
}

test("high data reliability cannot promote a bad strategy", () => {
  const result = evaluate({
    summary: {
      annualizedSharpe: 0.31,
      sharpeRatio: 0.31,
      maxDrawdownPct: 55,
      promotionConfidence: 96,
    },
  });

  assert.equal(result.components.dataReliability.passed, true);
  assert.equal(result.components.strategyEdge.passed, false);
  assert.equal(result.components.riskControl.passed, false);
  assert.equal(result.stage, "Research only");
  assert.equal(result.blocked, true);
  assert.equal(hasFlag(result, "LOW_SHARPE"), true);
  assert.equal(hasFlag(result, "HIGH_DRAWDOWN"), true);
  assert.ok(result.maxConfidence <= 25);
});

test("positive total return still blocks when benchmarks win after costs and margin", () => {
  const result = evaluate({
    summary: {
      totalReturnPct: 18,
      portfolioReturnPct: 18,
      benchmarkReturnPct: 22,
      buyHoldBenchmarkReturnPct: 24,
    },
  });

  assert.equal(result.stage, "Research only");
  assert.equal(result.components.benchmarkEdge.passed, false);
  assert.equal(result.benchmarks.bestBaselineReturnPct, 24);
  assert.equal(hasFlag(result, "BENCHMARK_FAILED"), true);
  assert.equal(hasFlag(result, "WEAK_BENCHMARK_MARGIN"), true);
});

test("high drawdown blocks readiness and caps confidence", () => {
  const result = evaluate({
    summary: {
      maxDrawdownPct: 31,
      promotionConfidence: 88,
    },
  });

  assert.equal(result.components.riskControl.passed, false);
  assert.equal(result.stage, "Research only");
  assert.equal(hasFlag(result, "HIGH_DRAWDOWN"), true);
  assert.ok(result.maxConfidence <= 25);
});

test("unstable walk-forward windows block promotion and surface the weakest period", () => {
  const result = evaluate({
    walkForwardSegments: walkForward(18, -12, 1),
    summary: {
      walkForwardSegments: walkForward(18, -12, 1),
    },
  });

  assert.equal(result.components.walkForwardRobustness.passed, false);
  assert.equal(result.walkForward.weakestPeriod?.index, 1);
  assert.equal(result.walkForward.bestPeriodContributionPct > 60, true);
  assert.equal(hasFlag(result, "WALK_FORWARD_UNSTABLE"), true);
  assert.equal(hasFlag(result, "OVERFIT_WALK_FORWARD_INSTABILITY"), true);
});

test("nearby parameter fragility blocks the selected configuration", () => {
  const result = evaluate({
    parameterRobustness: {
      stable: false,
      passRate: 37.5,
      benchmarkSurvivalRate: 50,
      variants: [{ configId: "lookback-80", excessReturnPct: -2, passed: false }],
    },
  });

  assert.equal(result.components.parameterRobustness.passed, false);
  assert.equal(result.parameterStability.stable, false);
  assert.equal(result.parameterStability.variants.length, 1);
  assert.equal(hasFlag(result, "PARAMETER_INSTABILITY"), true);
});

test("outlier-dependent returns block readiness and report trade concentration metrics", () => {
  const concentratedTrades = [
    { symbol: "A", returnPct: 120, entryExposure: 10 },
    ...trades(18, 1),
  ];
  const result = evaluate({ trades: concentratedTrades });

  assert.equal(result.components.concentrationControl.passed, false);
  assert.equal(result.concentration.outlierDependent, true);
  assert.equal(result.concentration.top1TradeContributionPct > 45, true);
  assert.equal(result.concentration.top5TradeContributionPct > 80, true);
  assert.equal(hasFlag(result, "OUTLIER_DEPENDENCY"), true);
  assert.equal(hasFlag(result, "OVERFIT_TOP_WINNER_DEPENDENCY"), true);
});

test("loss-limit walk-forward failures do not masquerade as concentration dependency", () => {
  const result = evaluate({
    walkForwardSegments: walkForward(5, 5, -12),
    summary: {
      walkForwardSegments: walkForward(5, 5, -12),
    },
    trades: trades(40, 1.2),
  });

  assert.equal(result.components.walkForwardRobustness.passed, false);
  assert.equal(result.walkForward.periodConcentrated, false);
  assert.equal(result.components.concentrationControl.passed, true);
  assert.equal(hasFlag(result, "WALK_FORWARD_UNSTABLE"), true);
  assert.equal(hasFlag(result, "OUTLIER_DEPENDENCY"), false);
});

test("non-positive median trade return blocks concentration clearance", () => {
  const medianNegativeTrades = [
    ...Array.from({ length: 21 }, (_, index) => ({
      symbol: `LOSS${index}`,
      returnPct: -0.05,
      entryExposure: 5,
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      symbol: `WIN${index}`,
      returnPct: 0.25,
      entryExposure: 5,
    })),
  ];
  const result = evaluate({ trades: medianNegativeTrades });

  assert.equal(result.concentration.medianTradeReturnPositive, false);
  assert.equal(result.components.concentrationControl.passed, false);
  assert.equal(result.components.concentrationControl.reasons.includes("Median trade return is not positive."), true);
  assert.equal(hasFlag(result, "OUTLIER_DEPENDENCY"), true);
  assert.equal(hasFlag(result, "MEDIAN_TRADE_RETURN_NOT_POSITIVE"), true);
  assert.equal(hasFlag(result, "OVERFIT_TOP_WINNER_DEPENDENCY"), false);
});

test("zero max-position readiness cannot produce buy ideas", () => {
  const blocked = evaluate({
    summary: {
      annualizedSharpe: 0.31,
      sharpeRatio: 0.31,
      maxDrawdownPct: 55,
    },
  });
  const decision = classifyStrategySignal({
    readiness: blocked,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 80,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 95,
  });

  assert.equal(blocked.maxPositionPct, 0);
  assert.equal(decision.signalAction, "Hold");
  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.suggestedExposure, 0);
  assert.equal(decision.signalConfidence, blocked.maxConfidence);
  assert.equal(decision.sizingResult.decision, "blocked");
  assert.equal(decision.sizingMode, "none");
  assert.ok(decision.sizingReasons.some((reason) => reason.includes("Strategy readiness")));
});

test("buy requires positive edge, passed readiness, passed risk checks, and non-zero sizing", () => {
  const ready = evaluate();
  const buy = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
  });
  const noEdge = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: -1,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
  });
  const highRisk = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 76,
    volatilityPct: 13,
    liquidityScore: 95,
    signalConfidence: 91,
  });

  assert.equal(ready.productionEligible, true);
  assert.equal(ready.trustGovernor.allowsNewExposure, true);
  assert.equal(buy.signalAction, "Buy");
  assert.equal(buy.allocationAction, "Buy");
  assert.equal(buy.belief.verdict, "justified");
  assert.equal(buy.trustGovernor?.allowsNewExposure, true);
  assert.equal(buy.suggestedExposure > 0, true);
  assert.equal(buy.sizingResult.decision, "allowed");
  assert.ok(buy.sizingConstraints.some((constraint) => constraint.id === "belief-justification" && constraint.passed));
  assert.ok(buy.viabilityResult?.constraints.some((constraint) => constraint.id === "belief-justification" && constraint.passed));
  assert.notEqual(buy.sizingMode, "none");
  assert.ok(buy.sizingReasons.includes("All sizing constraints passed."));
  assert.equal(noEdge.signalAction, "Sell");
  assert.equal(noEdge.suggestedExposure, 0);
  assert.equal(noEdge.sizingMode, "none");
  assert.equal(highRisk.signalAction, "Hold");
  assert.equal(highRisk.allocationAction, "Watch");
  assert.equal(highRisk.suggestedExposure, 0);
  assert.equal(highRisk.sizingResult.decision, "blocked");
  assert.ok(highRisk.sizingReasons.some((reason) => reason.includes("Risk gate")));
});

test("survival memory caps sizing before opportunity sizing expands exposure", () => {
  const ready = evaluate();
  const capped = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 34,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 88,
    previousTrades: Array.from({ length: 6 }, (_, index) => ({
      symbol: `SM${index}`,
      returnPct: 4,
      entryExposure: 8,
      setupQuality: 84,
      riskPressure: 34,
      volatilityPct: 3,
      liquidityScore: 90,
      maxDrawdownPct: 18,
      maxAdverseExcursion: 21,
      recoveryTimeBars: 18,
      tailRisk: 42,
    })),
  });

  assert.ok(capped.survivalMemory);
  assert.ok(capped.survivalMemory!.scarCount > 0);
  assert.ok(capped.maxPositionPct < ready.maxPositionPct);
  assert.ok(capped.sizingReasons.some((reason) => reason.includes("Survival memory capped max exposure")));
});

test("survival memory can block buys and still allow risk exits", () => {
  const ready = evaluate();
  const blockedBuy = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 4,
    setupQuality: 84,
    riskPressure: 34,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 88,
    survivalMemory: survivalMemory(),
    previousTrades: judgementTrades(Array(16).fill(6)),
  });
  const riskExit = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 4,
    setupQuality: 84,
    riskPressure: 90,
    volatilityPct: 8,
    liquidityScore: 90,
    signalConfidence: 88,
    survivalMemory: survivalMemory(),
  });

  assert.equal(blockedBuy.allocationAction, "Blocked");
  assert.equal(blockedBuy.rejectionReason, "Survival memory blocks new exposure");
  assert.equal(blockedBuy.judgement?.status, "blocked");
  assert.equal(blockedBuy.trustGovernor?.primaryBlocker, "survival_memory_wait");
  assert.equal(blockedBuy.trustGovernor?.audit.survivalRecovery?.trustedMaxExposure, 0);
  assert.equal(riskExit.signalAction, "Sell");
  assert.ok(riskExit.sizingReasons.includes("Risk-reducing exits remain allowed while Survival Memory blocks new exposure."));
});

test("long-history may improve trust and calibration but cannot clear Survival Memory or restore sizing", () => {
  const baseline = evaluate();
  const withHistory = evaluator.evaluate(passingInput({
    summary: { historyDiagnostics: longHistoryDiagnostics },
    dataQualityReport: { ...dataQualityReport, historyDiagnostics: longHistoryDiagnostics },
  }));
  const lockedReadiness = evaluator.evaluate({
    ...passingInput({
      summary: { historyDiagnostics: longHistoryDiagnostics },
      dataQualityReport: { ...dataQualityReport, historyDiagnostics: longHistoryDiagnostics },
    }),
    survivalMemory: survivalMemory(),
  });
  const lockedDecision = classifyStrategySignal({
    readiness: withHistory,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 90,
    riskPressure: 18,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 92,
    survivalMemory: survivalMemory(),
    previousTrades: judgementTrades(Array(20).fill(5)),
  });

  assert.ok(withHistory.trustworthiness >= baseline.trustworthiness);
  assert.ok(withHistory.calibratedConfidence >= baseline.calibratedConfidence);
  assert.equal(withHistory.historyDiagnostics?.coverageStatus, "full");
  assert.equal(lockedReadiness.survivalMemory?.status, "near_ruin");
  assert.equal(lockedReadiness.maxPositionPct, 0);
  assert.equal(lockedReadiness.trustGovernor.allowsNewExposure, false);
  assert.equal(lockedReadiness.recovery.canRestoreSizing, false);
  assert.equal(lockedDecision.allocationAction, "Blocked");
  assert.equal(lockedDecision.suggestedExposure, 0);
  assert.equal(lockedDecision.trustGovernor?.primaryBlocker, "survival_memory_wait");
  assert.equal(lockedDecision.recovery?.canRestoreSizing, false);
});

test("low long-history scores do not grant calibration credit", () => {
  const lowHistory = {
    ...longHistoryDiagnostics,
    historyDepthScore: 70,
    regimeCoverageScore: 70,
    regimeDiversityScore: 70,
    sampleDiversityScore: 70,
    coverageStatus: "partial" as const,
  };
  const result = evaluator.evaluate(passingInput({
    summary: { historyDiagnostics: lowHistory },
    dataQualityReport: { ...dataQualityReport, historyDiagnostics: lowHistory },
  }));

  assert.equal((result as any).extendedHistoryCredit, undefined);
});

test("readiness recovery includes near-ruin survival flags and summary discovery fallbacks", () => {
  const result = evaluator.evaluate({
    ...passingInput({
      summary: {
        opportunityDiscovery: { confidence: 42, maturity: 44 },
        opportunityNovelty: 71,
      },
    }),
    survivalMemory: survivalMemory({
      status: "near_ruin",
      recommendation: "wait",
      survivalConfidence: 32,
      exposureMultiplier: 0,
      maxExposurePct: 0,
    }),
  });

  assert.equal(hasFlag(result, "SURVIVAL_NEAR_RUIN"), true);
  assert.ok(result.maxConfidence <= 35);
  assert.equal(result.recovery.audit.normalized.discoveryConfidence, 42);
  assert.equal(result.recovery.audit.normalized.discoveryMaturity, 44);
  assert.equal(result.recovery.audit.normalized.novelty, 71);
});

test("recovery diagnostics keep scarred dashboard-like states recovering and review gated", () => {
  const base = evaluate();
  const ready = {
    ...base,
    maxConfidence: 73,
    rawConfidence: 85,
    calibratedConfidence: 73,
    trustworthiness: 80,
    maxPositionPct: 5.5,
    robustnessDiagnostics: { overfitRisk: 29 },
    recovery: {
      ...base.recovery,
      audit: {
        ...base.recovery.audit,
        normalized: {
          ...base.recovery.audit.normalized,
          targetNormalExposure: 7.25,
        },
      },
    },
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 4,
    setupQuality: 100,
    riskPressure: 22,
    volatilityPct: 2,
    liquidityScore: 95,
    signalConfidence: 85,
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      scarCount: 89,
      nearRuinCount: 54,
      averageSurvivalCost: 29,
      recoveryBurden: 9,
      survivalConfidence: 66,
      currentStateSimilarity: 62,
      exposureMultiplier: 0.27,
      maxExposurePct: 1.5,
    }),
    previousTrades: judgementTrades([...Array(999).fill(6), ...Array(50).fill(-2)]),
    opportunityCandidates: [
      {
        symbol: "SOLUSDT",
        candidateScore: 56,
        opportunityDiscovery: { confidence: 36, maturity: 39, novelty: 93 },
      },
    ],
    agencyResult: { violations: ["blocked participation", "reduce participation"] },
  });

  assert.equal(decision.recovery?.module, "signal.recovery");
  assert.equal(decision.recovery?.status, "recovering");
  assert.notEqual(decision.recovery?.mode, "normal");
  assert.equal(decision.recovery?.canRestoreSizing, false);
  assert.equal(decision.recovery?.shouldEscalateHumanReview, true);
  assert.ok(decision.recovery?.recommendedExposureCap > 0);
  assert.equal(decision.restorationProgress?.module, "stocks.restoration-progress");
  assert.equal(decision.restorationProgress?.status, "collecting_evidence");
  assert.equal(decision.restorationProgress?.restorationState, "scarred");
  assert.equal(decision.restorationProgress?.ledger.title, "Survival Memory Restoration Ledger");
  assert.equal(decision.restorationProgress?.ledger.requiredCleanOutcomes, 3);
  assert.equal(decision.restorationProgress?.targetNormalExposurePct, 7.25);
  assert.equal(decision.restorationProgress?.canRestoreSizing, false);
  assert.equal(decision.restorationProgress?.outcomeProof.cleanReducedSizeOutcomeCount, 0);
  assert.ok(decision.restorationProgress?.gates.some((gate) => gate.id === "clean-reduced-size-outcomes" && !gate.passed));
  assert.ok(decision.sizingReasons.some((reason) => reason.includes("Recovery is recovering")));
});

test("recovery target exposure falls back when readiness recovery audit is unavailable", () => {
  const ready = {
    ...evaluate(),
    recovery: undefined,
    maxPositionPct: 4.5,
  } as any;
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 4,
    setupQuality: 86,
    riskPressure: 24,
    volatilityPct: 3,
    liquidityScore: 92,
    signalConfidence: 88,
  });

  assert.equal(decision.restorationProgress?.targetNormalExposurePct, 4.5);
});

test("judgement and survival caps do not masquerade as poor calibration blocks", () => {
  const ready = {
    ...evaluate(),
    maxConfidence: 85,
    rawConfidence: 95,
    calibratedConfidence: 85,
    trustworthiness: 84,
    maxPositionPct: 2.66,
    robustnessDiagnostics: { overfitRisk: 29 },
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 2.4,
    rawSuggestedExposurePct: 4,
    setupQuality: 100,
    riskPressure: 24,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 84,
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      scarCount: 71,
      nearRuinCount: 44,
      averageSurvivalCost: 29,
      recoveryBurden: 10,
      survivalConfidence: 68,
      currentStateSimilarity: 50,
      exposureMultiplier: 0.65,
      confidencePenalty: 15,
      maxExposurePct: 1.73,
      mainWarnings: [
        "Similar states include near-ruin survival patterns.",
        "Similar states were profitable but carried unacceptable drawdown or stress.",
      ],
      reasons: [
        "Survival memory status is scarred with confidence 68/100.",
        "Cap exposure to 65% of the normal limit before opportunity sizing expands it.",
      ],
    }),
    previousTrades: judgementTrades([...Array(120).fill(6), ...Array(8).fill(-1)]),
    opportunityCandidates: [
      {
        symbol: "SOLUSDT",
        candidateScore: 57,
        opportunityDiscovery: { confidence: 32, maturity: 38, novelty: 93 },
      },
    ],
    agencyResult: { blockedActions: [] },
  });

  assert.equal(decision.judgement?.status, "cautious");
  assert.equal(decision.trustGovernor?.allowsNewExposure, true);
  assert.equal(decision.trustGovernor?.blockers.some((blocker) => blocker.id === "raw_calibrated_confidence_gap"), false);
  assert.equal(decision.trustGovernor?.primaryBlocker, "survival_reduced_size");
  assert.equal(decision.signalAction, "Buy");
  assert.equal(decision.allocationAction, "Buy");
  assert.ok(decision.suggestedExposure > 0);
  assert.ok(decision.suggestedExposure <= (decision.recovery?.recommendedExposureCap ?? 0));
  assert.ok(decision.sizingResult.size <= (decision.recovery?.recommendedExposureCap ?? 0));
});

test("recovery can restore normal mode after survival, trust, calibration, agency, and discovery clear", () => {
  const ready = {
    ...evaluate(),
    maxConfidence: 82,
    rawConfidence: 86,
    calibratedConfidence: 74,
    trustworthiness: 82,
    maxPositionPct: 5.5,
    robustnessDiagnostics: { overfitRisk: 24 },
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 4,
    setupQuality: 100,
    riskPressure: 18,
    volatilityPct: 2,
    liquidityScore: 95,
    signalConfidence: 86,
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      scarCount: 12,
      nearRuinCount: 0,
      averageSurvivalCost: 18,
      recoveryBurden: 6,
      survivalConfidence: 76,
      currentStateSimilarity: 24,
      exposureMultiplier: 0.58,
      confidencePenalty: 0,
      maxExposurePct: 3.2,
      mainWarnings: ["Controlled survival scars are improving."],
      reasons: ["Recovery evidence is improving."],
      records: cleanReducedSizeRecords(),
    }),
    previousTrades: judgementTrades([...Array(120).fill(6), ...Array(8).fill(-1)]),
    opportunityCandidates: [
      {
        symbol: "SOLUSDT",
        candidateScore: 78,
        discovery: { confidence: 68, maturity: 66, novelty: 28 },
      },
    ],
    agencyResult: { blockedActions: [] },
  });

  assert.equal(decision.recovery?.status, "restored");
  assert.equal(decision.recovery?.mode, "normal");
  assert.equal(decision.recovery?.canRestoreSizing, true);
  assert.equal(decision.recovery?.shouldEscalateHumanReview, false);
  assert.equal(decision.recovery?.trustedCapacity, 100);
  assert.equal(decision.restorationProgress?.status, "restored");
  assert.equal(decision.restorationProgress?.restorationState, "clear");
  assert.equal(decision.restorationProgress?.progressPct, 100);
  assert.equal(decision.restorationProgress?.gates.every((gate) => gate.passed), true);
});

test("restoration blocks normal sizing until clean reduced-size outcomes clear", () => {
  const ready = {
    ...evaluate(),
    maxConfidence: 82,
    rawConfidence: 86,
    calibratedConfidence: 74,
    trustworthiness: 82,
    maxPositionPct: 5.5,
    robustnessDiagnostics: { overfitRisk: 24 },
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 4,
    setupQuality: 100,
    riskPressure: 18,
    volatilityPct: 2,
    liquidityScore: 95,
    signalConfidence: 86,
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      scarCount: 12,
      nearRuinCount: 0,
      averageSurvivalCost: 18,
      recoveryBurden: 6,
      survivalConfidence: 76,
      currentStateSimilarity: 24,
      exposureMultiplier: 0.58,
      confidencePenalty: 0,
      maxExposurePct: 3.2,
      mainWarnings: ["Controlled survival scars are improving."],
      reasons: ["Recovery evidence is improving."],
    }),
    previousTrades: judgementTrades([...Array(120).fill(6), ...Array(8).fill(-1)]),
    opportunityCandidates: [
      {
        symbol: "SOLUSDT",
        candidateScore: 78,
        discovery: { confidence: 68, maturity: 66, novelty: 28 },
      },
    ],
    agencyResult: { blockedActions: [] },
  });

  assert.equal(decision.recovery?.canRestoreSizing, true);
  assert.equal(decision.restorationProgress?.canRestoreSizing, false);
  assert.equal(decision.restorationProgress?.status, "collecting_evidence");
  assert.equal(decision.restorationProgress?.restorationState, "watch");
  assert.equal(decision.restorationProgress?.gates.find((gate) => gate.id === "clean-reduced-size-outcomes")?.passed, false);
  assert.equal(decision.restorationProgress?.gates.find((gate) => gate.id === "survival-status")?.passed, false);
});

test("restoration ledger tracks clean reduced-size streaks and survival boundaries", () => {
  const clean = {
    timestamp: "2026-05-28T00:00:00.000Z",
    stateFingerprint: "venue:binance|action:buy",
    action: "buy",
    maxExposure: 1,
    realizedReturn: 1.2,
    maxDrawdown: 4,
    maxAdverseExcursion: 6,
    recoveryTimeBars: 2,
    volatilityExpansion: 8,
    tailRisk: 10,
    liquidityStress: 8,
    structuralDanger: 9,
    novelty: 12,
    opportunityDensity: 35,
    outcomeClass: "comfortable_survival",
    survivalCost: 10,
    scarWeight: 0,
  };
  const progress = buildRestorationProgress({
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      survivalConfidence: 73,
      maxExposurePct: 2,
      records: [
        { ...clean, id: "clean-1", asset: "BNBUSDT" },
        {
          ...clean,
          id: "mae-break",
          asset: "SOLUSDT",
          outcomeClass: "barely_survived",
          maxAdverseExcursion: 36,
          survivalCost: 34,
          scarWeight: 0.55,
        },
        { ...clean, id: "clean-2", asset: "BNBUSDT" },
        { ...clean, id: "clean-3", asset: "SOLUSDT" },
      ],
    }),
    currentExposureCapPct: 2,
    targetNormalExposurePct: 5,
  });

  assert.equal(progress.restorationState, "watch");
  assert.equal(progress.outcomeProof.requiredCleanOutcomes, 3);
  assert.equal(progress.outcomeProof.cleanReducedSizeOutcomeCount, 2);
  assert.equal(progress.outcomeProof.remainingCleanReducedSizeOutcomes, 1);
  assert.equal(progress.outcomeProof.activeProofBoundaryBreakCount, 0);
  assert.equal(progress.ledger.entries.length, 4);
  assert.ok(progress.ledger.entries.find((entry) => entry.id === "mae-break")?.boundaryBreaches.includes("MAE"));
  assert.equal(progress.ledger.exactUnlockCondition, "Close 1 more clean reduced-size outcome without breaching survival boundaries.");
  assert.equal(progress.actionPlan.remainingCleanOutcomes, 1);
  assert.match(progress.actionPlan.exposureInstruction, /Keep exposure capped/);
});

test("restoration proof lane can advance after an older boundary break is followed by a clean streak", () => {
  const clean = {
    timestamp: "2026-05-28T00:00:00.000Z",
    stateFingerprint: "venue:binance|action:buy",
    action: "buy",
    maxExposure: 1,
    realizedReturn: 1.2,
    maxDrawdown: 4,
    maxAdverseExcursion: 6,
    recoveryTimeBars: 2,
    volatilityExpansion: 8,
    tailRisk: 10,
    liquidityStress: 8,
    structuralDanger: 9,
    novelty: 12,
    opportunityDensity: 35,
    outcomeClass: "comfortable_survival",
    survivalCost: 10,
    scarWeight: 0,
  };
  const progress = buildRestorationProgress({
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      survivalConfidence: 73,
      maxExposurePct: 2,
      records: [
        {
          ...clean,
          id: "older-mae-break",
          asset: "SOLUSDT",
          outcomeClass: "barely_survived",
          maxAdverseExcursion: 36,
          survivalCost: 34,
          scarWeight: 0.55,
        },
        { ...clean, id: "clean-1", asset: "BNBUSDT" },
        { ...clean, id: "clean-2", asset: "SOLUSDT" },
        { ...clean, id: "clean-3", asset: "BNBUSDT" },
      ],
    }),
    currentExposureCapPct: 2,
    targetNormalExposurePct: 5,
  });

  assert.equal(progress.outcomeProof.failedReducedSizeOutcomeCount, 1);
  assert.equal(progress.outcomeProof.activeProofBoundaryBreakCount, 0);
  assert.equal(progress.outcomeProof.cleanReducedSizeOutcomeCount, 3);
  assert.equal(progress.outcomeProof.remainingCleanReducedSizeOutcomes, 0);
  assert.equal(progress.gates.find((gate) => gate.id === "clean-reduced-size-outcomes")?.passed, true);
  assert.equal(progress.gates.find((gate) => gate.id === "survival-status")?.passed, true);
  assert.equal(progress.restorationState, "clear");
  assert.equal(progress.actionPlan.status, "ready_for_review");
  assert.equal(progress.ledger.exactUnlockCondition, "Survival Memory restoration ledger is clear; normal sizing can proceed through downstream controls.");
  assert.equal(progress.actionPlan.steps.find((step) => step.id === "clear-survival-memory")?.status, "done");
});

test("restoration plan blocks clean proof while survival confidence and proof lane capacity are missing", () => {
  const progress = buildRestorationProgress({
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "wait",
      survivalConfidence: 66,
      maxExposurePct: 0,
    }),
    currentExposureCapPct: 0,
    targetNormalExposurePct: 0,
  });
  const cleanProofStep = progress.actionPlan.steps.find((step) => step.id === "collect-clean-outcomes");

  assert.match(progress.actionPlan.activeInstruction, /Raise survival confidence from 66\/100/);
  assert.match(progress.actionPlan.exposureInstruction, /Stay exits-only/);
  assert.equal(progress.actionPlan.steps[0]?.id, "raise-survival-confidence");
  assert.equal(cleanProofStep?.status, "blocked");
  assert.match(cleanProofStep?.detail ?? "", /survival confidence reaches 70\/100/);
});

test("restoration plan asks to reopen the proof lane before counting clean outcomes at zero cap", () => {
  const progress = buildRestorationProgress({
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      survivalConfidence: 73,
      maxExposurePct: 0,
    }),
    currentExposureCapPct: 0,
    targetNormalExposurePct: 0,
  });
  const cleanProofStep = progress.actionPlan.steps.find((step) => step.id === "collect-clean-outcomes");

  assert.match(progress.actionPlan.activeInstruction, /Reopen reduced-size proof lane capacity/);
  assert.equal(progress.actionPlan.steps[0]?.id, "reopen-proof-lane");
  assert.equal(cleanProofStep?.status, "blocked");
  assert.match(cleanProofStep?.detail ?? "", /current cap is 0%/);
});

test("recovery handles empty opportunity arrays and agency summary blocker counts", () => {
  const ready = evaluate();
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 3,
    setupQuality: 90,
    riskPressure: 26,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 82,
    survivalMemory: survivalMemory({
      status: "scarred",
      recommendation: "act_with_reduced_size",
      survivalConfidence: 66,
      currentStateSimilarity: 40,
      exposureMultiplier: 0.5,
      confidencePenalty: 0,
      maxExposurePct: 2,
    }),
    opportunityCandidates: [],
    agencyResult: { summary: { blockedActions: 2 } },
  });

  assert.equal(decision.recovery?.shouldEscalateHumanReview, true);
  assert.ok(decision.recovery?.blockers.includes("Blocked agency actions require human review before restoration."));
});

test("trust governor can cap allowed buy sizing without blocking exposure", () => {
  const ready = evaluate();
  const capped = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 8,
    rawSuggestedExposurePct: 20,
    setupQuality: 100,
    riskPressure: 10,
    volatilityPct: 1,
    liquidityScore: 100,
    signalConfidence: 50,
  });

  assert.equal(capped.signalAction, "Buy");
  assert.equal(capped.trustGovernor.allowsNewExposure, true);
  assert.equal(capped.trustGovernor.participationMode, "micro");
  assert.equal(capped.sizingResult.size, capped.trustGovernor.maxExposure);
  assert.equal(capped.sizingResult.size < ready.maxPositionPct, true);
  assert.ok(capped.sizingReasons.some((reason) => reason.includes("Trusted maximum exposure")));
});

test("belief gates route weak, uncertain, and contradicted candidates before buy actions", () => {
  const ready = evaluate();
  const weak = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 2,
    rawSuggestedExposurePct: 2,
    setupQuality: 45,
    riskPressure: 65,
    volatilityPct: 10,
    liquidityScore: 40,
    signalConfidence: 45,
  });
  const uncertain = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 2,
    rawSuggestedExposurePct: 2,
    setupQuality: 42,
    riskPressure: 70,
    volatilityPct: 13,
    liquidityScore: 20,
    signalConfidence: 45,
  });
  const riskyReadiness = {
    ...ready,
    robustnessDiagnostics: { overfitRisk: 90 },
    benchmarks: { ...ready.benchmarks, excessReturnAfterCostsPct: -12 },
    components: {
      ...ready.components,
      dataReliability: { ...ready.components.dataReliability, score: 25, passed: false },
      riskControl: { ...ready.components.riskControl, score: 25, passed: false },
    },
  };
  const contradicted = classifyStrategySignal({
    readiness: riskyReadiness,
    rawAction: "Buy",
    expectedEdgePct: 1,
    rawSuggestedExposurePct: 2,
    setupQuality: 35,
    riskPressure: 68,
    volatilityPct: 13,
    liquidityScore: 15,
    signalConfidence: 40,
  });

  assert.equal(weak.belief.verdict, "weak");
  assert.equal(weak.allocationAction, "Watch");
  assert.equal(weak.rejectionReason, "Belief requires review");
  assert.equal(weak.suggestedExposure, 0);
  assert.equal(weak.sizingConstraints.some((constraint) => constraint.id === "belief-justification" && !constraint.passed), true);

  assert.equal(uncertain.belief.verdict, "uncertain");
  assert.equal(uncertain.allocationAction, "Blocked");
  assert.equal(uncertain.rejectionReason, "Belief uncertain blocks new exposure");
  assert.equal(uncertain.sizingResult.decision, "blocked");

  assert.equal(contradicted.belief.verdict, "contradicted");
  assert.equal(contradicted.allocationAction, "Blocked");
  assert.equal(contradicted.rejectionReason, "Belief contradicted blocks new exposure");
  assert.ok(contradicted.sizingReasons.some((reason) => reason.includes("Belief contradicted")));
});

test("financial exposure mapping stays outside generic Signal sizing", () => {
  const sizing = sizeFinancialExposure({
    targetRef: "AAPL",
    actionRef: "Buy",
    confidence: 92,
    riskPressure: 18,
    requestedExposurePct: 12,
    availableExposurePct: 20,
    maxExposurePct: 20,
    constraints: [{ id: "opportunity-density", type: "hard", passed: true, severity: "high" }],
  });
  const band = financialExposureBandForSizingMode(sizing.sizingMode, 20);

  assert.equal(typeof sizing.sizingResult.size, "number");
  assert.equal("suggestedExposurePct" in (sizing.sizingResult as any), false);
  assert.equal(band.maxPct <= 20, true);
  assert.equal(sizing.suggestedExposurePct <= band.maxPct, true);
});

test("confidence is capped by readiness, not data quality", () => {
  const result = evaluate({
    summary: {
      annualizedSharpe: 0.31,
      sharpeRatio: 0.31,
      maxDrawdownPct: 55,
      modelConfidence: 99,
      promotionConfidence: 99,
      survivalScore: 99,
    },
  });

  assert.equal(result.components.dataReliability.score, 100);
  assert.ok(result.components.modelConfidence.score <= 25);
  assert.equal(result.maxConfidence, result.components.modelConfidence.score);
});

test("calibration reduces high raw confidence when outcomes are poor", () => {
  const result = evaluate({
    summary: {
      modelConfidence: 96,
      promotionConfidence: 96,
      survivalScore: 96,
    },
    trades: trades(36, -1.4),
  });

  assert.equal(result.rawConfidence, 96);
  assert.equal(result.calibration.status, "poor-calibration");
  assert.ok(result.calibratedConfidence < result.rawConfidence);
  assert.ok(result.maxConfidence <= result.calibratedConfidence);
  assert.ok(result.calibration.warnings.includes("overconfidence"));
  assert.ok(result.components.modelConfidence.reasons.some((reason) => reason.includes("historical calibration")));

  const decision = classifyStrategySignal({
    readiness: result,
    rawAction: "Buy",
    expectedEdgePct: 4,
    rawSuggestedExposurePct: 4,
    setupQuality: 80,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 90,
  });

  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.rejectionReason, "Calibration requires review");
  assert.ok(decision.sizingReasons.some((reason) => reason.includes("historical calibration")));
});

test("calibration uses trade-level setup confidence instead of inflating every historical trade", () => {
  const result = evaluate({
    summary: {
      modelConfidence: 96,
      promotionConfidence: 96,
      survivalScore: 96,
    },
    trades: trades(40, 1.2).map((trade) => ({
      ...trade,
      setupQuality: 76,
      riskPressure: 24,
    })),
  });

  assert.equal(result.rawConfidence, 96);
  assert.equal(result.calibration.status, "trusted");
  assert.equal(result.calibration.warnings.includes("poor calibration"), false);
  assert.equal(result.calibration.warnings.includes("overconfidence"), false);
  assert.ok(result.calibratedConfidence >= 90);

  const setupOnly = evaluate({
    summary: {
      modelConfidence: 96,
      promotionConfidence: 96,
      survivalScore: 96,
    },
    trades: trades(40, 1.2).map((trade) => ({
      ...trade,
      setupQuality: 76,
    })),
  });
  const riskOnly = evaluate({
    summary: {
      modelConfidence: 96,
      promotionConfidence: 96,
      survivalScore: 96,
    },
    trades: trades(40, 1.2).map((trade) => ({
      ...trade,
      riskPressure: 24,
    })),
  });

  assert.equal(setupOnly.calibration.warnings.includes("overconfidence"), false);
  assert.equal(riskOnly.calibration.warnings.includes("overconfidence"), false);
});

test("insufficient calibration history warns without blindly collapsing readiness", () => {
  const result = evaluate({ trades: [] });

  assert.equal(result.calibration.status, "insufficient-history");
  assert.ok(result.calibration.warnings.includes("insufficient history"));
  assert.ok(result.maxConfidence > 0);
  assert.equal(result.calibration.explanation, "Calibration history is still insufficient.");

  const decision = classifyStrategySignal({
    readiness: result,
    rawAction: "Buy",
    expectedEdgePct: 4,
    rawSuggestedExposurePct: 4,
    setupQuality: 80,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 80,
  });

  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.rejectionReason, "Calibration requires review");
  assert.ok(decision.sizingReasons.some((reason) => reason.includes("Calibration history is still insufficient")));
});

test("unstable calibration outcomes require review even with enough samples", () => {
  const result = evaluate({
    summary: {
      modelConfidence: 50,
      promotionConfidence: 50,
      survivalScore: 50,
    },
    trades: Array.from({ length: 36 }, (_, index) => ({
      symbol: `ALT${index}`,
      returnPct: index % 2 === 0 ? 1.2 : -1.1,
      confidence: 50,
    })),
  });

  assert.equal(result.calibration.status, "unstable-outcomes");
  assert.ok(result.calibration.warnings.includes("unstable outcomes"));
  assert.match(result.calibration.explanation, /outcomes are unstable/);
  assert.equal(result.trustGovernor.participationMode, "exits_only");
  assert.equal(result.trustGovernor.maxExposure, 0);
  assert.equal(result.trustGovernor.primaryBlocker, "calibration_unstable_outcomes");

  const decision = classifyStrategySignal({
    readiness: result,
    rawAction: "Buy",
    expectedEdgePct: 4,
    rawSuggestedExposurePct: 4,
    setupQuality: 80,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 80,
  });

  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.rejectionReason, "Calibration requires review");
  assert.equal(decision.trustGovernor?.participationMode, "exits_only");
  assert.ok(decision.sizingReasons.some((reason) => reason.includes("Calibration outcomes are unstable")));

  const sellDecision = classifyStrategySignal({
    readiness: result,
    rawAction: "Sell",
    expectedEdgePct: -2,
    rawSuggestedExposurePct: 0,
    setupQuality: 45,
    riskPressure: 35,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 60,
  });

  assert.equal(sellDecision.allocationAction, "Sell");
  assert.equal(sellDecision.signalStatus, "risk-exit");
  assert.ok(sellDecision.sizingReasons[0]?.includes("Risk-reducing exits remain allowed"));
  assert.equal(sellDecision.sizingReasons.some((reason) => reason.includes("opening new exposure")), false);
});

test("profitable mixed trade history can clear calibration review without becoming full production", () => {
  const result = evaluate({
    summary: {
      modelConfidence: 85,
      promotionConfidence: 85,
      survivalScore: 85,
      tradeCount: 99,
    },
    trades: [
      ...Array.from({ length: 53 }, (_, index) => ({
        symbol: `WIN${index}`,
        returnPct: 11.4,
        entryExposure: 30,
      })),
      ...Array.from({ length: 46 }, (_, index) => ({
        symbol: `LOSS${index}`,
        returnPct: -6.5,
        entryExposure: 30,
      })),
    ],
  });

  assert.equal(result.calibration.status, "trusted");
  assert.equal(result.calibration.warnings.includes("unstable outcomes"), false);
  assert.equal(result.calibration.warnings.includes("overconfidence"), false);
  assert.equal(result.stage, "Limited live");
  assert.equal(result.trustGovernor.participationMode, "limited");
  assert.ok(result.trustGovernor.maxExposure > 0);
  assert.ok(result.calibratedConfidence < result.rawConfidence);
  assert.ok(result.rawConfidence - result.calibratedConfidence < 15);
});

test("opportunity density zero blocks exposure even when confidence is strong", () => {
  const ready = evaluate();
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 0,
    setupQuality: 90,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 95,
  });

  assert.equal(decision.suggestedExposure, 0);
  assert.equal(decision.sizingResult.decision, "blocked");
  assert.ok(decision.sizingConstraints.some((constraint) => constraint.id === "opportunity-density" && constraint.passed === false));
});

test("strategy readiness blocks and reduces actionable confidence", () => {
  const blocked = evaluate({
    summary: {
      annualizedSharpe: 0.2,
      sharpeRatio: 0.2,
      maxDrawdownPct: 60,
      modelConfidence: 98,
      promotionConfidence: 98,
      survivalScore: 98,
    },
  });
  const decision = classifyStrategySignal({
    readiness: blocked,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 8,
    setupQuality: 85,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 98,
  });

  assert.equal(blocked.blocked, true);
  assert.ok(blocked.calibratedConfidence < blocked.rawConfidence);
  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.signalConfidence, blocked.maxConfidence);
  assert.equal(decision.suggestedExposure, 0);
});

test("calibration history handles trade metadata and missing readiness calibration defensively", () => {
  const result = evaluate({
    trades: [
      { id: "ZERO", exitDate: "2026-01-03", returnPct: 0, confidence: 42 },
      { symbol: "NEG", entryDate: "2026-01-02", returnPct: -2, signalConfidence: 74 },
      { returnPct: 1.5 },
    ],
  });
  const decision = classifyStrategySignal({
    readiness: { ...result, calibration: undefined as any },
    rawAction: "Buy",
    expectedEdgePct: 4,
    rawSuggestedExposurePct: 4,
    setupQuality: 80,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 82,
  });

  assert.ok(result.calibration.sampleSize >= 11);
  assert.ok(result.calibration.warnings.length > 0);
  assert.equal(decision.calibratedConfidence, Math.min(82, result.maxConfidence));

  const ready = evaluate();
  const noCalibrationReadiness = { ...ready, calibration: undefined as any };
  const buy = classifyStrategySignal({
    readiness: noCalibrationReadiness,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 85,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 90,
  });
  const sell = classifyStrategySignal({
    readiness: noCalibrationReadiness,
    rawAction: "Sell",
    expectedEdgePct: 3,
    rawSuggestedExposurePct: 8,
    setupQuality: 70,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 70,
  });

  assert.equal(buy.signalAction, "Buy");
  assert.deepEqual(buy.calibrationWarnings, []);
  assert.equal(sell.signalAction, "Sell");
  assert.deepEqual(sell.calibrationWarnings, []);
});

test("calibration treats zero-magnitude and returnless trades conservatively", () => {
  const zeroMagnitude = evaluate({
    trades: Array.from({ length: 12 }, (_, index) => ({
      symbol: `ZERO${index}`,
      returnPct: 0,
      confidence: 60,
    })),
  });
  const returnless = evaluate({
    trades: [
      { symbol: "MISS1", confidence: 65 },
      { symbol: "MISS2", signalConfidence: 55 },
    ],
  });

  assert.equal(zeroMagnitude.calibration.sampleSize >= 12, true);
  assert.equal(Number.isFinite(zeroMagnitude.calibration.historicalAccuracy), true);
  assert.equal(returnless.calibration.sampleSize > 0, true);
  assert.ok(returnless.calibration.warnings.length > 0);
});

test("robustness diagnostics cap confidence and can block execution", () => {
  const robust = evaluate({
    summary: {
      robustnessDiagnostics: {
        overfitRisk: 10,
        deploymentReadiness: 88,
        robustnessScore: 91,
        safetyGate: "allow",
      },
    },
  });
  assert.equal(hasFlag(robust, "ROBUSTNESS_OVERFIT_RISK"), false);
  assert.equal(robust.components.robustness.passed, true);
  assert.equal(robust.productionEligible, true);

  const reduced = evaluate({
    summary: {
      robustnessDiagnostics: {
        overfitRisk: 45,
        deploymentReadiness: 72,
        robustnessScore: 70,
        safetyGate: "reduce",
      },
    },
  });
  assert.equal(hasFlag(reduced, "ROBUSTNESS_OVERFIT_RISK"), true);
  assert.equal(reduced.components.robustness.passed, false);
  assert.equal(reduced.stage, "Research only");
  assert.equal(reduced.maxConfidence <= 55, true);

  const defaulted = evaluate({
    summary: {
      robustnessDiagnostics: {},
    },
  });
  assert.equal(hasFlag(defaulted, "ROBUSTNESS_OVERFIT_RISK"), true);

  const blocked = evaluate({
    summary: {
      robustnessDiagnostics: {
        overfitRiskPct: 72,
        deploymentReadinessScore: 40,
        safetyGate: "block",
      },
    },
  });
  assert.equal(hasFlag(blocked, "ROBUSTNESS_EXECUTION_BLOCKED"), true);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.maxConfidence <= 35, true);
  const blockedSummary = applyStrategyReadinessToSummary({}, blocked);
  assert.equal(blockedSummary.robustnessPassed, false);
  assert.equal(blocked.readinessRemediation.module, "signal.readiness-remediation-planner");
  assert.equal(blocked.readinessRemediation.steps[0]?.category, "robustness");
  assert.equal(blockedSummary.remediationTopAction, blocked.readinessRemediation.topAction);

  const external = evaluator.evaluate({
    ...passingInput(),
    robustnessDiagnostics: {
      overfitRisk: 50,
      deploymentReadiness: 68,
      robustnessScore: 60,
      safetyGate: "reduce",
    },
  });
  assert.equal(hasFlag(external, "ROBUSTNESS_OVERFIT_RISK"), true);
});

test("production eligible only when all required gates pass", () => {
  const result = evaluate();
  const summary = applyStrategyReadinessToSummary(passingInput().summary, result);

  assert.equal(result.recovery.module, "signal.recovery");
  for (const key of [
    "status",
    "mode",
    "recoveryScore",
    "trustedCapacity",
    "confidenceCapLift",
    "recommendedExposureCap",
    "canRestoreSizing",
    "shouldEscalateHumanReview",
    "blockers",
    "unlockConditions",
    "audit",
  ]) {
    assert.ok(key in result.recovery);
  }
  assert.equal(summary.recovery, result.recovery);
  assert.equal(summary.recoveryStatus, result.recovery.status);
  assert.equal(summary.recoveryMode, result.recovery.mode);
  assert.equal(summary.recoveryScore, result.recovery.recoveryScore);
  assert.equal(summary.recoveryTrustedCapacity, result.recovery.trustedCapacity);
  assert.equal(summary.recoveryConfidenceCapLift, result.recovery.confidenceCapLift);
  assert.equal(summary.recoveryRecommendedExposureCap, result.recovery.recommendedExposureCap);
  assert.equal(summary.recoveryCanRestoreSizing, result.recovery.canRestoreSizing);
  assert.equal(summary.recoveryHumanReviewRequired, result.recovery.shouldEscalateHumanReview);
  assert.equal(result.restorationProgress.module, "stocks.restoration-progress");
  assert.equal(result.restorationProgress.ledger.title, "Survival Memory Restoration Ledger");
  assert.equal(summary.restorationProgress, result.restorationProgress);
  assert.equal(summary.restorationProgressStatus, result.restorationProgress.status);
  assert.equal(summary.restorationProgressPct, result.restorationProgress.progressPct);
  assert.equal(result.stage, "Production eligible");
  assert.equal(result.productionEligible, true);
  assert.equal(result.blocked, false);
  assert.equal(result.failureFlags.length, 0);
  assert.equal(summary.productionReadinessStatus, "Production eligible");
  assert.equal(summary.promotionBlocked, false);
  assert.equal(summary.benchmarkStatus, "Pass");
  assert.equal(summary.walkForwardPassed, true);
  assert.equal(result.readinessRemediation.status, "ready");
  assert.equal(summary.remediationStatus, "ready");
  assert.equal(strategyReadinessStageRank(result.stage), 4);
});

test("core pass without live evidence remains shadow test, not production eligible", () => {
  const result = evaluate({
    forwardShadow: {
      passed: false,
      evaluatedSignalCount: 0,
      requiredSignals: 20,
      hitRatePct: 0,
      averageReturnPct: 0,
    },
  });

  assert.equal(result.stage, "Shadow test");
  assert.equal(result.blocked, false);
  assert.equal(result.productionEligible, false);
  assert.equal(hasFlag(result, "LIVE_SIGNAL_MISMATCH"), true);
  assert.ok(result.maxPositionPct > 0);
});

test("forward evidence consistency is not failed by hit rate alone when audited evidence passed", () => {
  const result = evaluate({
    forwardShadow: {
      passed: true,
      evaluatedSignalCount: 188,
      requiredSignals: 30,
      hitRatePct: 46.2,
      averageReturnPct: 1.8,
    },
  });

  assert.equal(result.components.liveSignalConsistency.passed, true);
  assert.equal(hasFlag(result, "LIVE_SIGNAL_MISMATCH"), false);
});

test("passed gates with low capped confidence remain paper trade", () => {
  const result = evaluate({
    summary: {
      promotionConfidence: 55,
      survivalScore: 55,
    },
  });

  assert.equal(result.stage, "Paper trade");
  assert.equal(result.maxConfidence, 55);
  assert.equal(result.productionEligible, false);
});

test("moderate confidence reaches limited live but not production", () => {
  const result = evaluate({
    summary: {
      promotionConfidence: 72,
      survivalScore: 72,
    },
  });
  const summary = applyStrategyReadinessToSummary(passingInput().summary, result);

  assert.equal(result.stage, "Limited live");
  assert.equal(result.maxConfidence, 72);
  assert.ok(result.maxPositionPct > 0);
  assert.equal(result.productionEligible, false);
  assert.equal(result.blocked, false);
  assert.equal(summary.promotionBlocked, false);
  assert.equal(summary.automaticFailureDetected, false);
  assert.equal(summary.readinessLabel, "Limited live");
});

test("data reliability failures are separated from strategy confidence", () => {
  const synthetic = evaluate({
    summary: {
      dataQualityReport: {
        quality: "synthetic",
        promotionEligibleData: false,
        syntheticSymbols: 2,
        fallbackSymbols: 0,
        duplicateTimestampSymbols: 1,
      },
    },
    dataQualityReport: {
      quality: "synthetic",
      promotionEligibleData: false,
      syntheticSymbols: 2,
      fallbackSymbols: 0,
      duplicateTimestampSymbols: 1,
    },
  });
  const fallback = evaluate({
    dataQualityReport: {
      sourceStatus: "fallback",
      promotionEligibleData: false,
      syntheticSymbols: 0,
      fallbackSymbols: 1,
      duplicateTimestampSymbols: 0,
    },
  });

  assert.equal(synthetic.components.dataReliability.passed, false);
  assert.equal(hasFlag(synthetic, "SYNTHETIC_DATA_FOR_PROMOTION"), true);
  assert.equal(synthetic.maxConfidence <= 20, true);
  assert.equal(fallback.components.dataReliability.score, 25);
  assert.equal(fallback.stage, "Research only");
});

test("strategy edge can fail from sample size even when sharpe is acceptable", () => {
  const result = evaluate({
    summary: {
      annualizedSharpe: 1.4,
      sharpeRatio: 1.4,
      tradeCount: 8,
    },
  });

  assert.equal(result.components.strategyEdge.passed, false);
  assert.equal(hasFlag(result, "INSUFFICIENT_STRATEGY_EDGE"), true);
});

test("readiness diagnostics cover real-data degradation, zero drawdown, alternate metric keys, and skew", () => {
  const degradedRealData = evaluate({
    dataQualityReport: {
      quality: "real",
      promotionEligibleData: false,
      syntheticSymbols: 0,
      fallbackSymbols: 0,
      duplicateTimestampSymbols: 0,
    },
  });
  const zeroDrawdown = evaluate({
    summary: {
      maxDrawdownPct: 0,
    },
  });
  const alternateKeys = evaluate({
    walkForwardSegments: [
      { return_pct: 7 },
      { return_pct: 6 },
      { return_pct: 5 },
    ],
    summary: {
      walkForwardSegments: [
        { return_pct: 7 },
        { return_pct: 6 },
        { return_pct: 5 },
      ],
    },
    trades: [
      { symbol: "ALT1", return_pct: 400, exposurePct: 10 },
      ...Array.from({ length: 20 }, (_, index) => ({
        symbol: `ALT${index + 2}`,
        return_pct: 3,
        weightPct: 100,
      })),
      { symbol: "DEFAULT_EXPOSURE", profitPct: -1 },
    ],
  });
  const flatReturns = evaluate({
    trades: Array.from({ length: 30 }, (_, index) => ({
      symbol: `FLAT${index}`,
      returnPct: 1,
      entryExposure: 5,
    })),
  });

  assert.equal(degradedRealData.components.dataReliability.score, 65);
  assert.equal(hasFlag(degradedRealData, "DATA_QUALITY_NOT_PROMOTABLE"), true);
  assert.equal(zeroDrawdown.components.riskControl.passed, false);
  assert.equal(hasFlag(zeroDrawdown, "HIGH_DRAWDOWN"), true);
  assert.equal(alternateKeys.walkForward.segmentCount, 3);
  assert.equal(alternateKeys.concentration.returnSkew > 4, true);
  assert.equal(alternateKeys.concentration.top1TradeContributionPct > 35, true);
  assert.equal(alternateKeys.concentration.top1TradeContributionPct < 45, true);
  assert.equal(hasFlag(alternateKeys, "OUTLIER_DEPENDENCY"), true);
  assert.equal(flatReturns.concentration.returnSkew, 0);
});

test("evaluator falls back to summary-owned inputs and conservative defaults", () => {
  const input = passingInput({
    config: {
      maxPositionPct: undefined,
    },
  });
  const result = evaluator.evaluate({
    summary: {
      ...input.summary,
      dataQualityReport,
      parameterRobustness,
      forwardShadow,
    },
    trades: undefined,
    config: input.config,
  });
  const empty = evaluator.evaluate({});

  assert.equal(result.productionEligible, true);
  assert.ok(result.maxPositionPct > 0);
  assert.equal(empty.stage, "Research only");
  assert.equal(empty.maxPositionPct, 0);
});

test("summary application handles empty summaries and missing confidence fields", () => {
  const ready = evaluate();
  const emptySummary = applyStrategyReadinessToSummary(null, ready);
  const survivalOnlySummary = applyStrategyReadinessToSummary({ survivalScore: 81 }, ready);

  assert.equal(emptySummary.productionReadinessStatus, "Production eligible");
  assert.equal(emptySummary.survivalScore, 0);
  assert.equal(survivalOnlySummary.promotionConfidence, 81);
  assert.equal(strategyReadinessStageRank("Research only"), 0);
  assert.equal(strategyReadinessStageRank("unknown" as any), -1);
});

test("summary application remains defensive when Survival Memory is absent", () => {
  const ready = evaluate();
  const withoutSurvivalMemory = { ...ready, survivalMemory: undefined } as any;
  const summary = applyStrategyReadinessToSummary({
    survivalScore: 72,
    promotionConfidence: 74,
  }, withoutSurvivalMemory);

  assert.equal(summary.survivalMemory, undefined);
  assert.equal(summary.survivalScarCount, 0);
  assert.equal(summary.survivalNearRuinCount, 0);
  assert.equal(summary.averageSurvivalCost, 0);
  assert.equal(summary.survivalRecoveryBurden, 0);
  assert.equal(summary.survivalConfidence, ready.maxConfidence);
  assert.equal(summary.survivalScore, Math.min(72, ready.maxConfidence));
});

test("hold and sell semantics do not create hidden allocations", () => {
  const ready = evaluate();
  const sell = classifyStrategySignal({
    readiness: ready,
    rawAction: "Sell",
    expectedEdgePct: 4,
    rawSuggestedExposurePct: 8,
    setupQuality: 70,
    riskPressure: 40,
    volatilityPct: 4,
    signalConfidence: 70,
  });
  const watch = classifyStrategySignal({
    readiness: ready,
    rawAction: "Hold",
    expectedEdgePct: 4,
    rawSuggestedExposurePct: 0,
    setupQuality: 60,
    riskPressure: 40,
    volatilityPct: 4,
    signalConfidence: 70,
  });

  assert.equal(sell.signalAction, "Sell");
  assert.equal(sell.allocationAction, "Sell");
  assert.equal(sell.suggestedExposure, 0);
  assert.equal(watch.signalAction, "Hold");
  assert.equal(watch.allocationAction, "Watch");
  assert.equal(watch.suggestedExposure, 0);
  assert.equal(watch.rejectionReason, "Viability checks did not pass");
});

test("non-blocked zero max position still becomes a blocked zero-allocation action", () => {
  const ready = {
    ...evaluate(),
    blocked: false,
    maxPositionPct: 0,
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 5,
    rawSuggestedExposurePct: 8,
    setupQuality: 80,
    riskPressure: 20,
    volatilityPct: 3,
    liquidityScore: 80,
    signalConfidence: Number.NaN,
  });

  assert.equal(decision.signalAction, "Hold");
  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.signalStatus, "blocked");
  assert.equal(decision.signalConfidence, 0);
});

test("judgement integrates after sizing and before agency-facing decisions", () => {
  const ready = evaluate();
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
    previousTrades: judgementTrades(Array(24).fill(6)),
  });

  assert.equal(decision.signalAction, "Buy");
  assert.equal(decision.allocationAction, "Buy");
  assert.equal(decision.judgement?.status, "trusted");
  assert.ok(decision.judgement.reasons.length > 0);
  assert.ok(decision.sizingReasons.some((reason) => reason.includes("Judgement compared")));
});

test("judgement fallback preserves current logic when no evidence is available", () => {
  const ready = evaluate();
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
  });

  assert.equal(decision.signalAction, "Buy");
  assert.equal(decision.allocationAction, "Buy");
  assert.equal(decision.judgement, undefined);
  assert.ok(decision.suggestedExposure > 0);
});

test("judgement can block buy exposure without bypassing existing sizing gates", () => {
  const ready = {
    ...evaluate(),
    robustnessDiagnostics: { overfitRisk: 92 },
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
    previousTrades: judgementTrades(Array(16).fill(6)),
  });

  assert.equal(decision.judgement?.status, "blocked");
  assert.equal(decision.suggestedExposure, 0);
  assert.equal(decision.allocationAction, "Blocked");
  assert.equal(decision.rejectionReason, "Judgement blocks new exposure");
  assert.equal(decision.sizingResult.decision, "blocked");
});

test("cautious judgement reduces exposure but can still allow a buy", () => {
  const ready = evaluate();
  const fallback = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
  });
  const cautious = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
    previousTrades: judgementTrades([...Array(8).fill(5), ...Array(4).fill(-2)]),
  });

  assert.equal(cautious.judgement?.status, "cautious");
  assert.equal(cautious.signalAction, "Buy");
  assert.ok(cautious.suggestedExposure > 0);
  assert.ok(cautious.suggestedExposure < fallback.suggestedExposure);
});

test("unstable judgement outcomes produce a review gate while risk exits remain allowed", () => {
  const ready = evaluate();
  const review = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
    previousTrades: judgementTrades(Array.from({ length: 16 }, (_, index) => index % 2 === 0 ? 100 : -100)),
  });
  const sell = classifyStrategySignal({
    readiness: ready,
    rawAction: "Sell",
    expectedEdgePct: -2,
    rawSuggestedExposurePct: 0,
    setupQuality: 45,
    riskPressure: 35,
    volatilityPct: 3,
    liquidityScore: 90,
    signalConfidence: 60,
    previousTrades: judgementTrades(Array.from({ length: 16 }, (_, index) => index % 2 === 0 ? 100 : -100)),
  });

  assert.equal(review.judgement?.status, "review_required");
  assert.equal(review.allocationAction, "Blocked");
  assert.equal(review.rejectionReason, "Judgement requires review");
  assert.equal(review.suggestedExposure, 0);
  assert.equal(sell.allocationAction, "Sell");
  assert.equal(sell.signalStatus, "risk-exit");
  assert.equal(sell.suggestedExposure, 0);
  assert.ok(sell.sizingReasons.some((reason) => reason.includes("Risk-reducing exits remain allowed while Judgement")));
});

test("stable judgement can improve agency trust when readiness trust is conservative", () => {
  const ready = {
    ...evaluate(),
    trustworthiness: 55,
  };
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
    previousTrades: judgementTrades(Array(24).fill(6)),
  });

  assert.equal(decision.judgement?.status, "trusted");
  assert.ok(decision.trustworthiness > ready.trustworthiness);
});

test("strong judgement evidence preserves full sizing when confidence lift is justified", () => {
  const ready = evaluate();
  const decision = classifyStrategySignal({
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
    previousTrades: judgementTrades(Array(24).fill(100)),
  });

  assert.equal(decision.judgement?.status, "trusted");
  assert.ok(decision.judgement.adjustedConfidence >= decision.judgement.rawConfidence);
  assert.equal(decision.sizingResult.mode, decision.sizingMode);
  assert.ok(decision.sizingResult.reasons.some((reason) => reason.includes("Status is trusted")));
});

test("judgement evidence can come from history, shadow, opportunities, or agency traces", () => {
  const ready = evaluate();
  const common = {
    readiness: ready,
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    signalConfidence: 91,
  };
  const fromHistory = classifyStrategySignal({
    ...common,
    strategyHistory: Array.from({ length: 6 }, (_, index) => ({ date: `2026-01-${index + 1}`, returnPct: 2 })),
  });
  const fromShadow = classifyStrategySignal({
    ...common,
    forwardShadow: { evaluatedSignalCount: 8, averageReturnPct: 1.4 },
  });
  const fromOpportunity = classifyStrategySignal({
    ...common,
    opportunityCandidates: Array.from({ length: 6 }, (_, index) => ({ symbol: `O${index}`, candidateScore: 70, expectedMove: 2 })),
  });
  const fromAgency = classifyStrategySignal({
    ...common,
    agencyResult: { allowed: true },
  });

  assert.ok(fromHistory.judgement);
  assert.ok(fromShadow.judgement);
  assert.ok(fromOpportunity.judgement);
  assert.ok(fromAgency.judgement);
});
