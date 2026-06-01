import { describe, expect, it } from "vitest";
import { evaluateCounterfactuals } from "../counterfactual/engine";
import { evaluateDiscoveryAccountability } from "../discovery-accountability/engine";
import { evaluateExecutionQuality } from "../execution-quality/engine";
import { evaluateExecutiveDecision } from "./engine";

describe("executive decision synthesis", () => {
  it("synthesizes a final limited buy with reasons, limits, and review conditions", () => {
    const executionQuality = evaluateExecutionQuality({
      entryQuality: 76,
      exitQuality: 74,
      liquidityQuality: 82,
      slippageRisk: 18,
      volatilityRisk: 32,
      timingUrgency: 72,
      scalingQuality: 64,
      invalidationClarity: 80,
    });
    const discoveryAccountability = evaluateDiscoveryAccountability({
      discovery: { status: "developing", confidence: 70, maturity: 62 },
      events: [{ outcome: "positive", profitScore: 70, wasEarly: true, novelty: 60 }],
    });
    const counterfactual = evaluateCounterfactuals({
      actualDecision: { decision: "buy", confidence: 76, risk: 28, maxExposure: 4 },
      normalSizeDecision: { decision: "buy", confidence: 80, risk: 44, maxExposure: 12, expectedReturn: 9 },
    });

    const decision = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 78,
      opportunity: 82,
      risk: 30,
      discovery: { confidence: 70, maturity: 62, invalidationConditions: ["Discovery support fails."] },
      discoveryAccountability,
      belief: { confidence: 76, reason: "Belief supports action." },
      judgement: { adjustedConfidence: 74, reasons: ["Similar states were profitable."] },
      resolve: { decision: "commit", resolveScore: 77 },
      trust: { score: 74, status: "trusted", reasons: ["Historical reliability is stable."] },
      permission: { allowed: true, level: "limited", reasons: ["Reduced-size approval."] },
      capacity: { maxExposure: 4, mode: "reduced", reasons: ["Recovery cap."] },
      urgency: { score: 72, mode: "act_soon", reasons: ["Window is timely."] },
      executionQuality,
      counterfactual,
      historicalEvidence: ["Backtest and live shadow evidence agree."],
    });

    expect(decision.decision).toBe("buy");
    expect(decision.participationMode).toBe("limited");
    expect(decision.maxExposure).toBe(4);
    expect(decision.strongestEvidence).toContain("Backtest and live shadow evidence agree.");
    expect(decision.unlockConditions.length).toBeGreaterThan(0);
    expect(decision.invalidationConditions.length).toBeGreaterThan(0);
  });

  it("keeps high confidence blocked when permission is blocked", () => {
    const decision = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 94,
      trust: { score: 90, status: "highly_trusted", reasons: ["Strong history."] },
      permission: { allowed: false, level: "blocked", reasons: ["Venue permission lock."] },
      capacity: { maxExposure: 25, mode: "normal", reasons: ["Capacity exists."] },
    });

    expect(decision.decision).toBe("avoid");
    expect(decision.maxExposure).toBe(0);
    expect(decision.permission.allowed).toBe(false);
    expect(decision.trust).toBe(90);
  });

  it("routes strong discovery to hold when execution quality is poor", () => {
    const decision = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 80,
      discovery: { confidence: 88, maturity: 80 },
      trust: 82,
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 10, mode: "normal", reasons: ["Normal capacity."] },
      executionQuality: evaluateExecutionQuality({
        entryQuality: 30,
        exitQuality: 35,
        liquidityQuality: 48,
        slippageRisk: 65,
        volatilityRisk: 70,
        scalingQuality: 30,
        invalidationClarity: 45,
      }),
    });

    expect(decision.decision).toBe("hold");
    expect(decision.participationMode).toBe("watch");
  });

  it("integrates generic pipeline outputs through Executive as final authority", () => {
    const discoveryAccountability = evaluateDiscoveryAccountability({
      discovery: { status: "emerging", confidence: 58, maturity: 38 },
    });
    const executionQuality = evaluateExecutionQuality({ liquidityQuality: 15 });
    const counterfactual = evaluateCounterfactuals({
      actualDecision: { decision: "watch", confidence: 50, risk: 20 },
      ignoredRestrictionDecision: { decision: "buy", confidence: 72, risk: 88, maxExposure: 20 },
    });

    const executive = evaluateExecutiveDecision({
      proposedDecision: "buy",
      discovery: { confidence: 58, maturity: 38 },
      discoveryAccountability,
      recognition: { recognitionScore: 55 },
      belief: { confidence: 64 },
      judgement: { adjustedConfidence: 62 },
      agency: { recommendation: "review", trustPct: 58 },
      resolve: { decision: "wait", resolveScore: 54 },
      trust: 58,
      capacity: 6,
      executionQuality,
      counterfactual,
      survivalMemory: { status: "scarred", recommendation: "act_with_reduced_size", maxExposurePct: 2 },
    });

    expect(executive.decision).toBe("avoid");
    expect(executive.primaryLimiter).toContain("Liquidity");
    expect(executive.audit.sourceModules).toContain("counterfactual");
    expect(executive.audit.sourceModules).toContain("discoveryAccountability");
  });

  it("separates aggressive, normal, and acceptable-execution participation modes", () => {
    const aggressive = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 100,
      discovery: { confidence: 96 },
      discoveryAccountability: { accountabilityScore: 95, maturity: 90, earlyDetectionAccuracy: 100, falseDiscoveryRate: 0, missedOpportunityRate: 0, noveltyToProfitConversion: 100, discoveryDecay: 0, confirmationLatency: 1, status: "trusted", blockers: [], unlockConditions: [], explanation: "Trusted.", audit: {} },
      recognition: { recognitionScore: 94 },
      belief: { confidence: 95 },
      judgement: { adjustedConfidence: 94 },
      resolve: { decision: "commit", resolveScore: 93 },
      executionQuality: evaluateExecutionQuality({
        entryQuality: 95,
        exitQuality: 95,
        liquidityQuality: 95,
        slippageRisk: 5,
        volatilityRisk: 10,
        timingUrgency: 90,
        scalingQuality: 95,
        invalidationClarity: 95,
      }),
      opportunity: 96,
      risk: 8,
      trust: { score: 94, status: "highly_trusted", reasons: ["Long-run reliability."] },
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 30, mode: "expanded", reasons: ["Expanded mandate."] },
      urgency: { score: 92, mode: "act_now", reasons: ["Immediate window."] },
      historicalEvidence: ["Durable edge is confirmed."],
    });
    const normal = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 76,
      trust: { score: 80, status: "trusted", reasons: ["Reliable."] },
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 12, mode: "normal", reasons: ["Normal mandate."] },
      urgency: { score: 50, mode: "monitor", reasons: ["No rush."] },
    });
    const acceptable = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 76,
      trust: { score: 80, status: "trusted", reasons: ["Reliable."] },
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 12, mode: "normal", reasons: ["Normal mandate."] },
      urgency: { score: 50, mode: "monitor", reasons: ["No rush."] },
      executionQuality: {
        score: 62,
        status: "acceptable",
        entryQuality: 60,
        exitQuality: 60,
        liquidityQuality: 62,
        slippageRisk: 38,
        volatilityRisk: 42,
        timingUrgency: 45,
        scalingQuality: 58,
        invalidationClarity: 62,
        blockers: [],
        warnings: ["Execution is acceptable but not clean enough for normal participation."],
        recommendedExecutionMode: "small_probe",
        explanation: "Acceptable execution.",
        audit: {},
      },
    });

    expect(aggressive.participationMode).toBe("aggressive");
    expect(aggressive.nextReviewCondition).toContain("execution-quality");
    expect(normal.participationMode).toBe("normal");
    expect(acceptable.participationMode).toBe("limited");
  });

  it("falls back through invalid proposed actions and immediate review conditions", () => {
    const review = evaluateExecutiveDecision({
      proposedDecision: "not-a-decision",
      agency: { recommendation: "needs_review" },
      trust: 74,
      capacity: 6,
      restrictions: [{ reason: "Policy review is required.", requiresReview: true }],
      unlockConditions: [{ id: "explicit-unlock", description: "Operator approves review.", source: "test", priority: 1 }],
      invalidationConditions: [{ id: "explicit-invalid", description: "Review evidence fails.", source: "test", priority: 1 }],
    });
    const wait = evaluateExecutiveDecision({
      proposedDecision: "unknown",
      resolve: { decision: "wait" },
      trust: 78,
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 5, mode: "reduced", reasons: ["Reduced mandate."] },
    });

    expect(review.decision).toBe("review");
    expect(review.primaryReason).toBe("Policy review is required.");
    expect(review.nextReviewCondition).toContain("immediately");
    expect(review.unlockConditions[0]?.id).toBe("explicit-unlock");
    expect(review.invalidationConditions[0]?.id).toBe("explicit-invalid");
    expect(wait.decision).toBe("watch");
    expect(wait.participationMode).toBe("watch");
  });

  it("watches low-confidence and zero-capacity buy decisions", () => {
    const lowConfidence = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 10,
      discovery: { confidence: 10 },
      discoveryAccountability: { accountabilityScore: 10 },
      recognition: { recognitionScore: 10 },
      belief: { confidence: 10 },
      judgement: { adjustedConfidence: 10 },
      resolve: { resolveScore: 10 },
      trust: { score: 20, status: "provisional", reasons: ["Too new."] },
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 5, mode: "reduced", reasons: ["Reduced."] },
    });
    const zeroCapacity = evaluateExecutiveDecision({
      proposedDecision: "buy",
      confidence: 80,
      trust: { score: 80, status: "trusted", reasons: ["Reliable."] },
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 0, mode: "none", reasons: ["No allocation room."] },
    });

    expect(lowConfidence.decision).toBe("watch");
    expect(lowConfidence.audit.decisionTrace).toContain("Confidence is too low for a buy decision.");
    expect(zeroCapacity.decision).toBe("watch");
    expect(zeroCapacity.audit.decisionTrace).toContain("Capacity is zero, so action is watched instead of executed.");
  });

  it("defaults sparse executive input to watch", () => {
    const decision = evaluateExecutiveDecision({
      trust: { score: 80, status: "trusted", reasons: ["Reliable enough to monitor."] },
      permission: { allowed: true, level: "approved", reasons: ["Approved."] },
      capacity: { maxExposure: 0, mode: "none", reasons: ["No position requested."] },
    });

    expect(decision.decision).toBe("watch");
    expect(decision.participationMode).toBe("watch");
  });
});
