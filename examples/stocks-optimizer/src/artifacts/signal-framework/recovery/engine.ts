/* c8 ignore next */
import { clamp } from "../math/statistics";

export type RecoveryStatus = "locked" | "recovering" | "restored" | "regressed";
export type RecoveryMode = "observe" | "reduced-size" | "graduated" | "normal";

export type RecoveryThresholds = {
  minSurvivalConfidenceForRecovery: number;
  minSurvivalConfidenceForRestore: number;
  minTrustScoreForRestore: number;
  minCalibratedConfidenceForRestore: number;
  minRecoveryScoreForRecovery: number;
  minRecoveryScoreForGraduated: number;
  minRecoveryScoreForRestore: number;
  minDataReliability: number;
  maxOverfitRisk: number;
  regressedOverfitRisk: number;
  maxBeliefFragilityForRestore: number;
  minEvidenceAgreementForRestore: number;
  minDiscoveryConfidenceForRestore: number;
  minDiscoveryMaturityForRestore: number;
  minJudgementReliabilityForRestore: number;
  minOutcomeStabilityForRestore: number;
  minSimilarSamplesForRestore: number;
  minPositiveOutcomeRatioForRestore: number;
  maxConfidenceCapLift: number;
  agencyReviewBlocksRestore: boolean;
};

export type RecoveryInput = {
  survivalConfidence?: number | null;
  scarCount?: number | null;
  nearRuinCount?: number | null;
  currentStateSimilarity?: number | null;
  recoveryExposureCap?: number | null;
  trustScore?: number | null;
  confidenceCap?: number | null;
  calibratedConfidence?: number | null;
  rawConfidence?: number | null;
  judgementReliability?: number | null;
  similarSampleCount?: number | null;
  positiveSimilarOutcomes?: number | null;
  negativeSimilarOutcomes?: number | null;
  neutralSimilarOutcomes?: number | null;
  outcomeStability?: number | null;
  overfitRisk?: number | null;
  beliefFragility?: number | null;
  evidenceAgreement?: number | null;
  dataReliability?: number | null;
  blockedAgencyActionCount?: number | null;
  discoveryConfidence?: number | null;
  discoveryMaturity?: number | null;
  novelty?: number | null;
  currentSizingMode?: string | null;
  currentMaxExposure?: number | null;
  targetNormalExposure?: number | null;
  thresholds?: Partial<RecoveryThresholds>;
};

export type RecoveryResult = {
  module: "signal.recovery";
  name: "Signal Recovery";
  status: RecoveryStatus;
  mode: RecoveryMode;
  recoveryScore: number;
  trustedCapacity: number;
  confidenceCapLift: number;
  recommendedExposureCap: number;
  canRestoreSizing: boolean;
  shouldEscalateHumanReview: boolean;
  reasons: string[];
  blockers: string[];
  unlockConditions: string[];
  invalidationConditions: string[];
  audit: {
    thresholds: RecoveryThresholds;
    normalized: {
      survivalConfidence: number;
      scarPressure: number;
      nearRuinPressure: number;
      currentStateSimilarity: number;
      trustScore: number;
      confidenceCap: number;
      calibratedConfidence: number;
      rawConfidence: number;
      judgementReliability: number;
      outcomeStability: number;
      overfitRisk: number;
      beliefFragility: number;
      evidenceAgreement: number;
      dataReliability: number;
      blockedAgencyActionCount: number;
      discoveryConfidence: number;
      discoveryMaturity: number;
      novelty: number;
      currentMaxExposure: number;
      targetNormalExposure: number;
    };
    positiveOutcomeRatio: number;
    sampleConfidence: number;
    evidenceLift: number;
    trustLift: number;
    discoveryLift: number;
    damagePenalty: number;
    riskPenalty: number;
    agencyPenalty: number;
    noveltyPenalty: number;
    recoveryScoreBeforeClamp: number;
    currentCapacityRatio: number;
    formulas: string[];
  };
};

