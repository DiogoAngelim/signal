import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECOVERY_THRESHOLDS,
  evaluateRecovery,
  type RecoveryInput,
} from "./engine";

const dashboardLike: RecoveryInput = {
  survivalConfidence: 66,
  scarCount: 89,
  nearRuinCount: 54,
  currentStateSimilarity: 62,
  recoveryExposureCap: 1.5,
  trustScore: 66,
  confidenceCap: 66,
  calibratedConfidence: 73,
  rawConfidence: 85,
  judgementReliability: 80,
  similarSampleCount: 1049,
  positiveSimilarOutcomes: 999,
  negativeSimilarOutcomes: 50,
  neutralSimilarOutcomes: 0,
  outcomeStability: 77,
  overfitRisk: 29,
  beliefFragility: 4,
  evidenceAgreement: 91,
  dataReliability: 100,
  blockedAgencyActionCount: 6,
  discoveryConfidence: 36,
  discoveryMaturity: 39,
  novelty: 93,
  currentSizingMode: "limited",
  currentMaxExposure: 1.5,
  targetNormalExposure: 5.5,
};

describe("Signal Recovery", () => {
  it("keeps the dashboard-like scar profile recovering and review gated", () => {
    const recovery = evaluateRecovery(dashboardLike);

    expect(recovery.module).toBe("signal.recovery");
    expect(recovery.name).toBe("Signal Recovery");
    expect(recovery.status).toBe("recovering");
    expect(["reduced-size", "graduated"]).toContain(recovery.mode);
    expect(recovery.mode).not.toBe("normal");
    expect(recovery.recoveryScore).toBeGreaterThanOrEqual(45);
    expect(recovery.trustedCapacity).toBeGreaterThan(0);
    expect(recovery.recommendedExposureCap).toBeGreaterThanOrEqual(1.5);
    expect(recovery.canRestoreSizing).toBe(false);
    expect(recovery.shouldEscalateHumanReview).toBe(true);
    expect(recovery.blockers).toContain("Blocked agency actions require human review before restoration.");
    expect(recovery.audit.positiveOutcomeRatio).toBeGreaterThan(0.95);
    expect(recovery.audit.formulas.length).toBeGreaterThan(0);
  });

  it("restores normal mode after survival, trust, calibration, agency, and discovery clear", () => {
    const recovery = evaluateRecovery({
      ...dashboardLike,
      survivalConfidence: 74,
      trustScore: 74,
      confidenceCap: 72,
      calibratedConfidence: 68,
      blockedAgencyActionCount: 0,
      discoveryConfidence: 62,
      discoveryMaturity: 64,
      novelty: 35,
      currentMaxExposure: 2.4,
      targetNormalExposure: 5.5,
    });

    expect(recovery.status).toBe("restored");
    expect(recovery.mode).toBe("normal");
    expect(recovery.canRestoreSizing).toBe(true);
    expect(recovery.shouldEscalateHumanReview).toBe(false);
    expect(recovery.trustedCapacity).toBe(100);
    expect(recovery.recommendedExposureCap).toBe(5.5);
    expect(recovery.confidenceCapLift).toBeGreaterThan(0);
    expect(recovery.blockers).toEqual([]);
  });

  it("does not fully restore sizing below the survival confidence threshold", () => {
    const recovery = evaluateRecovery({
      ...dashboardLike,
      survivalConfidence: DEFAULT_RECOVERY_THRESHOLDS.minSurvivalConfidenceForRestore - 1,
      trustScore: 90,
      calibratedConfidence: 88,
      blockedAgencyActionCount: 0,
      discoveryConfidence: 80,
      discoveryMaturity: 80,
      novelty: 10,
    });

    expect(recovery.status).toBe("recovering");
    expect(recovery.mode).not.toBe("normal");
    expect(recovery.canRestoreSizing).toBe(false);
    expect(recovery.blockers).toContain("Survival confidence has not cleared the normal-sizing threshold.");
  });

  it("keeps recovery gradual when survival clears but trust has not restored", () => {
    const recovery = evaluateRecovery({
      ...dashboardLike,
      survivalConfidence: 72,
      trustScore: 62,
      confidenceCap: 62,
      calibratedConfidence: 68,
      blockedAgencyActionCount: 0,
      discoveryConfidence: 64,
      discoveryMaturity: 62,
      novelty: 30,
      currentMaxExposure: 1,
      targetNormalExposure: 5,
    });

    expect(recovery.status).toBe("recovering");
    expect(recovery.mode).toBe("graduated");
    expect(recovery.canRestoreSizing).toBe(false);
    expect(recovery.trustedCapacity).toBeGreaterThan(0);
    expect(recovery.trustedCapacity).toBeLessThan(100);
    expect(recovery.blockers).toContain("Trust score has not cleared the restoration threshold.");
  });

  it("locks when survival confidence cannot support recovery", () => {
    const recovery = evaluateRecovery({
      ...dashboardLike,
      survivalConfidence: 31,
      blockedAgencyActionCount: 0,
    });

    expect(recovery.status).toBe("locked");
    expect(recovery.mode).toBe("observe");
    expect(recovery.trustedCapacity).toBe(0);
    expect(recovery.recommendedExposureCap).toBe(0);
    expect(recovery.confidenceCapLift).toBe(0);
    expect(recovery.blockers).toContain("Survival confidence is too low to start recovery.");
    expect(recovery.invalidationConditions).toEqual(["Do not restore sizing while recovery remains locked or regressed."]);
  });

  it("locks or regresses when overfit risk is above thresholds", () => {
    const locked = evaluateRecovery({
      ...dashboardLike,
      overfitRisk: 42,
      blockedAgencyActionCount: 0,
    });
    const regressed = evaluateRecovery({
      ...dashboardLike,
      overfitRisk: 58,
      blockedAgencyActionCount: 0,
    });

    expect(locked.status).toBe("locked");
    expect(locked.blockers).toContain("Overfit risk is above the recovery threshold.");
    expect(regressed.status).toBe("regressed");
    expect(regressed.mode).toBe("observe");
    expect(regressed.trustedCapacity).toBe(0);
  });

  it("locks when data reliability is poor", () => {
    const recovery = evaluateRecovery({
      ...dashboardLike,
      dataReliability: 52,
      blockedAgencyActionCount: 0,
    });

    expect(recovery.status).toBe("locked");
    expect(recovery.blockers).toContain("Data reliability is below the recovery threshold.");
    expect(recovery.unlockConditions).toContain("Restore data reliability to at least 70/100.");
  });

  it("supports configurable thresholds and agency review behavior", () => {
    const recovery = evaluateRecovery({
      ...dashboardLike,
      blockedAgencyActionCount: 3,
      thresholds: {
        agencyReviewBlocksRestore: false,
        minRecoveryScoreForGraduated: 50,
      },
    });

    expect(recovery.shouldEscalateHumanReview).toBe(false);
    expect(recovery.blockers).not.toContain("Blocked agency actions require human review before restoration.");
    expect(["graduated", "reduced-size"]).toContain(recovery.mode);
    expect(recovery.audit.thresholds.agencyReviewBlocksRestore).toBe(false);
  });

  it("falls back deterministically for null, undefined, empty, and non-finite inputs", () => {
    const recovery = evaluateRecovery({
      survivalConfidence: null,
      scarCount: undefined,
      nearRuinCount: Number.NaN,
      currentStateSimilarity: "" as any,
      recoveryExposureCap: undefined,
      trustScore: null,
      confidenceCap: undefined,
      calibratedConfidence: undefined,
      rawConfidence: "bad" as any,
      judgementReliability: undefined,
      similarSampleCount: undefined,
      positiveSimilarOutcomes: undefined,
      negativeSimilarOutcomes: undefined,
      neutralSimilarOutcomes: undefined,
      outcomeStability: undefined,
      overfitRisk: undefined,
      beliefFragility: undefined,
      evidenceAgreement: undefined,
      dataReliability: undefined,
      blockedAgencyActionCount: undefined,
      discoveryConfidence: undefined,
      discoveryMaturity: undefined,
      novelty: undefined,
      currentSizingMode: undefined,
      currentMaxExposure: undefined,
      targetNormalExposure: undefined,
    });

    expect(recovery.status).toBe("locked");
    expect(recovery.recoveryScore).toBe(0);
    expect(recovery.audit.normalized.scarPressure).toBe(0);
    expect(recovery.audit.positiveOutcomeRatio).toBe(0);
    expect(recovery.audit.currentCapacityRatio).toBe(0);
    expect(recovery.reasons[0]).toMatch(/locked/);
  });

  it("reports low-evidence blockers when score is otherwise not hard locked", () => {
    const recovery = evaluateRecovery({
      survivalConfidence: 56,
      trustScore: 58,
      confidenceCap: 58,
      calibratedConfidence: 54,
      judgementReliability: 55,
      similarSampleCount: 12,
      positiveSimilarOutcomes: 4,
      negativeSimilarOutcomes: 6,
      neutralSimilarOutcomes: 2,
      outcomeStability: 52,
      overfitRisk: 20,
      beliefFragility: 44,
      evidenceAgreement: 58,
      dataReliability: 90,
      discoveryConfidence: 20,
      discoveryMaturity: 18,
      targetNormalExposure: 5,
      currentMaxExposure: 0.5,
    });

    expect(recovery.status).toBe("locked");
    expect(recovery.blockers).toContain("Trust score has not cleared the restoration threshold.");
    expect(recovery.blockers).toContain("Positive similar-outcome ratio is below restoration threshold.");
    expect(recovery.blockers).toContain("Discovery maturity has not cleared the restoration threshold.");
    expect(recovery.unlockConditions).toContain("Let discovery confidence and maturity improve before restoring normal sizing.");
  });

  it("reports a score-only blocker when configured thresholds leave no other blocker", () => {
    const recovery = evaluateRecovery({
      survivalConfidence: 48,
      trustScore: 80,
      confidenceCap: 80,
      calibratedConfidence: 80,
      judgementReliability: 80,
      outcomeStability: 80,
      evidenceAgreement: 80,
      dataReliability: 80,
      similarSampleCount: 12,
      positiveSimilarOutcomes: 1,
      overfitRisk: 10,
      beliefFragility: 5,
      discoveryConfidence: 80,
      discoveryMaturity: 80,
      novelty: 50,
      thresholds: {
        minSurvivalConfidenceForRecovery: 0,
        minSurvivalConfidenceForRestore: 0,
        minTrustScoreForRestore: 0,
        minCalibratedConfidenceForRestore: 0,
        minRecoveryScoreForRecovery: 90,
        minRecoveryScoreForRestore: 95,
        minDataReliability: 0,
        maxOverfitRisk: 100,
        maxBeliefFragilityForRestore: 100,
        minEvidenceAgreementForRestore: 0,
        minDiscoveryConfidenceForRestore: 0,
        minDiscoveryMaturityForRestore: 0,
        minJudgementReliabilityForRestore: 0,
        minOutcomeStabilityForRestore: 0,
        minSimilarSamplesForRestore: 0,
        minPositiveOutcomeRatioForRestore: 0,
      },
    });

    expect(recovery.status).toBe("locked");
    expect(recovery.blockers).toEqual(["Recovery score is still below the recovery threshold."]);
    expect(recovery.unlockConditions).toEqual(["Keep collecting stable positive outcomes until recovery score improves."]);
  });
});
