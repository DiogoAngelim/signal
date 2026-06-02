import { clamp, mean } from "../math/statistics";

export type SignalEvidenceAction =
  | "proceed"
  | "proceed_carefully"
  | "observe"
  | "wait"
  | "reduce"
  | "unknown"
  | "insufficient_evidence";

export type SignalEvidenceDirection = "supporting" | "contradicting";

export type EvidenceItem = {
  id: string;
  label: string;
  summary: string;
  direction?: SignalEvidenceDirection;
  strength?: number;
  confidence?: number;
  source?: string;
  observedAt?: string;
  diversityGroup?: string;
  invalidates?: boolean;
  metadata?: Record<string, unknown>;
};

export type OutcomeResult = "right" | "partially_right" | "wrong" | "unknown";

export type SignalOutcomeReview = {
  reviewId: string;
  decisionId?: string;
  reviewedAt?: string;
  outcomeResult: OutcomeResult;
  confidenceAtDecision?: number;
  lesson?: string;
  lessonSurvived?: boolean;
  lessonWeakened?: boolean;
  lessonFailed?: boolean;
  whatChanged?: string;
  metadata?: Record<string, unknown>;
};

export type SignalCalibrationBucket = {
  confidenceBucket: string;
  reviewedCount: number;
  successCount: number;
  partialSuccessCount: number;
  failureCount: number;
  observedSuccessRate: number;
  calibrationGap: number;
};

export interface SignalEvidence {
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];

  assumptions: string[];
  unknowns: string[];

  evidenceStrength: number;
  evidenceFreshness: number;
  evidenceDiversity: number;
  evidenceAgreement: number;
  evidenceStability: number;

  calibration: number;

  confidence: number;
  confidenceLimit: number;

  outcomeReviewCount: number;

  lessonSurvivalCount: number;
  lessonFailureCount: number;

  evidenceAgeDays: number;

  invalidationConditions: string[];

  lastReviewedAt?: string;
}

export type SignalGovernanceMetricLabel = "weak" | "developing" | "healthy" | "strong";

export type SignalGovernanceMetric = {
  score: number;
  label: SignalGovernanceMetricLabel;
  supportingFactors: string[];
  weakeningFactors: string[];
  confidence: number;
  explanation: string;
  improvements: string[];
};

export type SignalGovernanceBars = {
  optionality: SignalGovernanceMetric;
  threatReduction: SignalGovernanceMetric;
  lessonSurvival: SignalGovernanceMetric;
  evidenceQuality: SignalGovernanceMetric;
  decisionQuality: SignalGovernanceMetric;
};

export type SignalEvidenceNarrative = {
  whatWeKnow: string[];
  whatWeDoNotKnow: string[];
  whatSupportsThis: string[];
  whatWeakensThis: string[];
  whatChangedSinceLastReview: string[];
  whyThisMatters: string;
  whatCouldChangeThis: string[];
  nextReasonableStep: string;
};

export type SignalEvidenceAssessment = {
  evidence: SignalEvidence;
  action: SignalEvidenceAction;
  calibrationBuckets: SignalCalibrationBucket[];
  governance: SignalGovernanceBars;
  narrative: SignalEvidenceNarrative;
  warnings: string[];
};

export type SignalEvidenceInput = {
  supportingEvidence?: EvidenceItem[];
  contradictingEvidence?: EvidenceItem[];
  assumptions?: string[];
  unknowns?: string[];
  evidenceStrength?: number;
  evidenceFreshness?: number;
  evidenceDiversity?: number;
  evidenceAgreement?: number;
  evidenceStability?: number;
  calibration?: number;
  confidence?: number;
  confidenceLimit?: number;
  outcomeReviews?: SignalOutcomeReview[];
  outcomeReviewCount?: number;
  lessonSurvivalCount?: number;
  lessonFailureCount?: number;
  evidenceAgeDays?: number;
  invalidationConditions?: string[];
  lastReviewedAt?: string;
  now?: string | number | Date;
  maxEvidenceAgeDays?: number;
};

type ReviewSummary = {
  reviewed: SignalOutcomeReview[];
  outcomeReviewCount: number;
  lessonSurvivalCount: number;
  lessonFailureCount: number;
  lastReviewedAt?: string;
  changes: string[];
};

