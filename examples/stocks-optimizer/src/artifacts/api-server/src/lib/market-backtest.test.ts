import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildHealthOptimizedConfigCandidates,
  getOrCreateMarketBacktest,
  normalizeMarginalRobustnessForReadiness,
  scoreStrategyHealthForSelection,
} from "./market-backtest";
import { backtestConfigForMarket } from "./market-backtest-config";
import { buildHistoricalDataset, summarizeHistoricalDatasets } from "./historical-dataset";

process.env.TRADINGVIEW_DATA_DISABLE_LOCAL = "true";
process.env.TRADINGVIEW_DATA_BASE_URL = "https://mock.tradingview.local/api/chart-data";

function deterministicSeed(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mockTradingViewBars(symbol: string, exchange: string, bars = 1260) {
  const seed = deterministicSeed(`${exchange}:${symbol}`);
  const start = 35 + (seed % 120);
  const drift = 0.00018 + ((seed % 29) - 11) / 180_000;
  const amplitude = 0.045 + (seed % 17) / 1_000;
  const phase = (seed % 360) * Math.PI / 180;
  const shockEvery = 73 + (seed % 23);
  const tradingDayMs = 86_400_000 * (365 / 252);
  let price = start;

  return Array.from({ length: bars }, (_, index) => {
    const cycle = Math.sin(index / 18 + phase) * amplitude;
    const shortCycle = Math.cos(index / 7 + phase / 2) * 0.012;
    const shock = index > 0 && index % shockEvery === 0 ? -0.035 : 0;
    price = Math.max(1, price * (1 + drift + cycle / 20 + shortCycle / 20 + shock));
    const open = price * (1 - Math.sin(index / 5 + phase) * 0.004);
    const high = Math.max(open, price) * 1.012;
    const low = Math.min(open, price) * 0.988;

    return {
      date: new Date(Date.now() - (bars - 1 - index) * tradingDayMs).toISOString().slice(0, 10),
      timestamp: new Date(Date.now() - (bars - 1 - index) * tradingDayMs).toISOString(),
      open,
      high,
      low,
      close: price,
      volume: 100_000 + ((seed + index * 17) % 900_000),
    };
  });
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  const symbol = url.searchParams.get("symbol") ?? "MOCK";
  const exchange = url.searchParams.get("exchange") ?? "";
  const bars = Math.max(90, Math.min(Number(url.searchParams.get("bars") ?? 3780), 3780));
  const rows = mockTradingViewBars(symbol, exchange, bars);

  if (url.pathname.endsWith("/api/v3/klines")) {
    return new Response(JSON.stringify(rows.map((row) => {
      const openTime = Date.parse(`${row.date}T00:00:00.000Z`);

      return [
        openTime,
        String(row.open),
        String(row.high),
        String(row.low),
        String(row.close),
        String(row.volume),
        openTime + 86_400_000 - 1,
        String(row.close * row.volume),
        1_000,
        String(row.volume * 0.48),
        String(row.close * row.volume * 0.48),
        "0",
      ];
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    symbol: exchange ? `${exchange}:${symbol}` : symbol,
    exchange,
    source: "tradingview-data",
    sourceStatus: "real",
    dataQuality: "real",
    bars: rows,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

test("long-history dataset scores full and partial coverage", () => {
  const full = buildHistoricalDataset({
    symbol: "FULL",
    requestedYears: 15,
    requestedBars: 3780,
    bars: mockTradingViewBars("FULL", "NASDAQ", 3780),
  });
  const partial = buildHistoricalDataset({
    symbol: "PART",
    requestedYears: 15,
    requestedBars: 3780,
    bars: mockTradingViewBars("PART", "NASDAQ", 252),
  });
  const summary = summarizeHistoricalDatasets([full, partial]);

  assert.ok(full.coverage.availableYears >= 14.5, "full history should span roughly 15 years");
  assert.equal(full.coverage.status, "full");
  assert.ok(full.regimeStats.historyDepthScore >= 90);
  assert.ok(full.regimeStats.regimeCoverageScore >= 0);
  assert.notEqual(partial.coverage.status, "full");
  assert.ok(partial.regimeStats.historyDepthScore < full.regimeStats.historyDepthScore);
  assert.ok(summary.historyDepthScore < full.regimeStats.historyDepthScore);
  assert.match(summary.explanation, /Extended history improves regime awareness/);
});

test("market backtest builds non-empty historical metrics for a market", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-market-backtest-"));
  process.env.LOCAL_BACKTEST_CACHE_DIR = cacheDir;

  const payload = await getOrCreateMarketBacktest("NASDAQ", { force: true });

  assert.equal(payload.market, "NASDAQ");
  assert.equal(payload.summary.market, "NASDAQ");
  assert.ok(payload.summary.updatedAt, "summary should carry an update timestamp");
  assert.ok(payload.history.length > 30, "history should contain enough points for historical metrics");
  assert.ok(payload.trades.length > 0, "walk-forward trades should not be empty");
  assert.ok(
    payload.trades.every((trade: any) => Number.isFinite(trade.survivalCost) && trade.outcomeClass),
    "stored outcomes should carry survival memory scar fields",
  );
  assert.equal(Number.isFinite(payload.summary.totalReturnPct), true);
  assert.equal(Number.isFinite(payload.summary.profitFactor), true);
  assert.equal(Number.isFinite(payload.summary.winRatePct), true);
  assert.equal(Number.isFinite(payload.summary.rawAnnualizedSharpe ?? payload.summary.annualizedSharpe), true);
  assert.equal(Number.isFinite(payload.summary.rawMaxDrawdownPct ?? payload.summary.maxDrawdownPct), true);
  assert.ok(payload.summary.maxDrawdownPct > 0, "mark-to-market history should produce a real drawdown");
  const flags = new Set(payload.summary.failureFlags ?? []);
  assert.equal(flags.has("OVERFIT_PROFIT_FACTOR"), false, "real closed-trade evidence should clear too-clean profit-factor warnings");
  assert.equal(flags.has("OVERFIT_LOW_DRAWDOWN"), false, "real mark-to-market history should clear too-clean drawdown warnings");
  assert.equal(flags.has("NEEDS_FORWARD_SHADOW"), false, "closed walk-forward trades should satisfy forward evidence");
  assert.equal(flags.has("SYNTHETIC_DATA_FOR_PROMOTION"), false, "real TradingView history should not be flagged synthetic");
  assert.equal(payload.summary.dataQualityReport?.promotionEligibleData, true);
  assert.equal(payload.summary.forwardShadow?.passed, true);
  assert.ok(payload.summary.forwardShadow?.confirmedSignalCount > 0, "live buy signals should be confirmed for shadow tracking");
  assert.ok(payload.summary.forwardShadow?.observedSignalCount > 0, "confirmed signals should be recorded as shadow observations");
  assert.equal(payload.summary.forwardShadow?.collectionStatus, "passed");
  assert.ok(payload.summary.historyDiagnostics?.historyCoverageYears >= 14.5, "summary should consume long-history coverage");
  assert.ok(payload.summary.historyDepthScore >= 90, "15-year history should produce high depth score");
  assert.ok(payload.summary.regimeCoverageScore >= 0, "regime coverage score should be present");
  assert.ok(payload.summary.regimeDiversityScore >= 0, "regime diversity score should be present");
  assert.ok(payload.summary.sampleDiversityScore >= 0, "sample diversity score should be present");
  assert.equal(payload.summary.coverageStatus, "full");
  assert.ok(Number.isFinite(payload.summary.robustnessDiagnostics?.historyDepthScore));
  assert.ok(Number.isFinite(payload.opportunityDiscovery?.diagnostics?.regimeCoverageScore));
  assert.equal(payload.config.name, "US large cap");
  assert.equal(payload.summary.strategyConfig.name, "US large cap");
  assert.equal(payload.summary.strategyProfile, "US large cap");
  assert.equal(payload.summary.strategyProfileKey, "US_LARGE_CAP");
  assert.ok(payload.opportunityDiscovery?.candidates?.length > 0, "opportunity discovery should rank emerging candidates");
  assert.ok(payload.opportunityDiscovery?.density?.density >= 0, "adaptive opportunity density should be present");
  assert.ok(payload.agencyDiagnostics?.summary?.traceCount > 0, "agency diagnostics should trace strategy decisions");
  assert.equal(payload.agencyDiagnostics.summary.traceCount, payload.signals.length);
  assert.ok(payload.recognitionDiagnostics?.primary, "recognition diagnostics should summarize recurrence evidence");
  assert.equal(payload.summary.recognitionDiagnostics?.signals?.length, payload.signals.length);
  assert.ok(payload.signals.every((signal: any) => signal.recognition?.metadata?.module === "recognition"), "signals should carry Recognition diagnostics");
  assert.ok(payload.signals.every((signal: any) => signal.agencyTrace?.traceId), "signals should carry agency traces");
  assert.ok(
    payload.signals.some((signal: any) => signal.survivalMemory?.recordCount > 0),
    "signals should carry survival memory diagnostics from outcome history",
  );
  assert.ok(
    payload.signals.some((signal: any) => signal.opportunityDiscovery?.progression?.length > 0),
    "signals should carry candidate progression evidence",
  );
  assert.match(payload.summary.configId, /^market-rotation-/);
});

test("anti-overfit gates separate historical robustness from promotion evidence", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-market-backtest-robust-"));
  process.env.LOCAL_BACKTEST_CACHE_DIR = cacheDir;

  const payload = await getOrCreateMarketBacktest("BINANCE", { force: true });

  assert.ok(payload.summary.maxDrawdownPct > 0.5, "robust profile should include meaningful drawdown");
  assert.ok(payload.summary.profitFactor < 20, "profit factor should stay below the overfit threshold");
  assert.equal(payload.summary.promotionBlocked, true);
  const flags = new Set(payload.summary.failureFlags ?? []);
  assert.equal(flags.has("OVERFIT_PROFIT_FACTOR"), false);
  assert.equal(flags.has("OVERFIT_LOW_DRAWDOWN"), false);
  assert.equal(flags.has("NEEDS_FORWARD_SHADOW"), false);
  assert.equal(flags.has("SYNTHETIC_DATA_FOR_PROMOTION"), false);
  assert.equal(flags.has("OUTLIER_DEPENDENCY"), false);
  assert.equal(flags.has("MEDIAN_TRADE_RETURN_NOT_POSITIVE"), false);
  assert.equal(flags.has("OVERFIT_SEGMENT_CONCENTRATION"), false);
  const healthOptimization = payload.summary.strategyHealthOptimization;
  const candidates = healthOptimization?.candidates ?? [];
  const selectedCandidate = candidates[0];
  assert.ok(selectedCandidate, "health optimizer should expose the selected BINANCE candidate first");
  assert.ok(
    candidates.every((candidate: any) => candidate.readinessGateCount <= selectedCandidate.readinessGateCount),
    "selection should prioritize readiness gates before cosmetic concentration cleanliness",
  );
  assert.equal(typeof selectedCandidate.selectionGates.benchmarkPass, "boolean");
  assert.equal(typeof selectedCandidate.selectionGates.parameterPass, "boolean");
  assert.ok(payload.summary.forwardShadow?.observedSignalCount > 0);
});

test("marginal robustness risk is normalized only when independent evidence clears", () => {
  const diagnostics = {
    robustnessScore: 72,
    overfitRisk: 31,
    generalizationConfidence: 74,
    structuralReliability: 78,
    adaptabilityScore: 76,
    uncertaintyLevel: 28,
    deploymentReadiness: 64,
    safetyGate: "reduce",
    reasons: ["Overfit risk is above the production threshold."],
    leakage: { passed: true, violations: [] },
    statisticalIntegrity: { score: 82 },
    parameterSensitivity: { stabilityScore: 74 },
    participation: { participationScore: 45 },
  } as any;
  const stableInput = {
    diagnostics,
    summary: {
      walkForwardSegments: [
        { returnPct: 8 },
        { returnPct: 7 },
        { returnPct: 5 },
      ],
    },
    parameterRobustness: {
      stable: true,
      passRate: 63,
      benchmarkSurvivalRate: 75,
      variants: [{ configId: "nearby", passed: true }],
    },
    forwardShadow: {
      passed: true,
      evaluatedSignalCount: 24,
      requiredSignals: 20,
    },
    dataQualityReport: {
      quality: "real",
      promotionEligibleData: true,
      syntheticSymbols: 0,
      fallbackSymbols: 0,
    },
    config: {
      minimumWalkForwardSegments: 3,
      minimumForwardSignals: 20,
    } as any,
  };
  const adjusted = normalizeMarginalRobustnessForReadiness(stableInput);
  const unresolved = normalizeMarginalRobustnessForReadiness({
    ...stableInput,
    diagnostics: { ...diagnostics, overfitRisk: 33 } as any,
  });

  assert.equal(adjusted.overfitRisk, 30);
  assert.equal((adjusted as any).rawOverfitRisk, 31);
  assert.equal(adjusted.safetyGate, "allow");
  assert.match(adjusted.reasons.join(" "), /Marginal overfit risk cleared/);
  assert.equal(unresolved.overfitRisk, 33);
  assert.equal(unresolved.safetyGate, "reduce");
});

test("strategy health objective prefers robust risk-adjusted edge over raw return", () => {
  const config = backtestConfigForMarket("BINANCE");
  const robust = scoreStrategyHealthForSelection({
    totalReturnPct: 34,
    excessReturnPct: 6,
    annualizedSharpe: 1.45,
    maxDrawdownPct: 8,
    profitFactor: 1.8,
    tradeCount: 64,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 8 }, { returnPct: 6 }, { returnPct: 5 }],
    segmentConcentration: { bestSegmentContributionPct: 42 },
  }, config);
  const fragile = scoreStrategyHealthForSelection({
    totalReturnPct: 90,
    excessReturnPct: 18,
    annualizedSharpe: 0.72,
    maxDrawdownPct: 31,
    profitFactor: 1.5,
    tradeCount: 64,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 24 }, { returnPct: -6 }, { returnPct: 2 }],
    segmentConcentration: { bestSegmentContributionPct: 86 },
  }, config);
  const underSampled = scoreStrategyHealthForSelection({
    totalReturnPct: 25,
    excessReturnPct: 12,
    annualizedSharpe: 1.8,
    maxDrawdownPct: 6,
    profitFactor: 3,
    tradeCount: 8,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 25 }],
    segmentConcentration: { bestSegmentContributionPct: 100 },
  }, config);

  assert.ok(robust > fragile, "health selection should reward Sharpe, drawdown, and distributed returns");
  assert.ok(underSampled < robust, "thin samples should not win the health objective");
});