export const DEFAULT_RECOVERY_THRESHOLDS: RecoveryThresholds = {
  minSurvivalConfidenceForRecovery: 45,
  minSurvivalConfidenceForRestore: 70,
  minTrustScoreForRestore: 70,
  minCalibratedConfidenceForRestore: 65,
  minRecoveryScoreForRecovery: 45,
  minRecoveryScoreForGraduated: 62,
  minRecoveryScoreForRestore: 76,
  minDataReliability: 70,
  maxOverfitRisk: 35,
  regressedOverfitRisk: 50,
  maxBeliefFragilityForRestore: 35,
  minEvidenceAgreementForRestore: 65,
  minDiscoveryConfidenceForRestore: 50,
  minDiscoveryMaturityForRestore: 50,
  minJudgementReliabilityForRestore: 70,
  minOutcomeStabilityForRestore: 65,
  minSimilarSamplesForRestore: 100,
  minPositiveOutcomeRatioForRestore: 0.65,
  maxConfidenceCapLift: 15,
  agencyReviewBlocksRestore: true,
};

export function evaluateRecovery(input: RecoveryInput = {}): RecoveryResult {
  const thresholds = { ...DEFAULT_RECOVERY_THRESHOLDS, ...(input.thresholds ?? {}) };
  const survivalConfidence = score(input.survivalConfidence, 0);
  const scarPressure = countPressure(input.scarCount, 100);
  const nearRuinPressure = countPressure(input.nearRuinCount, 50);
  const currentStateSimilarity = score(input.currentStateSimilarity, 0);
  const trustScore = score(input.trustScore, 50);
  const confidenceCap = score(input.confidenceCap, trustScore);
  const calibratedConfidence = score(input.calibratedConfidence, confidenceCap);
  const rawConfidence = score(input.rawConfidence, calibratedConfidence);
  const judgementReliability = score(input.judgementReliability, 50);
  const outcomeStability = score(input.outcomeStability, judgementReliability);
  const overfitRisk = score(input.overfitRisk, 100);
  const beliefFragility = score(input.beliefFragility, 50);
  const evidenceAgreement = score(input.evidenceAgreement, 50);
  const dataReliability = score(input.dataReliability, 0);
  const blockedAgencyActionCount = Math.max(0, Math.round(number(input.blockedAgencyActionCount, 0)));
  const discoveryConfidence = score(input.discoveryConfidence, 0);
  const discoveryMaturity = score(input.discoveryMaturity, 0);
  const novelty = score(input.novelty, 50);
  const currentMaxExposure = percent(input.currentMaxExposure, percent(input.recoveryExposureCap, 0));
  const targetNormalExposure = Math.max(
    0,
    percent(input.targetNormalExposure, Math.max(currentMaxExposure, percent(input.recoveryExposureCap, currentMaxExposure))),
  );
  const currentCapacityRatio = targetNormalExposure > 0 ? clamp(currentMaxExposure / targetNormalExposure * 100) : 0;
  const sampleCount = Math.max(0, Math.round(number(input.similarSampleCount, 0)));
  const positiveOutcomes = Math.max(0, Math.round(number(input.positiveSimilarOutcomes, 0)));
  const negativeOutcomes = Math.max(0, Math.round(number(input.negativeSimilarOutcomes, 0)));
  const neutralOutcomes = Math.max(0, Math.round(number(input.neutralSimilarOutcomes, 0)));
  const outcomeCount = positiveOutcomes + negativeOutcomes + neutralOutcomes;
  const positiveOutcomeRatio = outcomeCount > 0 ? positiveOutcomes / outcomeCount : 0;
  const sampleConfidence = clamp(sampleCount / Math.max(1, thresholds.minSimilarSamplesForRestore) * 100);
  const evidenceLift = round(
    Math.max(0, judgementReliability - 60) * 0.16 +
      Math.max(0, outcomeStability - 60) * 0.16 +
      Math.max(0, evidenceAgreement - 60) * 0.12 +
      Math.max(0, positiveOutcomeRatio * 100 - 55) * 0.25 +
      Math.max(0, sampleConfidence - 50) * 0.08,
  );
  const trustLift = round(
    Math.max(0, trustScore - 60) * 0.1 +
      Math.max(0, confidenceCap - 60) * 0.08 +
      Math.max(0, calibratedConfidence - 60) * 0.08 +
      Math.max(0, rawConfidence - calibratedConfidence) * 0.03 +
      Math.max(0, dataReliability - 80) * 0.12,
  );
  const discoveryLift = round(
    Math.max(0, discoveryConfidence - 45) * 0.07 +
      Math.max(0, discoveryMaturity - 45) * 0.07,
  );
  const damagePenalty = round(
    scarPressure * 0.05 +
      nearRuinPressure * 0.07 +
      currentStateSimilarity * 0.06,
  );
  const riskPenalty = round(
    overfitRisk * 0.2 +
      beliefFragility * 0.1 +
      Math.max(0, thresholds.minDataReliability - dataReliability) * 0.35,
  );
  const agencyPenalty = round(Math.min(blockedAgencyActionCount, 6) * 1.5);
  const noveltyPenalty = round(
    Math.max(0, novelty - 50) * 0.03 +
      Math.max(0, 50 - discoveryMaturity) * 0.1 +
      Math.max(0, 50 - discoveryConfidence) * 0.08,
  );
  const recoveryScoreBeforeClamp = round(
    survivalConfidence +
      evidenceLift +
      trustLift +
      discoveryLift -
      damagePenalty -
      riskPenalty -
      agencyPenalty -
      noveltyPenalty,
  );
  const recoveryScore = round(clamp(recoveryScoreBeforeClamp));
  const blockers = blockersFor({
    thresholds,
    survivalConfidence,
    dataReliability,
    overfitRisk,
    blockedAgencyActionCount,
    recoveryScore,
    trustScore,
    calibratedConfidence,
    beliefFragility,
    evidenceAgreement,
    judgementReliability,
    outcomeStability,
    sampleCount,
    positiveOutcomeRatio,
    discoveryConfidence,
    discoveryMaturity,
  });
  const shouldEscalateHumanReview = thresholds.agencyReviewBlocksRestore && blockedAgencyActionCount > 0;
  const status = statusFor({
    thresholds,
    survivalConfidence,
    dataReliability,
    overfitRisk,
    recoveryScore,
    canRestoreEvidence: restoreEvidencePasses({
      thresholds,
      survivalConfidence,
      trustScore,
      calibratedConfidence,
      beliefFragility,
      evidenceAgreement,
      judgementReliability,
      outcomeStability,
      sampleCount,
      positiveOutcomeRatio,
      discoveryConfidence,
      discoveryMaturity,
    }),
    shouldEscalateHumanReview,
  });
  const mode = modeFor(status, recoveryScore, thresholds);
  const trustedCapacity = trustedCapacityFor({
    status,
    mode,
    recoveryScore,
    survivalConfidence,
    currentCapacityRatio,
    thresholds,
  });
  const recommendedExposureCap = recommendedExposureCapFor({
    status,
    currentMaxExposure,
    targetNormalExposure,
    trustedCapacity,
  });
  const confidenceCapLift = confidenceCapLiftFor({
    status,
    recoveryScore,
    confidenceCap,
    currentCapacityRatio,
    trustedCapacity,
    thresholds,
  });
  const canRestoreSizing = status === "restored" && !shouldEscalateHumanReview;

  return {
    module: "signal.recovery",
    name: "Signal Recovery",
    status,
    mode,
    recoveryScore,
    trustedCapacity,
    confidenceCapLift,
    recommendedExposureCap,
    canRestoreSizing,
    shouldEscalateHumanReview,
    reasons: reasonsFor(status, mode, recoveryScore, confidenceCapLift, recommendedExposureCap, shouldEscalateHumanReview),
    blockers,
    unlockConditions: unlockConditionsFor(blockers, thresholds),
    invalidationConditions: invalidationConditionsFor(status),
    audit: {
      thresholds,
      normalized: {
        survivalConfidence,
        scarPressure,
        nearRuinPressure,
        currentStateSimilarity,
        trustScore,
        confidenceCap,
        calibratedConfidence,
        rawConfidence,
        judgementReliability,
        outcomeStability,
        overfitRisk,
        beliefFragility,
        evidenceAgreement,
        dataReliability,
        blockedAgencyActionCount,
        discoveryConfidence,
        discoveryMaturity,
        novelty,
        currentMaxExposure,
        targetNormalExposure,
      },
      positiveOutcomeRatio: roundRatio(positiveOutcomeRatio),
      sampleConfidence: round(sampleConfidence),
      evidenceLift,
      trustLift,
      discoveryLift,
      damagePenalty,
      riskPenalty,
      agencyPenalty,
      noveltyPenalty,
      recoveryScoreBeforeClamp,
      currentCapacityRatio: round(currentCapacityRatio),
      formulas: [
        "recoveryScore starts from survival confidence, then adds evidence, trust, and discovery lift",
        "damage, overfit, fragility, blocked agency actions, novelty, and immature discovery reduce recoveryScore",
        "trustedCapacity converts recoveryScore into a gradual capacity percentage while survival confidence is below restoration threshold",
        "recovery can recommend cap lift, but final execution must still pass external sizing, agency, resolve, and risk gates",
      ],
    },
  };
}