const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export function evaluateSignalEvidence(input: SignalEvidenceInput = {}): SignalEvidenceAssessment {
  const evidence = buildSignalEvidence(input);
  const action = selectEvidenceAction(evidence);
  const calibrationBuckets = buildCalibrationBuckets(input.outcomeReviews ?? []);
  const governance = evaluateSignalGovernance(evidence, action);
  const narrative = buildEvidenceNarrative(evidence, action, input.outcomeReviews ?? []);
  const warnings = evidenceWarnings(evidence, action);

  return {
    evidence,
    action,
    calibrationBuckets,
    governance,
    narrative,
    warnings,
  };
}

export function buildSignalEvidence(input: SignalEvidenceInput = {}): SignalEvidence {
  const supportingEvidence = normalizeEvidence(input.supportingEvidence ?? [], "supporting");
  const contradictingEvidence = normalizeEvidence(input.contradictingEvidence ?? [], "contradicting");
  const assumptions = uniqueStrings(input.assumptions ?? []);
  const unknowns = uniqueStrings(input.unknowns ?? []);
  const invalidationConditions = uniqueStrings(input.invalidationConditions ?? []);
  const allEvidence = [...supportingEvidence, ...contradictingEvidence];
  const nowMs = timestampMs(input.now) ?? Date.now();
  const maxEvidenceAgeDays = Math.max(1, numeric(input.maxEvidenceAgeDays, DEFAULT_MAX_EVIDENCE_AGE_DAYS));
  const reviewSummary = summarizeOutcomeReviews(input.outcomeReviews ?? []);
  const evidenceAgeDays = roundScore(
    input.evidenceAgeDays ??
      evidenceAgeDaysFrom(allEvidence, nowMs) ??
      (allEvidence.length ? maxEvidenceAgeDays : maxEvidenceAgeDays * 2),
  );
  const evidenceStrength = roundScore(
    input.evidenceStrength ?? deriveEvidenceStrength(supportingEvidence, contradictingEvidence),
  );
  const evidenceFreshness = roundScore(
    input.evidenceFreshness ?? deriveEvidenceFreshness(allEvidence, evidenceAgeDays, maxEvidenceAgeDays),
  );
  const evidenceDiversity = roundScore(
    input.evidenceDiversity ?? deriveEvidenceDiversity(allEvidence),
  );
  const evidenceAgreement = roundScore(
    input.evidenceAgreement ?? deriveEvidenceAgreement(supportingEvidence, contradictingEvidence),
  );
  const evidenceStability = roundScore(
    input.evidenceStability ?? deriveEvidenceStability(reviewSummary, allEvidence),
  );
  const calibration = roundScore(
    input.calibration ?? deriveCalibration(input.outcomeReviews ?? []),
  );
  const outcomeReviewCount = Math.max(
    0,
    Math.round(input.outcomeReviewCount ?? reviewSummary.outcomeReviewCount),
  );
  const lessonSurvivalCount = Math.max(
    0,
    Math.round(input.lessonSurvivalCount ?? reviewSummary.lessonSurvivalCount),
  );
  const lessonFailureCount = Math.max(
    0,
    Math.round(input.lessonFailureCount ?? reviewSummary.lessonFailureCount),
  );
  const derivedLimit = deriveConfidenceLimit({
    evidenceStrength,
    evidenceFreshness,
    evidenceDiversity,
    evidenceAgreement,
    evidenceStability,
    calibration,
    outcomeReviewCount,
    supportingEvidence,
    contradictingEvidence,
    assumptions,
    unknowns,
    evidenceAgeDays,
  });
  const confidenceLimit = roundScore(input.confidenceLimit == null ? derivedLimit : Math.min(clamp(input.confidenceLimit), derivedLimit));
  const requestedConfidence = input.confidence ?? mean([
    evidenceStrength,
    evidenceFreshness,
    evidenceDiversity,
    evidenceAgreement,
    evidenceStability,
    calibration,
  ]);
  const confidence = roundScore(Math.min(clamp(requestedConfidence), confidenceLimit));
  const lastReviewedAt = input.lastReviewedAt ?? reviewSummary.lastReviewedAt;

  return {
    supportingEvidence,
    contradictingEvidence,
    assumptions,
    unknowns,
    evidenceStrength,
    evidenceFreshness,
    evidenceDiversity,
    evidenceAgreement,
    evidenceStability,
    calibration,
    confidence,
    confidenceLimit,
    outcomeReviewCount,
    lessonSurvivalCount,
    lessonFailureCount,
    evidenceAgeDays,
    invalidationConditions,
    ...(lastReviewedAt ? { lastReviewedAt } : {}),
  };
}

