import { describe, expect, it } from "vitest";
import {
  buildDecisionPipeline,
  buildEvidenceSummary,
  buildExecutiveDashboardIA,
  buildGovernanceEvolution,
  buildTerminologyGroups,
  buildWhyNotFullSize,
  extractUnlockInvalidationConditions,
  resolveCanonicalExplanations,
} from "./dashboard-ia";

function richState() {
  const sourceState = { market: "US", selectedTicker: "AAPL" };
  const survivalMemory = {
    status: "scarred",
    recommendation: "act_with_reduced_size",
    scarCount: 3,
    nearRuinCount: 0,
    averageSurvivalCost: 58,
    recoveryBurden: 42,
    survivalConfidence: 61,
    currentStateSimilarity: 72,
    maxExposurePct: 2,
    mainWarnings: ["Survival memory remains scarred."],
    reasons: ["Survival scar restricts normal sizing."],
    missingEvidence: ["Reduced-size survival review"],
    unlockConditions: ["Raise survival confidence to at least 70/100 for normal sizing."],
    invalidationConditions: ["Invalidate if similar-state survival cost rises."],
  };

  return {
    sourceState,
    discovery: {
      confidence: 52,
      maturity: 48,
      status: "emerging",
      recommendedNextStep: "Raise Discovery confidence above 60/100.",
      invalidationConditions: ["Discovery invalidates if support fails."],
    },
    discoveryDensity: {
      density: 38,
      quality: 57,
      confidence: 54,
      explanation: "Opportunity density remains transitional.",
    },
    discoveryPipeline: {
      averageScore: 57,
      candidateCount: 8,
      improvingCount: 3,
    },
    recognition: {
      recognitionScore: 82,
      recurrenceConfidence: 77,
      noveltyScore: 18,
      archetype: "stable_positive_state",
      archetypeConfidence: 96,
      matchedSamples: 1313,
      matchedPositiveOutcomes: 1200,
      matchedNegativeOutcomes: 112,
      outcomeStability: 79,
      discoveryNoveltyJustified: false,
      judgementSimilarityJustified: true,
      verdict: "recognized",
      reason: "Recognized recurring positive state.",
      missingEvidence: [],
      invalidationConditions: ["Recognition invalidates if recurrence falls below 70/100."],
    },
    belief: {
      verdict: "justified",
      confidence: 73,
      trustworthiness: 68,
      evidenceStrength: 80,
      evidenceAgreement: 70,
      fragility: 35,
      blockers: [],
      warnings: [],
      reason: "Belief supports action.",
    },
    judgement: {
      status: "trusted",
      rawConfidence: 80,
      adjustedConfidence: 72,
      reliability: 74,
      overfitRisk: 24,
      outcomeStability: 78,
      similarSampleSize: 88,
      reasons: ["Similar outcomes support reduced participation."],
      warnings: [],
      evidence: {
        similarStates: 88,
        positiveOutcomes: 60,
        negativeOutcomes: 18,
        neutralOutcomes: 10,
      },
    },
    agency: {
      recommendation: "requires_human_review",
      trustPct: 64,
      dataReliabilityPct: 0.76,
      calibrationHealthPct: 0.72,
      reasons: ["Agency unresolved until reduced-size outcomes clear."],
    },
    resolve: {
      decision: "wait",
      commitmentLevel: "limited",
      resolveScore: 66,
      requiredScore: 75,
      humanReviewRequired: true,
      missingEvidence: ["Agency trust", "Reduced-size survival review"],
      unlockConditions: [
        "Raise agency trust to at least 70/100.",
        "Close reduced-size outcomes with acceptable drawdown.",
      ],
      invalidationConditions: ["Invalidate if Trust or Judgement falls below the commitment threshold."],
      explanation: "Resolve waits because Agency trust remains unresolved.",
      traces: [],
    },
    survivalMemory,
    recovery: {
      status: "recovering",
      mode: "reduced-size",
      recoveryScore: 58,
      trustedCapacity: 35,
      confidenceCapLift: 0,
      recommendedExposureCap: 2,
      canRestoreSizing: false,
      shouldEscalateHumanReview: false,
      blockers: ["Recovery incomplete until clean outcomes close."],
      reasons: [],
      unlockConditions: ["Close reduced-size outcomes for the stable positive state archetype."],
      invalidationConditions: ["Invalidate recovery if drawdown regresses."],
    },
    trustGovernor: {
      trustScore: 64,
      participationMode: "micro",
      maxExposure: 2,
      allowsNewExposure: true,
      confidenceCap: 55,
      blockers: [{
        id: "trust",
        label: "Trust below threshold",
        severity: "warn",
        reason: "Trust score has not cleared the restoration threshold.",
        unlockCriteria: ["Raise trust score to at least 70/100."],
      }],
      unlockCriteria: ["Raise trust score to at least 70/100."],
      reasons: ["Survival reduced size."],
    },
    sizing: {
      sizingMode: "micro",
      sizingDecision: "limited",
      suggestedMaximumExposurePct: 2,
      limitedReason: "Reduced size because survival scar and trust below threshold.",
      sizingReasons: ["Reduced size because survival scar."],
      sizingRationale: ["Trust below threshold."],
    },
    calibration: {
      status: "unstable-outcomes",
      rawConfidence: 85,
      calibratedConfidence: 66,
      trustworthiness: 72,
      sampleSize: 18,
      warnings: ["unstable outcomes"],
      explanation: "Calibration outcomes are unstable.",
    },
    readiness: {
      readinessScore: 62,
      maxPositionPct: 2,
      blocked: false,
      components: {
        dataReliability: { score: 76 },
        walkForwardRobustness: { score: 58 },
      },
      walkForward: {
        positiveSegmentCount: 2,
        segmentCount: 4,
      },
    },
    strategyHistory: {
      sharpeRatio: 1.21,
      profitFactor: 1.44,
      maxDrawdownPct: 12.5,
      overfitRisk: 24,
      walkForwardStability: 58,
      dataReliability: 76,
      modelReliability: 74,
    },
    opportunity: {
      densityPct: 38,
      candidateQualityPct: 57,
      candidateCount: 8,
    },
    riskPct: 32,
  };
}

