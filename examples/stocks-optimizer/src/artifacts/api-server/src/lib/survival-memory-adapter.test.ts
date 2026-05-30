import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStockSurvivalMemory,
  enrichTradesWithSurvivalMemory,
} from "./survival-memory-adapter";

const readiness = {
  stage: "Limited live",
  maxPositionPct: 10,
  calibration: { sampleSize: 8 },
  robustnessDiagnostics: { overfitRisk: 18 },
  walkForward: { stable: true },
  parameterStability: { stable: true },
  concentration: { outlierDependent: false },
};

test("stock survival memory turns trade outcomes into reusable survival records", () => {
  const memory = buildStockSurvivalMemory({
    market: "NASDAQ",
    symbol: "AAA",
    rawAction: "Buy",
    setupQuality: 82,
    riskPressure: 74,
    volatilityPct: 7,
    liquidityScore: 25,
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    maxPositionPct: 10,
    readiness,
    trades: [{
      id: "trade-1",
      symbol: "AAA",
      exitDate: "2026-01-05",
      returnPct: 8,
      entryExposure: 8,
      setupQuality: 82,
      riskPressure: 74,
      volatilityPct: 7,
      liquidityScore: 25,
      maxDrawdownPct: 32,
      maxAdverseExcursion: 36,
      recoveryTimeBars: 55,
      tailRisk: 86,
      liquidityStress: 83,
    }],
  });

  assert.equal(memory.module, "stocks.survival-memory");
  assert.equal(memory.records.length, 1);
  assert.equal(memory.records[0]?.outcomeClass, "barely_survived");
  assert.equal(memory.scarCount, 1);
  assert.equal(memory.recommendation, "act_with_reduced_size");
  assert.ok(memory.maxExposurePct < 8);
  assert.ok(memory.maxExposurePct > 0);
  assert.ok(memory.mainWarnings.some((warning) => warning.includes("profitable")));
});

test("survival enrichment extends stored trade outcomes without mutating the source records", () => {
  const trades = [{
    symbol: "BBB",
    entryDate: "2026-01-01",
    exitDate: "2026-01-06",
    returnPct: -2,
    entryExposure: 5,
    riskPressure: 45,
  }];
  const enriched = enrichTradesWithSurvivalMemory(trades, {
    market: "NYSE",
    rawAction: "Buy",
    maxPositionPct: 10,
    readiness,
  });

  assert.equal("survivalCost" in trades[0], false);
  assert.equal(enriched[0]?.outcomeClass, "stressed_survival");
  assert.equal(enriched[0]?.recoveryTimeBars, 5);
  assert.ok(enriched[0]?.survivalCost > 0);
  assert.ok(enriched[0]?.stateFingerprint.includes("venue:nyse"));
});

test("strategy history records and empty memory stay deterministic", () => {
  const fromHistory = buildStockSurvivalMemory({
    market: "BINANCE",
    rawAction: "Buy",
    setupQuality: 70,
    riskPressure: 20,
    rawSuggestedExposurePct: 2,
    maxPositionPct: 8,
    readiness: {
      ...readiness,
      walkForward: { stable: false },
      parameterStability: { stable: false },
      concentration: {
        outlierDependent: true,
        top1TradeContributionPct: 55,
      },
    },
    strategyHistory: [
      { date: "2026-01-01", portfolioReturnPct: 0.4, deployedPct: 12 },
      { date: "bad", changePct: null },
    ],
  });
  const empty = buildStockSurvivalMemory({
    market: "ADX",
    rawAction: "Watch",
    maxPositionPct: 5,
    trades: [],
  });

  assert.equal(fromHistory.records.length, 1);
  assert.ok(fromHistory.records[0]?.structuralDanger >= 70);
  assert.equal(empty.status, "empty");
  assert.equal(empty.maxExposurePct, 5);
});

test("explicit survival filtering and fallback branches stay deterministic", () => {
  const filtered = buildStockSurvivalMemory({
    market: "NYSE",
    symbol: "CCC",
    rawAction: "Buy",
    setupQuality: 64,
    riskPressure: Number.NaN,
    liquidityScore: Number.NaN,
    rawSuggestedExposurePct: 3,
    maxPositionPct: 6,
    requireExplicitSurvivalFields: true,
    readiness: {
      lifecycleStage: "Paper trade",
      similarSampleSize: 2,
      robustnessDiagnostics: { overfitRiskPct: 21 },
      concentration: { outlierDependent: true, top5TradeContributionPct: 12 },
    },
    trades: [
      { symbol: "SKIP", returnPct: 2 },
      {
        symbol: "TAKE",
        action: "Reduce",
        realizedReturn: 1,
        maxExposure: "",
        exposurePct: 2,
        maxDrawdown: "",
        maxAdverseExcursionPct: 3,
        entryDate: "2026-02-10",
        exitDate: "2026-02-01",
        volatilityShock: 12,
        tailPressure: 14,
        liquidityPressure: 16,
        structuralRisk: 18,
      },
    ],
    strategyHistory: [
      { date: "2026-01-01", changePct: "", maxDrawdownPct: 4 },
      { date: "2026-01-02", return_pct: "", maxDrawdownPct: 2 },
    ],
  });
  const enriched = enrichTradesWithSurvivalMemory([{
    ticker: "CALM",
    returnPct: 1,
    entryExposure: 1,
    setupQuality: 70,
    riskPressure: 5,
    maxDrawdownPct: 1,
    maxAdverseExcursionPct: 1,
    recoveryTimeBars: null,
  }], {
    market: "NYSE",
    rawAction: "Hold",
    readiness: null,
  });
  const fallback = buildStockSurvivalMemory({
    market: "LSE",
    setupQuality: undefined,
    riskPressure: 30,
    maxPositionPct: 0,
    trades: [null, { signalAction: "Watch", returnPct: 0, maxDrawdownPct: 1 }],
  });

  assert.equal(filtered.records.length, 1);
  assert.equal(filtered.records[0]?.action, "reduce");
  assert.equal(filtered.records[0]?.recoveryTimeBars, undefined);
  assert.equal(filtered.records[0]?.maxExposure, 2);
  assert.equal(enriched[0]?.recoveryTimeBars, undefined);
  assert.equal(enriched[0]?.survivalNotes, undefined);
  assert.equal(enriched[0]?.outcomeClass, "comfortable_survival");
  assert.equal(fallback.records.length, 2);
  assert.equal(fallback.records[0]?.asset, "TRADE-1");
  assert.equal(fallback.records[1]?.action, "watch");
  assert.equal(fallback.maxExposurePct, 0);
});