export function summarizeOutcomeReviews(reviews: SignalOutcomeReview[] = []): ReviewSummary {
  const reviewed = reviews.filter((review) => review.outcomeResult !== "unknown");
  const lessonSurvivalCount = reviewed.filter((review) => review.lessonSurvived === true).length;
  const lessonFailureCount = reviewed.filter((review) => review.lessonFailed === true || review.outcomeResult === "wrong").length;
  const lastReviewedAt = reviewed
    .map((review) => review.reviewedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    reviewed,
    outcomeReviewCount: reviewed.length,
    lessonSurvivalCount,
    lessonFailureCount,
    ...(lastReviewedAt ? { lastReviewedAt } : {}),
    changes: uniqueStrings(reviewed.flatMap((review) => review.whatChanged ? [review.whatChanged] : [])),
  };
}

export function buildCalibrationBuckets(reviews: SignalOutcomeReview[] = []): SignalCalibrationBucket[] {
  const reviewed = reviews.filter(
    (review) => review.outcomeResult !== "unknown" && review.confidenceAtDecision != null,
  );
  return Array.from({ length: 10 }, (_, index) => {
    const min = index * 10;
    const max = index === 9 ? 100 : min + 10;
    const bucket = reviewed.filter((review) => {
      const confidence = clamp(numeric(review.confidenceAtDecision, 0));
      return index === 9 ? confidence >= min && confidence <= max : confidence >= min && confidence < max;
    });
    const successCount = bucket.filter((review) => review.outcomeResult === "right").length;
    const partialSuccessCount = bucket.filter((review) => review.outcomeResult === "partially_right").length;
    const failureCount = bucket.filter((review) => review.outcomeResult === "wrong").length;
    const observedSuccessRate = bucket.length
      ? roundScore(((successCount + partialSuccessCount * 0.5) / bucket.length) * 100)
      : 0;
    const averageConfidence = bucket.length
      ? mean(bucket.map((review) => clamp(numeric(review.confidenceAtDecision, 0))))
      : 0;

    return {
      confidenceBucket: `${min}-${max}`,
      reviewedCount: bucket.length,
      successCount,
      partialSuccessCount,
      failureCount,
      observedSuccessRate,
      calibrationGap: roundSignedScore(averageConfidence - observedSuccessRate),
    };
  });
}

export function deriveCalibration(reviews: SignalOutcomeReview[] = []): number {
  const buckets = buildCalibrationBuckets(reviews).filter((bucket) => bucket.reviewedCount > 0);
  if (!buckets.length) return 45;
  const weightedGap = buckets.reduce(
    (sum, bucket) => sum + Math.abs(bucket.calibrationGap) * bucket.reviewedCount,
    0,
  ) / buckets.reduce((sum, bucket) => sum + bucket.reviewedCount, 0);
  const reviewedCount = buckets.reduce((sum, bucket) => sum + bucket.reviewedCount, 0);
  const sampleCredit = Math.min(12, reviewedCount * 2);
  return roundScore(clamp(100 - weightedGap + sampleCredit));
}

export function evaluateSignalGovernance(
  evidence: SignalEvidence,
  action: SignalEvidenceAction = selectEvidenceAction(evidence),
): SignalGovernanceBars {
  return {
    optionality: scoreOptionality(evidence, action),
    threatReduction: scoreThreatReduction(evidence),
    lessonSurvival: scoreLessonSurvival(evidence),
    evidenceQuality: scoreEvidenceQuality(evidence),
    decisionQuality: scoreDecisionQuality(evidence, action),
  };
}