function statusFor(input: {
  thresholds: RecoveryThresholds;
  survivalConfidence: number;
  dataReliability: number;
  overfitRisk: number;
  recoveryScore: number;
  canRestoreEvidence: boolean;
  shouldEscalateHumanReview: boolean;
}): RecoveryStatus {
  if (input.dataReliability < input.thresholds.minDataReliability) return "locked";
  if (input.overfitRisk >= input.thresholds.regressedOverfitRisk) return "regressed";
  if (input.overfitRisk > input.thresholds.maxOverfitRisk) return "locked";
  if (input.survivalConfidence < input.thresholds.minSurvivalConfidenceForRecovery) return "locked";
  if (
    input.canRestoreEvidence &&
    input.recoveryScore >= input.thresholds.minRecoveryScoreForRestore &&
    !input.shouldEscalateHumanReview
  ) {
    return "restored";
  }
  if (input.recoveryScore >= input.thresholds.minRecoveryScoreForRecovery) return "recovering";
  return "locked";
}

function restoreEvidencePasses(input: {
  thresholds: RecoveryThresholds;
  survivalConfidence: number;
  trustScore: number;
  calibratedConfidence: number;
  beliefFragility: number;
  evidenceAgreement: number;
  judgementReliability: number;
  outcomeStability: number;
  sampleCount: number;
  positiveOutcomeRatio: number;
  discoveryConfidence: number;
  discoveryMaturity: number;
}) {
  return (
    input.survivalConfidence >= input.thresholds.minSurvivalConfidenceForRestore &&
    input.trustScore >= input.thresholds.minTrustScoreForRestore &&
    input.calibratedConfidence >= input.thresholds.minCalibratedConfidenceForRestore &&
    input.beliefFragility <= input.thresholds.maxBeliefFragilityForRestore &&
    input.evidenceAgreement >= input.thresholds.minEvidenceAgreementForRestore &&
    input.judgementReliability >= input.thresholds.minJudgementReliabilityForRestore &&
    input.outcomeStability >= input.thresholds.minOutcomeStabilityForRestore &&
    input.sampleCount >= input.thresholds.minSimilarSamplesForRestore &&
    input.positiveOutcomeRatio >= input.thresholds.minPositiveOutcomeRatioForRestore &&
    input.discoveryConfidence >= input.thresholds.minDiscoveryConfidenceForRestore &&
    input.discoveryMaturity >= input.thresholds.minDiscoveryMaturityForRestore
  );
}

