import { describe, expect, it } from "vitest";
import {
  buildCapitalGuidance,
  buildDecisionPipeline,
  buildExecutiveDashboardIA,
  buildGovernanceEvolution,
  extractUnlockInvalidationConditions,
  resolveCanonicalExplanations,
} from "./executive-dashboard";

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
    expect(ia.capitalGuidance.hero.heading).toBe("What Seems Reasonable Right Now");
    expect(ia.evidenceSummary.find((item) => item.id === "similar-samples")?.value).toBe("1313");
    expect(ia.whyNotFullSize.factors[0]?.code).toBe("survival_scar");
    expect(ia.traceability.preservedModules.resolve).toBe(state.resolve);
  });

  it("builds clarity-first capital guidance before diagnostics", () => {
    const guidance = buildCapitalGuidance({
      ...state,
      resolve: {
        ...state.resolve,
        decision: "commit",
      },
      sizing: {
        ...state.sizing,
        allocations: [
          {
            symbol: "AAPL",
            allocationPct: 1.2,
            reason: "Strongest qualifying opportunity.",
          },
          {
            symbol: "MSFT",
            allocationPct: 0.8,
            reason: "Second strongest qualifying opportunity.",
          },
        ],
      },
    });

    expect(guidance.hero.narrative).toContain(
      "Participating gradually appears reasonable",
    );
    expect(guidance.hero.narrative).not.toMatch(
      /\d|%|confidence|score|diagnostic|terminal/i,
    );
    expect(guidance.participationPlan.items.map((item) => item.label)).toEqual([
      "Cash",
      "AAPL",
      "MSFT",
    ]);
    expect(guidance.participationPlan.cashPct).toBe(98);
    expect(guidance.participationPlan.deployedPct).toBe(2);
    expect(guidance.whyParticipationRemainsHere.reasons).toContain(
      "Similar situations have generally behaved well.",
    );
    expect(
      guidance.whatCouldChangeThisPlan.participationMayIncreaseIf,
    ).toContain("Reliability continues improving.");
    expect(
      guidance.whatCouldChangeThisPlan.participationMayDecreaseIf,
    ).toContain("Reliability deteriorates.");
    expect(
      guidance.evidence.items.find((item) => item.id === "similar-samples")
        ?.value,
    ).toBe("1313");
  });

  it("deduplicates repeated explanations and preserves pipeline order", () => {
    const reasons = resolveCanonicalExplanations(state);
    const pipeline = buildDecisionPipeline(state);

    expect(reasons.map((reason) => reason.code).filter((code) => code === "survival_scar")).toHaveLength(1);
    expect(reasons.map((reason) => reason.code)).toContain("trust_below_threshold");
    expect(pipeline.map((step) => step.stage)).toEqual([
      "Discovery",
      "Recognition",
      "Belief",
      "Judgement",
      "Agency",
      "Resolve",
      "Wisdom",
      "Survival",
      "Discovery Intelligence",
    ]);
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

  it("builds governance evolution with arbitration, exposure states, and accountability", () => {
    const evolution = buildGovernanceEvolution({
      ...state,
      resolve: { ...state.resolve, decision: "escalate" },
      survivalMemory: {
        ...state.survivalMemory,
        survivalConfidence: 73,
        recoveryBurden: 18,
      },
      wisdom: {
        decisionQuality: 74,
        wisdomScore: 86,
        learningConfidence: 74,
        counterfactuals: {
          decisionQuality: 96,
          avoidedLoss: 100,
          missedUpside: 4,
          restrictionValue: 98,
          counterfactualConfidence: 90,
          explanation: "Restrictions appear valuable.",
        },
        opportunityEconomics: {
          actionValue: -4,
          waitValue: -3,
          rejectValue: 0,
          urgencyCost: 0,
          opportunityCost: 0,
          bestOption: "reject",
        },
        discoveryMaturity: {
          maturityScore: 0,
          recurrenceRate: 0,
          noveltyPersistence: 0,
          conversionRate: 0,
          trustedDiscoveries: [],
          lifecycle: [],
        },
        agencyEffectiveness: {
          agencyAccuracy: 100,
          interventionValue: 50,
          approvalQuality: 100,
          rejectionQuality: 50,
          governanceEffectiveness: 80,
        },
        portfolioIntelligence: {
          concentrationRisk: 0,
          diversificationQuality: 100,
          capitalEfficiency: 50,
          opportunityCoverage: 100,
          portfolioConvexity: 50,
          allocationQuality: 80,
        },
        explanation: "Wisdom prefers reject.",
      } as any,
    });

    expect(evolution.command.action).toBe("review");
    expect(evolution.command.allowedExposureState).toBe("micro");
    expect(evolution.arbitration.conflicts.map((conflict) => conflict.id)).toContain("executive-wisdom-conflict");
    expect(evolution.arbitration.conflicts.map((conflict) => conflict.id)).toContain("survival-threshold-status-conflict");
    expect(evolution.exposureStates.find((item) => item.status === "active")?.state).toBe("micro");
    expect(evolution.confidenceLedger.find((item) => item.kind === "survival")?.status).toBe("scarred");
    expect(evolution.restrictionBets[0]?.evidenceRequired).toContain("max adverse excursion");
    expect(evolution.accountabilityLoop.map((step) => step.id)).toContain("restriction-bet");
  });
});