export function selectEvidenceAction(evidence: SignalEvidence): SignalEvidenceAction {
  const supportingStrength = evidence.supportingEvidence.reduce((sum, item) => sum + scoreOf(item.strength, 50), 0);
  const contradictingStrength = evidence.contradictingEvidence.reduce((sum, item) => sum + scoreOf(item.strength, 50), 0);
  const strongContradiction = evidence.contradictingEvidence.some((item) => scoreOf(item.strength, 50) >= 75 || item.invalidates);

  if (!evidence.supportingEvidence.length && !evidence.contradictingEvidence.length) return "insufficient_evidence";
  if (evidence.evidenceStrength < 20 || evidence.confidenceLimit < 20) return "insufficient_evidence";
  if (evidence.unknowns.length > 0 && evidence.confidenceLimit <= 45) return "unknown";
  if (strongContradiction || contradictingStrength > supportingStrength) return "reduce";
  if (evidence.evidenceFreshness < 35 || evidence.evidenceAgreement < 35) return "wait";
  if (evidence.confidenceLimit < 50 || evidence.calibration < 45 || evidence.outcomeReviewCount === 0) return "observe";
  if (evidence.confidence >= 75 && evidence.confidenceLimit >= 75 && evidence.evidenceAgreement >= 70) return "proceed";
  if (evidence.confidence >= 55 && evidence.confidenceLimit >= 55) return "proceed_carefully";
  return "observe";
}

function scoreOptionality(evidence: SignalEvidence, action: SignalEvidenceAction): SignalGovernanceMetric {
  const uncertaintyVisibility = evidence.unknowns.length > 0 ? 90 : 45;
  const invalidationVisibility = Math.min(100, evidence.invalidationConditions.length * 28);
  const capCompliance = evidence.confidence <= evidence.confidenceLimit ? 100 : 0;
  const actionPreservesChoice = action === "proceed" ? 55 : action === "proceed_carefully" ? 70 : 92;
  const score = roundScore(mean([uncertaintyVisibility, invalidationVisibility, capCompliance, actionPreservesChoice]));
  return governanceMetric({
    score,
    confidence: evidence.confidence,
    supportingFactors: [
      ...(evidence.unknowns.length > 0 ? ["Unknowns are visible before action."] : []),
      ...(evidence.invalidationConditions.length > 0 ? ["Invalidation conditions define when to change course."] : []),
      ...(evidence.confidence <= evidence.confidenceLimit ? ["Confidence remains inside the evidence cap."] : []),
      ...(action !== "proceed" ? ["The next step preserves future choice."] : []),
    ],
    weakeningFactors: [
      ...(evidence.unknowns.length === 0 ? ["No explicit unknowns are listed."] : []),
      ...(evidence.invalidationConditions.length === 0 ? ["No invalidation conditions are listed."] : []),
      ...(action === "proceed" ? ["Proceeding consumes more optionality than observing or waiting."] : []),
    ],
    explanation: `Optionality score averages uncertainty visibility (${pct(uncertaintyVisibility)}), invalidation visibility (${pct(invalidationVisibility)}), cap compliance (${pct(capCompliance)}), and whether the next step preserves choice (${pct(actionPreservesChoice)}).`,
    improvements: [
      ...(evidence.unknowns.length === 0 ? ["Name the most important unknowns."] : []),
      ...(evidence.invalidationConditions.length === 0 ? ["Add concrete invalidation conditions."] : []),
      ...(action === "proceed" ? ["Prefer a smaller or reversible step until reviewed evidence improves."] : []),
    ],
  });
}

function scoreThreatReduction(evidence: SignalEvidence): SignalGovernanceMetric {
  const contradictionVisibility = evidence.contradictingEvidence.length > 0 ? 90 : 55;
  const invalidationVisibility = Math.min(100, evidence.invalidationConditions.length * 25);
  const assumptionPenalty = Math.max(0, 100 - evidence.assumptions.length * 12);
  const threatMonitoring = mean([contradictionVisibility, invalidationVisibility, assumptionPenalty]);
  const score = roundScore(threatMonitoring);
  return governanceMetric({
    score,
    confidence: evidence.confidence,
    supportingFactors: [
      ...(evidence.contradictingEvidence.length > 0 ? ["Contradicting evidence is visible."] : []),
      ...(evidence.invalidationConditions.length > 0 ? ["Threats have monitoring conditions."] : []),
      ...(evidence.assumptions.length > 0 ? ["Assumptions are explicit instead of hidden."] : []),
    ],
    weakeningFactors: [
      ...(evidence.contradictingEvidence.length === 0 ? ["No contradictory evidence is listed, so hidden threats may remain."] : []),
      ...(evidence.invalidationConditions.length === 0 ? ["No trigger says when the conclusion should change."] : []),
      ...(evidence.assumptions.length > 3 ? ["Several assumptions still carry unreviewed risk."] : []),
    ],
    explanation: `Threat reduction score averages contradiction visibility (${pct(contradictionVisibility)}), invalidation visibility (${pct(invalidationVisibility)}), and assumption load (${pct(assumptionPenalty)}).`,
    improvements: [
      ...(evidence.contradictingEvidence.length === 0 ? ["Actively search for disconfirming evidence."] : []),
      ...(evidence.invalidationConditions.length === 0 ? ["Define what would weaken or invalidate this conclusion."] : []),
      ...(evidence.assumptions.length > 0 ? ["Review the assumptions that carry the highest downside."] : []),
    ],
  });
}