function modeFor(status: RecoveryStatus, recoveryScore: number, thresholds: RecoveryThresholds): RecoveryMode {
  if (status === "restored") return "normal";
  if (status === "recovering") {
    return recoveryScore >= thresholds.minRecoveryScoreForGraduated ? "graduated" : "reduced-size";
  }
  return "observe";
}

function trustedCapacityFor(input: {
  status: RecoveryStatus;
  mode: RecoveryMode;
  recoveryScore: number;
  survivalConfidence: number;
  currentCapacityRatio: number;
  thresholds: RecoveryThresholds;
}) {
  if (input.status === "restored") return 100;
  if (input.status !== "recovering") return 0;

  const modeCap = input.mode === "graduated" ? 70 : 40;
  const survivalCap = input.survivalConfidence >= input.thresholds.minSurvivalConfidenceForRestore
    ? 85
    : clamp(input.survivalConfidence - 30, 0, 65);
  const evidenceCapacity = (input.recoveryScore - input.thresholds.minRecoveryScoreForRecovery) * 1.25 + input.currentCapacityRatio * 0.25 + 25;

  return round(clamp(Math.min(evidenceCapacity, modeCap, survivalCap)));
}

function recommendedExposureCapFor(input: {
  status: RecoveryStatus;
  currentMaxExposure: number;
  targetNormalExposure: number;
  trustedCapacity: number;
}) {
  if (input.status === "locked" || input.status === "regressed") return 0;
  if (input.status === "restored") return round(input.targetNormalExposure);
  const capacityCap = input.targetNormalExposure * input.trustedCapacity / 100;
  return round(Math.min(input.targetNormalExposure, Math.max(input.currentMaxExposure, capacityCap)));
}

