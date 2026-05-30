import { describe, expect, it } from "vitest";
import { type ReflectionInput, reflect } from "./engine";

const now = 1_800_000_000_000;

function baseHistory(): ReflectionInput["history"] {
  return [
    {
      id: "h1",
      timestamp: now - 4_000,
      state: { load: 20, mode: "normal", stable: true },
      prediction: {
        id: "p1",
        decisionId: "d1",
        confidence: 0.8,
        expectedOutcome: "success",
      },
      decision: { id: "d1", type: "route", confidence: 0.8 },
      outcome: {
        predictionId: "p1",
        decisionId: "d1",
        label: "success",
        success: true,
      },
    },
    {
      id: "h2",
      timestamp: now - 3_000,
      state: { load: 25, mode: "normal", stable: true },
      prediction: {
        id: "p2",
        decisionId: "d2",
        confidence: 75,
        expectedOutcome: "partial",
      },
      decision: { id: "d2", type: "route", confidence: 75 },
      outcome: { predictionId: "p2", decisionId: "d2", label: "partial" },
    },
    {
      id: "h3",
      timestamp: now - 2_000,
      state: { load: 90, mode: "surge", stable: false },
      prediction: {
        id: "p3",
        decisionId: "d3",
        confidence: 0.9,
        expectedOutcome: "success",
      },
      decision: { id: "d3", type: "pause", confidence: 0.9 },
      outcome: {
        predictionId: "p3",
        decisionId: "d3",
        label: "failure",
        success: false,
      },
    },
  ];
}

