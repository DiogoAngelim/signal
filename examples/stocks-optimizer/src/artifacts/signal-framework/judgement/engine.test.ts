import assert from "node:assert/strict";
import test from "node:test";
import { evaluateJudgement, type JudgementInput, type JudgementOutcome } from "./engine";

function outcome(returnPct: number, overrides: Partial<JudgementOutcome> = {}): JudgementOutcome {
  return {
    state: {
      market: "NASDAQ",
      regime: "trend",
      setupQuality: 80,
      riskPressure: 25,
      tags: ["breakout", "liquid"],
    },
    decision: {
      kind: "buy",
      horizon: "swing",
      confidence: 70,
    },
    action: {
      kind: "open_exposure",
      sizePct: 4,
    },
    outcome: { returnPct, success: returnPct > 0, label: returnPct > 0 ? "success" : returnPct < 0 ? "failure" : "neutral" },
    confidence: 70,
    ...overrides,
  };
}

function base(overrides: Partial<JudgementInput> = {}): JudgementInput {
  return {
    currentState: {
      market: "NASDAQ",
      regime: "trend",
      setupQuality: 82,
      riskPressure: 24,
      tags: ["liquid", "breakout"],
    },
    proposedDecision: {
      kind: "buy",
      horizon: "swing",
      rawConfidence: 70,
    },
    proposedAction: {
      kind: "open_exposure",
      sizePct: 4,
    },
    context: {
      minimumSimilarSamples: 5,
      strongSampleSize: 8,
      similarityThreshold: 0.5,
      overfitRisk: 12,
    },
    ...overrides,
  };
}

test("low sample size requires review", () => {
  const result = evaluateJudgement(base({
    historicalOutcomes: [outcome(8), outcome(7)],
  }));

  assert.equal(result.status, "review_required");
  assert.equal(result.similarSampleSize, 2);
  assert.ok(result.adjustedConfidence < result.rawConfidence);
  assert.ok(result.warnings.includes("low sample size"));
});

test("stable positive outcomes can produce trusted judgement and a small evidence-backed lift", () => {
  const result = evaluateJudgement(base({
    historicalOutcomes: Array.from({ length: 10 }, (_, index) => outcome(14 + (index % 3))),
  }));

  assert.equal(result.status, "trusted");
  assert.equal(result.evidence.positiveOutcomes, 10);
  assert.equal(result.evidence.negativeOutcomes, 0);
  assert.ok(result.trust >= 75);
  assert.ok(result.adjustedConfidence >= result.rawConfidence);
  assert.ok(result.reasons.some((reason) => reason.includes("consistently positive")));
});

test("unstable outcomes create a review gate and reduce high confidence", () => {
  const result = evaluateJudgement(base({
    proposedDecision: { kind: "buy", rawConfidence: 82 },
    historicalOutcomes: Array.from({ length: 12 }, (_, index) => outcome(index % 2 === 0 ? 100 : -100)),
    context: { minimumSimilarSamples: 5, strongSampleSize: 8, similarityThreshold: 0.5 },
  }));

  assert.equal(result.status, "review_required");
  assert.ok(result.outcomeStability < 45);
  assert.ok(result.adjustedConfidence < 60);
  assert.ok(result.warnings.includes("unstable outcomes"));
});