function confidenceCapLiftFor(input: {
  status: RecoveryStatus;
  recoveryScore: number;
  confidenceCap: number;
  currentCapacityRatio: number;
  trustedCapacity: number;
  thresholds: RecoveryThresholds;
}) {
  if (input.status === "locked" || input.status === "regressed") return 0;
  const scoreLift = Math.max(0, input.recoveryScore - input.confidenceCap) * 0.45;
  const capacityLift = Math.max(0, input.trustedCapacity - input.currentCapacityRatio) * 0.08;
  return round(clamp(scoreLift + capacityLift, 0, input.thresholds.maxConfidenceCapLift));
}

function blockersFor(input: {
  thresholds: RecoveryThresholds;
  survivalConfidence: number;
  dataReliability: number;
  overfitRisk: number;
  blockedAgencyActionCount: number;
  recoveryScore: number;
  trustScore: number;
  calibratedConfidence: number;
  beliefFragility: number;
  evidenceAgreement: number;
  judgementReliability: number;
  outcomeStability: number;
  sampleCount: number;
  positiveOutcomeRatio: number;
  discoveryConfidence: number;
  discoveryMaturity: number;
}) {
  const blockers: string[] = [];
  if (input.dataReliability < input.thresholds.minDataReliability) blockers.push("Data reliability is below the recovery threshold.");
  if (input.overfitRisk > input.thresholds.maxOverfitRisk) blockers.push("Overfit risk is above the recovery threshold.");
  if (input.survivalConfidence < input.thresholds.minSurvivalConfidenceForRecovery) blockers.push("Survival confidence is too low to start recovery.");
  if (input.survivalConfidence < input.thresholds.minSurvivalConfidenceForRestore) blockers.push("Survival confidence has not cleared the normal-sizing threshold.");
  if (input.trustScore < input.thresholds.minTrustScoreForRestore) blockers.push("Trust score has not cleared the restoration threshold.");
  if (input.calibratedConfidence < input.thresholds.minCalibratedConfidenceForRestore) blockers.push("Calibrated confidence has not cleared the restoration threshold.");
  if (input.blockedAgencyActionCount > 0 && input.thresholds.agencyReviewBlocksRestore) blockers.push("Blocked agency actions require human review before restoration.");
  if (input.beliefFragility > input.thresholds.maxBeliefFragilityForRestore) blockers.push("Belief fragility is too high for normal sizing.");
  if (input.evidenceAgreement < input.thresholds.minEvidenceAgreementForRestore) blockers.push("Evidence agreement is not strong enough for restoration.");
  if (input.judgementReliability < input.thresholds.minJudgementReliabilityForRestore) blockers.push("Judgement reliability is below restoration threshold.");
  if (input.outcomeStability < input.thresholds.minOutcomeStabilityForRestore) blockers.push("Outcome stability is below restoration threshold.");
  if (input.sampleCount < input.thresholds.minSimilarSamplesForRestore) blockers.push("Similar outcome sample count is too small for restoration.");
  if (input.positiveOutcomeRatio < input.thresholds.minPositiveOutcomeRatioForRestore) blockers.push("Positive similar-outcome ratio is below restoration threshold.");
  if (input.discoveryConfidence < input.thresholds.minDiscoveryConfidenceForRestore) blockers.push("Discovery confidence has not matured enough for normal sizing.");
  if (input.discoveryMaturity < input.thresholds.minDiscoveryMaturityForRestore) blockers.push("Discovery maturity has not cleared the restoration threshold.");
  if (input.recoveryScore < input.thresholds.minRecoveryScoreForRecovery && !blockers.length) blockers.push("Recovery score is still below the recovery threshold.");
  return unique(blockers);
}