test("strategy health objective rejects benchmark-failing fragile neighbors", () => {
  const config = backtestConfigForMarket("BINANCE");
  const benchmarkFailed = scoreStrategyHealthForSelection({
    totalReturnPct: 64,
    excessReturnPct: -11,
    annualizedSharpe: 0.95,
    maxDrawdownPct: 12,
    profitFactor: 1.9,
    tradeCount: 79,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 40 }, { returnPct: 25 }, { returnPct: -6 }],
    segmentConcentration: { bestSegmentContributionPct: 72 },
  }, config, {
    stable: false,
    passRate: 0,
    benchmarkSurvivalRate: 12.5,
  });
  const benchmarkPassed = scoreStrategyHealthForSelection({
    totalReturnPct: 58,
    excessReturnPct: 4,
    annualizedSharpe: 1.08,
    maxDrawdownPct: 14,
    profitFactor: 1.7,
    tradeCount: 72,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 18 }, { returnPct: 12 }, { returnPct: 5 }],
    segmentConcentration: { bestSegmentContributionPct: 48 },
  }, config, {
    stable: true,
    passRate: 75,
    benchmarkSurvivalRate: 80,
  });

  assert.ok(
    benchmarkPassed > benchmarkFailed,
    "selection should prefer durable benchmark edge over higher raw return",
  );
});

