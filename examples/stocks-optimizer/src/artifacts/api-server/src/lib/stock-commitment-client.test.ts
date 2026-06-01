import assert from "node:assert/strict";
import test from "node:test";
import {
  annotateSignalsWithCommitment,
  buildStocksCommitment,
  commitmentProfileFromRequest,
} from "./stock-commitment-client.js";

function signal(overrides: Record<string, any> = {}) {
  return {
    symbol: "AAPL",
    ticker: "AAPL",
    name: "Apple",
    price: 200,
    signalAction: "Buy",
    allocationAction: "Buy",
    signalStatus: "confirmed",
    suggestedExposure: 5,
    maxPositionPct: 5,
    setupQuality: 88,
    signalConfidence: 86,
    calibratedConfidence: 84,
    riskPressure: 22,
    expectedMove: 3,
    actionAllowed: true,
    sizingReasons: ["Existing sizing note should be preserved as context."],
    sizingConstraints: [
      {
        id: "liquidity",
        label: "Liquidity",
        type: "hard",
        severity: "high",
        passed: true,
        reason: "Liquidity is sufficient.",
      },
    ],
    trustGovernor: {
      trustScore: 88,
      allowsNewExposure: true,
    },
    judgement: {
      trust: 84,
      reliability: 82,
    },
    ...overrides,
  };
}

test("stocks commitment annotates signals from the Signal Commitment result", () => {
  const signals = [
    signal(),
    signal({
      symbol: "MSFT",
      ticker: "MSFT",
      name: "Microsoft",
      price: 400,
      setupQuality: 76,
      signalConfidence: 74,
      calibratedConfidence: 72,
      riskPressure: 34,
      suggestedExposure: 4,
      maxPositionPct: 4,
    }),
    signal({
      symbol: "TSLA",
      ticker: "TSLA",
      signalAction: "Sell",
      allocationAction: "Sell",
      price: 180,
      setupQuality: 70,
      signalConfidence: 68,
      calibratedConfidence: 66,
      riskPressure: 78,
      suggestedExposure: 0,
      maxPositionPct: 0,
    }),
  ];

  const commitment = buildStocksCommitment({
    market: "US",
    signals,
    profile: {
      availableCapital: 10_000,
      intent: "investing",
      riskPreference: "balanced",
      trustOverride: 0.9,
      maxSinglePositionPct: 6,
    },
  });
  const annotated = annotateSignalsWithCommitment(signals, commitment);
  const applePlan = commitment.executionPlan.find((row) => row.symbol === "AAPL");
  const appleSignal = annotated.find((row) => row.symbol === "AAPL");
  const teslaSignal = annotated.find((row) => row.symbol === "TSLA");

  assert.equal(commitment.source, "signal.commitment");
  assert.equal(commitment.result.module, "signal.commitment");
  assert.equal(commitment.result.operation, "commitment.evaluate.v1");
  assert.ok(applePlan);
  assert.ok(applePlan.commitmentAmount > 0);
  assert.equal(appleSignal?.commitment.amount, applePlan.commitmentAmount);
  assert.equal(appleSignal?.suggestedExposure, applePlan.allocationPct);
  assert.equal(appleSignal?.allocationAction, applePlan.action);
  assert.equal(teslaSignal?.suggestedExposure, 0);
  assert.equal(teslaSignal?.allocationAction, "Sell");
});

test("stocks commitment reevaluates when investor inputs change", () => {
  const signals = [signal()];
  const small = buildStocksCommitment({
    market: "US",
    signals,
    profile: {
      availableCapital: 1_000,
      intent: "trading",
      riskPreference: "conservative",
    },
  });
  const large = buildStocksCommitment({
    market: "US",
    signals,
    profile: {
      availableCapital: 5_000,
      intent: "investing",
      riskPreference: "aggressive",
    },
  });

  assert.notEqual(small.diagnostics.recomputeKey, large.diagnostics.recomputeKey);
  assert.ok(large.result.totalRecommended > small.result.totalRecommended);
  assert.equal(small.input.policy, "conservative");
  assert.equal(large.input.policy, "aggressive");
});

test("stocks commitment exposes invalidation and monitoring views", () => {
  const commitment = buildStocksCommitment({
    market: "US",
    signals: [signal()],
    profile: {
      availableCapital: 10_000,
      intent: "investing",
      riskPreference: "balanced",
    },
  });
  const plan = commitment.executionPlan[0];

  assert.ok(plan.invalidationTriggers.length > 0);
  assert.ok(plan.monitoringMetrics.length > 0);
  assert.ok(commitment.summary.monitorFirst);
  assert.ok(Array.isArray(commitment.result.invalidation.confidenceDeterioration));
  assert.ok(Array.isArray(commitment.result.monitoringPlan.futureChecks));
});

test("commitment request parsing supports investor overrides", () => {
  const profile = commitmentProfileFromRequest({
    query: { market: "US" },
    body: {
      commitment: {
        availableCapital: "2500",
        intent: "trading",
        riskPreference: "conservative",
        trustOverride: "82",
        maxSinglePositionPct: "4",
        maxPortfolioCommitmentPct: "12",
      },
    },
  });

  assert.deepEqual(profile, {
    availableCapital: 2500,
    intent: "trading",
    riskPreference: "conservative",
    trustOverride: 0.82,
    maxSinglePositionPct: 4,
    maxPortfolioCommitmentPct: 12,
  });
});