function unlockConditionsFor(blockers: string[], thresholds: RecoveryThresholds) {
  if (!blockers.length) return [];
  const unlocks: string[] = [];
  if (blockers.some((item) => item.includes("Data reliability"))) unlocks.push(`Restore data reliability to at least ${thresholds.minDataReliability}/100.`);
  if (blockers.some((item) => item.includes("Overfit"))) unlocks.push(`Reduce overfit risk to ${thresholds.maxOverfitRisk}/100 or lower.`);
  if (blockers.some((item) => item.includes("Survival confidence"))) unlocks.push(`Raise survival confidence to at least ${thresholds.minSurvivalConfidenceForRestore}/100 for normal sizing.`);
  if (blockers.some((item) => item.includes("Trust score"))) unlocks.push(`Raise trust score to at least ${thresholds.minTrustScoreForRestore}/100.`);
  if (blockers.some((item) => item.includes("Calibrated confidence"))) unlocks.push(`Raise calibrated confidence to at least ${thresholds.minCalibratedConfidenceForRestore}/100.`);
  if (blockers.some((item) => item.includes("agency"))) unlocks.push("Clear blocked agency actions or complete human review.");
  if (blockers.some((item) => item.includes("Discovery"))) unlocks.push("Let discovery confidence and maturity improve before restoring normal sizing.");
  if (!unlocks.length) unlocks.push("Keep collecting stable positive outcomes until recovery score improves.");
  return unique(unlocks);
}

function invalidationConditionsFor(status: RecoveryStatus) {
  const base = [
    "Invalidate recovery if overfit risk rises above the configured threshold.",
    "Invalidate recovery if data reliability falls below the configured threshold.",
    "Invalidate recovery if similar states repeat near-ruin survival costs.",
  ];
  if (status === "restored") return [...base, "Invalidate restoration if blocked agency actions reappear."];
  if (status === "recovering") return base;
  return ["Do not restore sizing while recovery remains locked or regressed."];
}

function reasonsFor(
  status: RecoveryStatus,
  mode: RecoveryMode,
  recoveryScore: number,
  confidenceCapLift: number,
  recommendedExposureCap: number,
  shouldEscalateHumanReview: boolean,
) {
  const reasons = [
    `Recovery is ${status} with ${mode} mode and score ${Math.round(recoveryScore)}/100.`,
  ];

  if (status === "recovering") {
    reasons.push(`Recovered evidence supports a gradual exposure cap near ${recommendedExposureCap.toFixed(2)}%.`);
  }
  if (status === "restored") {
    reasons.push("Recovery evidence supports normal sizing subject to downstream gates.");
  }
  if (confidenceCapLift > 0) {
    reasons.push(`Recovery can lift the trusted confidence cap by ${confidenceCapLift.toFixed(1)} points before downstream gates.`);
  }
  if (shouldEscalateHumanReview) {
    reasons.push("Blocked agency actions remain; human review is required before restoration.");
  }

  return reasons;
}

function countPressure(value: unknown, scale: number) {
  const count = Math.max(0, number(value, 0));
  if (count === 0) return 0;
  return clamp(Math.log1p(count) / Math.log1p(scale) * 100);
}

function score(value: unknown, fallback: number) {
  return clamp(number(value, fallback));
}

function percent(value: unknown, fallback: number) {
  return clamp(number(value, fallback), 0, 100);
}

function number(value: unknown, fallback: number) {
  if (value == null || value === "") return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

/* c8 ignore next 3 */
function unique(values: string[]) {
  return Array.from(new Set(values));
}