test("strategy health objective prefers distributed median-positive outcomes", () => {
  const config = backtestConfigForMarket("B3");
  const concentrated = scoreStrategyHealthForSelection({
    totalReturnPct: 72,
    excessReturnPct: 8,
    annualizedSharpe: 1.18,
    maxDrawdownPct: 13,
    profitFactor: 2.1,
    tradeCount: 84,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 38 }, { returnPct: 14 }, { returnPct: 3 }],
    segmentConcentration: { bestSegmentContributionPct: 69 },
    topWinnerDependency: {
      dependencyDetected: true,
      topOneDependencyPct: 58,
      topThreeDependencyPct: 83,
      topTenPctDependencyPct: 89,
    },
    tradeOutcomeDistribution: {
      medianTradeReturnPct: -0.15,
    },
  }, config, {
    stable: true,
    passRate: 80,
    benchmarkSurvivalRate: 82,
  });
  const distributed = scoreStrategyHealthForSelection({
    totalReturnPct: 54,
    excessReturnPct: 6,
    annualizedSharpe: 1.1,
    maxDrawdownPct: 14,
    profitFactor: 1.8,
    tradeCount: 84,
    benchmarkMarginRequiredPct: 2,
    walkForwardSegments: [{ returnPct: 18 }, { returnPct: 15 }, { returnPct: 12 }],
    segmentConcentration: { bestSegmentContributionPct: 40 },
    topWinnerDependency: {
      dependencyDetected: false,
      topOneDependencyPct: 24,
      topThreeDependencyPct: 48,
      topTenPctDependencyPct: 62,
    },
    tradeOutcomeDistribution: {
      medianTradeReturnPct: 0.32,
    },
  }, config, {
    stable: true,
    passRate: 80,
    benchmarkSurvivalRate: 82,
  });

  assert.ok(
    distributed > concentrated,
    "selection should prefer lower concentration and a positive median trade over higher headline return",
  );
});

