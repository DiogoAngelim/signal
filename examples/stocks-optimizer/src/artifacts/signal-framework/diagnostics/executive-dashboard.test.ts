import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDecisionPipeline,
  buildExecutiveDashboardIA,
  extractUnlockInvalidationConditions,
  resolveCanonicalExplanations,
} from "./executive-dashboard";

function expect(received: any) {
  return {
    toBe(expected: any) {
      assert.equal(received, expected);
    },
    toContain(expected: any) {
      assert.ok(received.includes(expected));
    },
    toEqual(expected: any) {
      assert.deepEqual(received, expected);
    },
    toHaveLength(expected: number) {
      assert.equal(received.length, expected);
    },
  };
}

const state = {
  discovery: {
    confidence: 51,
    maturity: 44,
    status: "emerging",
    recommendedNextStep: "Raise Discovery confidence above 60/100.",
  },
  recognition: {
    recognitionScore: 80,
    recurrenceConfidence: 76,
    noveltyScore: 18,
    matchedSamples: 1313,
    matchedPositiveOutcomes: 1200,
    matchedNegativeOutcomes: 112,
    outcomeStability: 79,
    verdict: "recognized",
    reason: "Recognized recurring positive state.",
  },
  belief: {
    verdict: "justified",
    confidence: 73,
    trustworthiness: 68,
    reason: "Belief supports action.",
  },
  judgement: {
    status: "trusted",
    adjustedConfidence: 72,
    reliability: 74,
    overfitRisk: 24,
    outcomeStability: 78,
    similarSampleSize: 88,
    evidence: {
      positiveOutcomes: 60,
      negativeOutcomes: 18,
      neutralOutcomes: 10,
    },
  },
  agency: {
    recommendation: "requires_human_review",
    trustPct: 64,
    reasons: ["Agency unresolved until reduced-size outcomes clear."],
  },
  resolve: {
    decision: "wait",
    resolveScore: 66,
    missingEvidence: ["Agency trust", "Reduced-size survival review"],
    unlockConditions: ["Raise agency trust to at least 70/100."],
    invalidationConditions: ["Invalidate if Trust or Judgement falls below the commitment threshold."],
    explanation: "Resolve waits because Agency trust remains unresolved.",
  },
  survivalMemory: {
    status: "scarred",
    mainWarnings: ["Survival memory remains scarred."],
    unlockConditions: ["Raise survival confidence to at least 70/100 for normal sizing."],
    invalidationConditions: ["Invalidate if similar-state survival cost rises."],
  },
  recovery: {
    status: "recovering",
    blockers: ["Recovery incomplete until clean outcomes close."],
    unlockConditions: ["Close reduced-size outcomes for the stable positive state archetype."],
  },
  trustGovernor: {
    trustScore: 64,
    participationMode: "micro",
    maxExposure: 2,
    blockers: [{
      reason: "Trust score has not cleared the restoration threshold.",
      unlockCriteria: ["Raise trust score to at least 70/100."],
    }],
  },
  sizing: {
    sizingMode: "micro",
    suggestedMaximumExposurePct: 2,
    limitedReason: "Reduced size because survival scar and trust below threshold.",
  },
  calibration: {
    status: "unstable-outcomes",
    rawConfidence: 85,
    calibratedConfidence: 66,
    trustworthiness: 72,
    warnings: ["unstable outcomes"],
  },
  strategyHistory: {
    sharpeRatio: 1.21,
    profitFactor: 1.44,
    maxDrawdownPct: 12.5,
    dataReliability: 76,
    walkForwardStability: 58,
  },
  readiness: {
    readinessScore: 62,
  },
  opportunity: {
    densityPct: 38,
  },
  riskPct: 32,
};

describe("executive dashboard IA integration", () => {
  it("builds a traceable executive IA model from generic framework diagnostics", () => {
    const ia = buildExecutiveDashboardIA(state);

    expect(ia.executiveReasoning.finalDecision).toBe("Wait");
    expect(ia.executiveReasoning.recommendedParticipationMode).toBe("Micro");
    expect(ia.executiveReasoning.mainReasonForRestriction?.code).toBe("survival_scar");
    expect(ia.evidenceSummary.find((item) => item.id === "similar-samples")?.value).toBe("1313");
    expect(ia.whyNotFullSize.factors[0]?.code).toBe("survival_scar");
    expect(ia.traceability.preservedModules.resolve).toBe(state.resolve);
  });

  it("deduplicates repeated explanations and preserves pipeline order", () => {
    const reasons = resolveCanonicalExplanations(state);
    const pipeline = buildDecisionPipeline(state);

    expect(reasons.map((reason) => reason.code).filter((code) => code === "survival_scar")).toHaveLength(1);
    expect(reasons.map((reason) => reason.code)).toContain("trust_below_threshold");
    expect(pipeline.map((step) => step.stage)).toEqual(["Discovery", "Recognition", "Belief", "Judgement", "Agency", "Wisdom", "Resolve"]);
    expect(pipeline.find((step) => step.stage === "Agency")?.outcome).toBe("escalated");
  });

  it("extracts unlock and invalidation conditions and tolerates empty input", () => {
    const extracted = extractUnlockInvalidationConditions(state);
    const empty = buildExecutiveDashboardIA({});

    expect(extracted.unlockConditions).toContain("Raise trust score to at least 70/100.");
    expect(extracted.invalidationConditions).toContain("Invalidate if Trust or Judgement falls below the commitment threshold.");
    expect(empty.executiveReasoning.finalDecision).toBe("Pending");
    expect(empty.evidenceSummary.every((item) => item.value === "Pending")).toBe(true);
  });
});
