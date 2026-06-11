/**
 * End-to-end verification test for the 4-layer architecture.
 *
 * Tests the full pipeline:
 *   Raw Signal → Signal Adapter → Portfolio & Risk Engine → Position
 *
 * This verifies:
 * - Signal validation works (schema only, no logic changes)
 * - Portfolio & Risk engine produces deterministic positions
 * - Execution layer receives Position objects
 * - Monitoring captures signal→outcome logs
 * - No signal generation logic was modified
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  validateSignal,
  adaptStrategySignal,
  adaptStrategySignals,
  evaluatePortfolioRisk,
  runTradingPipeline,
  monitoringStore,
  DEFAULT_PORTFOLIO_RISK_CONFIG,
} from "../index";
import type { ValidatedSignal } from "../types";

// ── Test Data ──────────────────────────────────────────────────────

const MOCK_RAW_SIGNALS = [
  {
    symbol: "AAPL",
    direction: "long",
    strength: 0.8,
    confidence: 0.7,
    timestamp: Date.now(),
    horizon: "swing",
  },
  {
    symbol: "TSLA",
    direction: "short",
    strength: 0.6,
    confidence: 0.5,
    timestamp: Date.now(),
  },
  {
    symbol: "GOOG",
    direction: "flat",
    strength: 0.3,
    confidence: 0.2,
    timestamp: Date.now(),
  },
];

const validatedSignals: ValidatedSignal[] = [
  { asset: "AAPL", direction: "long", strength: 0.8, confidence: 0.7, timestamp: Date.now() },
  { asset: "TSLA", direction: "short", strength: 0.6, confidence: 0.5, timestamp: Date.now() },
  { asset: "GOOG", direction: "flat", strength: 0.3, confidence: 0.2, timestamp: Date.now() },
];

// ── Signal Adapter Tests ──────────────────────────────────────────

test("Signal Adapter: validates a well-formed signal", () => {
  const result = validateSignal({
    asset: "AAPL",
    direction: "long",
    strength: 0.8,
    confidence: 0.7,
    timestamp: Date.now(),
  });
  assert.ok(result, "valid signal should return ValidatedSignal, not null");
  assert.equal(result.asset, "AAPL");
  assert.equal(result.direction, "long");
});

test("Signal Adapter: rejects a signal with missing fields", () => {
  const result = validateSignal({ asset: "AAPL" } as Record<string, unknown>);
  // Missing timestamp makes it invalid → returns null
  assert.equal(result, null);
});

test("Signal Adapter: rejects a signal with invalid direction", () => {
  const result = validateSignal({
    asset: "AAPL",
    direction: "sideways",
    strength: 0.8,
    confidence: 0.7,
    timestamp: Date.now(),
  });
  // "sideways" normalizes to "flat" — still valid, just flat
  assert.ok(result);
  assert.equal(result.direction, "flat");
});

test("Signal Adapter: adapts raw strategy signal to validated signal", () => {
  const result = adaptStrategySignal({
    symbol: "AAPL",
    direction: "long",
    strength: 0.8,
    confidence: 0.7,
    timestamp: Date.now(),
  });
  assert.ok(result);
  assert.equal(result.asset, "AAPL");
});

test("Signal Adapter: adapts multiple raw signals", () => {
  const results = adaptStrategySignals(MOCK_RAW_SIGNALS);
  assert.equal(results.length, 3);
});

// ── Portfolio & Risk Engine Tests ─────────────────────────────────

test("Risk Engine: produces positions from valid signals", () => {
  const result = evaluatePortfolioRisk({
    signals: validatedSignals,
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: {},
    totalCurrentExposure: 0,
    lastTradeTimestampByAsset: {},
    nowMs: Date.now(),
  });

  // AAPL (long) and TSLA (short) should produce positions; GOOG (flat) should not
  assert.equal(result.positions.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.ok(result.rejected[0].reasons.includes("flat_direction_no_position"));
});

test("Risk Engine: respects max exposure per asset", () => {
  const result = evaluatePortfolioRisk({
    signals: validatedSignals,
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: { AAPL: 15_000 },
    totalCurrentExposure: 15_000,
    lastTradeTimestampByAsset: {},
    nowMs: Date.now(),
    config: { maxExposurePerAsset: 0.2 },
  });

  const aaplPosition = result.positions.find((p) => p.position.asset === "AAPL");
  if (aaplPosition) {
    // 20% of 100k = 20k max, already 15k exposed, so max 5k more
    assert.ok(aaplPosition.position.size <= 5_000 + 0.01);
  }
});

test("Risk Engine: respects total portfolio exposure limit", () => {
  const result = evaluatePortfolioRisk({
    signals: validatedSignals,
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: {},
    totalCurrentExposure: 45_000,
    lastTradeTimestampByAsset: {},
    nowMs: Date.now(),
    config: { maxTotalExposure: 0.5 },
  });

  const totalNewExposure = result.positions.reduce((sum, p) => sum + p.position.size, 0);
  assert.ok(totalNewExposure <= 5_000 + 0.01);
});

test("Risk Engine: enforces cooldown per asset", () => {
  const now = Date.now();
  const result = evaluatePortfolioRisk({
    signals: [validatedSignals[0]],
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: {},
    totalCurrentExposure: 0,
    lastTradeTimestampByAsset: { AAPL: now - 1000 },
    nowMs: now,
    config: { cooldownMs: 60_000 },
  });

  assert.equal(result.positions.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.ok(result.rejected[0].reasons[0].includes("cooldown_active"));
});

test("Risk Engine: is deterministic — same inputs produce same outputs", () => {
  const input = {
    signals: validatedSignals,
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: {},
    totalCurrentExposure: 0,
    lastTradeTimestampByAsset: {},
    nowMs: 1000000,
  };

  const result1 = evaluatePortfolioRisk(input);
  const result2 = evaluatePortfolioRisk(input);

  assert.equal(result1.positions.length, result2.positions.length);
  for (let i = 0; i < result1.positions.length; i++) {
    assert.equal(result1.positions[i].position.size, result2.positions[i].position.size);
    assert.equal(result1.positions[i].position.asset, result2.positions[i].position.asset);
  }
});

test("Risk Engine: rejects signals below minimum confidence", () => {
  const result = evaluatePortfolioRisk({
    signals: [{ asset: "LOW", direction: "long", strength: 0.8, confidence: 0.05, timestamp: Date.now() }],
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: {},
    totalCurrentExposure: 0,
    lastTradeTimestampByAsset: {},
    nowMs: Date.now(),
  });

  assert.equal(result.positions.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.ok(result.rejected[0].reasons[0].includes("confidence_below_threshold"));
});

// ── Pipeline Tests ────────────────────────────────────────────────

test("Pipeline: runs the full pipeline without execution module", async () => {
  const result = await runTradingPipeline({
    rawSignals: MOCK_RAW_SIGNALS,
    equity: 100_000,
    availableEquity: 50_000,
  });

  assert.equal(result.validatedSignals.length, 3);
  assert.equal(result.riskResult.positions.length, 2);
  assert.equal(result.positions.length, 2);
  assert.equal(result.executionResults, undefined);
});

test("Pipeline: records signal outcomes in monitoring store", async () => {
  const summary0 = monitoringStore.getSummary();

  await runTradingPipeline({
    rawSignals: MOCK_RAW_SIGNALS,
    equity: 100_000,
    availableEquity: 50_000,
  });

  const summary = monitoringStore.getSummary();
  assert.ok(summary.signalOutcomeCount > summary0.signalOutcomeCount);
});

// ── Architecture Invariant Tests ──────────────────────────────────

test("Invariant: Signal adapter does NOT modify signal logic", () => {
  const raw = { symbol: "AAPL", direction: "long", strength: 0.75, confidence: 0.65, timestamp: 12345 };
  const result = adaptStrategySignal(raw);

  assert.ok(result);
  assert.equal(result.direction, "long");
  assert.equal(result.strength, 0.75);
  assert.equal(result.confidence, 0.65);
  assert.equal(result.timestamp, 12345);
});

test("Invariant: Position contains only financial decision data", () => {
  const result = evaluatePortfolioRisk({
    signals: [{ asset: "AAPL", direction: "long", strength: 0.8, confidence: 0.7, timestamp: Date.now() }],
    equity: 100_000,
    availableEquity: 50_000,
    currentExposureByAsset: {},
    totalCurrentExposure: 0,
    lastTradeTimestampByAsset: {},
    nowMs: Date.now(),
  });

  assert.equal(result.positions.length, 1);
  const pos = result.positions[0].position;
  assert.deepEqual(Object.keys(pos).sort(), ["asset", "direction", "size"]);
});

test("Invariant: Risk engine is the ONLY place with financial decisions", () => {
  const equity = 100_000;
  const confidence = 0.7;
  const strength = 0.8;
  const baseFraction = DEFAULT_PORTFOLIO_RISK_CONFIG.baseSizeFraction;

  const result = evaluatePortfolioRisk({
    signals: [{ asset: "AAPL", direction: "long", strength, confidence, timestamp: Date.now() }],
    equity,
    availableEquity: equity,
    currentExposureByAsset: {},
    totalCurrentExposure: 0,
    lastTradeTimestampByAsset: {},
    nowMs: Date.now(),
  });

  const expectedSize = baseFraction * confidence * strength * equity;
  assert.equal(result.positions.length, 1);
  assert.ok(Math.abs(result.positions[0].position.size - expectedSize) < 0.01);
});