test("health optimized candidates include protective variants without mutating the base config", () => {
  const config = backtestConfigForMarket("BINANCE");
  const candidates = buildHealthOptimizedConfigCandidates(config);

  assert.equal(config.name, "Crypto liquid");
  assert.equal(config.profile, "CRYPTO_LIQUID");
  assert.equal(config.id.endsWith(":slow-confirmation"), false);
  assert.ok(candidates.some((candidate) => candidate.id === config.id), "base candidate should remain available");
  assert.ok(candidates.some((candidate) => candidate.id.includes("crypto-low-drawdown")), "crypto profile should include drawdown defense");
  assert.ok(candidates.some((candidate) => candidate.id.includes("crypto-distributed-survival")), "crypto profile should include distributed survival confirmation");
  assert.ok(candidates.some((candidate) => candidate.id.includes("crypto-benchmark-balanced")), "crypto profile should include benchmark-balanced confirmation");
  assert.ok(candidates.some((candidate) => candidate.maxPositionPct < config.maxPositionPct), "nearby variants should reduce concentration risk");
  assert.ok(candidates.every((candidate) => candidate.stopLossPct > 0 && candidate.trailingStopPct > 0));
});

test("B3 health candidates include concentration-reduction variants", () => {
  const config = backtestConfigForMarket("B3");
  const candidates = buildHealthOptimizedConfigCandidates(config);

  assert.ok(candidates.some((candidate) => candidate.id.includes("b3-distributed-quality")));
  assert.ok(candidates.some((candidate) => candidate.id.includes("b3-median-return")));
  assert.ok(candidates.some((candidate) => candidate.maxPositions > config.maxPositions && candidate.maxPositionPct < config.maxPositionPct));
});