function scoreLessonSurvival(evidence: SignalEvidence): SignalGovernanceMetric {
  const reviewDepth = Math.min(100, evidence.outcomeReviewCount * 25);
  const survivalRate = evidence.outcomeReviewCount > 0
    ? clamp((evidence.lessonSurvivalCount / evidence.outcomeReviewCount) * 100)
    : 0;
  const failureDrag = Math.max(0, 100 - evidence.lessonFailureCount * 22);
  const stability = evidence.evidenceStability;
  const score = roundScore(mean([reviewDepth, survivalRate, failureDrag, stability]));
  return governanceMetric({
    score,
    confidence: evidence.confidence,
    supportingFactors: [
      ...(evidence.outcomeReviewCount > 0 ? [`${evidence.outcomeReviewCount} reviewed outcome(s) are available.`] : []),
      ...(evidence.lessonSurvivalCount > 0 ? ["At least one lesson survived review."] : []),
      ...(evidence.lessonFailureCount === 0 ? ["No reviewed lesson has failed yet."] : []),
    ],
    weakeningFactors: [
      ...(evidence.outcomeReviewCount === 0 ? ["No reviewed outcomes support lesson survival."] : []),
      ...(evidence.lessonSurvivalCount === 0 ? ["Similarity does not count as lesson survival without review."] : []),
      ...(evidence.lessonFailureCount > 0 ? ["One or more lessons failed review."] : []),
    ],
    explanation: `Lesson survival score averages review depth (${pct(reviewDepth)}), reviewed survival rate (${pct(survivalRate)}), failure drag (${pct(failureDrag)}), and evidence stability (${pct(stability)}).`,
    improvements: [
      ...(evidence.outcomeReviewCount === 0 ? ["Review actual outcomes before treating lessons as durable."] : []),
      ...(evidence.lessonFailureCount > 0 ? ["Weaken or rewrite failed lessons."] : []),
      ...(evidence.evidenceStability < 65 ? ["Recheck whether the evidence is still stable."] : []),
    ],
  });
}

function scoreEvidenceQuality(evidence: SignalEvidence): SignalGovernanceMetric {
  const contradictionDrag = clamp(100 - evidence.contradictingEvidence.length * 18);
  const reviewCredit = Math.min(100, evidence.outcomeReviewCount * 20);
  const score = roundScore(mean([
    evidence.evidenceStrength,
    evidence.evidenceFreshness,
    evidence.evidenceDiversity,
    evidence.evidenceAgreement,
    evidence.calibration,
    contradictionDrag,
    reviewCredit,
  ]));
  return governanceMetric({
    score,
    confidence: evidence.confidence,
    supportingFactors: [
      ...(evidence.evidenceFreshness >= 70 ? ["Evidence is fresh."] : []),
      ...(evidence.evidenceDiversity >= 70 ? ["Evidence comes from diverse sources."] : []),
      ...(evidence.calibration >= 70 ? ["Calibration is healthy."] : []),
      ...(evidence.outcomeReviewCount > 0 ? ["Reviewed outcomes support the evidence base."] : []),
    ],
    weakeningFactors: [
      ...(evidence.evidenceFreshness < 50 ? ["Evidence is stale or undated."] : []),
      ...(evidence.evidenceDiversity < 50 ? ["Evidence is narrow."] : []),
      ...(evidence.contradictingEvidence.length > 0 ? ["Contradictory evidence lowers quality."] : []),
      ...(evidence.outcomeReviewCount === 0 ? ["Evidence lacks reviewed outcomes."] : []),
    ],
    explanation: `Evidence quality score averages strength (${pct(evidence.evidenceStrength)}), freshness (${pct(evidence.evidenceFreshness)}), diversity (${pct(evidence.evidenceDiversity)}), agreement (${pct(evidence.evidenceAgreement)}), calibration (${pct(evidence.calibration)}), contradiction drag (${pct(contradictionDrag)}), and review credit (${pct(reviewCredit)}).`,
    improvements: [
      ...(evidence.evidenceFreshness < 70 ? ["Refresh the oldest evidence."] : []),
      ...(evidence.evidenceDiversity < 70 ? ["Add independent evidence sources."] : []),
      ...(evidence.outcomeReviewCount === 0 ? ["Run outcome reviews for prior decisions."] : []),
      ...(evidence.contradictingEvidence.length > 0 ? ["Resolve or monitor the strongest contradictions."] : []),
    ],
  });
}

