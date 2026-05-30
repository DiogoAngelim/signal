import assert from "node:assert/strict";
import test from "node:test";
import { SignalRobustnessEngine, type RobustnessObservation } from "./engine";

function durableObservations(): RobustnessObservation[] {
  const regimes = [
    "trending",
    "recovery",
    "low-volatility",
    "volatile",
    "expansion",
    "sideways",
  ];

  return Array.from({ length: 72 }, (_, index) => {
    const cycle = index % regimes.length;
    const actual = 1.8 + Math.sin(index / 3) * 0.55 + (cycle === 3 ? -0.35 : 0) + (cycle === 4 ? 0.45 : 0);
    return {
      id: `obs-${index}`,
      index,
      timestamp: index,
      actual,
      predicted: actual * 0.8,
      confidence: actual > 0 ? 72 : 38,
      regime: regimes[cycle],
      participated: index % 7 !== 0,
      features: {
        momentum: actual + index * 0.01,
        stability: 4 - Math.abs(actual - 1.8),
        volatility: cycle === 3 ? 48 : 24 + cycle,
        liquidity: 80 - cycle * 3,
      },
    };
  });
}

test("durable diagnostics reduce overfit risk below production threshold", () => {
  const engine = new SignalRobustnessEngine();
  const result = engine.evaluate({
    observations: durableObservations(),
    minimumSamples: 30,
    trainWindowSize: 18,
    validationWindowSize: 6,
    stepSize: 6,
    expectedForwardSamples: 30,
    observedForwardSamples: 72,
    dataQualityScore: 100,
    parameterVariants: [
      { id: "base", score: 100, baselineScore: 100, benchmarkScore: 35, passed: true },
      { id: "lookback-down", score: 92, baselineScore: 100, benchmarkScore: 34, passed: true },
      { id: "lookback-up", score: 96, baselineScore: 100, benchmarkScore: 36, passed: true },
      { id: "risk-up", score: 90, baselineScore: 100, benchmarkScore: 33, passed: true },
    ],
    adversarialScenarios: [
      { id: "spread-widening", score: 94, baselineScore: 100, severity: 12 },
      { id: "delayed-data", score: 91, baselineScore: 100, severity: 16 },
      { id: "volatility-spike", score: 88, baselineScore: 100, severity: 22 },
    ],
    ensembleVotes: [
      { id: "momentum", direction: 1, confidence: 78, weight: 1 },
      { id: "structure", direction: 1, confidence: 72, weight: 1 },
      { id: "breadth", direction: 1, confidence: 68, weight: 0.9 },
      { id: "volatility", direction: -1, confidence: 36, weight: 0.65 },
    ],
    leakageChecks: [
      { id: "wf-1", trainEndIndex: 17, validationStartIndex: 18, featureTimestampIndex: 17, labelTimestampIndex: 18 },
    ],
    seed: 99,
  });

  assert.equal(result.safetyGate, "allow");
  assert.equal(result.leakage.passed, true);
  assert.ok(result.overfitRisk <= 30);
  assert.ok(result.walkForward.windows.length > 0);
  assert.ok(result.regimes.regimes.length >= 4);
  assert.ok(result.calibration.reliabilityCurve.some((bucket) => bucket.samples > 0));
  assert.ok(result.parameterSensitivity.heatmap.every((cell) => cell.passed));
  assert.deepEqual(result.reasons, ["Robustness diagnostics are within production tolerance."]);
});

test("long-history diversity scores reduce false overfit confidence without hiding weak coverage", () => {
  const engine = new SignalRobustnessEngine();
  const baseInput = {
    observations: durableObservations(),
    minimumSamples: 30,
    trainWindowSize: 18,
    validationWindowSize: 6,
    stepSize: 6,
    expectedForwardSamples: 30,
    observedForwardSamples: 72,
    dataQualityScore: 92,
    parameterVariants: [
      { id: "base", score: 100, baselineScore: 100, benchmarkScore: 35, passed: true },
      { id: "nearby", score: 90, baselineScore: 100, benchmarkScore: 34, passed: true },
    ],
    adversarialScenarios: [
      { id: "spread-widening", score: 90, baselineScore: 100, severity: 12 },
    ],
    leakageChecks: [
      { id: "wf-1", trainEndIndex: 17, validationStartIndex: 18 },
    ],
    seed: 99,
  };
  const shallow = engine.evaluate({
    ...baseInput,
    historyDepthScore: 24,
    regimeCoverageScore: 28,
    regimeDiversityScore: 30,
    sampleDiversityScore: 35,
  });
  const broad = engine.evaluate({
    ...baseInput,
    historyDepthScore: 96,
    regimeCoverageScore: 92,
    regimeDiversityScore: 90,
    sampleDiversityScore: 88,
  });

  assert.ok(broad.overfitRisk < shallow.overfitRisk);
  assert.equal(broad.historyDepthScore, 96);
  assert.equal(broad.regimeDiversityScore, 90);
  assert.ok(shallow.reasons.some((reason) => reason.includes("Historical depth")));
  assert.ok(shallow.reasons.some((reason) => reason.includes("Regime coverage")));
});

