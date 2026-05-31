import assert from "node:assert/strict";
import test from "node:test";
import {
  accountabilityGetOperation,
  decisionCapabilitiesPayload,
  enrichStrategySignal,
  evaluateDecisionOperation,
  recordDecisionOutcomeOperation,
} from "../lib/decision-intelligence.js";

test("decision intelligence enriches strategy signals with required governance fields", () => {
  const signal = enrichStrategySignal(
    {
      symbol: "BTCUSDT",
      signalAction: "Buy",
      allocationAction: "Buy",
      suggestedExposure: 5,
      setupQuality: 86,
      riskPressure: 24,
      expectedMove: 2.1,
      signalConfidence: 82,
      calibratedConfidence: 78,
      trustworthiness: 76,
    },
    {
      market: "BINANCE",
      summary: { survivalScore: 74, tradeCount: 44, updatedAt: "2026-05-31T00:00:00.000Z" },
    },
  );

  assert.equal(typeof signal.coherenceScore, "number");
  assert.equal(typeof signal.coherenceStatus, "string");
  assert.equal(typeof signal.consensusLevel, "number");
  assert.ok(Array.isArray(signal.predictionScenarios));
  assert.equal(typeof signal.simulationRecommendation, "string");
  assert.equal(typeof signal.wisdomDecision, "string");
  assert.equal(typeof signal.accountabilitySummary, "string");
  assert.equal(signal.decisionReplayAvailable, true);
  assert.equal(typeof signal.actionAllowed, "boolean");
  assert.equal(typeof signal.actionScale, "number");
  assert.ok(signal.suggestedExposure <= 5);
});

test("decision intelligence blocks or scales unsafe buy signals", () => {
  const signal = enrichStrategySignal({
    symbol: "RISKY",
    signalAction: "Buy",
    allocationAction: "Buy",
    suggestedExposure: 7,
    setupQuality: 54,
    riskPressure: 92,
    expectedMove: -3.5,
    signalConfidence: 80,
    calibratedConfidence: 32,
    trustworthiness: 24,
  });

  assert.equal(signal.suggestedExposure, 0);
  assert.equal(signal.actionAllowed, false);
  assert.equal(signal.allocationAction, "Blocked");
  assert.match(signal.accountabilitySummary, /Signal|coherence|decision/i);
});

test("decision operations expose protocol-style capabilities and persisted accountability", () => {
  const capabilities = decisionCapabilitiesPayload();
  assert.ok(capabilities.operations.some((operation: any) => operation.name === "decision.evaluate.v1"));
  assert.ok(capabilities.events.some((operation: any) => operation.name === "decision.blocked.v1"));

  const result = evaluateDecisionOperation({
    decisionId: "test-decision",
    observation: { target: "test" },
    modules: {
      discovery: 80,
      judgment: 76,
      purpose: 72,
      need: 70,
      trust: 74,
      recovery: 78,
      calibration: 75,
      agency: 62,
    },
  });
  const outcome = recordDecisionOutcomeOperation({
    decisionId: "test-decision",
    actualSuccessScore: 81,
    expectedConfidence: 76,
  });
  const accountability = accountabilityGetOperation({ decisionId: "test-decision" });

  assert.equal(result.record.decisionId, "test-decision");
  assert.equal(outcome.outcome.decisionId, "test-decision");
  assert.equal(accountability.found, true);
  assert.equal(accountability.accountability.decisionId, "test-decision");
});