function scoreDecisionQuality(evidence: SignalEvidence, action: SignalEvidenceAction): SignalGovernanceMetric {
  const capCompliance = evidence.confidence <= evidence.confidenceLimit ? 100 : 0;
  const uncertaintyVisible = evidence.unknowns.length > 0 || action === "unknown" || action === "insufficient_evidence" ? 90 : 45;
  const actionFit = actionFitScore(evidence, action);
  const evidenceSupport = mean([evidence.evidenceStrength, evidence.evidenceAgreement, evidence.calibration]);
  const score = roundScore(mean([capCompliance, uncertaintyVisible, actionFit, evidenceSupport]));
  return governanceMetric({
    score,
    confidence: evidence.confidence,
    supportingFactors: [
      ...(capCompliance === 100 ? ["Confidence is capped by evidence."] : []),
      ...(uncertaintyVisible >= 80 ? ["Uncertainty is visible in the next step."] : []),
      ...(actionFit >= 75 ? ["The next step matches the evidence strength."] : []),
    ],
    weakeningFactors: [
      ...(evidence.confidenceLimit < 50 ? ["Evidence does not justify a strong action."] : []),
      ...(actionFit < 60 ? ["The next step is stronger than the evidence supports."] : []),
      ...(evidence.unknowns.length === 0 ? ["Unknowns are not explicit."] : []),
    ],
    explanation: `Decision quality score averages cap compliance (${pct(capCompliance)}), uncertainty visibility (${pct(uncertaintyVisible)}), next-step fit (${pct(actionFit)}), and evidence support (${pct(evidenceSupport)}).`,
    improvements: [
      ...(evidence.confidenceLimit < 50 ? ["Use observe, wait, reduce, unknown, or insufficient_evidence until evidence improves."] : []),
      ...(evidence.unknowns.length === 0 ? ["Name the unknowns the decision depends on."] : []),
      ...(evidence.calibration < 65 ? ["Improve calibration with reviewed outcomes."] : []),
    ],
  });
}

function governanceMetric(input: {
  score: number;
  confidence: number;
  supportingFactors: string[];
  weakeningFactors: string[];
  explanation: string;
  improvements: string[];
}): SignalGovernanceMetric {
  const score = roundScore(input.score);
  return {
    score,
    label: governanceLabel(score),
    supportingFactors: uniqueStrings(input.supportingFactors),
    weakeningFactors: uniqueStrings(input.weakeningFactors),
    confidence: roundScore(Math.min(clamp(input.confidence), score)),
    explanation: input.explanation,
    improvements: uniqueStrings(input.improvements),
  };
}

function buildEvidenceNarrative(
  evidence: SignalEvidence,
  action: SignalEvidenceAction,
  reviews: SignalOutcomeReview[],
): SignalEvidenceNarrative {
  const reviewSummary = summarizeOutcomeReviews(reviews);
  return {
    whatWeKnow: evidence.supportingEvidence.length
      ? evidence.supportingEvidence.map((item) => item.summary)
      : ["The evidence is not strong enough to treat the conclusion as known."],
    whatWeDoNotKnow: evidence.unknowns.length
      ? evidence.unknowns
      : ["No explicit unknowns were supplied, which should be treated as a gap."],
    whatSupportsThis: evidence.supportingEvidence.map((item) => item.label),
    whatWeakensThis: [
      ...evidence.contradictingEvidence.map((item) => item.summary),
      ...evidence.assumptions.map((assumption) => `Assumption: ${assumption}`),
    ],
    whatChangedSinceLastReview: reviewSummary.changes.length
      ? reviewSummary.changes
      : ["No reviewed outcome has changed the lesson yet."],
    whyThisMatters: `Confidence is capped at ${pct(evidence.confidenceLimit)} because Signal should not be more certain than the evidence supports.`,
    whatCouldChangeThis: evidence.invalidationConditions.length
      ? evidence.invalidationConditions
      : ["New contradictory evidence, stale evidence, or poor outcome reviews would lower confidence."],
    nextReasonableStep: nextStepText(action),
  };
}