test("overconfidence against poor outcomes is blocked", () => {
  const result = evaluateJudgement(base({
    proposedDecision: { kind: "buy", rawConfidence: 92 },
    historicalOutcomes: Array.from({ length: 12 }, () => outcome(-18, { confidence: 92 })),
    context: { minimumSimilarSamples: 5, strongSampleSize: 8, overfitRisk: 24 },
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.adjustedConfidence, 0);
  assert.ok(result.calibration < 50);
  assert.ok(result.reasons.some((reason) => reason.includes("Calibration is weak")));
});

test("poor calibration without a hard block still reduces trust", () => {
  const result = evaluateJudgement(base({
    proposedDecision: { kind: "buy", rawConfidence: 86 },
    historicalOutcomes: [
      ...Array.from({ length: 5 }, () => outcome(1, { confidence: 94 })),
      ...Array.from({ length: 7 }, () => outcome(-6, { confidence: 94 })),
    ],
    context: { minimumSimilarSamples: 5, strongSampleSize: 12, overfitRisk: 30 },
  }));

  assert.notEqual(result.status, "trusted");
  assert.ok(result.calibration < 55);
  assert.ok(result.trust < 70);
  assert.ok(result.adjustedConfidence < result.rawConfidence);
  assert.ok(result.warnings.includes("poor calibration"));
});

test("high overfit risk requires review even when recent outcomes look good", () => {
  const result = evaluateJudgement(base({
    historicalOutcomes: Array.from({ length: 10 }, () => outcome(12)),
    context: { minimumSimilarSamples: 5, strongSampleSize: 8, overfitRiskPct: 78 },
  }));

  assert.equal(result.status, "review_required");
  assert.ok(result.overfitRisk >= 78);
  assert.ok(result.warnings.includes("high overfit risk"));
});

test("very high overfit risk blocks judgement", () => {
  const result = evaluateJudgement(base({
    historicalOutcomes: Array.from({ length: 10 }, () => outcome(12)),
    context: { minimumSimilarSamples: 5, strongSampleSize: 8, overfitRisk: 0.92 },
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.adjustedConfidence, 0);
  assert.ok(result.warnings.includes("judgement blocked action"));
});

test("cautious judgement allows reduced confidence when evidence is adequate but not strong", () => {
  const result = evaluateJudgement(base({
    proposedDecision: { kind: "buy", rawConfidence: 64 },
    historicalOutcomes: [
      ...Array.from({ length: 6 }, () => outcome(6, { confidence: 62 })),
      ...Array.from({ length: 3 }, () => outcome(-3, { confidence: 62 })),
    ],
    context: { minimumSimilarSamples: 5, strongSampleSize: 12, overfitRisk: 38 },
  }));

  assert.equal(result.status, "cautious");
  assert.ok(result.similarSampleSize >= 5);
  assert.ok(result.adjustedConfidence <= result.rawConfidence);
});

test("missing optional fields remain safe and explainable", () => {
  const result = evaluateJudgement({
    currentState: { confidence: 0.61 },
  });

  assert.equal(result.rawConfidence, 61);
  assert.equal(result.status, "review_required");
  assert.equal(result.evidence.similarStates, 0);
  assert.ok(result.reasons.length > 0);
  assert.ok(result.warnings.includes("low sample size"));
});

test("malformed partial input uses conservative deterministic defaults", () => {
  const result = evaluateJudgement({
    currentState: null,
    proposedDecision: "bad",
    proposedAction: 4,
    historicalOutcomes: { bad: true },
    traces: "bad",
    context: "bad",
  } as any);

  assert.equal(result.rawConfidence, 50);
  assert.equal(result.status, "review_required");
  assert.ok(result.warnings.includes("currentState was not an object"));
  assert.ok(result.warnings.includes("historicalOutcomes was not an array"));
});

test("traces and flexible outcome labels contribute to evidence", () => {
  const traces = [
    {
      state: { market: "NASDAQ", regime: "trend", setupQuality: 81, riskPressure: 24 },
      decision: { kind: "buy" },
      action: { kind: "open_exposure" },
      result: { label: "win" },
      rawConfidence: 0.68,
    },
    {
      perception: { market: "NASDAQ", regime: "trend", setupQuality: 80, riskPressure: 25 },
      proposedDecision: { kind: "buy" },
      proposedAction: { kind: "open_exposure" },
      outcome: { label: "neutral" },
      confidence: 68,
    },
  ];
  const result = evaluateJudgement(base({
    historicalOutcomes: Array.from({ length: 4 }, () => outcome(9)),
    traces,
  }));

  assert.equal(result.similarSampleSize, 6);
  assert.equal(result.evidence.neutralOutcomes, 1);
  assert.ok(result.evidence.positiveOutcomes >= 5);
});

test("nested state features and missing outcomes stay explainable", () => {
  const result = evaluateJudgement(base({
    currentState: {
      market: "NASDAQ",
      regime: "trend",
      setupQuality: 82,
      riskPressure: 24,
      nested: { liquidity: "deep" },
    },
    historicalOutcomes: [
      outcome(8, { state: { market: "NASDAQ", regime: "trend", setupQuality: 82, riskPressure: 24, nested: { liquidity: "deep" } } }),
      {
        state: { market: "NASDAQ", regime: "trend", setupQuality: 82, riskPressure: 24, nested: { liquidity: "deep" } },
        decision: { kind: "buy" },
        action: { kind: "open_exposure" },
      },
      ...Array.from({ length: 4 }, () => outcome(7)),
    ],
  }));

  assert.equal(result.evidence.similarStates > result.similarSampleSize, true);
  assert.ok(result.warnings.includes("some similar states have no usable outcome"));
});

test("non-record historical items and malformed robustness context stay conservative", () => {
  const result = evaluateJudgement(base({
    historicalOutcomes: [
      null as any,
      outcome(4),
      outcome(5),
      outcome(6),
      outcome(7),
      outcome(8),
    ],
    context: {
      minimumSimilarSamples: "bad",
      strongSampleSize: "bad",
      similarityThreshold: "bad",
      robustnessDiagnostics: "bad",
      robustness: "bad",
    },
  }));

  assert.ok(result.similarSampleSize >= 5);
  assert.ok(result.reasons.length > 0);
});

test("label-only and boolean outcomes are normalized consistently", () => {
  const result = evaluateJudgement(base({
    historicalOutcomes: [
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, outcome: "success" },
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, outcome: "failure" },
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, outcome: "partial" },
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, result: { outcomeLabel: "mixed" } },
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, success: false },
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, success: true },
      { state: base().currentState, decision: { kind: "buy" }, action: { kind: "open_exposure" }, returnPct: 3 },
    ],
    context: { minimumSimilarSamples: 5, strongSampleSize: 5, robustnessDiagnostics: { overfitRiskPct: 20 }, robustness: { overfitRisk: 18 } },
  }));

  assert.equal(result.similarSampleSize, 7);
  assert.ok(result.evidence.positiveOutcomes > 0);
  assert.ok(result.evidence.negativeOutcomes > 0);
  assert.ok(result.evidence.neutralOutcomes > 0);
});

