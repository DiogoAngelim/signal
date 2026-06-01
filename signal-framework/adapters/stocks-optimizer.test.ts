import { describe, expect, it } from "vitest";
import {
  type StocksOptimizerMetricSource,
  buildStocksCommitmentInput,
  evaluateStocksCommitment,
} from "./stocks-optimizer";

describe("stocks optimizer commitment adapter", () => {
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
    now: 1_800_000_000_000,
    meaningText,
  };
}