test("fragile synchronized history is reduced or blocked instead of promoted", () => {
  const observations: RobustnessObservation[] = Array.from({ length: 22 }, (_, index) => ({
    index,
    timestamp: index,
    actual: index < 18 ? 2.5 : -8 - index,
    confidence: 94,
    regime: index < 18 ? "trending" : "panic",
    participated: index < 4,
    features: {
      synchronized: 1,
      volatility: index < 18 ? 18 : 92,
      liquidity: index < 18 ? 80 : 20,
    },
  }));

  const result = new SignalRobustnessEngine().evaluate({
    observations,
    minimumSamples: 30,
    trainWindowSize: 8,
    validationWindowSize: 4,
    stepSize: 4,
    expectedForwardSamples: 30,
    observedForwardSamples: 4,
    dataQualityScore: 78,
    parameterVariants: [
      { id: "base", score: 100, baselineScore: 100, benchmarkScore: 50, passed: true },
      { id: "nearby", score: 8, baselineScore: 100, benchmarkScore: 50, passed: false },
    ],
    adversarialScenarios: [
      { id: "slippage", score: -12, baselineScore: 100, severity: 35 },
    ],
    ensembleVotes: [
      { id: "single-path", direction: 1, confidence: 95, weight: 5 },
      { id: "minority", direction: -1, confidence: 10, weight: 0.1 },
    ],
    leakageChecks: [
      { id: "leak", trainEndIndex: 12, validationStartIndex: 12, normalizedWithFuture: true, featureTimestampIndex: 13, labelTimestampIndex: 13 },
    ],
  });

  assert.equal(result.safetyGate, "block");
  assert.equal(result.leakage.passed, false);
  assert.ok(result.overfitRisk > 60);
  assert.ok(result.parameterSensitivity.fragilityScore > 50);
  assert.ok(result.participation.participationScore < 35);
  assert.ok(result.reasons.some((reason) => reason.includes("validation overlaps training")));
  assert.ok(result.reasons.some((reason) => reason.includes("normalization used future data")));
});

test("diagnostics are reproducible for identical seeds and inputs", () => {
  const input = {
    observations: durableObservations().slice(0, 40),
    minimumSamples: 20,
    parameterVariants: [
      { id: "a", score: 30, baselineScore: 35, benchmarkScore: 20, passed: true },
    ],
    adversarialScenarios: [
      { id: "noise", score: 28, baselineScore: 35, severity: 5 },
    ],
    seed: 123,
  };
  const first = new SignalRobustnessEngine().evaluate(input);
  const second = new SignalRobustnessEngine().evaluate(input);

  assert.deepEqual(first.statisticalIntegrity, second.statisticalIntegrity);
  assert.equal(first.overfitRisk, second.overfitRisk);
  assert.equal(first.deploymentReadiness, second.deploymentReadiness);
});