function evidenceWarnings(evidence: SignalEvidence, action: SignalEvidenceAction) {
  const warnings: string[] = [];
  if (evidence.confidence >= evidence.confidenceLimit) warnings.push("confidence capped by evidence");
  if (evidence.contradictingEvidence.length > 0) warnings.push("contradictions visible");
  if (evidence.calibration < 50) warnings.push("calibration limits confidence");
  if (evidence.outcomeReviewCount === 0) warnings.push("no reviewed outcomes");
  if (action === "unknown" || action === "insufficient_evidence") warnings.push("unknown is a valid state");
  return warnings;
}

function deriveConfidenceLimit(input: {
  evidenceStrength: number;
  evidenceFreshness: number;
  evidenceDiversity: number;
  evidenceAgreement: number;
  evidenceStability: number;
  calibration: number;
  outcomeReviewCount: number;
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  assumptions: string[];
  unknowns: string[];
  evidenceAgeDays: number;
}) {
  const reviewCredit = Math.min(100, input.outcomeReviewCount * 20);
  const base = input.evidenceStrength * 0.22 +
    input.evidenceFreshness * 0.18 +
    input.evidenceDiversity * 0.14 +
    input.evidenceAgreement * 0.16 +
    input.evidenceStability * 0.12 +
    input.calibration * 0.12 +
    reviewCredit * 0.06;
  const contradictionPressure = input.contradictingEvidence.reduce((sum, item) => sum + scoreOf(item.strength, 50), 0);
  const supportPressure = input.supportingEvidence.reduce((sum, item) => sum + scoreOf(item.strength, 50), 0);
  const contradictionPenalty = supportPressure + contradictionPressure > 0
    ? (contradictionPressure / (supportPressure + contradictionPressure)) * 35
    : 0;
  const unknownPenalty = Math.min(18, input.unknowns.length * 4 + input.assumptions.length * 2);
  const reviewPenalty = input.outcomeReviewCount > 0 ? 0 : 8;
  let limit = clamp(base - contradictionPenalty - unknownPenalty - reviewPenalty);

  if (!input.supportingEvidence.length) limit = Math.min(limit, 25);
  if (input.contradictingEvidence.some((item) => item.invalidates)) limit = Math.min(limit, 30);
  if (contradictionPressure > supportPressure) limit = Math.min(limit, 45);
  if (input.calibration < 50) limit = Math.min(limit, input.calibration + 15);
  if (input.evidenceFreshness < 35 || input.evidenceAgeDays > DEFAULT_MAX_EVIDENCE_AGE_DAYS * 1.5) limit = Math.min(limit, 45);
  if (input.evidenceDiversity < 35) limit = Math.min(limit, 55);
  return limit;
}

function deriveEvidenceStrength(supporting: EvidenceItem[], contradicting: EvidenceItem[]) {
  if (!supporting.length) return 0;
  const support = mean(supporting.map((item) => scoreOf(item.strength, item.confidence ?? 50)));
  const contradictionDrag = Math.min(45, mean(contradicting.map((item) => scoreOf(item.strength, 0))) * 0.45);
  return clamp(support - contradictionDrag);
}

function deriveEvidenceFreshness(evidence: EvidenceItem[], evidenceAgeDays: number, maxEvidenceAgeDays: number) {
  if (!evidence.length) return 0;
  const explicit = evidence
    .map((item) => item.observedAt)
    .filter(Boolean);
  if (!explicit.length) return 45;
  return clamp(100 - (evidenceAgeDays / maxEvidenceAgeDays) * 100);
}

function deriveEvidenceDiversity(evidence: EvidenceItem[]) {
  if (!evidence.length) return 0;
  const groups = new Set(evidence.map((item) => item.diversityGroup ?? item.source ?? item.id));
  const desiredGroups = Math.min(4, Math.max(1, evidence.length));
  return clamp((groups.size / desiredGroups) * 100);
}

