import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateStockJudgement,
  judgementExposureGate,
  judgementReasons,
  judgementTrustForAgency,
  type StockJudgementInput,
} from "./stock-judgement";

function base(overrides: Partial<StockJudgementInput> = {}): StockJudgementInput {
  return {
    market: "NASDAQ",
    symbol: "AAPL",
    rawAction: "Buy",
    expectedEdgePct: 6,
    rawSuggestedExposurePct: 8,
    setupQuality: 84,
    riskPressure: 28,
    volatilityPct: 3,
    liquidityScore: 95,
    rawConfidence: 91,
    calibratedConfidence: 82,
    readiness: {
      stage: "Production eligible",
      readinessScore: 88,
      maxPositionPct: 20,
      trustworthiness: 75,
      calibration: {
        status: "trusted",
        sampleSize: 40,
        trustworthiness: 82,
        warnings: [],
      },
      benchmarks: {
        excessReturnAfterCostsPct: 8,
        strategyReturnPct: 30,
        buyHoldReturnPct: 10,
      },
      components: {
        liveSignalConsistency: { score: 82, passed: true },
        strategyEdge: { score: 90, passed: true },
      },
      walkForward: {
        segmentCount: 4,
        positiveSegmentCount: 4,
        stable: true,
      },
      parameterStability: {
        stable: true,
        passRate: 88,
      },
      concentration: {
        outlierDependent: false,
      },
      robustnessDiagnostics: {
        overfitRisk: 15,
      },
    },
    sizingResult: {
      decision: "allowed",
      mode: "micro",
      size: 4,
      normalizedSize: 0.2,
      reasons: ["Sizing passed."],
    },
    previousTrades: Array.from({ length: 18 }, (_, index) => ({
      symbol: `T${index}`,
      returnPct: 4,
      entryExposure: 5,
      setupQuality: 84,
      riskPressure: 28,
      volatilityPct: 3,
      confidence: 76,
    })),
    ...overrides,
  };
}

test("stock judgement maps trades into generic judgement evidence", () => {
  const judgement = evaluateStockJudgement(base());

  assert.equal(judgement.status, "trusted");
  assert.equal(judgement.evidence.positiveOutcomes, 18);
  assert.ok(judgement.reasons.some((reason) => reason.includes("Judgement compared")));
});

test("stock judgement reduces confidence when profitable similar trades carried survival scars", () => {
  const clean = evaluateStockJudgement(base());
  const scarred = evaluateStockJudgement(base({
    riskPressure: 74,
    volatilityPct: 7,
    liquidityScore: 25,
    previousTrades: Array.from({ length: 8 }, (_, index) => ({
      symbol: `SCAR${index}`,
      returnPct: 8,
      entryExposure: 8,
      setupQuality: 84,
      riskPressure: 74,
      volatilityPct: 7,
      liquidityScore: 25,
      maxDrawdownPct: 32,
      maxAdverseExcursion: 36,
      recoveryTimeBars: 55,
      tailRisk: 86,
      liquidityStress: 83,
      confidence: 80,
    })),
  }));

  assert.equal(scarred.survivalMemory?.scarCount, 8);
  assert.ok(scarred.adjustedConfidence < clean.adjustedConfidence);
  assert.notEqual(scarred.status, "trusted");
  assert.ok(scarred.reasons.some((reason) => reason.includes("Survival memory penalized confidence")));
});

test("stock judgement review-gates wait recommendations before near-ruin exposure goes to zero", () => {
  const reviewed = evaluateStockJudgement(base({
    survivalMemory: {
      module: "stocks.survival-memory",
      name: "Survival Memory",
      status: "scarred",
      recommendation: "wait",
      recordCount: 3,
      matchedCount: 3,
      scarCount: 2,
      nearRuinCount: 1,
      averageSurvivalCost: 52,
      recoveryBurden: 40,
      survivalConfidence: 46,
      currentStateSimilarity: 48,
      exposureMultiplier: 0.2,
      confidencePenalty: 34,
      maxExposurePct: 1,
      stateFingerprint: "venue:nasdaq|action:buy",
      mainWarnings: ["Similar states carried high survival cost."],
      reasons: ["Wait because similar states had unacceptable survival cost."],
      missingEvidence: ["Survival memory clearance"],
      unlockConditions: ["Wait until similar states show survival cost below 35/100 and no near-ruin match."],
      invalidationConditions: ["Invalidate if liquidity or tail pressure remains elevated in the current state."],
      fragileMatches: [],
      records: [],
    },
  }));

  assert.equal(reviewed.status, "review_required");
  assert.ok(reviewed.adjustedConfidence <= 46);
});

test("stock judgement includes strategy history, shadow evidence, opportunities, and agency traces", () => {
  const judgement = evaluateStockJudgement(base({
    previousTrades: [],
    strategyHistory: [{ date: "2026-01-01", returnPct: 2, confidence: 70 }],
    forwardShadow: { evaluatedSignalCount: 20, averageReturnPct: 1.2 },
    opportunityCandidates: [{ symbol: "AAPL", candidateScore: 72, expectedMove: 3 }],
    agencyResult: { allowed: true },
  }));

  assert.ok(judgement.evidence.similarStates >= 4);
  assert.ok(judgement.similarSampleSize >= 4);
  assert.ok(judgement.reasons.length > 0);
});