test("diagnostic raw technical mode emits explainable trades and survival analytics", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-market-backtest-diagnostics-"));
  process.env.LOCAL_BACKTEST_CACHE_DIR = cacheDir;

  const payload = await getOrCreateMarketBacktest("NASDAQ", {
    force: true,
    diagnostics: true,
    runtimeMode: "MODE_RAW_TECHNICAL",
  });

  const buySignals = payload.signals.filter((signal: any) => signal.signalAction === "Buy");
  const sellSignals = payload.signals.filter((signal: any) => signal.signalAction === "Sell");
  const rawBuyCandidates = payload.signals.filter((signal: any) => signal.diagnostic?.rawAction === "Buy");
  const blockedSignals = payload.signals.filter((signal: any) => signal.allocationAction === "Blocked");
  const finalDecisionStage = payload.diagnostics.stageSurvival.stages.find(
    (stage: any) => stage.stage === "FINAL_DECISION",
  );

  assert.ok(payload.trades.length > 0, "raw technical validation should create trades");
  assert.ok(rawBuyCandidates.length > 0, "raw technical validation should expose buy candidates in diagnostics");
  assert.ok(sellSignals.length > 0, "raw technical validation should expose sell signals");
  if (payload.summary.strategyReadiness?.blocked) {
    assert.equal(buySignals.length, 0, "blocked readiness should not leak buy allocations");
    assert.ok(blockedSignals.length > 0, "blocked readiness should label zero-position assets as blocked");
    assert.ok(blockedSignals.every((signal: any) => signal.suggestedExposure === 0));
  } else {
    assert.ok(buySignals.length > 0, "passed readiness should expose buy allocations");
    assert.ok(buySignals.every((signal: any) => signal.entryPrice > 0), "buy signals should carry shadow entry prices");
  }
  assert.ok(rawBuyCandidates.every((signal: any) => signal.signalDate), "raw buy candidates should carry a shadow signal date");
  assert.equal(Number.isFinite(payload.summary.annualizedSharpe), true);
  assert.equal(Number.isFinite(payload.summary.maxDrawdownPct), true);
  assert.ok(payload.diagnostics.auditTrail.length > 0, "diagnostics should include audit events");
  assert.ok(finalDecisionStage?.passed > 0, "assets should survive to final decision");
  assert.ok(
    payload.diagnostics.modeComparison.some((row: any) => row.mode === "MODE_FULL_PERCEPTION"),
    "diagnostics should compare runtime modes",
  );
});
