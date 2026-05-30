import { describe, expect, it } from "vitest";
import { evaluateTrustGovernor } from "./engine";

const trustedJudgement = {
  status: "trusted" as const,
  rawConfidence: 85,
  adjustedConfidence: 72,
  trust: 72,
  calibration: 72,
  reliability: 88,
  overfitRisk: 28,
  outcomeStability: 85,
  similarSampleSize: 1049,
  confidenceDelta: -13,
  reasons: [],
  warnings: [],
  evidence: {
    similarStates: 1049,
    positiveOutcomes: 999,
    negativeOutcomes: 50,
    neutralOutcomes: 0,
  },
};

describe("Signal Trust Governor", () => {
  it("keeps new exposure gated when calibration is unstable even if judgement is trusted", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 85,
      calibratedConfidence: 66,
      maxExposure: 5.5,
      requestedExposure: 3,
      opensNewExposure: true,
      calibration: {
        rawConfidence: 85,
        calibratedConfidence: 66,
        historicalAccuracy: 63,
        calibrationError: 19,
        trustworthiness: 72,
        sampleSize: 107,
        reliabilityBuckets: [],
        warnings: ["poor calibration", "overconfidence", "unstable outcomes"],
        status: "unstable-outcomes",
      },
      judgement: trustedJudgement,
      reliability: { score: 100, status: "healthy", confidenceCap: 100 },
      strategy: {
        stage: "Limited live",
        productionEligible: false,
        readinessScore: 86,
        maxConfidence: 66,
        maxPositionPct: 5.5,
      },
    });

    expect(result.name).toBe("Signal Trust Governor");
    expect(result.module).toBe("signal.trust-governor");
    expect(result.participationMode).toBe("exits_only");
    expect(result.maxExposure).toBe(0);
    expect(result.allowsNewExposure).toBe(false);
    expect(result.allowedActions).toContain("risk_reducing_exits");
    expect(result.blockedActions).toContain("new_exposure");
    expect(result.primaryBlocker).toBe("calibration_unstable_outcomes");
    expect(result.unlockCriteria.join(" ")).toMatch(/outcome stability/i);
    expect(result.contradictions).toContain("Judgement finds similar history usable, but calibration still requires review.");
  });

  it("allows normal participation when trust inputs agree and capacity exists", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 91,
      calibratedConfidence: 88,
      maxExposure: 6,
      requestedExposure: 4,
      opensNewExposure: true,
      calibration: {
        rawConfidence: 91,
        calibratedConfidence: 88,
        historicalAccuracy: 87,
        calibrationError: 3,
        trustworthiness: 90,
        sampleSize: 140,
        reliabilityBuckets: [],
        warnings: [],
        status: "trusted",
      },
      judgement: {
        ...trustedJudgement,
        adjustedConfidence: 89,
        trust: 91,
        calibration: 90,
        reliability: 92,
        overfitRisk: 12,
      },
      reflection: { reflectionScore: 88, recommendedConfidenceCap: 90 },
      reliability: { score: 96, status: "healthy", confidenceCap: 94 },
      strategy: {
        stage: "Production eligible",
        productionEligible: true,
        readinessScore: 90,
        maxConfidence: 89,
        maxPositionPct: 6,
      },
      agency: { status: "approved", agencyScore: 91, commitmentConfidence: 89 },
    });

    expect(result.participationMode).toBe("normal");
    expect(result.allowsNewExposure).toBe(true);
    expect(result.maxExposure).toBe(6);
    expect(result.blockers).toEqual([]);
    expect(result.blockedActions).toEqual([]);
    expect(result.allowedActions).toContain("new_exposure");
  });

  it("blocks all execution when data reliability is unusable", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 80,
      calibratedConfidence: 78,
      maxExposure: 5,
      reliability: { score: 20, status: "invalid", confidenceCap: 20 },
      calibration: { warnings: [], calibratedConfidence: 78, trustworthiness: 80 },
    });

    expect(result.participationMode).toBe("blocked");
    expect(result.maxExposure).toBe(0);
    expect(result.allowedActions).toEqual(["observe"]);
    expect(result.primaryBlocker).toBe("data_reliability_unusable");
    expect(result.confidenceCap).toBe(20);
  });

  it("surfaces specific robustness blockers before generic readiness blocks", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 85,
      calibratedConfidence: 80,
      maxExposure: 5,
      requestedExposure: 3,
      opensNewExposure: true,
      calibration: {
        warnings: [],
        calibratedConfidence: 80,
        trustworthiness: 84,
        status: "trusted",
      },
      reliability: { score: 96, status: "healthy", confidenceCap: 96 },
      strategy: {
        blocked: true,
        stage: "Research only",
        productionEligible: false,
        readinessScore: 86,
        maxConfidence: 55,
        maxPositionPct: 0,
        failureFlags: ["ROBUSTNESS_OVERFIT_RISK"],
      },
    });

    expect(result.participationMode).toBe("exits_only");
    expect(result.primaryBlocker).toBe("robustness_overfit_risk");
    expect(result.unlockCriteria.join(" ")).toMatch(/overfit risk/i);
    expect(result.blockers.some((blocker) => blocker.id === "strategy_readiness_blocked")).toBe(false);
  });

  it("uses paper mode when trust is low but no hard blocker is present", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 49,
      calibratedConfidence: 48,
      maxExposure: 4,
      calibration: { warnings: [], calibratedConfidence: 48, trustworthiness: 52 },
      reliability: { score: 80, status: "healthy", confidenceCap: 80 },
      strategy: { readinessScore: 55, maxConfidence: 50, maxPositionPct: 4 },
    });

    expect(result.participationMode).toBe("paper");
    expect(result.maxExposure).toBe(0);
    expect(result.allowedActions).toContain("paper_trade");
    expect(result.blockedActions).toContain("increase_position");
  });

  it("blocks new exposure when generic survival memory says to wait", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 90,
      calibratedConfidence: 84,
      maxExposure: 8,
      requestedExposure: 5,
      opensNewExposure: true,
      calibration: { warnings: [], calibratedConfidence: 84, trustworthiness: 86, status: "trusted" },
      reliability: { score: 96, status: "healthy", confidenceCap: 96 },
      strategy: { readinessScore: 88, maxConfidence: 84, maxPositionPct: 8 },
      survivalMemory: {
        status: "near_ruin",
        recommendation: "wait",
        scarCount: 4,
        nearRuinCount: 2,
        averageSurvivalCost: 72,
        recoveryBurden: 64,
        survivalConfidence: 28,
        currentStateSimilarity: 82,
        exposureMultiplier: 0,
        confidencePenalty: 55,
        maxExposurePct: 0,
        unlockConditions: ["Clear near-ruin survival matches."],
      },
    });

    expect(result.participationMode).toBe("exits_only");
    expect(result.maxExposure).toBe(0);
    expect(result.primaryBlocker).toBe("survival_memory_wait");
    expect(result.confidenceCap).toBe(28);
    expect(result.audit.rawMaxExposure).toBe(0);
    expect(result.audit.survivalRecovery?.recommendation).toBe("wait");
    expect(result.unlockCriteria).toContain("Clear near-ruin survival matches.");
  });

  it("allows reduced-size recovery exposure when survival memory has scars but no wait recommendation", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 88,
      calibratedConfidence: 84,
      maxExposure: 10,
      requestedExposure: 6,
      opensNewExposure: true,
      calibration: { warnings: [], calibratedConfidence: 84, trustworthiness: 86, status: "trusted" },
      reliability: { score: 96, status: "healthy", confidenceCap: 96 },
      strategy: { stage: "Limited live", readinessScore: 86, maxConfidence: 84, maxPositionPct: 10 },
      survivalMemory: {
        status: "scarred",
        recommendation: "act_with_reduced_size",
        scarCount: 3,
        nearRuinCount: 0,
        averageSurvivalCost: 48,
        survivalConfidence: 72,
        exposureMultiplier: 0.4,
        confidencePenalty: 18,
        maxExposurePct: 2.5,
      },
    });

    expect(result.primaryBlocker).toBe("survival_reduced_size");
    expect(result.blockers[0]?.severity).toBe("medium");
    expect(result.allowsNewExposure).toBe(true);
    expect(result.maxExposure).toBeGreaterThan(0);
    expect(result.maxExposure).toBeLessThanOrEqual(2.5);
    expect(result.audit.rawMaxExposure).toBe(2.5);
    expect(result.audit.componentScores.survival).toBeLessThan(70);
  });

  it("does not apply the survival multiplier twice when an explicit recovery cap is provided", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 85,
      calibratedConfidence: 73,
      maxExposure: 3.37,
      requestedExposure: 3.37,
      opensNewExposure: true,
      calibration: { warnings: [], calibratedConfidence: 73, trustworthiness: 81, status: "trusted" },
      reliability: { score: 100, status: "healthy", confidenceCap: 100 },
      strategy: { stage: "Paper trade", readinessScore: 86, maxConfidence: 73, maxPositionPct: 3.37 },
      survivalMemory: {
        status: "scarred",
        recommendation: "act_with_reduced_size",
        scarCount: 89,
        nearRuinCount: 54,
        averageSurvivalCost: 29,
        survivalConfidence: 66,
        exposureMultiplier: 0.65,
        confidencePenalty: 21,
        maxExposurePct: 3.37,
      },
    });

    expect(result.audit.rawMaxExposure).toBe(3.37);
    expect(result.audit.survivalRecovery?.trustedMaxExposure).toBe(3.37);
    expect(result.participationMode).toBe("limited");
    expect(result.maxExposure).toBeGreaterThan(1);
  });
});
