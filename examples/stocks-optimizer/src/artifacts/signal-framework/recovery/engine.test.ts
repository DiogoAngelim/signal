import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RECOVERY_THRESHOLDS,
  type RecoveryInput,
  evaluateRecovery,
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

test("recovery keeps the dashboard-like scar profile recovering and review gated", () => {
  const recovery = evaluateRecovery(dashboardLike);

  assert.equal(recovery.module, "signal.recovery");
  assert.equal(recovery.name, "Signal Recovery");
  assert.equal(recovery.status, "recovering");
  assert.notEqual(recovery.mode, "normal");
  assert.ok(recovery.recoveryScore >= 45);
  assert.ok(recovery.trustedCapacity > 0);
  assert.ok(recovery.recommendedExposureCap >= 1.5);
  assert.equal(recovery.canRestoreSizing, false);
  assert.equal(recovery.shouldEscalateHumanReview, true);
  assert.ok(
    recovery.blockers.includes(
      "Blocked agency actions require human review before restoration.",
    ),
  );
  assert.ok(recovery.audit.positiveOutcomeRatio > 0.95);
});

test("recovery restores normal mode after survival, trust, calibration, agency, and discovery clear", () => {
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

  assert.equal(recovery.status, "restored");
  assert.equal(recovery.mode, "normal");
  assert.equal(recovery.canRestoreSizing, true);
  assert.equal(recovery.trustedCapacity, 100);
  assert.equal(recovery.recommendedExposureCap, 5.5);
  assert.ok(recovery.confidenceCapLift > 0);
  assert.deepEqual(recovery.blockers, []);
});

test("recovery does not fully restore sizing below the survival confidence threshold", () => {
  const recovery = evaluateRecovery({
    ...dashboardLike,
    survivalConfidence:
      DEFAULT_RECOVERY_THRESHOLDS.minSurvivalConfidenceForRestore - 1,
    trustScore: 90,
    calibratedConfidence: 88,
    blockedAgencyActionCount: 0,
    discoveryConfidence: 80,
    discoveryMaturity: 80,
    novelty: 10,
  });

  assert.equal(recovery.status, "recovering");
  assert.notEqual(recovery.mode, "normal");
  assert.equal(recovery.canRestoreSizing, false);
  assert.ok(
    recovery.blockers.includes(
      "Survival confidence has not cleared the normal-sizing threshold.",
    ),
  );
});

test("recovery stays gradual when survival clears but trust has not restored", () => {
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

  assert.equal(recovery.status, "recovering");
  assert.equal(recovery.mode, "graduated");
  assert.equal(recovery.canRestoreSizing, false);
  assert.ok(recovery.trustedCapacity > 0);
  assert.ok(recovery.trustedCapacity < 100);
  assert.ok(
    recovery.blockers.includes(
      "Trust score has not cleared the restoration threshold.",
    ),
  );
});

test("recovery locks and regresses on hard safety blockers", () => {
  const lowSurvival = evaluateRecovery({
    ...dashboardLike,
    survivalConfidence: 31,
    blockedAgencyActionCount: 0,
  });
  const poorData = evaluateRecovery({
    ...dashboardLike,
    dataReliability: 52,
    blockedAgencyActionCount: 0,
  });
  const lockedOverfit = evaluateRecovery({
    ...dashboardLike,
    overfitRisk: 42,
    blockedAgencyActionCount: 0,
  });
  const regressed = evaluateRecovery({
    ...dashboardLike,
    overfitRisk: 58,
    blockedAgencyActionCount: 0,
  });

  assert.equal(lowSurvival.status, "locked");
  assert.equal(lowSurvival.recommendedExposureCap, 0);
  assert.ok(
    lowSurvival.blockers.includes(
      "Survival confidence is too low to start recovery.",
    ),
  );
  assert.equal(poorData.status, "locked");
  assert.ok(
    poorData.unlockConditions.includes(
      "Restore data reliability to at least 70/100.",
    ),
  );
  assert.equal(lockedOverfit.status, "locked");
  assert.equal(regressed.status, "regressed");
  assert.equal(regressed.trustedCapacity, 0);
});

test("recovery supports configurable agency review behavior", () => {
  const recovery = evaluateRecovery({
    ...dashboardLike,
    blockedAgencyActionCount: 3,
    thresholds: {
      agencyReviewBlocksRestore: false,
      minRecoveryScoreForGraduated: 50,
    },
  });

  assert.equal(recovery.shouldEscalateHumanReview, false);
  assert.equal(
    recovery.blockers.includes(
      "Blocked agency actions require human review before restoration.",
    ),
    false,
  );
  assert.equal(recovery.audit.thresholds.agencyReviewBlocksRestore, false);
});

test("recovery falls back deterministically for sparse and malformed inputs", () => {
  const recovery = evaluateRecovery({
    survivalConfidence: null,
    scarCount: undefined,
    nearRuinCount: Number.NaN,
    currentStateSimilarity: "" as any,
    rawConfidence: "bad" as any,
  });

  assert.equal(recovery.status, "locked");
  assert.equal(recovery.recoveryScore, 0);
  assert.equal(recovery.audit.normalized.scarPressure, 0);
  assert.equal(recovery.audit.positiveOutcomeRatio, 0);
  assert.equal(recovery.audit.currentCapacityRatio, 0);
});

test("recovery reports score-only blockers when thresholds leave no other blocker", () => {
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

  assert.equal(recovery.status, "locked");
  assert.deepEqual(recovery.blockers, [
    "Recovery score is still below the recovery threshold.",
  ]);
  assert.deepEqual(recovery.unlockConditions, [
    "Keep collecting stable positive outcomes until recovery score improves.",
  ]);
});
