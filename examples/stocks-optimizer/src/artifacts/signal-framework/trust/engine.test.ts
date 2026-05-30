import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

    assert.equal(result.name, "Signal Trust Governor");
    assert.equal(result.module, "signal.trust-governor");
    assert.equal(result.participationMode, "exits_only");
    assert.equal(result.maxExposure, 0);
    assert.equal(result.allowsNewExposure, false);
    assert.ok(result.allowedActions.includes("risk_reducing_exits"));
    assert.ok(result.blockedActions.includes("new_exposure"));
    assert.equal(result.primaryBlocker, "calibration_unstable_outcomes");
    assert.match(result.unlockCriteria.join(" "), /outcome stability/i);
    assert.ok(result.contradictions.includes("Judgement finds similar history usable, but calibration still requires review."));
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

    assert.equal(result.participationMode, "normal");
    assert.equal(result.allowsNewExposure, true);
    assert.equal(result.maxExposure, 6);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.blockedActions, []);
    assert.ok(result.allowedActions.includes("new_exposure"));
  });

  it("blocks all execution when data reliability is unusable", () => {
    const result = evaluateTrustGovernor({
      rawConfidence: 80,
      calibratedConfidence: 78,
      maxExposure: 5,
      reliability: { score: 20, status: "invalid", confidenceCap: 20 },
      calibration: { warnings: [], calibratedConfidence: 78, trustworthiness: 80 },
    });

    assert.equal(result.participationMode, "blocked");
    assert.equal(result.maxExposure, 0);
    assert.deepEqual(result.allowedActions, ["observe"]);
    assert.equal(result.primaryBlocker, "data_reliability_unusable");
    assert.equal(result.confidenceCap, 20);
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

    assert.equal(result.participationMode, "exits_only");
    assert.equal(result.primaryBlocker, "robustness_overfit_risk");
    assert.match(result.unlockCriteria.join(" "), /overfit risk/i);
    assert.equal(result.blockers.some((blocker) => blocker.id === "strategy_readiness_blocked"), false);
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

    assert.equal(result.participationMode, "paper");
    assert.equal(result.maxExposure, 0);
    assert.ok(result.allowedActions.includes("paper_trade"));
    assert.ok(result.blockedActions.includes("increase_position"));
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

    assert.equal(result.participationMode, "exits_only");
    assert.equal(result.maxExposure, 0);
    assert.equal(result.primaryBlocker, "survival_memory_wait");
    assert.equal(result.confidenceCap, 28);
    assert.equal(result.audit.rawMaxExposure, 0);
    assert.equal(result.audit.survivalRecovery?.recommendation, "wait");
    assert.ok(result.unlockCriteria.includes("Clear near-ruin survival matches."));
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

    assert.equal(result.primaryBlocker, "survival_reduced_size");
    assert.equal(result.blockers[0]?.severity, "medium");
    assert.equal(result.allowsNewExposure, true);
    assert.ok(result.maxExposure > 0);
    assert.ok(result.maxExposure <= 2.5);
    assert.equal(result.audit.rawMaxExposure, 2.5);
    assert.ok(result.audit.componentScores.survival < 70);
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

    assert.equal(result.audit.rawMaxExposure, 3.37);
    assert.equal(result.audit.survivalRecovery?.trustedMaxExposure, 3.37);
    assert.equal(result.participationMode, "limited");
    assert.ok(result.maxExposure > 1);
  });
});
