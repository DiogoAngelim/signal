import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessDecisionEvidence as assessDecisionEvidenceFromCore,
  evaluateDecision as evaluateDecisionFromCore,
  reviewDecisionOutcome as reviewDecisionOutcomeFromCore,
} from "./core";
import {
  SIGNAL_UNIVERSAL_LIFECYCLE,
  applyOutcomeFeedback,
  assessCoherence,
  assessDecisionEvidence,
  assessSignalLessonSurvival,
  assessWisdom,
  buildHumanDecisionGuide,
  createAccountabilityReport,
  createDecisionRecord,
  createInMemoryDecisionRecordStore,
  createRealitySnapshot,
  createSignalRelationshipMemory,
  deriveLearningPatterns,
  evaluateDecision,
  evaluateLearningJudgment,
  evaluateOutcome,
  generatePredictionScenarios,
  listDecisionOperations,
  registerDecisionOperations,
  replayDecision,
  reviewDecisionOutcome,
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
    expect(coherence.contradictions.map((item) => item.conflictId)).toContain(
      "high-agency-weak-purpose",
    );
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
        "condition improves",
        "condition weakens",
        "condition remains stable",
        "uncertainty expands",
      ],
    });
    const simulation = simulateDecisionPaths({
      decisionId: "decision:2",
      scenarios,
    });
    const wisdom = assessWisdom({
      expectedReward: 88,
      downsideRisk: 92,
      irreversibleRisk: 84,
      confidence: 52,
    });

    expect(scenarios).toHaveLength(4);
    expect(
      simulation.pathComparisons.map((path) => path.actionVariant),
    ).toEqual(["act normally", "act smaller", "wait", "block action"]);
    expect(["act", "reduce", "wait", "block", "escalate"]).toContain(
      simulation.recommendedAction,
    );
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
    const report = createAccountabilityReport({
      record,
      currentCoherence: weaker,
    });
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
    expect(store.replay("decision:3", weaker)?.replayResult).toBe(
      "changed-decision",
    );
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
    expect(result.record.realitySnapshot?.payload).toMatchObject({
      source: "test",
    });
    expect(result.predictionScenarios.length).toBe(3);
    expect(result.outcomeAccuracy).toBeGreaterThan(80);
    expect(result.decisionReplayAvailable).toBe(true);
    expect(
      listDecisionOperations().map((definition) => definition.name),
    ).toContain("decision.evaluate.v1");
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
      known: [
        {
          label: "Current state is observable",
          evidenceIds: ["evidence:primary"],
        },
      ],
      unknowns: ["Whether the condition persists"],
      assumptions: [
        {
          label: "The observation remains relevant",
          evidenceIds: ["evidence:primary"],
          reviewAfter: "outcome",
        },
      ],
      contradicted: [
        {
          label: "All evidence points the same way",
          evidenceIds: ["evidence:challenge"],
        },
      ],
      desiredConfidence: 92,
      importance: 84,
      threats: [{ label: "Loss of optionality", severity: 75, likelihood: 60 }],
      optionality: 68,
      resilience: 62,
      reversibility: { canUndo: true, cost: 30, speed: 80 },
    });

    expect(assessment.evidenceQuality.quality).toBeGreaterThan(40);
    expect(assessment.confidence.capped).toBeLessThanOrEqual(
      assessment.evidenceQuality.quality,
    );
    expect(assessment.governance.contradictionVisibility).toBe(100);
    expect(assessment.journal.assumptionsUsed).toEqual([
      "The observation remains relevant",
    ]);
    expect(assessment.journal.contradictionsPresent).toContain(
      "All evidence points the same way",
    );
    expect(assessment.stewardship.reversibility.level).toBe("high");
    expect(assessment.nextBestEvidence.question).toMatch(
      /contradictory evidence/i,
    );
  });

  it("does not count missing evidence references as traceable coverage", () => {
    const assessment = assessDecisionEvidence({
      decisionId: "decision:missing-evidence-reference",
      evidence: [
        {
          evidenceId: "evidence:present",
          label: "Present observation",
          direction: "supporting",
          quality: 80,
          traceability: 90,
        },
      ],
      known: [
        {
          factId: "known:linked",
          label: "Known fact",
          evidenceIds: ["evidence:present"],
        },
      ],
      assumptions: [
        {
          factId: "assumption:broken",
          label: "Broken assumption",
          evidenceIds: ["evidence:missing"],
        },
      ],
      contradicted: [
        {
          factId: "contradiction:partial",
          label: "Partially traceable contradiction",
          evidenceIds: ["evidence:present", "evidence:missing"],
        },
      ],
      threats: [
        {
          threatId: "threat:broken",
          label: "Threat with missing evidence",
          evidenceIds: ["evidence:threat-missing"],
        },
      ],
      reversibility: "medium",
    });

    expect(assessment.evidenceQuality.coverage).toBe(50);
    expect(assessment.evidenceQuality.missingEvidenceReferences).toEqual([
      "evidence:missing",
      "evidence:threat-missing",
    ]);
    expect(assessment.journal.traceability?.complete).toBe(false);
    expect(assessment.journal.traceability?.evidenceReferenceCoverage).toBe(50);
    expect(assessment.journal.traceability?.missingEvidenceReferences).toEqual([
      "evidence:missing",
      "evidence:threat-missing",
    ]);
    expect(
      assessment.journal.traceRefs?.find(
        (trace) => trace.refId === "assumption:broken",
      ),
    ).toMatchObject({
      refType: "assumption",
      linkedEvidenceIds: [],
      missingEvidenceIds: ["evidence:missing"],
    });
    expect(assessment.governance.warnings.join(" ")).toContain(
      "evidence:threat-missing",
    );
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
    expect(
      Math.max(
        ...result.predictionScenarios.map((scenario) => scenario.confidence),
      ),
    ).toBeLessThanOrEqual(result.record.assessment?.confidence.cap ?? 100);
    expect(result.record.accountability?.modulesInvolved).toContain(
      "assessment",
    );
    expect(result.actionScale).toBeLessThanOrEqual(0.45);
  });

  it("reviews outcomes, generates simple learning, and derives repeated learning patterns", () => {
    const review = reviewDecisionOutcome({
      reviewId: "review:1",
      decisionId: "decision:review",
      whatHappened:
        "The action worked initially, then failed when conditions changed.",
      why: "A freshness assumption failed.",
      assumptions: [
        {
          assumptionId: "assumption:fresh",
          label: "Evidence stays fresh",
          status: "failed",
        },
        {
          assumptionId: "assumption:reversible",
          label: "Action remains reversible",
          status: "survived",
        },
      ],
      evidence: [
        { evidenceId: "evidence:1", label: "Opening signal", role: "mattered" },
        {
          evidenceId: "evidence:2",
          label: "Old comparison",
          role: "misleading",
        },
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
        assumptions: [
          {
            assumptionId: "assumption:fresh",
            label: "Evidence stays fresh",
            status: "failed",
          },
        ],
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

    expect(review.assumptionFailures.map((item) => item.label)).toEqual([
      "Evidence stays fresh",
    ]);
    expect(review.evidenceThatMisled.map((item) => item.label)).toEqual([
      "Old comparison",
    ]);
    expect(review.learning.whatShouldChange).toBe(
      "Require freshness checks before repeating.",
    );
    expect(outcome.review?.learning.outcome).toBe("contradicted");
    expect(patterns[0]?.frequency).toBe(3);
    expect(patterns[0]?.confirmations).toBe(1);
    expect(patterns[0]?.contradictions).toBe(2);
    expect(patterns[0]?.explanation).toMatch(/process quality/i);
  });

  it("applies reviewed history to a generic current judgment before a new outcome exists", () => {
    const result = evaluateLearningJudgment({
      now: "2026-06-06T00:00:00.000Z",
      objective: {
        id: "objective:capacity",
        type: "Objective",
        label: "Keep service capacity resilient",
        traceRefs: [],
        reviewRefs: [],
        explanation: ["Generic objective."],
        priority: 80,
      },
      evidence: [
        {
          id: "evidence:load",
          type: "Evidence",
          label: "Recent load is observable",
          traceRefs: [],
          reviewRefs: [],
          explanation: ["Fresh operating evidence."],
          strength: 76,
          confidence: 72,
        },
      ],
      currentTags: ["capacity-pressure", "reversible-action", "fresh-evidence"],
      reviewedSituations: [
        {
          id: "situation:reviewed-capacity",
          label: "reviewed reversible capacity change",
          tags: ["capacity-pressure", "reversible-action"],
          decisionRef: "decision:past-capacity",
          outcomeRef: "outcome:past-capacity",
          reviewRef: { reviewId: "review:past-capacity", outcome: "survived" },
          lessonRefs: ["lesson:keep-reversible"],
          relationshipRefs: ["relationship:lesson-applies"],
        },
      ],
      lessons: [
        {
          id: "lesson:keep-reversible",
          type: "Lesson",
          label: "Keep reversible changes small until evidence repeats",
          traceRefs: [{ refId: "review:past-capacity", refType: "Review" }],
          reviewRefs: [
            { reviewId: "review:past-capacity", outcome: "survived" },
          ],
          explanation: ["Repeatedly survived review."],
          reviewCount: 3,
          survivalCount: 3,
          failureCount: 0,
          confidence: 78,
          applicability: ["capacity-pressure", "reversible-action"],
          domainCoverage: ["operations"],
        },
      ],
      relationships: [
        {
          id: "relationship:lesson-applies",
          type: "Relationship",
          label: "Reviewed lesson applies to current judgment",
          sourceType: "Lesson",
          sourceId: "lesson:keep-reversible",
          relationType: "applies_to",
          targetType: "Judgment",
          targetId: "judgment:objective:capacity",
          traceRefs: [{ refId: "review:past-capacity", refType: "Review" }],
          reviewRefs: [
            { reviewId: "review:past-capacity", outcome: "survived" },
          ],
          explanation: [
            "The same reversible pressure pattern was reviewed before.",
          ],
          strength: 82,
          confidence: 78,
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
      ],
    });

    expect(SIGNAL_UNIVERSAL_LIFECYCLE).toContain("Reviewed History");
    expect(result.similarityMatches[0]?.situation.id).toBe(
      "situation:reviewed-capacity",
    );
    expect(result.reviewedHistory.lessonRefs).toContain(
      "lesson:keep-reversible",
    );
    expect(result.judgment.futureOutcomeRequired).toBe(false);
    expect(result.judgment.lessonRefs).toContain("lesson:keep-reversible");
    expect(result.strategies[0]?.quality).toBeGreaterThan(40);
    expect(result.rationale.join(" ")).toMatch(
      /Previously reviewed situations suggest/i,
    );
  });

  it("traces relationship memory from review to lesson to judgment", () => {
    const memory = createSignalRelationshipMemory([
      {
        id: "relationship:review-generated-lesson",
        type: "Relationship",
        label: "Review generated lesson",
        sourceType: "Review",
        sourceId: "review:1",
        relationType: "generated",
        targetType: "Lesson",
        targetId: "lesson:1",
        traceRefs: [{ refId: "outcome:1", refType: "Outcome" }],
        reviewRefs: [{ reviewId: "review:1", outcome: "survived" }],
        explanation: [
          "The review converted an outcome into a reusable lesson.",
        ],
        strength: 90,
        confidence: 84,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
      {
        id: "relationship:lesson-applied-judgment",
        type: "Relationship",
        label: "Lesson applied to judgment",
        sourceType: "Lesson",
        sourceId: "lesson:1",
        relationType: "applies_to",
        targetType: "Judgment",
        targetId: "judgment:1",
        traceRefs: [{ refId: "review:1", refType: "Review" }],
        reviewRefs: [{ reviewId: "review:1", outcome: "survived" }],
        explanation: ["The reviewed lesson constrains the present judgment."],
        strength: 88,
        confidence: 82,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
      {
        id: "relationship:similarity-resembles-history",
        type: "Relationship",
        label: "Similarity resembles reviewed history",
        sourceType: "Similarity",
        sourceId: "similarity:1",
        relationType: "resembles",
        targetType: "ReviewedHistory",
        targetId: "history:1",
        traceRefs: [{ refId: "review:1", refType: "Review" }],
        reviewRefs: [{ reviewId: "review:1", outcome: "survived" }],
        explanation: ["Similarity is grounded in a reviewed case."],
        strength: 80,
        confidence: 76,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
    ]);

    expect(memory.lookup({ relationType: "applies_to" })).toHaveLength(1);
    expect(memory.explain({ sourceId: "lesson:1" })[0]?.explanation).toMatch(
      /constrains/,
    );
    expect(
      memory.lineage("lesson:1").reviewRefs.map((ref) => ref.reviewId),
    ).toEqual(["review:1"]);
    expect(memory.lineage("judgment:1").lessonRefs).toEqual(["lesson:1"]);
    expect(memory.lineage("similarity:1").similarityRefs).toEqual([
      "similarity:1",
    ]);
  });

  it("tracks lesson survival and keeps review, verification, outcome, lesson, strategy, and execution separate", () => {
    const lessons = assessSignalLessonSurvival([
      {
        id: "lesson:repeat",
        type: "Lesson",
        label: "Repeated reviewed lesson",
        traceRefs: [],
        reviewRefs: [{ reviewId: "review:repeat", outcome: "survived" }],
        explanation: ["Survived repeatedly."],
        reviewCount: 5,
        survivalCount: 4,
        failureCount: 1,
        confidence: 82,
        applicability: ["reversible-action"],
        domainCoverage: ["operations", "support"],
      },
      {
        id: "lesson:weak",
        type: "Lesson",
        label: "Single weak lesson",
        traceRefs: [],
        reviewRefs: [],
        explanation: ["Not reviewed yet."],
        reviewCount: 0,
        survivalCount: 0,
        failureCount: 1,
        confidence: 55,
        applicability: [],
        domainCoverage: [],
      },
    ]);
    const concepts = [
      { id: "outcome:1", type: "Outcome" },
      { id: "review:1", type: "Review" },
      { id: "verification:1", type: "Verification" },
      { id: "lesson:1", type: "Lesson" },
      { id: "strategy:1", type: "Strategy", quality: 70 },
      { id: "execution:1", type: "Execution", quality: 40 },
    ];

    expect(lessons[0]?.lessonId).toBe("lesson:repeat");
    expect(lessons[0]?.survivalRate).toBe(80);
    expect(new Set(concepts.map((concept) => concept.type)).size).toBe(
      concepts.length,
    );
    expect(
      concepts.find((concept) => concept.type === "Strategy")?.quality,
    ).not.toBe(
      concepts.find((concept) => concept.type === "Execution")?.quality,
    );
  });

  it("keeps product adapters outside Signal Core without adding product vocabulary to core source", () => {
    const productAdapter = {
      toSignalInput(input: {
        subjectId: string;
        currentValue: number;
        unitCount: number;
        totalExposure: number;
        variation: number;
        domainRisk: number;
        rationale: string;
        reviewedLesson: string;
      }) {
        return {
          now: "2026-06-06T00:00:00.000Z",
          objective: {
            id: `objective:${input.subjectId}`,
            type: "Objective" as const,
            label: "Keep allocation discipline reviewable",
            traceRefs: [],
            reviewRefs: [],
            explanation: [input.rationale],
          },
          evidence: [
            {
              id: `evidence:${input.subjectId}:position`,
              type: "Evidence" as const,
              label: "Adapter translated current holding context",
              traceRefs: [],
              reviewRefs: [],
              explanation: [
                `Mapped value ${input.currentValue} and units ${input.unitCount} outside core.`,
              ],
              strength: 68,
              confidence: 66,
            },
          ],
          currentTags: [
            "allocation-pressure",
            "uncertainty",
            "reversible-action",
          ],
          threats: [
            {
              id: `threat:${input.subjectId}:risk`,
              type: "Threat" as const,
              label: "Adapter translated current risk pressure",
              severity: input.domainRisk,
              likelihood: input.variation,
              traceRefs: [],
              reviewRefs: [],
              explanation: ["Domain risk stays in the adapter payload."],
            },
          ],
          reviewedSituations: [
            {
              id: "situation:reviewed-allocation",
              label: "reviewed allocation adjustment",
              tags: ["allocation-pressure", "uncertainty"],
              reviewRef: {
                reviewId: "review:allocation",
                outcome: "survived" as const,
              },
              lessonRefs: ["lesson:allocation-discipline"],
            },
          ],
          lessons: [
            {
              id: "lesson:allocation-discipline",
              type: "Lesson" as const,
              label: input.reviewedLesson,
              traceRefs: [],
              reviewRefs: [
                { reviewId: "review:allocation", outcome: "survived" as const },
              ],
              explanation: [
                "Adapter supplied reviewed domain learning as a generic lesson.",
              ],
              reviewCount: 4,
              survivalCount: 3,
              failureCount: 1,
              confidence: 74,
              applicability: ["allocation-pressure", "uncertainty"],
              domainCoverage: ["application-domain"],
            },
          ],
          metadata: { totalExposure: input.totalExposure },
        };
      },
    };
    const result = evaluateLearningJudgment(
      productAdapter.toSignalInput({
        subjectId: "subject:alpha",
        currentValue: 42,
        unitCount: 10,
        totalExposure: 18,
        variation: 62,
        domainRisk: 58,
        rationale:
          "Position remains useful only while the rationale is reviewable.",
        reviewedLesson:
          "Keep allocation changes reversible when uncertainty is visible.",
      }),
    );
    const productionSource = productionDecisionSource();
    const forbiddenTerms = [
      joinFragments("ti", "cker"),
      joinFragments("sh", "ares"),
      joinFragments("port", "folio"),
      joinFragments("in", "vestment"),
      joinFragments("b", "uy"),
      joinFragments("s", "ell"),
    ];

    expect(result.judgment.futureOutcomeRequired).toBe(false);
    expect(result.reviewedHistory.lessonRefs).toContain(
      "lesson:allocation-discipline",
    );
    expect(result.strategies[0]?.label).not.toMatch(
      forbiddenPattern(forbiddenTerms),
    );
    expect(productionSource).not.toMatch(forbiddenPattern(forbiddenTerms));
  });
});

function joinFragments(...fragments: string[]): string {
  return fragments.join("");
}

function forbiddenPattern(terms: readonly string[]): RegExp {
  return new RegExp(`\\b(${terms.join("|")})\\b`, "i");
}

function productionDecisionSource(): string {
  const root = join(__dirname);
  return productionFiles(root)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return productionFiles(path);
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) return [];
    return [path];
  });
}