describe("dashboard executive information architecture", () => {
  it("generates Executive Reasoning without changing source diagnostics", () => {
    const state = richState();
    const ia = buildExecutiveDashboardIA(state);

    expect(ia.executiveReasoning.narrative).toContain("historically recurring positive state");
    expect(ia.executiveReasoning.narrative).toContain("governance recommends micro participation");
    expect(ia.executiveReasoning.finalDecision).toBe("Wait");
    expect(ia.executiveReasoning.recommendedParticipationMode).toBe("Micro");
    expect(ia.executiveReasoning.maxExposure).toBe("2%");
    expect(ia.executiveReasoning.mainReasonForRestriction?.code).toBe("survival_scar");
    expect(ia.traceability.originalState).toBe(state.sourceState);
    expect(ia.traceability.preservedModules.survivalMemory).toBe(state.survivalMemory);
  });

  it("selects the compact Evidence Summary from buried diagnostics", () => {
    const summary = buildEvidenceSummary(richState());
    const byId = Object.fromEntries(summary.map((item) => [item.id, item]));

    expect(byId["similar-samples"]?.value).toBe("1313");
    expect(byId["positive-outcomes"]?.value).toBe("1200");
    expect(byId["negative-outcomes"]?.value).toBe("112");
    expect(byId["neutral-outcomes"]?.value).toBe("10");
    expect(byId["outcome-stability"]?.value).toBe("79%");
    expect(byId["overfit-risk"]?.value).toBe("24%");
    expect(byId["sharpe-ratio"]?.value).toBe("1.21");
    expect(byId["profit-factor"]?.value).toBe("1.44");
    expect(byId["max-drawdown"]?.value).toBe("13%");
    expect(byId["data-reliability"]?.value).toBe("76%");
    expect(byId["calibration-trustworthiness"]?.value).toBe("72%");
    expect(byId["walk-forward-stability"]?.value).toBe("58%");
    expect(byId["readiness-score"]?.value).toBe("62%");
  });

  it("deduplicates repeated reasons into canonical explanation codes", () => {
    const reasons = resolveCanonicalExplanations(richState());
    const codes = reasons.map((reason) => reason.code);

    expect(codes.filter((code) => code === "survival_scar")).toHaveLength(1);
    expect(codes).toContain("trust_below_threshold");
    expect(codes).toContain("reduced_size");
    expect(codes).toContain("recovery_incomplete");
    expect(reasons.find((reason) => reason.code === "survival_scar")?.affectedModules).toContain("Survival Memory");
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("orders the Decision Pipeline and classifies outcomes", () => {
    const pipeline = buildDecisionPipeline(richState());

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
    expect(pipeline.find((step) => step.stage === "Recognition")?.outcome).toBe("passed");
    expect(pipeline.find((step) => step.stage === "Agency")?.outcome).toBe("escalated");
    expect(pipeline.find((step) => step.stage === "Resolve")?.outcome).toBe("limited");
  });

  it("explains why full size is unavailable in priority order", () => {
    const why = buildWhyNotFullSize(richState());

    expect(why.active).toBe(true);
    expect(why.mode).toBe("Micro");
    expect(why.factors.map((factor) => factor.code).slice(0, 3)).toEqual([
      "survival_scar",
      "trust_below_threshold",
      "reduced_size",
    ]);
    expect(why.factors[0]?.unlockCondition).toContain("70/100");
  });

  it("extracts unlock and invalidation conditions for decision changes", () => {
    const extracted = extractUnlockInvalidationConditions(richState());

    expect(extracted.unlockConditions).toContain("Raise trust score to at least 70/100.");
    expect(extracted.unlockConditions).toContain("Raise agency trust to at least 70/100.");
    expect(extracted.invalidationConditions).toContain("Invalidate if Trust or Judgement falls below the commitment threshold.");
    expect(extracted.primaryUnlockCondition).toContain("70/100");
    expect(extracted.primaryInvalidationCondition).toContain("survival cost");
  });

  it("groups terminology under operator-facing parent concepts", () => {
    const groups = buildTerminologyGroups(richState());

    expect(groups.map((group) => group.concept)).toEqual([
      "Trust",
      "Confidence",
      "Reliability",
      "Safety",
      "Opportunity",
      "Wisdom",
      "Discovery Intelligence",
    ]);
    expect(groups.find((group) => group.concept === "Trust")?.metrics.map((metric) => metric.label)).toContain("Agency trust");
    expect(groups.find((group) => group.concept === "Confidence")?.metrics.map((metric) => metric.label)).toContain("Calibrated confidence");
  });

  it("keeps backwards compatibility with current app state shape", () => {
    const ia = buildExecutiveDashboardIA({
      strategyReadiness: {
        readinessScore: 71,
        trustworthiness: 73,
        components: {
          dataReliability: { score: 81 },
          walkForwardRobustness: { score: 67 },
        },
      },
      backtestSummary: {
        annualizedSharpe: 1.04,
        profitFactor: 1.2,
        maxDrawdownPct: 14,
        readinessScore: 70,
      },
    });
    const byId = Object.fromEntries(ia.evidenceSummary.map((item) => [item.id, item.value]));

    expect(byId["sharpe-ratio"]).toBe("1.04");
    expect(byId["profit-factor"]).toBe("1.20");
    expect(byId["data-reliability"]).toBe("81%");
    expect(byId["walk-forward-stability"]).toBe("67%");
    expect(byId["readiness-score"]).toBe("71%");
  });

  it("surfaces Executive, Wisdom, Execution Quality, Counterfactual, Discovery Accountability, Discovery Intelligence, and separated states", () => {
    const ia = buildExecutiveDashboardIA({
      ...richState(),
      executionQuality: {
        score: 76,
        status: "good",
        entryQuality: 80,
        exitQuality: 74,
        liquidityQuality: 82,
        slippageRisk: 18,
        volatilityRisk: 28,
        timingUrgency: 70,
        scalingQuality: 66,
        invalidationClarity: 79,
        blockers: [],
        warnings: ["Use scale-in execution."],
        recommendedExecutionMode: "scale_in",
        explanation: "Execution is good.",
        audit: {},
      },
      counterfactual: {
        scenarios: [{
          id: "counterfactual:normal_size",
          kind: "normal_size",
          label: "Normal-size decision",
          decision: "buy",
          expectedOutcomeScore: 72,
          expectedReturn: 8,
          riskScore: 44,
          regretScore: 22,
          restrictionImpactScore: 48,
          confidence: 74,
          summary: "Normal size may have worked.",
          assumptions: [],
        }],
        avoidedLossScore: 38,
        missedUpsideScore: 62,
        restrictionValueScore: 41,
        cautionCostScore: 52,
        recommendedLearning: ["Review sizing policy."],
        shouldAdjustRestrictionPolicy: false,
        shouldAdjustDiscoveryPolicy: false,
        shouldAdjustSizingPolicy: true,
        explanation: "Caution cost is visible.",
        audit: {},
      },
      discoveryAccountability: {
        accountabilityScore: 58,
        maturity: 44,
        earlyDetectionAccuracy: 63,
        falseDiscoveryRate: 12,
        missedOpportunityRate: 22,
        noveltyToProfitConversion: 48,
        discoveryDecay: 20,
        confirmationLatency: 4,
        status: "developing",
        blockers: ["Discovery maturity is still immature."],
        unlockConditions: ["Raise discovery maturity with more confirmed outcome samples."],
        explanation: "Discovery is developing.",
        audit: {},
      },
      discoveryIntelligence: {
        score: 67,
        maturity: {
          emerging: 1,
          detected: 2,
          observed: 3,
          confirmed: 2,
          repeatable: 1,
          trusted: 1,
          institutional: 0,
          discoveryCount: 10,
          promotionRate: 60,
          abandonmentRate: 10,
          falseDiscoveryRate: 12,
          noveltyConversionRate: 50,
          trustedConversionRate: 10,
          institutionalConversionRate: 0,
          maturityScore: 58,
        },
        economics: {
          actValue: 8,
          waitValue: 3,
          rejectValue: 0,
          restrictValue: 5,
          avoidedLoss: 4,
          missedUpside: 2,
          opportunityCost: -2,
          economicsScore: 72,
        },
        governance: {
          score: 64,
          helpfulRestrictions: 1,
          harmfulRestrictions: 0,
          restrictions: [],
        },
        institutionalization: {
          knowledgeCount: 2,
          policyCount: 1,
          standardCount: 0,
          institutionalCount: 0,
          institutionalizationScore: 35,
        },
        metaLearning: {
          score: 61,
          calibrationTrend: 4,
          trustTrend: 3,
          survivalTrend: -1,
          decisionQualityTrend: 5,
          governanceTrend: 2,
        },
        recommendations: [{
          id: "institutionalize",
          category: "institutionalization",
          priority: "medium",
          message: "Convert trusted discoveries into policies.",
        }],
      },
    });

    expect(ia.executionQuality?.recommendedExecutionMode).toBe("scale_in");
    expect(ia.counterfactual?.shouldAdjustSizingPolicy).toBe(true);
    expect(ia.discoveryAccountability?.status).toBe("developing");
    expect(ia.discoveryIntelligence?.score).toBe(67);
    expect(ia.decisionStates.trust.status).toBe("provisional");
    expect(ia.decisionStates.permission.level).toBe("review_required");
    expect(ia.traceability.preservedModules.executionQuality).toBe(ia.executionQuality);
  });

  it("evolves governance into a single command with arbitration and accountability", () => {
    const state = richState();
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
    expect(evolution.command.reason).toContain("governance review");
    expect(evolution.arbitration.conflicts.map((conflict) => conflict.id)).toContain("executive-wisdom-conflict");
    expect(evolution.arbitration.conflicts.map((conflict) => conflict.id)).toContain("survival-threshold-status-conflict");
    expect(evolution.exposureStates.find((item) => item.status === "active")?.state).toBe("micro");
    expect(evolution.confidenceLedger.find((item) => item.kind === "survival")?.status).toBe("scarred");
    expect(evolution.restrictionBets[0]?.evidenceRequired).toContain("max adverse excursion");
    expect(evolution.accountabilityLoop.map((step) => step.id)).toContain("policy-adjustment");
  });

  it("handles empty, missing, and partial diagnostic states", () => {
    const empty = buildExecutiveDashboardIA({});

    expect(empty.executiveReasoning.finalDecision).toBe("Pending");
    expect(empty.evidenceSummary).toHaveLength(18);
    expect(empty.evidenceSummary.every((item) => item.value === "Pending")).toBe(true);
    expect(empty.decisionPipeline).toHaveLength(9);
    expect(empty.terminologyGroups).toHaveLength(7);

    const partial = buildExecutiveDashboardIA({ trustGovernor: { participationMode: "limited", maxExposure: 5 } });
    expect(partial.executiveReasoning.recommendedParticipationMode).toBe("Limited");
    expect(partial.whyNotFullSize.active).toBe(true);
  });
});