test("judgement exposure gate falls back when judgement is missing", () => {
  const gate = judgementExposureGate(undefined, 5);

  assert.equal(gate.allowsNewExposure, true);
  assert.equal(gate.exposureMultiplier, 1);
  assert.equal(gate.adjustedExposurePct, 5);
  assert.deepEqual(gate.reasons, []);
});

test("judgement exposure gate blocks and reduces exposure by status", () => {
  const blocked = judgementExposureGate({
    ...evaluateStockJudgement(base()),
    status: "blocked",
    rawConfidence: 80,
    adjustedConfidence: 0,
    warnings: ["judgement blocked action"],
  }, 6);
  const cautious = judgementExposureGate({
    ...evaluateStockJudgement(base()),
    status: "cautious",
    rawConfidence: 80,
    adjustedConfidence: 60,
  }, 6);

  assert.equal(blocked.allowsNewExposure, false);
  assert.equal(blocked.blocksNewExposure, true);
  assert.equal(blocked.adjustedExposurePct, 0);
  assert.equal(cautious.allowsNewExposure, true);
  assert.equal(cautious.exposureMultiplier, 0.75);
  assert.equal(cautious.adjustedExposurePct, 4.5);
});

test("judgement trust and reasons are agency friendly", () => {
  const trusted = evaluateStockJudgement(base());
  const review = {
    ...trusted,
    status: "review_required" as const,
    adjustedConfidence: 45,
    trust: 52,
    warnings: ["human review required"],
  };

  assert.ok(judgementTrustForAgency(50, trusted) >= 50);
  assert.equal(judgementTrustForAgency(80, review), 45);
  assert.ok(judgementReasons(review).some((reason) => reason.includes("Judgement warning")));
});

test("sell actions are represented as risk-reducing judgement actions", () => {
  const judgement = evaluateStockJudgement(base({
    rawAction: "Sell",
    expectedEdgePct: -3,
    rawSuggestedExposurePct: 0,
    previousTrades: Array.from({ length: 8 }, (_, index) => ({
      symbol: `S${index}`,
      returnPct: index % 2 === 0 ? 2 : -1,
      action: "Sell",
    })),
  }));

  assert.ok(judgement.similarSampleSize >= 5);
  assert.ok(judgement.reasons.length > 0);
});

test("stock judgement safely normalizes malformed history records", () => {
  const judgement = evaluateStockJudgement(base({
    previousTrades: [null, "bad", { returnPct: 2 }],
    opportunityCandidates: [null],
    strategyHistory: [null, { returnPct: 1 }],
  }));

  assert.ok(judgement.evidence.similarStates > 0);
  assert.ok(judgement.reasons.length > 0);
});

test("stock judgement covers conservative defaults for hold and failed agency traces", () => {
  const judgement = evaluateStockJudgement(base({
    rawAction: "Hold",
    readiness: {
      ...base().readiness,
      stage: undefined,
      robustnessDiagnostics: { overfitRisk: Number.NaN },
    },
    agencyResult: { allowed: false, requiresApproval: false },
  }));

  assert.ok(judgement.evidence.similarStates > 0);
  assert.equal(judgementTrustForAgency(Number.NaN, undefined), 0);
});

test("stock judgement covers shadow, agency approval, and robustness edge branches", () => {
  const partialAgency = evaluateStockJudgement(base({
    readiness: {
      ...base().readiness,
      stage: undefined,
      parameterStability: { stable: false, passRate: 25 },
      walkForward: { stable: false },
    },
    forwardShadow: { evaluatedSignals: 3, meanReturnPct: 0 },
    agencyResult: { allowed: false, requiresApproval: true },
  }));
  const negativeShadow = evaluateStockJudgement(base({
    forwardShadow: { evaluatedSignalCount: 3, averageReturnPct: -1 },
  }));

  assert.ok(partialAgency.overfitRisk > 0);
  assert.ok(partialAgency.reasons.length > 0);
  assert.ok(negativeShadow.reasons.length > 0);
});

test("stock judgement uses conservative defaults when optional stock fields are missing", () => {
  const judgement = evaluateStockJudgement(base({
    market: undefined,
    symbol: undefined,
    liquidityScore: undefined,
    sizingResult: undefined,
    previousTrades: [{ returnPct: 0 }],
    strategyHistory: [{ portfolioReturnPct: 0 }],
    forwardShadow: { evaluatedSignalCount: 0 },
    readiness: {
      stage: undefined,
      maxPositionPct: 10,
      concentration: {
        outlierDependent: true,
        top1TradeContributionPct: 55,
      },
      robustnessDiagnostics: {},
    },
  }));

  assert.equal(judgement.evidence.neutralOutcomes, 2);
  assert.ok(judgement.overfitRisk >= 55);
  assert.ok(judgement.reasons.length > 0);
});