test("fallback branches handle sparse participation and inferred regimes", () => {
  const engine = new SignalRobustnessEngine();
  const sparse = engine.evaluate({
    observations: [
      { index: 0, actual: -1, participated: false },
      { index: 1, actual: 0, participated: false },
    ],
    trainWindowSize: 10,
    validationWindowSize: 4,
    minimumSamples: 10,
    parameterVariants: [],
    adversarialScenarios: [],
    ensembleVotes: [],
    leakageChecks: [],
    observedForwardSamples: 0,
    expectedForwardSamples: 10,
    dataQualityScore: 40,
  });

  assert.equal(sparse.safetyGate, "block");
  assert.equal(sparse.walkForward.windows.length, 0);
  assert.equal(sparse.adversarial.scenarios.length, 0);
  assert.equal(sparse.featureTrust.features.length, 0);
  assert.equal(sparse.participation.participationScore, 0);

  const inferred = engine.evaluate({
    observations: [
      { actual: -7, features: { volatility: 20, liquidity: 70 } },
      { actual: 8, features: { volatility: 60, liquidity: 70 } },
      { actual: 2, features: { volatility: 20, liquidity: 70 } },
      { actual: -1, features: { volatility: 50, liquidity: 70 } },
      { actual: 0.2, features: { volatility: 10, liquidity: 70 } },
      { actual: -0.5, features: { volatility: 30, liquidity: 20 } },
      { actual: 0.5, features: { volatility: 30, liquidity: 70 } },
      { actual: -0.5, features: { volatility: 30, liquidity: 70 } },
      { actual: 1.4, features: { risk: 20, liquidity: 70 } },
    ],
    trainWindowSize: 3,
    validationWindowSize: 2,
    stepSize: 0,
    parameterVariants: [
      { id: "zero-baseline", score: 0, baselineScore: 0, benchmarkScore: 0, passed: true },
      { id: "fallback-baseline", score: 2 },
    ],
    adversarialScenarios: [
      { id: "zero-adversarial", score: 0, baselineScore: 0 },
      { id: "fallback-adversarial", score: 4 },
    ],
    ensembleVotes: [
      { id: "default-weight", direction: 1, confidence: 20 },
      { id: "zero-weight", direction: -1, confidence: 20, weight: 0 },
    ],
    seed: 0,
  });

  assert.ok(inferred.regimes.regimes.some((item) => item.regime === "trending"));
  assert.ok(inferred.regimes.regimes.some((item) => item.regime === "expansion"));
  assert.ok(inferred.regimes.regimes.some((item) => item.regime === "liquidity-compression"));
  assert.equal(inferred.parameterSensitivity.heatmap[0].degradationPct, 0);
  assert.equal(inferred.adversarial.scenarios[0].degradationPct, 0);

  const fallbackVariant = engine.evaluate({
    observations: [
      { actual: 1, confidence: 60 },
      { actual: 2, confidence: 65 },
      { actual: 3, confidence: 70 },
      { actual: 4, confidence: 75 },
      { actual: 5, confidence: 80 },
    ],
    trainWindowSize: 2,
    validationWindowSize: 1,
    parameterVariants: [
      { id: "no-baseline", score: 3 },
    ],
    ensembleVotes: [
      { id: "zero-a", direction: 1, confidence: 50, weight: 0 },
      { id: "zero-b", direction: -1, confidence: 50, weight: 0 },
    ],
  });
  assert.equal(fallbackVariant.parameterSensitivity.heatmap[0].degradationPct, 0);
  assert.equal(Number.isFinite(fallbackVariant.ensemble.consensusScore), true);

  const empty = engine.evaluate({
    observations: [],
    minimumSamples: 5,
    observedForwardSamples: 0,
    expectedForwardSamples: 5,
  });
  assert.equal(empty.calibration.calibrationError, 75);
  assert.equal(empty.regimes.regimeDependencyScore, 100);
  assert.equal(empty.statisticalIntegrity.bootstrapStability, 0);
  assert.equal(empty.statisticalIntegrity.monteCarloStability, 0);

  const featureEdges = engine.evaluate({
    observations: [
      { actual: "bad" as any, features: { sparse: 1, inverse: 3 } },
      { actual: 1, features: { sparse: 2, inverse: 2 } },
      { actual: 2, features: { inverse: 1 } },
      { actual: 3, features: { inverse: 0, nullable: null as any } },
    ],
    trainWindowSize: 2,
    validationWindowSize: 1,
  });
  assert.ok(featureEdges.featureTrust.features.some((item) => item.key === "sparse" && item.trust === 45));
  assert.ok(featureEdges.featureTrust.features.some((item) => item.key === "inverse"));

  const zeroTrust = engine.evaluate({
    observations: [
      { actual: 1, features: { inverseOnly: 3 } },
      { actual: 2, features: { inverseOnly: 2 } },
      { actual: 3, features: { inverseOnly: 1 } },
    ],
    trainWindowSize: 2,
    validationWindowSize: 1,
  });
  assert.equal(zeroTrust.featureTrust.features[0].trust, 0);
});