test("feature matching handles sparse records, arrays, booleans, and empty tokens", () => {
  const sparse = evaluateJudgement({
    currentState: { a: 1 },
    historicalOutcomes: [
      { state: { b: 2 }, returnPct: 1 },
      { state: { c: 3 }, returnPct: -1 },
    ],
    context: { minimumSimilarSamples: 1, strongSampleSize: 2, similarityThreshold: 0 },
  });
  const shaped = evaluateJudgement({
    currentState: {
      flag: true,
      empty: " ",
      note: "!!!",
      tags: ["alpha", null, "alpha"],
    },
    proposedDecision: { kind: "buy", active: true },
    proposedAction: { kind: "open_exposure", reduce: false },
    context: { minimumSimilarSamples: 1, strongSampleSize: 2, similarityThreshold: 0, niche: true },
    historicalOutcomes: [
      {
        state: { flag: false, empty: " ", note: "???", tags: ["beta"] },
        decision: { kind: "buy", active: false },
        action: { kind: "open_exposure", reduce: true },
        context: { niche: false },
        success: false,
      },
      {
        state: { flag: true, note: "!!!", tags: ["alpha"] },
        decision: { kind: "buy", active: true },
        action: { kind: "open_exposure", reduce: false },
        context: { niche: true },
        success: true,
      },
    ],
  });

  assert.equal(sparse.similarSampleSize, 2);
  assert.equal(shaped.similarSampleSize, 2);
  assert.ok(shaped.evidence.positiveOutcomes > 0);
  assert.ok(shaped.evidence.negativeOutcomes > 0);
});

test("null input stays deterministic and review gated", () => {
  const result = evaluateJudgement(null as any);

  assert.equal(result.status, "review_required");
  assert.equal(result.rawConfidence, 50);
  assert.ok(result.warnings.includes("currentState was not an object"));
});

test("deterministic output is stable across repeated evaluations", () => {
  const input = base({
    historicalOutcomes: [
      ...Array.from({ length: 8 }, (_, index) => outcome(10 + index % 2)),
      outcome(0),
    ],
  });

  assert.deepEqual(evaluateJudgement(input), evaluateJudgement(input));
});
