import { describe, expect, it } from "vitest";
import {
  type StocksOptimizerMetricSource,
  adjustStocksExposureForMeaning,
  adjustStocksExposureForPruning,
  buildStocksMeaningViewModel,
  buildStocksCommitmentInput,
  evaluateStocksCommitment,
  buildStocksPruningViewModel,
  buildStocksPurposeViewModel,
  evaluateStocksMeaning,
  evaluateStocksPruning,
  evaluateStocksPurpose,
} from "./stocks-optimizer";

describe("stocks optimizer commitment adapter", () => {
  it("builds beginner-facing meaning, purpose, and exposure decisions", () => {
    const metricSource = source("I want to recover my losses quickly.");
    const meaning = evaluateStocksMeaning(metricSource);
    const purpose = evaluateStocksPurpose(metricSource, { meaning });
    const view = buildStocksMeaningViewModel(meaning);

    expect(meaning?.primaryNeed).toBe("security");
    expect(view.mode).toBe("enhanced");
    expect(view.whatYouSeemToWant).toContain("Recover losses quickly");
    expect(purpose.recommendedAction).not.toBe("increase-priority");
    expect(adjustStocksExposureForMeaning(40, meaning)).toBeLessThanOrEqual(20);
  });

  it("exposes beginner-facing purpose fields", () => {
    const purpose = evaluateStocksPurpose(source("I want steady progress."));
    const view = buildStocksPurposeViewModel(purpose);

    expect(view.mode).toBe("enhanced");
    expect(view.ambition).toBe(72);
    expect(view.behavioralAmbition).toBeGreaterThan(0);
    expect(view.purposeStatement).toMatch(/progress|willing/i);
    expect(view.alignmentTrustScore).toBeGreaterThan(0);
    expect(view.primaryFocus).toMatch(
      /Protecting progress|Building momentum|Pursuing growth|Preserving flexibility|Reducing stress|Staying disciplined/,
    );
  });

  it("exposes pruning without breaking legacy view mode", () => {
    const pruning = evaluateStocksPruning(source("I want steady progress."));
    const enhanced = buildStocksPruningViewModel(pruning);
    const legacy = buildStocksPruningViewModel(null);

    expect(enhanced.mode).toMatch(/enhanced|degraded/);
    expect(enhanced.survivalCriticalSignals.length).toBeGreaterThan(0);
    expect(enhanced.explanation).toContain("Pruning");
    expect(legacy.mode).toBe("legacy");
    expect(adjustStocksExposureForPruning(80, { recommendedAction: "reduce" })).toBe(40);
  });

  it("turns an investor contribution into stock units", () => {
    const result = evaluateStocksCommitment(source("I want steady progress."), {
      contributionAmount: 1_000,
      commitmentKind: "investment",
    });

    expect(result.status).toBe("recommended");
    expect(result.commitmentKind).toBe("investment");
    expect(result.goal).toMatch(/progress/i);
    expect(result.totalRecommended).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]).toEqual({
      ticker: "ALPHA",
      amount: result.recommendations[0]?.amount,
      price: 25,
      units: result.recommendations[0]?.units,
    });
    expect(result.recommendations[0]?.units).toBeCloseTo(
      (result.recommendations[0]?.amount ?? 0) / 25,
      5,
    );
  });

  it("keeps trade and investment intent in the commitment input without extra request fields", () => {
    const input = buildStocksCommitmentInput(
      source("I want financial freedom."),
      {
        contributionAmount: 500,
        commitmentKind: "trade",
      },
    );

    expect(input.resource).toEqual({
      available: 500,
      requested: 500,
      maximum: 500,
    });
    expect(input.metadata).toMatchObject({
      source: "stocks-optimizer",
      commitmentKind: "trade",
    });
    expect(input.decisions?.map((decision) => decision.id)).toEqual([
      "ALPHA",
      "BETA",
    ]);
    expect(input.decisions?.[0]?.metadata).toEqual({ price: 25 });
  });
});

function source(meaningText: string): StocksOptimizerMetricSource {
  return {
    marketStatus: "Open",
    stocks: [
      {
        ticker: "ALPHA",
        price: 25,
        history: [23, 24, 25],
        signalAction: "Buy",
        quoteStatus: "available",
        signalStatus: "provided",
        setupQuality: 82,
        trendQuality: 80,
        timingQuality: 76,
        riskPressure: 24,
        suggestedExposure: 60,
        expectedMove: 2,
      },
      {
        ticker: "BETA",
        price: 50,
        history: [48, 49, 50],
        signalAction: "Buy",
        quoteStatus: "available",
        signalStatus: "provided",
        setupQuality: 72,
        trendQuality: 70,
        timingQuality: 68,
        riskPressure: 36,
        suggestedExposure: 40,
        expectedMove: 1,
      },
      {
        ticker: "RISK",
        price: 10,
        history: [12, 11, 10],
        signalAction: "Sell",
        quoteStatus: "available",
        signalStatus: "provided",
        setupQuality: 30,
        trendQuality: 24,
        timingQuality: 20,
        riskPressure: 82,
        suggestedExposure: 0,
        expectedMove: -3,
      },
    ],
    avgRisk: 34,
    avgQuality: 75,
    breadth: 64,
    confidence: 78,
    targetExposure: 50,
    survivalScore: 82,
    failureFlags: [],
    staleData: false,
    hasBacktestData: true,
    hasProvidedSignals: true,
    backtestTradeCount: 88,
    backtestSharpe: 1.3,
    backtestMaxDrawdownPct: 7,
    backtestProfitFactor: 1.8,
    backtestWinRatePct: 61,
    backtestReturnPct: 15,
    calibrationTrustworthiness: 80,
    calibrationHistoricalAccuracy: 62,
    deploymentReadinessScore: 84,
    ambition: 72,
    now: 1_800_000_000_000,
    meaningText,
  };
}