describe("reflect", () => {
  it("handles no history and empty predictions conservatively", () => {
    const result = reflect({});

    expect(result.calibration.status).toBe("insufficient-data");
    expect(result.historicalReliability.evaluatedPredictionCount).toBe(0);
    expect(result.recommendedConfidenceCap).toBe(70);
    expect(result.knownUnknowns).toContain(
      "No evaluated prediction history is available.",
    );
    expect(result.knowledgeCompleteness.knownUnknowns).toContain(
      "No knowledge inputs were supplied.",
    );
    expect(result.reflectionScore).toBeGreaterThanOrEqual(0);
    expect(result.reflectionScore).toBeLessThanOrEqual(100);
  });

  it("tracks predictions, decisions, outcomes, arbitrary labels, and reliability trend", () => {
    const result = reflect({
      history: baseHistory(),
      predictions: [
        { id: "custom", confidence: 0.6, expectedOutcome: "handoff-complete" },
      ],
      outcomes: [{ predictionId: "custom", label: "handoff-complete" }],
    });

    expect(result.historicalReliability.predictionCount).toBe(4);
    expect(result.historicalReliability.decisionCount).toBe(3);
    expect(result.historicalReliability.outcomeDistribution).toMatchObject({
      success: expect.any(Number),
      partial: expect.any(Number),
      failure: expect.any(Number),
      "handoff-complete": expect.any(Number),
    });
    expect(result.historicalReliability.reliabilityTrend.direction).toMatch(
      /flat|weakening|improving/,
    );
    expect(result.calibration.sampleSize).toBe(4);
  });

  it("matches outcomes by id, decision id, correctness flags, and generic labels", () => {
    const result = reflect({
      predictions: [
        { id: "outcome-id", confidence: 60 },
        { decisionId: "decision-match", confidence: 60 },
        { id: "explicit-false", confidence: 80, correct: false },
        { id: "outcome-correct-true", confidence: 70 },
        { id: "outcome-correct-false", confidence: 30 },
        { id: "expected-match", confidence: 70, expectedOutcome: "custom" },
        { id: "expected-mismatch", confidence: 70, expectedOutcome: "wanted" },
        { id: "label-success", confidence: 80 },
        { id: "label-failure", confidence: 30 },
        { id: "blank-label", confidence: 50 },
      ],
      outcomes: [
        { id: "outcome-id", label: "success" },
        { decisionId: "decision-match", label: "passed" },
        { predictionId: "outcome-correct-true", correct: true },
        { predictionId: "outcome-correct-false", correct: false },
        { predictionId: "expected-match", label: "custom" },
        { predictionId: "expected-mismatch", label: "other" },
        { predictionId: "label-success", label: "success" },
        { predictionId: "label-failure", label: "failure" },
        { predictionId: "blank-label", label: " " },
      ],
    });

    expect(result.calibration.sampleSize).toBe(9);
    expect(result.historicalReliability.evaluatedPredictionCount).toBe(9);
    expect(
      result.historicalReliability.outcomeDistribution.unknown,
    ).toBeGreaterThan(0);
  });

  it("detects improving and weakening reliability trends", () => {
    const improving = reflect({
      history: [
        {
          timestamp: 1,
          prediction: { id: "early", confidence: 50 },
          outcome: { label: "failure" },
        },
        {
          timestamp: 2,
          prediction: { id: "recent", confidence: 50 },
          outcome: { label: "success" },
        },
      ],
    });
    const weakening = reflect({
      history: [
        {
          timestamp: 1,
          prediction: { id: "early", confidence: 50 },
          outcome: { label: "success" },
        },
        {
          timestamp: 2,
          prediction: { id: "recent", confidence: 50 },
          outcome: { label: "failure" },
        },
      ],
    });

    expect(improving.historicalReliability.reliabilityTrend.direction).toBe(
      "improving",
    );
    expect(weakening.historicalReliability.reliabilityTrend.direction).toBe(
      "weakening",
    );
  });

  it("reports missing outcomes as known unknowns without pretending calibration exists", () => {
    const result = reflect({
      predictions: [
        { id: "p1", confidence: 90, expectedOutcome: "success" },
        { id: "p2", confidence: 20, expectedOutcome: "custom-label" },
      ],
      decisions: [{ id: "d1", confidence: 50 }],
    });

    expect(result.calibration.status).toBe("insufficient-data");
    expect(result.historicalReliability.predictionCount).toBe(2);
    expect(result.historicalReliability.outcomeCount).toBe(0);
    expect(result.reasons).toContain(
      "Historical reliability is not yet established.",
    );
  });

  it("detects high-confidence incorrect predictions as overconfidence", () => {
    const result = reflect({
      predictions: [{ id: "bad", confidence: 95, expectedOutcome: "success" }],
      outcomes: [{ predictionId: "bad", label: "failure", success: false }],
    });

    expect(result.calibration.status).toBe("overconfident");
    expect(result.calibration.overconfidenceDetected).toBe(true);
    expect(result.confidenceAdjustment).toBeLessThan(0);
    expect(result.recommendedConfidenceCap).toBeLessThan(100);
  });

  it("detects low-confidence correct predictions as underconfidence", () => {
    const result = reflect({
      predictions: [
        { id: "good", confidence: 0.2, expectedOutcome: "success" },
      ],
      outcomes: [{ predictionId: "good", label: "success", success: true }],
    });

    expect(result.calibration.status).toBe("underconfident");
    expect(result.calibration.underconfidenceDetected).toBe(true);
    expect(result.confidenceAdjustment).toBeGreaterThan(0);
  });

  it("finds similar states and reports cluster reliability", () => {
    const result = reflect({
      history: baseHistory(),
      currentState: { load: 22, mode: "normal", stable: true },
      options: { similarityThreshold: 70, nearestStateLimit: 2 },
    });

    expect(result.stateSimilarity.nearestStates).toHaveLength(2);
    expect(result.stateSimilarity.nearestStates[0]?.id).toBe("h1");
    expect(result.stateSimilarity.score).toBeGreaterThan(50);
    expect(
      result.stateSimilarity.reliabilityByStateCluster.high.count,
    ).toBeGreaterThan(0);
  });

  it("handles anonymous, medium-similarity, empty, and incomplete state comparisons", () => {
    const medium = reflect({
      currentState: { load: 0 },
      history: [
        { state: { load: 25 }, outcome: { label: "mystery" } },
        { state: { load: 100 } },
      ],
      options: { similarityThreshold: 80, nearestStateLimit: 2 },
    });
    const empty = reflect({
      currentState: {},
      history: [{ state: {}, outcome: { label: "success" } }],
    });
    const missingDimension = reflect({
      currentState: { load: null },
      history: [{ state: { load: 1 }, outcome: { label: "success" } }],
    });

    expect(medium.stateSimilarity.nearestStates[0]?.id).toBe("state-1");
    expect(medium.stateSimilarity.reliabilityByStateCluster.medium.count).toBe(
      1,
    );
    expect(
      medium.stateSimilarity.reliabilityByStateCluster.high.reliability,
    ).toBe(0);
    expect(empty.stateSimilarity.nearestStates[0]?.similarity).toBe(0);
    expect(missingDimension.stateSimilarity.nearestStates[0]?.similarity).toBe(
      0,
    );
  });

  it("reports no similar states when state history is absent", () => {
    const result = reflect({
      currentState: { phase: "draft" },
      history: [{ id: "h1", outcome: { label: "unknown" } }],
    });

    expect(result.stateSimilarity.nearestStates).toEqual([]);
    expect(result.stateSimilarity.score).toBe(0);
    expect(result.knownUnknowns).toContain(
      "No similar historical states are available.",
    );
  });

  it("measures contradictions and dispersion across generic perception layers", () => {
    const result = reflect({
      perceptionLayers: {
        information: { score: 95 },
        risk: 10,
        confidence: { value: 88 },
        ignored: null,
      },
    });

    expect(result.metaCoherence.layerCount).toBe(3);
    expect(result.metaCoherence.contradictions.length).toBeGreaterThan(0);
    expect(result.metaCoherence.score).toBeLessThan(80);
    expect(result.reasons).toContain(
      "Perception layers contain material contradictions.",
    );
  });

  it("detects stale, unknown, missing, and low-quality inputs", () => {
    const result = reflect({
      now,
      requiredInputs: [
        "fresh",
        "stale",
        "defaultStale",
        "missing",
        "unknown",
        "weak",
      ],
      inputs: [
        {
          key: "fresh",
          value: "ok",
          quality: 0.95,
          timestamp: now - 100,
          staleAfterMs: 1_000,
        },
        {
          key: "stale",
          value: "old",
          quality: 90,
          timestamp: now - 5_000,
          staleAfterMs: 1_000,
        },
        {
          key: "defaultStale",
          value: "old",
          quality: 90,
          timestamp: now - 5_000,
        },
        { key: "unknown", value: "?", known: false },
        { key: "weak", value: "present", quality: 30 },
      ],
      options: { lowQualityThreshold: 50, staleAfterMs: 1_000 },
    });

    expect(result.knowledgeCompleteness.missingInputs).toEqual(["missing"]);
    expect(result.knowledgeCompleteness.staleInputs).toEqual([
      "stale",
      "defaultStale",
    ]);
    expect(result.knowledgeCompleteness.unknownInputs).toEqual(["unknown"]);
    expect(result.knowledgeCompleteness.lowQualityInputs).toEqual(["weak"]);
    expect(result.knowledgeCompleteness.score).toBeLessThan(70);
  });

  it("evaluates counterfactual candidates generically", () => {
    const result = reflect({
      candidateDecisions: [
        {
          id: "A",
          confidence: 80,
          expectedUtility: 40,
          expectedDownside: 15,
          uncertainty: 20,
        },
        {
          id: "B",
          confidence: 60,
          expectedUtility: 10,
          expectedDownside: 5,
          uncertainty: 35,
        },
        {
          id: "C",
          confidence: 0.4,
          expectedAdvantage: -10,
          expectedDownside: 30,
        },
      ],
    });

    expect(result.counterfactuals.candidates).toHaveLength(3);
    expect(result.counterfactuals.bestCandidateId).toBe("A");
    expect(result.counterfactuals.spread).toBeGreaterThan(0);
    expect(result.counterfactuals.confidence).toBeGreaterThan(50);
  });

  it("evaluates a labeled single counterfactual candidate", () => {
    const result = reflect({
      candidateDecisions: [
        {
          id: "single",
          label: "Single candidate",
          confidence: 0.7,
          expectedUtility: 10,
        },
      ],
    });

    expect(result.counterfactuals.candidates[0]?.label).toBe(
      "Single candidate",
    );
    expect(result.counterfactuals.bestCandidateId).toBe("single");
    expect(result.counterfactuals.spread).toBe(0);
  });

  it("accepts array layers and explicit correctness flags", () => {
    const result = reflect({
      perceptionLayers: [
        { key: "quality", score: 80 },
        { key: "stability", confidence: 50, value: 70 },
      ],
      predictions: [{ id: "p", confidence: 50, correct: true }],
    });

    expect(result.metaCoherence.layerCount).toBe(2);
    expect(result.calibration.observedAccuracy).toBe(100);
    expect(result.audit.formulas.length).toBeGreaterThan(0);
  });

  it("creates deterministic identifiers for anonymous object predictions", () => {
    const result = reflect({
      predictions: [
        {
          confidence: 40,
          correct: true,
          metadata: { source: "anonymous", sample: 1 },
        },
      ],
    });

    expect(result.calibration.sampleSize).toBe(1);
    expect(result.calibration.status).toBe("underconfident");
    expect(result.historicalReliability.evaluatedPredictionCount).toBe(1);
  });

  it("emits high-awareness and coherent fallback reasons", () => {
    const high = reflect({
      history: [
        {
          timestamp: 1,
          state: { phase: "stable", score: 90 },
          prediction: { id: "p1", confidence: 95 },
          outcome: { label: "success" },
        },
        {
          timestamp: 2,
          state: { phase: "stable", score: 92 },
          prediction: { id: "p2", confidence: 90 },
          outcome: { label: "success" },
        },
      ],
      currentState: { phase: "stable", score: 91 },
      perceptionLayers: { information: 90, quality: 88, stability: 92 },
      inputs: [{ key: "signal", value: "known", quality: 95 }],
      requiredInputs: ["signal"],
      candidateDecisions: [{ id: "go", confidence: 90, expectedUtility: 25 }],
    });
    const coherent = reflect({
      history: [
        {
          state: {},
          prediction: { id: "partial", confidence: 50 },
          outcome: { label: "partial" },
        },
      ],
      currentState: {},
      perceptionLayers: { information: 50, quality: 50 },
      inputs: [{ key: "input", value: "known", quality: 100 }],
      requiredInputs: ["input"],
      candidateDecisions: [{ id: "hold", confidence: 50, expectedUtility: 0 }],
    });

    expect(high.reflectionScore).toBeGreaterThanOrEqual(75);
    expect(high.reasons).toContain(
      "Reflection quality supports higher self-awareness.",
    );
    expect(coherent.reflectionScore).toBeLessThan(75);
    expect(coherent.reasons).toContain(
      "Reflection signals are coherent and sufficiently evidenced.",
    );
  });
});