function deriveEvidenceAgreement(supporting: EvidenceItem[], contradicting: EvidenceItem[]) {
  const support = supporting.reduce((sum, item) => sum + scoreOf(item.strength, item.confidence ?? 50), 0);
  const contradiction = contradicting.reduce((sum, item) => sum + scoreOf(item.strength, item.confidence ?? 50), 0);
  if (support + contradiction <= 0) return 0;
  return clamp((support / (support + contradiction)) * 100);
}

function deriveEvidenceStability(summary: ReviewSummary, evidence: EvidenceItem[]) {
  const reviewStability = summary.outcomeReviewCount
    ? clamp(
        55 +
          summary.lessonSurvivalCount * 18 -
          summary.lessonFailureCount * 24 +
          Math.min(18, summary.outcomeReviewCount * 4),
      )
    : 45;
  const invalidationDrag = evidence.some((item) => item.invalidates) ? 30 : 0;
  return clamp(reviewStability - invalidationDrag);
}

function normalizeEvidence(items: EvidenceItem[], direction: SignalEvidenceDirection): EvidenceItem[] {
  return items.map((item, index) => ({
    id: String(item.id ?? `${direction}:${index + 1}`),
    label: String(item.label ?? item.id ?? `${direction} evidence ${index + 1}`),
    summary: String(item.summary ?? item.label ?? item.id ?? "Evidence item supplied."),
    direction,
    strength: clamp(numeric(item.strength, item.confidence ?? 50)),
    confidence: clamp(numeric(item.confidence, item.strength ?? 50)),
    ...(item.source ? { source: item.source } : {}),
    ...(item.observedAt ? { observedAt: item.observedAt } : {}),
    ...(item.diversityGroup ? { diversityGroup: item.diversityGroup } : {}),
    ...(item.invalidates === true ? { invalidates: true } : {}),
    ...(item.metadata ? { metadata: item.metadata } : {}),
  }));
}

function evidenceAgeDaysFrom(evidence: EvidenceItem[], nowMs: number) {
  const ages = evidence
    .map((item) => timestampMs(item.observedAt))
    .filter((value): value is number => value != null)
    .map((value) => Math.max(0, (nowMs - value) / DAY_MS));
  return ages.length ? Math.max(...ages) : null;
}

function actionFitScore(evidence: SignalEvidence, action: SignalEvidenceAction) {
  if (action === "insufficient_evidence") return evidence.confidenceLimit < 35 ? 100 : 55;
  if (action === "unknown") return evidence.unknowns.length > 0 && evidence.confidenceLimit < 45 ? 100 : 60;
  if (action === "reduce") return evidence.contradictingEvidence.length > 0 ? 95 : 55;
  if (action === "wait") return evidence.evidenceFreshness < 50 || evidence.evidenceAgreement < 45 ? 95 : 65;
  if (action === "observe") return evidence.confidenceLimit < 55 || evidence.outcomeReviewCount === 0 ? 90 : 70;
  if (action === "proceed_carefully") return evidence.confidenceLimit >= 55 && evidence.confidenceLimit < 80 ? 85 : 65;
  return evidence.confidenceLimit >= 75 && evidence.calibration >= 65 && evidence.outcomeReviewCount > 0 ? 90 : 35;
}

function governanceLabel(score: number): SignalGovernanceMetricLabel {
  if (score >= 82) return "strong";
  if (score >= 65) return "healthy";
  if (score >= 40) return "developing";
  return "weak";
}

function nextStepText(action: SignalEvidenceAction) {
  switch (action) {
    case "proceed":
      return "The next reasonable step is to proceed, while keeping the confidence cap and invalidation conditions visible.";
    case "proceed_carefully":
      return "The next reasonable step is to proceed carefully with a reversible, measured commitment.";
    case "observe":
      return "The next reasonable step is to observe and collect stronger reviewed evidence.";
    case "wait":
      return "The next reasonable step is to wait until stale or conflicting evidence is refreshed.";
    case "reduce":
      return "The next reasonable step is to reduce exposure to the conclusion until the contradiction is resolved.";
    case "unknown":
      return "The next reasonable step is to say unknown and keep learning.";
    case "insufficient_evidence":
      return "The next reasonable step is to treat the evidence as insufficient and avoid forcing action.";
  }
}

function scoreOf(value: unknown, fallback: number) {
  return clamp(numeric(value, fallback));
}

function timestampMs(value: string | number | Date | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function numeric(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function pct(value: number) {
  return `${roundScore(value)}%`;
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function roundSignedScore(value: number) {
  return Math.round(value * 100) / 100;
}
