export type ThesisStatus =
  | "emerging"
  | "strengthening"
  | "stable"
  | "weakening"
  | "invalidated";
export type EvidenceDirection = "supporting" | "contradicting" | "missing";
export type DecisionOutcomeJudgment =
  | "correct"
  | "wrong"
  | "early"
  | "late"
  | "inconclusive";
export type Horizon = "short-term" | "medium-term" | "long-term";

export type Evidence = {
  evidenceId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  observedAt: string;
  label: string;
  description: string;
  direction: EvidenceDirection;
  strength: number;
  confidence: number;
  source?: string;
  decisionId?: string;
  thesisId?: string;
  regimeSnapshotId?: string;
  metadata?: Record<string, unknown>;
};

export type DisconfirmingEvidence = Evidence & {
  direction: "contradicting";
  invalidates?: boolean;
};

export type Thesis = {
  thesisId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  title: string;
  description: string;
  status: ThesisStatus;
  confidence: number;
  supportingEvidence: Evidence[];
  contradictingEvidence: DisconfirmingEvidence[];
  missingEvidence: string[];
  invalidationConditions: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type RegimeSnapshot = {
  regimeSnapshotId: string;
  appId?: string;
  domain?: string;
  decisionId?: string;
  correlationId?: string;
  version?: string;
  source: string;
  marketCategory: string;
  venue: string;
  timestamp: string;
  marketHealth: number;
  riskState: string;
  trust: number;
  confidence: number;
  readiness: number;
  exposureGuidance: number;
  opportunityDensity: number;
  volatility?: number;
  breadth?: number;
  participation?: number;
  finalRecommendation: string;
  eventualOutcome?: {
    classification: DecisionOutcomeJudgment;
    summary: string;
    score?: number;
    recordedAt?: string;
  };
  metadata?: Record<string, unknown>;
};

export type DecisionRecord = {
  decisionId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  createdAt: string;
  marketCategory: string;
  venue: string;
  symbol?: string;
  recommendation: string;
  confidence: number;
  trust: number;
  conviction: number;
  readiness: number;
  exposure: number;
  thesisIds: string[];
  regimeSnapshotId?: string;
  supportingEvidence: Evidence[];
  contradictingEvidence: DisconfirmingEvidence[];
  missingEvidence: string[];
  invalidationConditions: string[];
  rationale: string;
  metadata?: Record<string, unknown>;
};

export type DecisionOutcome = {
  outcomeId: string;
  decisionId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  recordedAt: string;
  classification: DecisionOutcomeJudgment;
  actualReturnPct?: number;
  maxDrawdownPct?: number;
  readinessDelta?: number;
  confidenceAccuracy?: number;
  summary: string;
  lessons: string[];
  metadata?: Record<string, unknown>;
};

export type CalibrationRecord = {
  calibrationRecordId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  createdAt: string;
  decisionId?: string;
  predictedConfidence: number;
  actualOutcomeScore: number | null;
  calibrationError: number;
  calibrationScore: number;
  overconfidenceSignal: boolean;
  underconfidenceSignal: boolean;
  reliabilityTrend:
    | "aligned"
    | "overconfident"
    | "underconfident"
    | "insufficient-data";
  sampleSize: number;
  explanation: string;
  metadata?: Record<string, unknown>;
};

export type ProcessQualityRecord = {
  processQualityId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  createdAt: string;
  decisionId?: string;
  processQualityScore: number;
  outcomeQualityScore: number | null;
  classification:
    | "sound_process"
    | "weak_process"
    | "lucky_win"
    | "unlucky_loss"
    | "inconclusive";
  evidenceQualityScore: number;
  disconfirmationScore: number;
  uncertaintyScore: number;
  sizingScore: number;
  readinessScore: number;
  learningNote: string;
  metadata?: Record<string, unknown>;
};

export type DecisionReview = {
  reviewId: string;
  decisionId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  reviewedAt: string;
  classification: DecisionOutcomeJudgment;
  whatWasRecommended: string;
  whyRecommended: string;
  whatHappened: string;
  lesson: string;
  confidenceAdjustment: number;
  trustAdjustment: number;
  metadata?: Record<string, unknown>;
};

export type LearningRecord = {
  learningId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  source: string;
  createdAt: string;
  decisionId?: string;
  thesisId?: string;
  regimeSnapshotId?: string;
  lesson: string;
  changes: string[];
  confidenceAdjustment: number;
  trustAdjustment: number;
  metadata?: Record<string, unknown>;
};

export type BeliefFreshnessProfile = {
  freshness: number;
  ageDays: number;
  status: "fresh" | "aging" | "stale" | "unsupported";
  confidenceAfterDecay: number;
  decayApplied: number;
  explanation: string;
};

export type DisconfirmationProfile = {
  supportingEvidence: Evidence[];
  contradictingEvidence: DisconfirmingEvidence[];
  missingEvidence: string[];
  invalidationConditions: string[];
  question: string;
};

export type MindChangeTrigger = {
  triggerId: string;
  label: string;
  metric?: string;
  direction: "falls_below" | "rises_above" | "changes" | "invalidates";
  threshold?: number;
  currentValue?: number;
  reason: string;
  severity: "watch" | "reduce" | "exit" | "review";
};

export type ConvictionProfile = {
  confidence: number;
  trust: number;
  conviction: number;
  supportStrength: number;
  contradictionPressure: number;
  explanation: string;
};

export type ReadinessProfile = {
  readiness: number;
  actionJustified: boolean;
  actionLanguage:
    | "avoid"
    | "observe"
    | "watch"
    | "prepare"
    | "act-small"
    | "act";
  exposure: number;
  explanation: string;
};

export type TimeHorizonView = {
  horizon: Horizon;
  view: "constructive" | "neutral" | "cautious" | "avoid";
  confidence: number;
  thesis: string;
  action: string;
  risks: string[];
};

export type PortfolioContext = {
  hasData: boolean;
  concentrationRisk: number;
  diversificationBenefit: number;
  exposureOverlap: number;
  riskContribution: number;
  expectedRiskAdjustedContribution: number;
  summary: string;
  warnings: string[];
  metadata?: Record<string, unknown>;
};

export type SimilarRegime = {
  snapshot: RegimeSnapshot;
  similarity: number;
  whatHappened: string;
};

export type OpportunityRankingInput = {
  id: string;
  label: string;
  readiness: number;
  quality: number;
  trust: number;
  risk: number;
  expectedEdge?: number;
  exposure?: number;
  reasons?: string[];
  risks?: string[];
};

export type RankedOpportunity = OpportunityRankingInput & {
  rank: number;
  score: number;
  bucket: "best" | "other" | "not-ready";
  explanation: string;
};

export type OpportunityRankingResult = {
  bestOpportunity: RankedOpportunity | null;
  otherOpportunities: RankedOpportunity[];
  notReadyYet: RankedOpportunity[];
  explanation: string;
};

export type InvestorNarrative = {
  headline: string;
  whatIsHappening: string;
  whyItMatters: string;
  whatChanged: string;
  uncertainty: string;
  action: string;
  mindChange: string;
};

export type InvestorLearningInput = {
  source?: string;
  decisionId: string;
  createdAt?: string;
  marketCategory?: string;
  venue?: string;
  symbol?: string;
  recommendation?: string;
  action?: string;
  marketHealth?: number;
  riskState?: string;
  riskPressure?: number;
  trust?: number;
  confidence?: number;
  readiness?: number;
  exposure?: number;
  opportunityDensity?: number;
  volatility?: number;
  breadth?: number;
  participation?: number;
  supportingEvidence?: string[];
  contradictingEvidence?: string[];
  missingEvidence?: string[];
  invalidationConditions?: string[];
  existingThesis?: Thesis;
  similarRegimeHistory?: RegimeSnapshot[];
  reviewedOutcomes?: DecisionReview[];
  outcome?: DecisionOutcome;
  alternatives?: OpportunityRankingInput[];
  portfolioContext?: Partial<PortfolioContext>;
  metadata?: Record<string, unknown>;
};

export type InvestorLearningAssessment = {
  thesis: Thesis;
  evidence: {
    supporting: Evidence[];
    contradicting: DisconfirmingEvidence[];
    missing: string[];
    invalidationConditions: string[];
  };
  regimeSnapshot: RegimeSnapshot;
  similarRegimes: SimilarRegime[];
  decisionRecord: DecisionRecord;
  review: DecisionReview | null;
  learningRecords: LearningRecord[];
  calibration: CalibrationRecord;
  processQuality: ProcessQualityRecord;
  beliefFreshness: BeliefFreshnessProfile;
  disconfirmation: DisconfirmationProfile;
  mindChangeTriggers: MindChangeTrigger[];
  conviction: ConvictionProfile;
  readiness: ReadinessProfile;
  horizons: TimeHorizonView[];
  opportunityRanking: OpportunityRankingResult;
  portfolioContext: PortfolioContext;
  narrative: InvestorNarrative;
  emptyStates: string[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateThesis(thesis: Thesis): ValidationResult {
  return validationResult([
    thesis.thesisId ? "" : "thesisId is required",
    thesis.title ? "" : "title is required",
    thesis.description ? "" : "description is required",
    isThesisStatus(thesis.status) ? "" : "status is invalid",
    scoreIsValid(thesis.confidence) ? "" : "confidence must be 0..100",
    Array.isArray(thesis.supportingEvidence)
      ? ""
      : "supportingEvidence must be an array",
    Array.isArray(thesis.contradictingEvidence)
      ? ""
      : "contradictingEvidence must be an array",
  ]);
}

export function validateRegimeSnapshot(
  snapshot: RegimeSnapshot,
): ValidationResult {
  return validationResult([
    snapshot.regimeSnapshotId ? "" : "regimeSnapshotId is required",
    snapshot.marketCategory ? "" : "marketCategory is required",
    snapshot.venue ? "" : "venue is required",
    snapshot.timestamp ? "" : "timestamp is required",
    scoreIsValid(snapshot.marketHealth) ? "" : "marketHealth must be 0..100",
    scoreIsValid(snapshot.trust) ? "" : "trust must be 0..100",
    scoreIsValid(snapshot.confidence) ? "" : "confidence must be 0..100",
    scoreIsValid(snapshot.readiness) ? "" : "readiness must be 0..100",
    scoreIsValid(snapshot.opportunityDensity)
      ? ""
      : "opportunityDensity must be 0..100",
  ]);
}

export function validateDecisionRecord(
  record: DecisionRecord,
): ValidationResult {
  return validationResult([
    record.decisionId ? "" : "decisionId is required",
    record.source ? "" : "source is required",
    record.createdAt ? "" : "createdAt is required",
    record.recommendation ? "" : "recommendation is required",
    scoreIsValid(record.confidence) ? "" : "confidence must be 0..100",
    scoreIsValid(record.trust) ? "" : "trust must be 0..100",
    scoreIsValid(record.conviction) ? "" : "conviction must be 0..100",
    scoreIsValid(record.readiness) ? "" : "readiness must be 0..100",
  ]);
}

export function createInvestorLearningAssessment(
  input: InvestorLearningInput,
): InvestorLearningAssessment {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const source = input.source ?? "signal";
  const marketCategory = clean(input.marketCategory, "stocks");
  const venue = clean(input.venue, "UNKNOWN").toUpperCase();
  const recommendation = clean(input.recommendation ?? input.action, "Observe");
  const confidence = clampScore(input.confidence, 50);
  const trust = clampScore(input.trust, 50);
  const readinessValue = clampScore(input.readiness, 35);
  const exposure = clampScore(input.exposure, 0);
  const opportunityDensity = clampScore(input.opportunityDensity, 0);
  const support = evidenceFromStrings({
    values: input.supportingEvidence,
    source,
    observedAt: createdAt,
    direction: "supporting",
    fallbackStrength: confidence,
    fallbackLabel: "Supporting evidence",
    decisionId: input.decisionId,
  });
  const contradicting = evidenceFromStrings({
    values: input.contradictingEvidence,
    source,
    observedAt: createdAt,
    direction: "contradicting",
    fallbackStrength: clampScore(input.riskPressure, 50),
    fallbackLabel: "Contradicting evidence",
    decisionId: input.decisionId,
  }) as DisconfirmingEvidence[];
  const missing = uniqueStrings(input.missingEvidence ?? []);
  const invalidationConditions = uniqueStrings(
    input.invalidationConditions ?? [],
  );
  const thesis = updateThesisStatus(
    input.existingThesis ??
      createThesis({
        source,
        createdAt,
        marketCategory,
        venue,
        symbol: input.symbol,
        recommendation,
        confidence,
        supportingEvidence: support,
        contradictingEvidence: contradicting,
        missingEvidence: missing,
        invalidationConditions,
      }),
    {
      updatedAt: createdAt,
      confidence,
      supportingEvidence: support,
      contradictingEvidence: contradicting,
      missingEvidence: missing,
      invalidationConditions,
    },
  );
  const beliefFreshness = evaluateBeliefFreshness(thesis, createdAt);
  const disconfirmation = assessDisconfirmation(thesis);
  const regimeSnapshot = buildRegimeSnapshot({
    source,
    decisionId: input.decisionId,
    marketCategory,
    venue,
    timestamp: createdAt,
    marketHealth: input.marketHealth,
    riskState: input.riskState,
    riskPressure: input.riskPressure,
    trust,
    confidence,
    readiness: readinessValue,
    exposure,
    opportunityDensity,
    volatility: input.volatility,
    breadth: input.breadth,
    participation: input.participation,
    finalRecommendation: recommendation,
    outcome: input.outcome,
    metadata: input.metadata,
  });
  const similarRegimes = findSimilarRegimes(
    regimeSnapshot,
    input.similarRegimeHistory ?? [],
  );
  const conviction = buildConvictionProfile({
    confidence,
    trust,
    supportingEvidence: thesis.supportingEvidence,
    contradictingEvidence: thesis.contradictingEvidence,
  });
  const readiness = buildReadinessProfile({
    readiness: readinessValue,
    exposure,
    confidence,
    trust,
    contradictionCount: thesis.contradictingEvidence.length,
  });
  const alternatives = input.alternatives?.length
    ? input.alternatives
    : [
        {
          id: input.symbol ?? input.decisionId,
          label: input.symbol ?? recommendation,
          readiness: readinessValue,
          quality: confidence,
          trust,
          risk: clampScore(input.riskPressure, 50),
          exposure,
          reasons: support.map((item) => item.description),
          risks: contradicting.map((item) => item.description),
        },
      ];
  const opportunityRanking = rankOpportunities(alternatives);
  const portfolioContext = input.portfolioContext
    ? evaluatePortfolioContext({
        ...input.portfolioContext,
        riskContribution:
          input.portfolioContext.riskContribution ??
          clampScore(input.riskPressure, 50),
        expectedRiskAdjustedContribution:
          input.portfolioContext.expectedRiskAdjustedContribution ??
          clampScore(
            confidence -
              clampScore(input.riskPressure, 50) * 0.35 +
              exposure * 2,
            0,
          ),
      })
    : evaluatePortfolioContext();
  const horizons = buildTimeHorizonViews({
    thesis,
    confidence,
    trust,
    readiness: readinessValue,
    risk: clampScore(input.riskPressure, 50),
    opportunityDensity,
    recommendation,
  });
  const mindChangeTriggers = buildMindChangeTriggers({
    thesis,
    current: regimeSnapshot,
    similarRegimes,
  });
  const review = input.outcome
    ? createDecisionReview({
        decision: {
          decisionId: input.decisionId,
          source,
          recommendation,
          rationale: thesis.description,
          confidence,
          trust,
        },
        outcome: input.outcome,
      })
    : null;
  const learningRecords = review
    ? [
        createLearningRecordFromReview(review, {
          source,
          thesisId: thesis.thesisId,
          regimeSnapshotId: regimeSnapshot.regimeSnapshotId,
        }),
      ]
    : [];
  const decisionRecord = {
    decisionId: input.decisionId,
    source,
    createdAt,
    marketCategory,
    venue,
    ...(input.symbol ? { symbol: input.symbol } : {}),
    recommendation,
    confidence,
    trust,
    conviction: conviction.conviction,
    readiness: readiness.readiness,
    exposure,
    thesisIds: [thesis.thesisId],
    regimeSnapshotId: regimeSnapshot.regimeSnapshotId,
    supportingEvidence: thesis.supportingEvidence,
    contradictingEvidence: thesis.contradictingEvidence,
    missingEvidence: missing,
    invalidationConditions,
    rationale: thesis.description,
    metadata: input.metadata,
  };
  const calibration = buildCalibrationRecord({
    decisionRecord,
    outcome: input.outcome,
    reviewedOutcomes: input.reviewedOutcomes,
    createdAt,
  });
  const processQuality = buildProcessQualityRecord({
    decisionRecord,
    outcome: input.outcome,
    createdAt,
  });
  const narrative = generateInvestorNarrative({
    thesis,
    conviction,
    readiness,
    similarRegimes,
    mindChangeTriggers,
    portfolioContext,
    opportunityRanking,
    recommendation,
  });
  const emptyStates = learningEmptyStates({
    similarRegimes,
    reviewedOutcomes: input.reviewedOutcomes,
    contradicting,
    outcome: input.outcome,
  });

  return {
    thesis,
    evidence: {
      supporting: thesis.supportingEvidence,
      contradicting: thesis.contradictingEvidence,
      missing,
      invalidationConditions,
    },
    regimeSnapshot,
    similarRegimes,
    decisionRecord,
    review,
    learningRecords,
    calibration,
    processQuality,
    beliefFreshness,
    disconfirmation,
    mindChangeTriggers,
    conviction,
    readiness,
    horizons,
    opportunityRanking,
    portfolioContext,
    narrative,
    emptyStates,
  };
}

export function createThesis(input: {
  source?: string;
  createdAt?: string;
  marketCategory?: string;
  venue?: string;
  symbol?: string;
  recommendation?: string;
  confidence?: number;
  supportingEvidence?: Evidence[];
  contradictingEvidence?: DisconfirmingEvidence[];
  missingEvidence?: string[];
  invalidationConditions?: string[];
}): Thesis {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const subject =
    input.symbol ?? input.venue ?? input.marketCategory ?? "market";
  const recommendation = clean(input.recommendation, "Observe");
  const title = `${subject} ${recommendation} thesis`;
  return {
    thesisId: idFor(
      "thesis",
      input.source ?? "signal",
      subject,
      recommendation,
    ),
    source: input.source ?? "signal",
    title,
    description: `${subject} is being evaluated for ${recommendation.toLowerCase()} because current evidence may justify the suggested risk.`,
    status: "emerging",
    confidence: clampScore(input.confidence, 50),
    supportingEvidence: input.supportingEvidence ?? [],
    contradictingEvidence: input.contradictingEvidence ?? [],
    missingEvidence: uniqueStrings(input.missingEvidence ?? []),
    invalidationConditions: uniqueStrings(input.invalidationConditions ?? []),
    createdAt,
    updatedAt: createdAt,
  };
}

export function updateThesisStatus(
  thesis: Thesis,
  patch: {
    updatedAt?: string;
    confidence?: number;
    supportingEvidence?: Evidence[];
    contradictingEvidence?: DisconfirmingEvidence[];
    missingEvidence?: string[];
    invalidationConditions?: string[];
  },
): Thesis {
  const supportingEvidence = uniqueEvidence([
    ...thesis.supportingEvidence,
    ...(patch.supportingEvidence ?? []),
  ]);
  const contradictingEvidence = uniqueEvidence([
    ...thesis.contradictingEvidence,
    ...(patch.contradictingEvidence ?? []),
  ]) as DisconfirmingEvidence[];
  const missingEvidence = uniqueStrings([
    ...thesis.missingEvidence,
    ...(patch.missingEvidence ?? []),
  ]);
  const invalidationConditions = uniqueStrings([
    ...thesis.invalidationConditions,
    ...(patch.invalidationConditions ?? []),
  ]);
  const confidence = clampScore(patch.confidence, thesis.confidence);
  const supportStrength = average(
    supportingEvidence.map((item) => item.strength),
    0,
  );
  const contradictionPressure = average(
    contradictingEvidence.map((item) => item.strength),
    0,
  );
  const invalidated = contradictingEvidence.some(
    (item) => item.invalidates || item.strength >= 90,
  );
  const status: ThesisStatus = invalidated
    ? "invalidated"
    : contradictionPressure >= supportStrength + 15
      ? "weakening"
      : supportStrength >= 72 && confidence >= 70 && contradictionPressure < 45
        ? "strengthening"
        : confidence >= 62 && supportStrength >= 55
          ? "stable"
          : "emerging";

  return {
    ...thesis,
    confidence,
    status,
    supportingEvidence,
    contradictingEvidence,
    missingEvidence,
    invalidationConditions,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
}

export function buildRegimeSnapshot(input: {
  source?: string;
  decisionId?: string;
  marketCategory?: string;
  venue?: string;
  timestamp?: string;
  marketHealth?: number;
  riskState?: string;
  riskPressure?: number;
  trust?: number;
  confidence?: number;
  readiness?: number;
  exposure?: number;
  opportunityDensity?: number;
  volatility?: number;
  breadth?: number;
  participation?: number;
  finalRecommendation?: string;
  outcome?: DecisionOutcome;
  metadata?: Record<string, unknown>;
}): RegimeSnapshot {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const marketCategory = clean(input.marketCategory, "stocks");
  const venue = clean(input.venue, "UNKNOWN").toUpperCase();
  const decisionId = input.decisionId ?? `${venue}:${timestamp}`;
  const riskPressure = clampScore(input.riskPressure, 50);
  const outcome = input.outcome
    ? {
        classification: input.outcome.classification,
        summary: input.outcome.summary,
        score: input.outcome.confidenceAccuracy,
        recordedAt: input.outcome.recordedAt,
      }
    : undefined;

  return {
    regimeSnapshotId: idFor(
      "regime",
      input.source ?? "signal",
      decisionId,
      timestamp,
    ),
    source: input.source ?? "signal",
    marketCategory,
    venue,
    timestamp,
    marketHealth: clampScore(input.marketHealth, 100 - riskPressure),
    riskState: clean(
      input.riskState,
      riskPressure >= 70
        ? "elevated"
        : riskPressure >= 45
          ? "mixed"
          : "contained",
    ),
    trust: clampScore(input.trust, 50),
    confidence: clampScore(input.confidence, 50),
    readiness: clampScore(input.readiness, 35),
    exposureGuidance: clampScore(input.exposure, 0),
    opportunityDensity: clampScore(input.opportunityDensity, 0),
    ...(input.volatility == null
      ? {}
      : { volatility: clampScore(input.volatility, 50) }),
    ...(input.breadth == null
      ? {}
      : { breadth: clampScore(input.breadth, 50) }),
    ...(input.participation == null
      ? {}
      : { participation: clampScore(input.participation, 50) }),
    finalRecommendation: clean(input.finalRecommendation, "Observe"),
    ...(outcome ? { eventualOutcome: outcome } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function findSimilarRegimes(
  current: RegimeSnapshot,
  history: readonly RegimeSnapshot[],
  options: { limit?: number; threshold?: number } = {},
): SimilarRegime[] {
  const threshold = options.threshold ?? 0.55;
  const limit = options.limit ?? 5;
  return history
    .filter(
      (snapshot) => snapshot.regimeSnapshotId !== current.regimeSnapshotId,
    )
    .map((snapshot) => ({
      snapshot,
      similarity: regimeSimilarity(current, snapshot),
      whatHappened:
        snapshot.eventualOutcome?.summary ??
        "Outcome learning starts after decisions are reviewed.",
    }))
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function regimeSimilarity(
  left: RegimeSnapshot,
  right: RegimeSnapshot,
): number {
  const numericPairs: Array<[number | undefined, number | undefined]> = [
    [left.marketHealth, right.marketHealth],
    [left.trust, right.trust],
    [left.confidence, right.confidence],
    [left.readiness, right.readiness],
    [left.exposureGuidance, right.exposureGuidance],
    [left.opportunityDensity, right.opportunityDensity],
    [left.volatility, right.volatility],
    [left.breadth, right.breadth],
    [left.participation, right.participation],
  ];
  const scores = numericPairs
    .filter(
      (pair): pair is [number, number] => pair[0] != null && pair[1] != null,
    )
    .map(([a, b]) => 1 - Math.min(Math.abs(a - b), 100) / 100);
  const numericScore = average(scores, 0.5);
  const categoryScore = left.marketCategory === right.marketCategory ? 1 : 0.55;
  const venueScore = left.venue === right.venue ? 1 : 0.7;
  const riskScore =
    normalizedWords(left.riskState) === normalizedWords(right.riskState)
      ? 1
      : 0.72;
  return round(
    numericScore * 0.68 +
      categoryScore * 0.12 +
      venueScore * 0.1 +
      riskScore * 0.1,
    3,
  );
}

export function createDecisionReview(input: {
  decision: {
    decisionId: string;
    source?: string;
    recommendation: string;
    rationale: string;
    confidence?: number;
    trust?: number;
  };
  outcome: DecisionOutcome;
  reviewedAt?: string;
}): DecisionReview {
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const classification = input.outcome.classification;
  const adjustment = adjustmentFor(classification);
  return {
    reviewId: idFor(
      "review",
      input.decision.decisionId,
      input.outcome.outcomeId,
    ),
    decisionId: input.decision.decisionId,
    source: input.decision.source ?? input.outcome.source,
    reviewedAt,
    classification,
    whatWasRecommended: input.decision.recommendation,
    whyRecommended: input.decision.rationale,
    whatHappened: input.outcome.summary,
    lesson: input.outcome.lessons[0] ?? lessonFor(classification),
    confidenceAdjustment: adjustment,
    trustAdjustment: adjustment * 0.7,
    metadata: {
      confidenceAtDecision: input.decision.confidence,
      trustAtDecision: input.decision.trust,
    },
  };
}

export function createLearningRecordFromReview(
  review: DecisionReview,
  context: {
    source?: string;
    thesisId?: string;
    regimeSnapshotId?: string;
  } = {},
): LearningRecord {
  return {
    learningId: idFor("learning", review.reviewId),
    source: context.source ?? review.source,
    createdAt: review.reviewedAt,
    decisionId: review.decisionId,
    ...(context.thesisId ? { thesisId: context.thesisId } : {}),
    ...(context.regimeSnapshotId
      ? { regimeSnapshotId: context.regimeSnapshotId }
      : {}),
    lesson: review.lesson,
    changes: [
      review.confidenceAdjustment === 0
        ? "Keep confidence unchanged until more reviewed outcomes arrive."
        : `Adjust confidence by ${round(review.confidenceAdjustment, 2)} points.`,
      review.trustAdjustment === 0
        ? "Keep trust unchanged until more reviewed outcomes arrive."
        : `Adjust trust by ${round(review.trustAdjustment, 2)} points.`,
    ],
    confidenceAdjustment: review.confidenceAdjustment,
    trustAdjustment: review.trustAdjustment,
    metadata: { classification: review.classification },
  };
}

export function buildCalibrationRecord(input: {
  decisionRecord: DecisionRecord;
  outcome?: DecisionOutcome;
  reviewedOutcomes?: readonly DecisionReview[];
  createdAt?: string;
}): CalibrationRecord {
  const createdAt =
    input.createdAt ?? input.outcome?.recordedAt ?? new Date().toISOString();
  const actualOutcomeScore = input.outcome ? scoreOutcome(input.outcome) : null;
  const calibrationError =
    actualOutcomeScore == null
      ? 0
      : round(input.decisionRecord.confidence - actualOutcomeScore, 2);
  const sampleSize =
    (input.reviewedOutcomes?.length ?? 0) + (input.outcome ? 1 : 0);
  const reviewBias = average(
    input.reviewedOutcomes?.map((review) => review.confidenceAdjustment) ?? [],
    0,
  );
  const reliabilityTrend =
    actualOutcomeScore == null && sampleSize === 0
      ? "insufficient-data"
      : calibrationError > 12 || reviewBias < -1
        ? "overconfident"
        : calibrationError < -12 || reviewBias > 1
          ? "underconfident"
          : "aligned";
  const calibrationScore =
    actualOutcomeScore == null
      ? 0
      : clampScore(100 - Math.abs(calibrationError), 0);

  return {
    calibrationRecordId: idFor(
      "calibration-record",
      input.decisionRecord.decisionId,
      createdAt,
    ),
    source: input.decisionRecord.source,
    createdAt,
    decisionId: input.decisionRecord.decisionId,
    predictedConfidence: input.decisionRecord.confidence,
    actualOutcomeScore,
    calibrationError,
    calibrationScore,
    overconfidenceSignal: reliabilityTrend === "overconfident",
    underconfidenceSignal: reliabilityTrend === "underconfident",
    reliabilityTrend,
    sampleSize,
    explanation:
      actualOutcomeScore == null
        ? "Calibration will improve after more outcomes are reviewed."
        : `Predicted confidence differed from the reviewed outcome by ${Math.abs(calibrationError)} points.`,
  };
}

export function buildProcessQualityRecord(input: {
  decisionRecord: DecisionRecord;
  outcome?: DecisionOutcome;
  createdAt?: string;
}): ProcessQualityRecord {
  const createdAt =
    input.createdAt ?? input.outcome?.recordedAt ?? new Date().toISOString();
  const supportStrength = average(
    input.decisionRecord.supportingEvidence.map((item) => item.strength),
    input.decisionRecord.confidence,
  );
  const contradictionPressure = average(
    input.decisionRecord.contradictingEvidence.map((item) => item.strength),
    0,
  );
  const evidenceQualityScore = clampScore(
    supportStrength - contradictionPressure * 0.25,
  );
  const disconfirmationScore = clampScore(
    (input.decisionRecord.contradictingEvidence.length > 0 ? 45 : 20) +
      Math.min(input.decisionRecord.invalidationConditions.length, 3) * 15 +
      Math.min(input.decisionRecord.missingEvidence.length, 3) * 8,
    50,
  );
  const uncertaintyScore = clampScore(
    100 -
      Math.max(0, input.decisionRecord.confidence - 78) -
      input.decisionRecord.missingEvidence.length * 8,
    70,
  );
  const readinessScore =
    input.decisionRecord.exposure > 0
      ? clampScore(input.decisionRecord.readiness)
      : clampScore(100 - Math.max(0, 45 - input.decisionRecord.readiness));
  const sizingScore = clampScore(
    input.decisionRecord.exposure <=
      exposureCapFor(input.decisionRecord.readiness)
      ? 90 - contradictionPressure * 0.2
      : 45 -
          (input.decisionRecord.exposure -
            exposureCapFor(input.decisionRecord.readiness)) *
            4,
    65,
  );
  const processQualityScore = clampScore(
    evidenceQualityScore * 0.25 +
      disconfirmationScore * 0.2 +
      uncertaintyScore * 0.2 +
      sizingScore * 0.2 +
      readinessScore * 0.15,
  );
  const outcomeQualityScore = input.outcome
    ? scoreOutcome(input.outcome)
    : null;
  const classification = classifyProcessQuality(
    processQualityScore,
    outcomeQualityScore,
  );

  return {
    processQualityId: idFor(
      "process-quality",
      input.decisionRecord.decisionId,
      createdAt,
    ),
    source: input.decisionRecord.source,
    createdAt,
    decisionId: input.decisionRecord.decisionId,
    processQualityScore,
    outcomeQualityScore,
    classification,
    evidenceQualityScore,
    disconfirmationScore,
    uncertaintyScore,
    sizingScore,
    readinessScore,
    learningNote: processLearningNote(classification),
  };
}

export function evaluateBeliefFreshness(
  thesis: Thesis,
  asOf: string | Date = new Date(),
): BeliefFreshnessProfile {
  const observedDates = [
    thesis.updatedAt,
    ...thesis.supportingEvidence.map((item) => item.observedAt),
    ...thesis.contradictingEvidence.map((item) => item.observedAt),
  ];
  const latestEvidenceAt = latestValidDate(observedDates);
  const asOfDate = typeof asOf === "string" ? new Date(asOf) : asOf;
  const hasEvidence =
    thesis.supportingEvidence.length + thesis.contradictingEvidence.length > 0;
  const ageDays = latestEvidenceAt
    ? Math.max(
        0,
        Math.floor(
          (asOfDate.getTime() - latestEvidenceAt.getTime()) / 86_400_000,
        ),
      )
    : Number.POSITIVE_INFINITY;
  const status: BeliefFreshnessProfile["status"] = !hasEvidence
    ? "unsupported"
    : ageDays <= 7
      ? "fresh"
      : ageDays <= 30
        ? "aging"
        : "stale";
  const decayApplied =
    status === "fresh"
      ? 0
      : status === "aging"
        ? Math.min(10, ageDays * 0.25)
        : status === "stale"
          ? Math.min(35, 8 + ageDays * 0.35)
          : 20;
  const confidenceAfterDecay = clampScore(
    thesis.confidence - decayApplied,
    thesis.confidence,
  );
  const freshness =
    status === "unsupported" ? 0 : clampScore(100 - decayApplied * 2);

  return {
    freshness,
    ageDays: Number.isFinite(ageDays) ? ageDays : 0,
    status,
    confidenceAfterDecay,
    decayApplied: round(decayApplied, 2),
    explanation:
      status === "fresh"
        ? "This thesis has fresh evidence."
        : status === "unsupported"
          ? "This thesis has not received fresh evidence yet."
          : `Evidence is ${ageDays} day(s) old, so conviction should decay unless refreshed.`,
  };
}

export function applyBeliefDecay(
  thesis: Thesis,
  asOf: string | Date = new Date(),
): Thesis {
  const freshness = evaluateBeliefFreshness(thesis, asOf);
  return {
    ...thesis,
    confidence: freshness.confidenceAfterDecay,
    status:
      freshness.status === "stale" && thesis.status !== "invalidated"
        ? "weakening"
        : thesis.status,
    metadata: {
      ...thesis.metadata,
      beliefFreshness: freshness,
    },
  };
}

export function assessDisconfirmation(thesis: Thesis): DisconfirmationProfile {
  return {
    supportingEvidence: thesis.supportingEvidence,
    contradictingEvidence: thesis.contradictingEvidence,
    missingEvidence: thesis.missingEvidence,
    invalidationConditions: thesis.invalidationConditions,
    question: "What could make this wrong?",
  };
}

export function buildConvictionProfile(input: {
  confidence?: number;
  trust?: number;
  supportingEvidence?: Evidence[];
  contradictingEvidence?: DisconfirmingEvidence[];
}): ConvictionProfile {
  const confidence = clampScore(input.confidence, 50);
  const trust = clampScore(input.trust, 50);
  const supportStrength = average(
    (input.supportingEvidence ?? []).map((item) => item.strength),
    confidence,
  );
  const contradictionPressure = average(
    (input.contradictingEvidence ?? []).map((item) => item.strength),
    0,
  );
  const conviction = clampScore(
    confidence * 0.38 +
      trust * 0.28 +
      supportStrength * 0.28 -
      contradictionPressure * 0.18,
  );
  return {
    confidence,
    trust,
    conviction,
    supportStrength: round(supportStrength, 1),
    contradictionPressure: round(contradictionPressure, 1),
    explanation: `Conviction is ${Math.round(conviction)}/100 after separating evidence support, historical trust, and contradictory pressure.`,
  };
}

export function buildReadinessProfile(input: {
  readiness?: number;
  exposure?: number;
  confidence?: number;
  trust?: number;
  contradictionCount?: number;
}): ReadinessProfile {
  const readiness = clampScore(input.readiness, 35);
  const exposure = clampScore(input.exposure, 0);
  const confidence = clampScore(input.confidence, 50);
  const trust = clampScore(input.trust, 50);
  const contradictionCount = input.contradictionCount ?? 0;
  const actionJustified =
    readiness >= 68 && exposure > 0 && trust >= 55 && contradictionCount === 0;
  const actionLanguage: ReadinessProfile["actionLanguage"] =
    readiness < 25 || contradictionCount >= 3
      ? "avoid"
      : readiness < 42
        ? "observe"
        : readiness < 58
          ? "watch"
          : readiness < 68
            ? "prepare"
            : exposure <= 2 || confidence < 75 || trust < 70
              ? "act-small"
              : "act";
  return {
    readiness,
    actionJustified,
    actionLanguage,
    exposure: actionJustified || actionLanguage === "act-small" ? exposure : 0,
    explanation: `Readiness, not confidence alone, drives action language: ${actionLanguage.replace("-", " ")}.`,
  };
}

export function buildMindChangeTriggers(input: {
  thesis: Thesis;
  current: RegimeSnapshot;
  similarRegimes?: SimilarRegime[];
}): MindChangeTrigger[] {
  const failedSimilar = (input.similarRegimes ?? []).some(
    (item) =>
      item.snapshot.eventualOutcome?.classification === "wrong" ||
      item.snapshot.eventualOutcome?.classification === "late",
  );
  return uniqueTriggers([
    {
      triggerId: idFor(
        "trigger",
        input.current.regimeSnapshotId,
        "participation",
      ),
      label: "Participation deteriorates",
      metric: "participation",
      direction: "falls_below",
      threshold: 40,
      currentValue: input.current.participation,
      reason: "Participation below 40 would weaken breadth behind the view.",
      severity: "reduce",
    },
    {
      triggerId: idFor("trigger", input.current.regimeSnapshotId, "volatility"),
      label: "Volatility expands",
      metric: "volatility",
      direction: "rises_above",
      threshold: 70,
      currentValue: input.current.volatility,
      reason: "Volatility above 70 would make current sizing too aggressive.",
      severity: "review",
    },
    {
      triggerId: idFor("trigger", input.current.regimeSnapshotId, "trust"),
      label: "Trust falls",
      metric: "trust",
      direction: "falls_below",
      threshold: 50,
      currentValue: input.current.trust,
      reason:
        "Trust below 50 means historical reliability no longer supports action.",
      severity: "review",
    },
    ...input.thesis.invalidationConditions.map((condition) => ({
      triggerId: idFor("trigger", input.thesis.thesisId, condition),
      label: condition,
      direction: "invalidates" as const,
      reason: condition,
      severity: "exit" as const,
    })),
    failedSimilar
      ? {
          triggerId: idFor(
            "trigger",
            input.current.regimeSnapshotId,
            "similar-regime-failure",
          ),
          label: "Similar regimes begin failing",
          direction: "changes" as const,
          reason: "Past similar states include wrong or late outcomes.",
          severity: "review" as const,
        }
      : null,
  ]);
}

export function rankOpportunities(
  input: readonly OpportunityRankingInput[],
): OpportunityRankingResult {
  const ranked = input
    .map((item, index) => {
      const risk = clampScore(item.risk, 50);
      const score = clampScore(
        item.readiness * 0.32 +
          item.quality * 0.26 +
          item.trust * 0.2 +
          (100 - risk) * 0.16 +
          clampScore(item.expectedEdge, 50) * 0.06,
      );
      const bucket: RankedOpportunity["bucket"] =
        item.readiness < 45 || item.exposure === 0 || risk >= 78
          ? "not-ready"
          : index === 0
            ? "best"
            : "other";
      return {
        ...item,
        rank: index + 1,
        score,
        bucket,
        explanation:
          bucket === "not-ready"
            ? `${item.label} is not ready because readiness, risk, or exposure permission is incomplete.`
            : `${item.label} ranks on readiness, quality, trust, and risk-adjusted contribution.`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const ready = ranked.filter((item) => item.bucket !== "not-ready");
  const best = ready[0] ? { ...ready[0], bucket: "best" as const } : null;
  const other = ready
    .slice(best ? 1 : 0)
    .map((item) => ({ ...item, bucket: "other" as const }));
  const notReady = ranked.filter((item) => item.bucket === "not-ready");
  return {
    bestOpportunity: best,
    otherOpportunities: other,
    notReadyYet: notReady,
    explanation: best
      ? `${best.label} ranks above alternatives because its readiness-adjusted score is ${Math.round(best.score)}/100.`
      : "No opportunity is ready enough to rank as best right now.",
  };
}

export function buildTimeHorizonViews(input: {
  thesis: Thesis;
  confidence?: number;
  trust?: number;
  readiness?: number;
  risk?: number;
  opportunityDensity?: number;
  recommendation?: string;
}): TimeHorizonView[] {
  const confidence = clampScore(input.confidence, input.thesis.confidence);
  const trust = clampScore(input.trust, 50);
  const readiness = clampScore(input.readiness, 35);
  const risk = clampScore(input.risk, 50);
  const density = clampScore(input.opportunityDensity, 0);
  const recommendation = clean(input.recommendation, "Observe");

  return [
    horizonView({
      horizon: "short-term",
      score: readiness * 0.45 + confidence * 0.25 + (100 - risk) * 0.3,
      confidence,
      thesis: input.thesis.title,
      action:
        readiness >= 68
          ? recommendation
          : "Wait for cleaner short-term confirmation",
      risks: input.thesis.contradictingEvidence.map((item) => item.description),
    }),
    horizonView({
      horizon: "medium-term",
      score:
        confidence * 0.32 + trust * 0.32 + density * 0.18 + (100 - risk) * 0.18,
      confidence: (confidence + trust) / 2,
      thesis: input.thesis.title,
      action: trust >= 60 ? recommendation : "Track until reliability improves",
      risks: input.thesis.missingEvidence,
    }),
    horizonView({
      horizon: "long-term",
      score:
        trust * 0.42 + confidence * 0.2 + (100 - risk) * 0.24 + density * 0.14,
      confidence: trust,
      thesis: input.thesis.title,
      action:
        risk >= 70 ? "Stay cautious until risk normalizes" : recommendation,
      risks: input.thesis.invalidationConditions,
    }),
  ];
}

export function evaluatePortfolioContext(
  input: Partial<PortfolioContext> = {},
): PortfolioContext {
  if (input.hasData === false || Object.keys(input).length === 0) {
    return {
      hasData: false,
      concentrationRisk: 0,
      diversificationBenefit: 0,
      exposureOverlap: 0,
      riskContribution: 0,
      expectedRiskAdjustedContribution: 0,
      summary:
        "Portfolio context is unavailable; Signal is evaluating the opportunity on standalone evidence only.",
      warnings: [
        "Portfolio improvement checks will appear after portfolio data is connected.",
      ],
    };
  }

  const concentrationRisk = clampScore(input.concentrationRisk, 0);
  const diversificationBenefit = clampScore(input.diversificationBenefit, 50);
  const exposureOverlap = clampScore(input.exposureOverlap, 0);
  const riskContribution = clampScore(input.riskContribution, 50);
  const expectedRiskAdjustedContribution = clampScore(
    input.expectedRiskAdjustedContribution,
    50,
  );
  const warnings = uniqueStrings([
    ...(input.warnings ?? []),
    concentrationRisk >= 70 ? "Concentration risk is elevated." : "",
    exposureOverlap >= 70
      ? "Exposure overlaps heavily with existing positions."
      : "",
  ]);

  return {
    hasData: true,
    concentrationRisk,
    diversificationBenefit,
    exposureOverlap,
    riskContribution,
    expectedRiskAdjustedContribution,
    summary:
      input.summary ??
      `Expected risk-adjusted contribution is ${Math.round(expectedRiskAdjustedContribution)}/100.`,
    warnings,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function generateInvestorNarrative(input: {
  thesis: Thesis;
  conviction: ConvictionProfile;
  readiness: ReadinessProfile;
  similarRegimes: SimilarRegime[];
  mindChangeTriggers: MindChangeTrigger[];
  portfolioContext: PortfolioContext;
  opportunityRanking: OpportunityRankingResult;
  recommendation: string;
}): InvestorNarrative {
  const similar = input.similarRegimes[0];
  const trigger = input.mindChangeTriggers[0];
  return {
    headline: input.thesis.title,
    whatIsHappening: input.thesis.description,
    whyItMatters: input.opportunityRanking.explanation,
    whatChanged: similar
      ? `This resembles ${similar.snapshot.venue} on ${similar.snapshot.timestamp.slice(0, 10)} with ${Math.round(similar.similarity * 100)}% similarity.`
      : "Similar regimes will appear after more snapshots are collected.",
    uncertainty:
      input.thesis.contradictingEvidence[0]?.description ??
      input.thesis.missingEvidence[0] ??
      "No contradicting evidence has been found yet.",
    action: `${input.recommendation}; readiness says ${input.readiness.actionLanguage.replace("-", " ")}.`,
    mindChange:
      trigger?.reason ??
      "What would change the view will become clearer as more evidence is collected.",
  };
}

export class RegimeMemoryEngine {
  private readonly snapshots: RegimeSnapshot[];

  constructor(initialSnapshots: readonly RegimeSnapshot[] = []) {
    this.snapshots = [...initialSnapshots];
  }

  remember(snapshot: RegimeSnapshot): RegimeSnapshot {
    const existingIndex = this.snapshots.findIndex(
      (item) => item.regimeSnapshotId === snapshot.regimeSnapshotId,
    );
    if (existingIndex >= 0) this.snapshots.splice(existingIndex, 1);
    this.snapshots.unshift(snapshot);
    return snapshot;
  }

  list(): RegimeSnapshot[] {
    return [...this.snapshots];
  }

  findSimilar(
    current: RegimeSnapshot,
    options?: { limit?: number; threshold?: number },
  ): SimilarRegime[] {
    return findSimilarRegimes(current, this.snapshots, options);
  }
}

export class ReflectionEngine {
  reviewDecision(
    input: Parameters<typeof createDecisionReview>[0],
  ): DecisionReview {
    return createDecisionReview(input);
  }

  createLearningRecord(
    review: DecisionReview,
    context?: { source?: string; thesisId?: string; regimeSnapshotId?: string },
  ): LearningRecord {
    return createLearningRecordFromReview(review, context);
  }
}

export class ProcessQualityEngine {
  evaluate(
    input: Parameters<typeof buildProcessQualityRecord>[0],
  ): ProcessQualityRecord {
    return buildProcessQualityRecord(input);
  }
}

export class CalibrationEngine {
  evaluate(
    input: Parameters<typeof buildCalibrationRecord>[0],
  ): CalibrationRecord {
    return buildCalibrationRecord(input);
  }
}

export class BeliefDecayEngine {
  evaluate(thesis: Thesis, asOf?: string | Date): BeliefFreshnessProfile {
    return evaluateBeliefFreshness(thesis, asOf);
  }

  apply(thesis: Thesis, asOf?: string | Date): Thesis {
    return applyBeliefDecay(thesis, asOf);
  }
}

export class ThesisEngine {
  create(input: Parameters<typeof createThesis>[0]): Thesis {
    return createThesis(input);
  }

  update(
    thesis: Thesis,
    patch: Parameters<typeof updateThesisStatus>[1],
  ): Thesis {
    return updateThesisStatus(thesis, patch);
  }
}

export class DisconfirmationEngine {
  assess(thesis: Thesis): DisconfirmationProfile {
    return assessDisconfirmation(thesis);
  }
}

export class MindChangeEngine {
  buildTriggers(
    input: Parameters<typeof buildMindChangeTriggers>[0],
  ): MindChangeTrigger[] {
    return buildMindChangeTriggers(input);
  }
}

export class ConvictionEngine {
  buildProfile(
    input: Parameters<typeof buildConvictionProfile>[0],
  ): ConvictionProfile {
    return buildConvictionProfile(input);
  }
}

export class ReadinessEngine {
  buildProfile(
    input: Parameters<typeof buildReadinessProfile>[0],
  ): ReadinessProfile {
    return buildReadinessProfile(input);
  }
}

export class OpportunityCostEngine {
  rank(input: readonly OpportunityRankingInput[]): OpportunityRankingResult {
    return rankOpportunities(input);
  }
}

export class TimeHorizonEngine {
  buildViews(
    input: Parameters<typeof buildTimeHorizonViews>[0],
  ): TimeHorizonView[] {
    return buildTimeHorizonViews(input);
  }
}

export class NarrativeEngine {
  generate(
    input: Parameters<typeof generateInvestorNarrative>[0],
  ): InvestorNarrative {
    return generateInvestorNarrative(input);
  }
}

function learningEmptyStates(input: {
  similarRegimes: SimilarRegime[];
  reviewedOutcomes?: readonly DecisionReview[];
  contradicting: readonly DisconfirmingEvidence[];
  outcome?: DecisionOutcome;
}) {
  return uniqueStrings([
    input.reviewedOutcomes?.length
      ? ""
      : "No previous decisions have been reviewed yet.",
    input.similarRegimes.length
      ? ""
      : "Similar regimes will appear after more snapshots are collected.",
    input.contradicting.length
      ? ""
      : "No contradicting evidence has been found yet.",
    input.outcome
      ? ""
      : "Outcome learning starts after decisions are reviewed.",
  ]);
}

function evidenceFromStrings(input: {
  values?: string[];
  source: string;
  observedAt: string;
  direction: EvidenceDirection;
  fallbackStrength: number;
  fallbackLabel: string;
  decisionId?: string;
  thesisId?: string;
  regimeSnapshotId?: string;
}): Evidence[] {
  return uniqueStrings(input.values ?? []).map((description, index) => ({
    evidenceId: idFor("evidence", input.direction, description),
    observedAt: input.observedAt,
    label: `${input.fallbackLabel} ${index + 1}`,
    description,
    direction: input.direction,
    strength: clampScore(input.fallbackStrength, 50),
    confidence: clampScore(input.fallbackStrength, 50),
    source: input.source,
    ...(input.decisionId ? { decisionId: input.decisionId } : {}),
    ...(input.thesisId ? { thesisId: input.thesisId } : {}),
    ...(input.regimeSnapshotId
      ? { regimeSnapshotId: input.regimeSnapshotId }
      : {}),
    ...(input.direction === "contradicting" &&
    /invalidate|block|collapse|falls?|deteriorates?|weakens?/i.test(description)
      ? { invalidates: true }
      : {}),
  }));
}

function horizonView(input: {
  horizon: Horizon;
  score: number;
  confidence: number;
  thesis: string;
  action: string;
  risks: string[];
}): TimeHorizonView {
  const score = clampScore(input.score, 50);
  const view: TimeHorizonView["view"] =
    score >= 68
      ? "constructive"
      : score >= 50
        ? "neutral"
        : score >= 35
          ? "cautious"
          : "avoid";
  return {
    horizon: input.horizon,
    view,
    confidence: clampScore(input.confidence, 50),
    thesis: input.thesis,
    action: input.action,
    risks: uniqueStrings(input.risks).slice(0, 3),
  };
}

function scoreOutcome(outcome: DecisionOutcome): number {
  if (Number.isFinite(outcome.confidenceAccuracy)) {
    return clampScore(outcome.confidenceAccuracy, 50);
  }

  if (outcome.classification === "correct") return 100;
  if (outcome.classification === "wrong") return 0;
  if (outcome.classification === "early" || outcome.classification === "late")
    return 55;
  return 50;
}

function exposureCapFor(readiness: number): number {
  if (readiness >= 80) return 8;
  if (readiness >= 68) return 4;
  if (readiness >= 55) return 2;
  return 0;
}

function classifyProcessQuality(
  processQualityScore: number,
  outcomeQualityScore: number | null,
): ProcessQualityRecord["classification"] {
  if (outcomeQualityScore == null) {
    return processQualityScore >= 65 ? "sound_process" : "inconclusive";
  }

  if (processQualityScore >= 65 && outcomeQualityScore < 45)
    return "unlucky_loss";
  if (processQualityScore < 65 && outcomeQualityScore >= 65) return "lucky_win";
  if (processQualityScore >= 65) return "sound_process";
  return "weak_process";
}

function processLearningNote(
  classification: ProcessQualityRecord["classification"],
): string {
  if (classification === "unlucky_loss") {
    return "The process was sound even though the outcome was poor; avoid learning the wrong lesson from an unlucky loss.";
  }

  if (classification === "lucky_win") {
    return "The outcome was good, but the process was weak; avoid reinforcing a lucky win.";
  }

  if (classification === "weak_process") {
    return "Improve evidence quality, disconfirmation, sizing, or readiness before trusting a similar decision.";
  }

  if (classification === "sound_process") {
    return "The decision process was coherent; future learning should focus on calibration and outcome follow-through.";
  }

  return "Process quality will become clearer after the decision has a reviewed outcome.";
}

function latestValidDate(values: readonly string[]): Date | null {
  const dates = values
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0] ?? null;
}

function validationResult(errors: string[]): ValidationResult {
  const filtered = errors.filter(Boolean);
  return { valid: filtered.length === 0, errors: filtered };
}

function isThesisStatus(value: string): value is ThesisStatus {
  return [
    "emerging",
    "strengthening",
    "stable",
    "weakening",
    "invalidated",
  ].includes(value);
}

function scoreIsValid(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function clampScore(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function average(values: readonly number[], fallback: number): number {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return fallback;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function round(value: number, digits = 0): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clean(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizedWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
}

function uniqueEvidence<T extends Evidence>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = value.evidenceId || normalizedWords(value.description);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniqueTriggers(
  values: Array<MindChangeTrigger | null>,
): MindChangeTrigger[] {
  const seen = new Set<string>();
  const result: MindChangeTrigger[] = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value.triggerId)) continue;
    seen.add(value.triggerId);
    result.push(value);
  }
  return result;
}

function idFor(prefix: string, ...parts: unknown[]): string {
  const body = parts
    .map((part) => normalizedWords(String(part ?? "")))
    .filter(Boolean)
    .join(":")
    .slice(0, 96);
  return `${prefix}:${body || "record"}`;
}

function adjustmentFor(classification: DecisionOutcomeJudgment): number {
  if (classification === "correct") return 3;
  if (classification === "wrong") return -5;
  if (classification === "early" || classification === "late") return -2;
  return 0;
}

function lessonFor(classification: DecisionOutcomeJudgment): string {
  if (classification === "correct")
    return "The decision logic was supported by the reviewed outcome.";
  if (classification === "wrong")
    return "Reduce trust in this setup until disconfirming evidence is better handled.";
  if (classification === "early")
    return "The thesis may have been right, but readiness was too early.";
  if (classification === "late")
    return "The thesis may have been right, but the action arrived too late.";
  return "The outcome is inconclusive; keep collecting reviewed decisions.";
}
