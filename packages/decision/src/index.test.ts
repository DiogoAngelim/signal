import { describe, expect, it } from "vitest";
import {
  applyOutcomeFeedback,
  assessCoherence,
  assessWisdom,
  buildHumanDecisionGuide,
  createAccountabilityReport,
  createDecisionRecord,
  createInMemoryDecisionRecordStore,
  createRealitySnapshot,
  evaluateDecision,
  evaluateOutcome,
  generatePredictionScenarios,
  listDecisionOperations,
  registerDecisionOperations,
  replayDecision,
  simulateDecisionPaths,
} from "./index";

describe("@signal/decision", () => {
  it("detects coherence contradictions and blocks unsafe agency", () => {
    const coherence = assessCoherence({
      discovery: 88,
      trust: 30,
      agency: 82,
      purpose: 35,
      recovery: 32,
      judgment: 84,
      calibration: 42,
    });

    expect(coherence.actionAllowed).toBe(false);
    expect(coherence.status).toBe("blocked");
    expect(coherence.contradictions.map((item) => item.conflictId)).toContain("high-agency-weak-purpose");
    expect(coherence.actionScale).toBe(0);
    expect(coherence.confidenceAdjustment).toBeLessThan(0);
  });

  it("amplifies trust when reflection and judgment agree", () => {
    const coherence = assessCoherence({
      discovery: 76,
      trust: 78,
      agency: 68,
      purpose: 74,
      recovery: 76,
      reflection: 82,
      judgment: 84,
      calibration: 80,
    });

    expect(coherence.actionAllowed).toBe(true);
    expect(coherence.status).toBe("aligned");
    expect(coherence.trustAdjustment).toBeGreaterThan(0);
  });

  it("classifies outcomes and feeds trust, calibration, memory, learning, recovery, and judgment", () => {
    const outcome = evaluateOutcome({
      decisionId: "decision:1",
      expectedConfidence: 90,
      actualSuccessScore: 28,
      purposeAlignment: 34,
      needAlignment: 42,
      riskTaken: 82,
      expectedRisk: 40,
    });
    const feedback = applyOutcomeFeedback(outcome);

    expect(outcome.category).toBe("failure");
    expect(outcome.confidenceAccuracy).toBeLessThan(50);
    expect(feedback.modules.trust).toBeLessThan(0);
    expect(feedback.modules.calibration).toBeLessThan(0);
    expect(feedback.modules.memory).toBeGreaterThan(0);
    expect(feedback.modules.learning).toBeGreaterThan(0);
    expect(feedback.modules.recovery).toBeLessThan(0);
    expect(feedback.modules.judgment).toBeLessThan(0);
  });

  it("generates scenarios, compares action paths, and applies wisdom", () => {
    const scenarios = generatePredictionScenarios({
      currentScore: 68,
      expectedReward: 72,
      expectedRisk: 48,
      labels: [
        "market improves",
        "market weakens",
        "market remains flat",
        "volatility expands",
      ],
    });
    const simulation = simulateDecisionPaths({ decisionId: "decision:2", scenarios });
    const wisdom = assessWisdom({
      expectedReward: 88,
      downsideRisk: 92,
      irreversibleRisk: 84,
      confidence: 52,
    });

    expect(scenarios).toHaveLength(4);
    expect(simulation.pathComparisons.map((path) => path.actionVariant)).toEqual([
      "act normally",
      "act smaller",
      "wait",
      "block action",
    ]);
    expect(["act", "reduce", "wait", "block", "escalate"]).toContain(simulation.recommendedAction);
    expect(wisdom.decision).toBe("avoid");
  });

  it("creates records, accountability reports, replay comparisons, and human guide steps", () => {
    const coherence = assessCoherence({
      discovery: 78,
      trust: 74,
      agency: 60,
      purpose: 76,
      need: 70,
      recovery: 72,
      judgment: 75,
      calibration: 73,
    });
    const record = createDecisionRecord({
      decisionId: "decision:3",
      realitySnapshot: createRealitySnapshot({
        snapshotId: "reality:decision:3",
        source: "test",
        createdAt: "2026-05-31T00:00:00.000Z",
        dataQuality: 0.8,
        freshnessScore: 0.9,
        payload: { kind: "candidate" },
      }),
      observation: { kind: "candidate" },
      coherence,
    });
    const weaker = assessCoherence({
      discovery: 90,
      trust: 20,
      agency: 85,
      purpose: 30,
      recovery: 30,
    });
    const report = createAccountabilityReport({ record, currentCoherence: weaker });
    const replay = replayDecision({ record, currentCoherence: weaker });
    const guide = buildHumanDecisionGuide(record);
    const store = createInMemoryDecisionRecordStore();

    store.save({ ...record, accountability: report });

    expect(report.replayResult).toBe("changed-decision");
    expect(record.realitySnapshotId).toBe("reality:decision:3");
    expect(record.realitySnapshot?.dataQuality).toBe(80);
    expect(replay.differences.length).toBeGreaterThan(0);
    expect(guide.map((step) => step.title)).toEqual([
      "What is happening?",
      "What matters?",
      "What could happen next?",
      "What did Signal test?",
      "What should I do now?",
      "Why?",
      "What will Signal learn from this?",
    ]);
    expect(store.get("decision:3")?.decisionId).toBe("decision:3");
    expect(store.audit("decision:3")?.decisionId).toBe("decision:3");
    expect(store.replay("decision:3", weaker)?.replayResult).toBe("changed-decision");
  });

  it("runs the full decision pipeline and exposes versioned operations", () => {
    const result = evaluateDecision({
      decisionId: "decision:4",
      observation: { source: "test" },
      modules: {
        discovery: 82,
        judgment: 76,
        purpose: 72,
        need: 70,
        trust: 68,
        recovery: 78,
        calibration: 74,
        agency: 65,
      },
      prediction: {
        labels: ["signal succeeds", "signal fails", "liquidity drops"],
      },
      outcome: {
        decisionId: "decision:4",
        actualSuccessScore: 76,
        expectedConfidence: 72,
      },
    });
    const registry = {
      queries: [] as string[],
      mutations: [] as string[],
      events: [] as string[],
      registerQuery(definition: { name: string }) {
        this.queries.push(definition.name);
      },
      registerMutation(definition: { name: string }) {
        this.mutations.push(definition.name);
      },
      registerEvent(definition: { name: string }) {
        this.events.push(definition.name);
      },
    };
    registerDecisionOperations(registry);

    expect(result.record.accountability?.decisionId).toBe("decision:4");
    expect(result.record.realitySnapshotId).toBe("reality:decision:4");
    expect(result.record.realitySnapshot?.payload).toMatchObject({ source: "test" });
    expect(result.predictionScenarios.length).toBe(3);
    expect(result.outcomeAccuracy).toBeGreaterThan(80);
    expect(result.decisionReplayAvailable).toBe(true);
    expect(listDecisionOperations().map((definition) => definition.name)).toContain("decision.evaluate.v1");
    expect(registry.queries).toContain("decision.scenarios.predict.v1");
    expect(registry.mutations).toContain("decision.outcome.record.v1");
    expect(registry.events).toContain("decision.blocked.v1");
  });
});
