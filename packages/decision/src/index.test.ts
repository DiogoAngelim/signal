import { describe, expect, it } from "vitest";
import {
  applyOutcomeFeedback,
  assessDecisionEvidence,
  assessCoherence,
  assessWisdom,
  buildHumanDecisionGuide,
  createAccountabilityReport,
  createDecisionRecord,
  createInMemoryDecisionRecordStore,
  createRealitySnapshot,
  deriveLearningPatterns,
  evaluateDecision,
  evaluateOutcome,
  generatePredictionScenarios,
  reviewDecisionOutcome,
  listDecisionOperations,
  registerDecisionOperations,
  replayDecision,
  simulateDecisionPaths,
} from "./index";
import {
  assessDecisionEvidence as assessDecisionEvidenceFromCore,
  evaluateDecision as evaluateDecisionFromCore,
  reviewDecisionOutcome as reviewDecisionOutcomeFromCore,
} from "./core";

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

  it("assesses evidence visibility, caps confidence, and identifies next best evidence", () => {
    const assessment = assessDecisionEvidence({
      decisionId: "decision:evidence",
      evidence: [
        {
          evidenceId: "evidence:primary",
          label: "Primary observation",
          direction: "supporting",
          quality: 70,
          reliability: 72,
          freshness: 80,
          independence: 55,
          replication: 50,
          calibration: 64,
          traceability: 90,
          strength: 74,
        },
        {
          evidenceId: "evidence:challenge",
          label: "Conflicting observation",
          direction: "contradicting",
          quality: 58,
          reliability: 62,
          freshness: 70,
          independence: 75,
          replication: 45,
          calibration: 60,
          traceability: 86,
          strength: 68,
        },
      ],
      known: [{ label: "Current state is observable", evidenceIds: ["evidence:primary"] }],
      unknowns: ["Whether the condition persists"],
      assumptions: [{ label: "The observation remains relevant", evidenceIds: ["evidence:primary"], reviewAfter: "outcome" }],
      contradicted: [{ label: "All evidence points the same way", evidenceIds: ["evidence:challenge"] }],
      desiredConfidence: 92,
      importance: 84,
      threats: [{ label: "Loss of optionality", severity: 75, likelihood: 60 }],
      optionality: 68,
      resilience: 62,
      reversibility: { canUndo: true, cost: 30, speed: 80 },
    });

    expect(assessment.evidenceQuality.quality).toBeGreaterThan(40);
    expect(assessment.confidence.capped).toBeLessThanOrEqual(assessment.evidenceQuality.quality);
    expect(assessment.governance.contradictionVisibility).toBe(100);
    expect(assessment.journal.assumptionsUsed).toEqual(["The observation remains relevant"]);
    expect(assessment.journal.contradictionsPresent).toContain("All evidence points the same way");
    expect(assessment.stewardship.reversibility.level).toBe("high");
    expect(assessment.nextBestEvidence.question).toMatch(/contradictory evidence/i);
  });

  it("exposes an evidence-centered core entrypoint for new consumers", () => {
    expect(assessDecisionEvidenceFromCore).toBe(assessDecisionEvidence);
    expect(evaluateDecisionFromCore).toBe(evaluateDecision);
    expect(reviewDecisionOutcomeFromCore).toBe(reviewDecisionOutcome);
  });

  it("threads assessment through records and constrains pipeline confidence", () => {
    const result = evaluateDecision({
      decisionId: "decision:assessment-pipeline",
      observation: { source: "test" },
      modules: {
        discovery: 84,
        judgment: 82,
        purpose: 80,
        need: 78,
        trust: 76,
        recovery: 78,
        calibration: 79,
        agency: 70,
      },
      prediction: {
        confidence: 95,
        labels: ["conditions improve", "conditions weaken"],
      },
      assessment: {
        evidence: [
          {
            label: "Thin but traceable signal",
            direction: "supporting",
            quality: 48,
            reliability: 50,
            freshness: 52,
            independence: 46,
            replication: 42,
            calibration: 44,
            traceability: 70,
          },
        ],
        known: ["A signal exists"],
        unknowns: ["Whether it repeats"],
        assumptions: ["The signal is not noise"],
        desiredConfidence: 95,
        reversibility: "high",
      },
    });

    expect(result.record.assessment?.confidence.capped).toBeLessThan(95);
    expect(Math.max(...result.predictionScenarios.map((scenario) => scenario.confidence))).toBeLessThanOrEqual(
      result.record.assessment?.confidence.cap ?? 100,
    );
    expect(result.record.accountability?.modulesInvolved).toContain("assessment");
    expect(result.actionScale).toBeLessThanOrEqual(0.45);
  });

  it("reviews outcomes, generates simple learning, and derives repeated learning patterns", () => {
    const review = reviewDecisionOutcome({
      reviewId: "review:1",
      decisionId: "decision:review",
      whatHappened: "The action worked initially, then failed when conditions changed.",
      why: "A freshness assumption failed.",
      assumptions: [
        { assumptionId: "assumption:fresh", label: "Evidence stays fresh", status: "failed" },
        { assumptionId: "assumption:reversible", label: "Action remains reversible", status: "survived" },
      ],
      evidence: [
        { evidenceId: "evidence:1", label: "Opening signal", role: "mattered" },
        { evidenceId: "evidence:2", label: "Old comparison", role: "misleading" },
      ],
      whatShouldChange: "Require freshness checks before repeating.",
    });
    const outcome = evaluateOutcome({
      decisionId: "decision:review",
      actualSuccessScore: 42,
      expectedConfidence: 82,
      review: {
        decisionId: "decision:review",
        whatHappened: "The outcome was weaker than the decision expected.",
        why: "Contradictory evidence arrived late.",
        assumptions: [{ assumptionId: "assumption:fresh", label: "Evidence stays fresh", status: "failed" }],
        whatShouldChange: "Require freshness checks before repeating.",
      },
    });
    const patterns = deriveLearningPatterns([
      review.learning,
      outcome.review?.learning ?? review.learning,
      {
        ...review.learning,
        learningId: "learning:confirmed",
        outcome: "confirmed",
      },
    ]);

    expect(review.assumptionFailures.map((item) => item.label)).toEqual(["Evidence stays fresh"]);
    expect(review.evidenceThatMisled.map((item) => item.label)).toEqual(["Old comparison"]);
    expect(review.learning.whatShouldChange).toBe("Require freshness checks before repeating.");
    expect(outcome.review?.learning.outcome).toBe("contradicted");
    expect(patterns[0]?.frequency).toBe(3);
    expect(patterns[0]?.confirmations).toBe(1);
    expect(patterns[0]?.contradictions).toBe(2);
    expect(patterns[0]?.explanation).toMatch(/process quality/i);
  });
});
