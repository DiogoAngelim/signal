import {
  type SignalAssumption,
  type SignalConstraint,
  type SignalEvaluation,
  type SignalEvidence,
  type SignalLearningRuntimeInput,
  type SignalLearningRuntimeResult,
  type SignalLesson,
  type SignalObjective,
  type SignalPosition,
  type SignalRelationship,
  type SignalReview,
  type SignalReviewRef,
  type SignalReviewedSituation,
  type SignalState,
  type SignalThreat,
  evaluateLearningJudgment,
} from "@signal/decision";

export type AllocationAdjustment =
  | "increase"
  | "hold"
  | "reduce"
  | "exit"
  | "watch";

export type StockAllocationSituation = {
  ticker: string;
  price: number;
  shares: number;
  portfolioExposurePct: number;
  volatilityPct: number;
  concentrationPct: number;
  drawdownPct: number;
  marketRiskPct: number;
  liquidityRiskPct: number;
  investmentThesis: string;
  allocationAdjustment: AllocationAdjustment;
  tags?: string[];
  observedAt?: string;
};

export type ReviewedInvestmentSituation = {
  id: string;
  ticker: string;
  label: string;
  investmentOutcome: "survived" | "failed" | "mixed";
  postmortem: string;
  investmentLesson: string;
  tags: string[];
  reviewCount: number;
  survivalCount: number;
  failureCount: number;
  confidence: number;
  reviewedAt: string;
};

export type StocksSignalLearningJudgment = {
  signalInput: SignalLearningRuntimeInput;
  signalResult: SignalLearningRuntimeResult;
  allocationPosture: string;
  reviewableLanguage: string[];
};

const APP_SOURCE = "stocks-optimizer";

function nowFrom(input: StockAllocationSituation) {
  return input.observedAt ?? "2026-06-06T12:00:00.000Z";
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function keyForTicker(ticker: string) {
  return ticker.trim().toUpperCase() || "UNKNOWN";
}

function domainIdentifier(ticker: string) {
  return `instrument:${keyForTicker(ticker)}`;
}

function baseTrace(refId: string, role: string) {
  return [{ refId, refType: "Evidence", role }];
}

function reviewRefFor(
  reviewId: string,
  reviewedAt: string,
  outcome: ReviewedInvestmentSituation["investmentOutcome"],
): SignalReviewRef {
  return {
    reviewId,
    reviewedAt,
    reviewer: APP_SOURCE,
    outcome,
    explanation:
      "Reviewed investment outcome translated at the Stocks Optimizer boundary.",
  };
}

function currentTagsFor(situation: StockAllocationSituation) {
  const riskTag =
    situation.marketRiskPct >= 70 ? "risk-pressure" : "normal-risk";
  const volatilityTag =
    situation.volatilityPct >= 60 ? "high-volatility" : "ordinary-volatility";
  const concentrationTag =
    situation.concentrationPct >= 50
      ? "concentrated-exposure"
      : "diversified-exposure";

  return [
    "capital-allocation",
    "reviewable-allocation",
    riskTag,
    volatilityTag,
    concentrationTag,
    ...(situation.tags ?? []).map((tag) => tag.toLowerCase()),
  ];
}

export function mapStockAllocationToSignalInput(
  situation: StockAllocationSituation,
  reviewedSituations: readonly ReviewedInvestmentSituation[] = defaultReviewedInvestmentHistory(
    situation,
  ),
): SignalLearningRuntimeInput {
  const ticker = keyForTicker(situation.ticker);
  const observedAt = nowFrom(situation);
  const instrumentId = domainIdentifier(ticker);
  const objectiveId = `objective:allocation:${ticker}`;
  const judgmentId = `judgment:${objectiveId}`;
  const positionId = `position:${ticker}`;
  const stateId = `state:${ticker}`;
  const evaluationId = `evaluation:${ticker}`;
  const thesisId = `assumption:thesis:${ticker}`;
  const totalExposure = situation.price * situation.shares;
  const riskPressure = clampPct(
    mean([
      situation.marketRiskPct,
      situation.liquidityRiskPct,
      situation.volatilityPct,
      situation.concentrationPct,
      situation.drawdownPct,
    ]),
  );
  const quality = Math.round(clampPct(100 - riskPressure * 0.7));
  const uncertainty = Math.round(clampPct(riskPressure));

  const objective: SignalObjective = {
    id: objectiveId,
    type: "Objective",
    label: `Review allocation posture for ${ticker}`,
    desiredState: "A reviewable allocation decision with explicit uncertainty.",
    priority: 75,
    createdAt: observedAt,
    traceRefs: [
      { refId: instrumentId, refType: "Position", role: "domain-identifier" },
    ],
    reviewRefs: [],
    explanation: [
      "Ticker is mapped to a domain identifier at the Stocks Optimizer adapter boundary.",
    ],
    metadata: {
      app: APP_SOURCE,
      ticker,
      allocationAdjustment: situation.allocationAdjustment,
    },
  };

  const evidence: SignalEvidence[] = [
    {
      id: `evidence:position-value:${ticker}`,
      type: "Evidence",
      label: "Position value and size",
      createdAt: observedAt,
      strength: 70,
      confidence: 76,
      traceRefs: baseTrace(positionId, "position"),
      reviewRefs: [],
      explanation: [
        "Price and shares are mapped to a generic Signal position.",
      ],
      metadata: {
        price: situation.price,
        shares: situation.shares,
        totalExposure,
      },
    },
    {
      id: `evidence:investment-thesis:${ticker}`,
      type: "Evidence",
      label: "Investment thesis evidence",
      createdAt: observedAt,
      strength: 64,
      confidence: Math.round(clampPct(100 - uncertainty * 0.35)),
      traceRefs: [{ refId: thesisId, refType: "Assumption", role: "thesis" }],
      reviewRefs: [],
      explanation: [situation.investmentThesis],
    },
  ];

  const positions: SignalPosition[] = [
    {
      id: positionId,
      type: "Position",
      label: `${ticker} position`,
      createdAt: observedAt,
      resourceId: instrumentId,
      quantity: situation.shares,
      traceRefs: [
        {
          refId: evidence[0].id,
          refType: "Evidence",
          role: "position-evidence",
        },
      ],
      reviewRefs: [],
      explanation: [
        "Price plus shares are represented as a generic Signal position.",
      ],
      metadata: {
        price: situation.price,
        totalExposure,
        portfolioExposurePct: situation.portfolioExposurePct,
      },
    },
  ];

  const state: SignalState = {
    id: stateId,
    type: "State",
    label: `${ticker} allocation state`,
    createdAt: observedAt,
    positionIds: [positionId],
    quality,
    uncertainty,
    traceRefs: [
      { refId: positionId, refType: "Position", role: "position-state" },
    ],
    reviewRefs: [],
    explanation: [
      "Portfolio exposure is mapped into Signal state quality and uncertainty.",
    ],
    metadata: {
      portfolioExposurePct: situation.portfolioExposurePct,
    },
  };

  const evaluation: SignalEvaluation = {
    id: evaluationId,
    type: "Evaluation",
    label: `${ticker} risk evaluation`,
    createdAt: observedAt,
    stateId,
    score: quality,
    confidence: Math.round(clampPct(100 - uncertainty * 0.4)),
    traceRefs: [{ refId: stateId, refType: "State", role: "state-evaluation" }],
    reviewRefs: [],
    explanation: [
      "Volatility, concentration, and drawdown are mapped to a generic Signal evaluation.",
    ],
    metadata: {
      volatilityPct: situation.volatilityPct,
      concentrationPct: situation.concentrationPct,
      drawdownPct: situation.drawdownPct,
    },
  };

  const constraints: SignalConstraint[] = [
    {
      id: `constraint:reviewability:${ticker}`,
      type: "Constraint",
      label: "Keep allocation reviewable",
      createdAt: observedAt,
      severity: 68,
      binding:
        situation.portfolioExposurePct > 35 || situation.drawdownPct > 22,
      traceRefs: [{ refId: stateId, refType: "State", role: "reviewability" }],
      reviewRefs: [],
      explanation: [
        "Allocation posture must stay reversible enough to review after outcomes are known.",
      ],
    },
  ];

  const threats: SignalThreat[] = [
    {
      id: `threat:market-risk:${ticker}`,
      type: "Threat",
      label: "Market risk pressure",
      createdAt: observedAt,
      severity: clampPct(situation.marketRiskPct),
      likelihood: clampPct(situation.volatilityPct),
      traceRefs: [{ refId: evaluationId, refType: "Evaluation", role: "risk" }],
      reviewRefs: [],
      explanation: ["Market risk is mapped to a Signal threat."],
    },
    {
      id: `threat:liquidity-risk:${ticker}`,
      type: "Threat",
      label: "Liquidity risk pressure",
      createdAt: observedAt,
      severity: clampPct(situation.liquidityRiskPct),
      likelihood: clampPct(
        mean([situation.liquidityRiskPct, situation.concentrationPct]),
      ),
      traceRefs: [{ refId: evaluationId, refType: "Evaluation", role: "risk" }],
      reviewRefs: [],
      explanation: ["Liquidity risk is mapped to a Signal threat."],
    },
  ];

  const assumptions: SignalAssumption[] = [
    {
      id: thesisId,
      type: "Assumption",
      label: `${ticker} investment thesis`,
      createdAt: observedAt,
      confidence: Math.round(clampPct(100 - uncertainty * 0.35)),
      status: "untested",
      traceRefs: [
        { refId: evidence[1].id, refType: "Evidence", role: "thesis-evidence" },
      ],
      reviewRefs: [],
      explanation: [
        "Investment thesis is mapped to a generic Signal assumption.",
        situation.investmentThesis,
      ],
    },
  ];

  const reviews = reviewedSituations.map(toSignalReview);
  const lessons = reviewedSituations.map(toSignalLesson);
  const reviewed = reviewedSituations.map(toSignalReviewedSituation);
  const relationships = reviewedSituations.flatMap((reviewedSituation) =>
    relationshipsForReviewedSituation(reviewedSituation, judgmentId),
  );

  return {
    objective,
    evidence,
    positions,
    state,
    evaluation,
    constraints,
    threats,
    assumptions,
    currentTags: currentTagsFor(situation),
    priorReviews: reviews,
    reviewedSituations: reviewed,
    lessons,
    relationships,
    now: observedAt,
  };
}

export function evaluateStocksLearningJudgment(
  situation: StockAllocationSituation,
  reviewedSituations?: readonly ReviewedInvestmentSituation[],
): StocksSignalLearningJudgment {
  const signalInput = mapStockAllocationToSignalInput(
    situation,
    reviewedSituations,
  );
  const signalResult = evaluateLearningJudgment(signalInput);
  const strongestSimilarity = signalResult.similarityMatches[0];
  const strongestLesson = signalResult.judgment.lessonRefs[0];
  const allocationPosture = postureToAllocationLanguage(
    signalResult.judgment.posture,
  );
  const lessonLine = strongestLesson
    ? `The strongest surviving lesson is ${strongestLesson}.`
    : "The strongest surviving lesson is still forming.";
  const similarityLine = strongestSimilarity
    ? `This resembles ${strongestSimilarity.situation.label}.`
    : "This resembles no reviewed situation strongly enough yet.";

  return {
    signalInput,
    signalResult,
    allocationPosture,
    reviewableLanguage: [
      similarityLine,
      "Previously reviewed situations suggest treating the current allocation as reviewable evidence, not certainty.",
      lessonLine,
      `The current judgment is ${signalResult.judgment.posture} with ${signalResult.judgment.confidence}/100 confidence.`,
      `The next allocation should remain reviewable as ${allocationPosture}.`,
    ],
  };
}

export function createReviewedLearningDemo() {
  return evaluateStocksLearningJudgment({
    ticker: "ACME",
    price: 42,
    shares: 30,
    portfolioExposurePct: 18,
    volatilityPct: 64,
    concentrationPct: 42,
    drawdownPct: 11,
    marketRiskPct: 66,
    liquidityRiskPct: 35,
    investmentThesis:
      "Momentum improved, but exposure should stay bounded until the thesis survives review.",
    allocationAdjustment: "hold",
    tags: ["momentum-rebound", "post-drawdown"],
  });
}

function toSignalReview(input: ReviewedInvestmentSituation): SignalReview {
  const reviewId = `review:${input.id}`;
  const lessonId = `lesson:${input.id}`;

  return {
    id: reviewId,
    type: "Review",
    label: `${input.label} postmortem`,
    createdAt: input.reviewedAt,
    outcomeId: `outcome:${input.id}`,
    whatHappened: input.postmortem,
    why: "The investment outcome was reviewed before being reused as current judgment evidence.",
    assumptionRefs: [`assumption:${input.id}`],
    lessonRefs: [lessonId],
    whatShouldChange: input.investmentLesson,
    traceRefs: [
      {
        refId: `outcome:${input.id}`,
        refType: "Outcome",
        role: "reviewed-outcome",
      },
    ],
    reviewRefs: [
      reviewRefFor(reviewId, input.reviewedAt, input.investmentOutcome),
    ],
    explanation: [input.postmortem],
    metadata: {
      app: APP_SOURCE,
      ticker: keyForTicker(input.ticker),
    },
  };
}

function toSignalLesson(input: ReviewedInvestmentSituation): SignalLesson {
  const reviewId = `review:${input.id}`;

  return {
    id: `lesson:${input.id}`,
    type: "Lesson",
    label: `${input.label} surviving lesson`,
    createdAt: input.reviewedAt,
    reviewCount: input.reviewCount,
    survivalCount: input.survivalCount,
    failureCount: input.failureCount,
    confidence: input.confidence,
    applicability: input.tags,
    domainCoverage: ["capital-allocation", "risk-sizing"],
    traceRefs: [{ refId: reviewId, refType: "Review", role: "review-source" }],
    reviewRefs: [
      reviewRefFor(reviewId, input.reviewedAt, input.investmentOutcome),
    ],
    explanation: [input.investmentLesson],
    metadata: {
      app: APP_SOURCE,
      ticker: keyForTicker(input.ticker),
    },
  };
}

function toSignalReviewedSituation(
  input: ReviewedInvestmentSituation,
): SignalReviewedSituation {
  const reviewId = `review:${input.id}`;

  return {
    id: `reviewed-situation:${input.id}`,
    label: input.label,
    tags: input.tags,
    decisionRef: `decision:${input.id}`,
    outcomeRef: `outcome:${input.id}`,
    reviewRef: reviewRefFor(
      reviewId,
      input.reviewedAt,
      input.investmentOutcome,
    ),
    assumptionRefs: [`assumption:${input.id}`],
    lessonRefs: [`lesson:${input.id}`],
    relationshipRefs: [
      `relationship:${reviewId}:lesson:${input.id}`,
      `relationship:lesson:${input.id}:current-judgment`,
    ],
    explanation: [input.postmortem, input.investmentLesson],
    metadata: {
      app: APP_SOURCE,
      ticker: keyForTicker(input.ticker),
    },
  };
}

function relationshipsForReviewedSituation(
  input: ReviewedInvestmentSituation,
  judgmentId: string,
): SignalRelationship[] {
  const reviewId = `review:${input.id}`;
  const lessonId = `lesson:${input.id}`;
  const reviewedAt = input.reviewedAt;
  const reviewRef = reviewRefFor(reviewId, reviewedAt, input.investmentOutcome);

  return [
    {
      id: `relationship:${reviewId}:lesson:${input.id}`,
      type: "Relationship",
      label: "Review produced lesson",
      sourceType: "Review",
      sourceId: reviewId,
      relationType: "produces",
      targetType: "Lesson",
      targetId: lessonId,
      strength: 84,
      confidence: input.confidence,
      createdAt: reviewedAt,
      updatedAt: reviewedAt,
      traceRefs: [{ refId: reviewId, refType: "Review", role: "source" }],
      reviewRefs: [reviewRef],
      explanation: [
        `The reviewed postmortem produced this investment lesson: ${input.investmentLesson}`,
      ],
    },
    {
      id: `relationship:lesson:${input.id}:current-judgment`,
      type: "Relationship",
      label: "Lesson applies to current judgment",
      sourceType: "Lesson",
      sourceId: lessonId,
      relationType: "applies_to",
      targetType: "Judgment",
      targetId: judgmentId,
      strength: 78,
      confidence: input.confidence,
      createdAt: reviewedAt,
      updatedAt: reviewedAt,
      traceRefs: [{ refId: lessonId, refType: "Lesson", role: "source" }],
      reviewRefs: [reviewRef],
      explanation: [
        "The lesson applies because the current allocation shares the reviewed situation tags.",
      ],
    },
  ];
}

function postureToAllocationLanguage(
  posture: SignalLearningRuntimeResult["judgment"]["posture"],
) {
  if (posture === "proceed") return "a measured allocation";
  if (posture === "proceed-reversibly") return "a reversible allocation";
  if (posture === "reduce") return "a reduced allocation";
  if (posture === "avoid") return "no new allocation";
  return "continued observation";
}

function defaultReviewedInvestmentHistory(
  situation: StockAllocationSituation,
): ReviewedInvestmentSituation[] {
  const ticker = keyForTicker(situation.ticker);

  return [
    {
      id: `${ticker.toLowerCase()}:post-drawdown-review`,
      ticker,
      label: `${ticker} post-drawdown allocation review`,
      investmentOutcome: "survived",
      postmortem:
        "A prior allocation held up when exposure stayed capped during volatile recovery conditions.",
      investmentLesson:
        "Cap exposure until momentum and liquidity both survive review.",
      tags: [
        "capital-allocation",
        "reviewable-allocation",
        "high-volatility",
        "post-drawdown",
      ],
      reviewCount: 3,
      survivalCount: 3,
      failureCount: 0,
      confidence: 82,
      reviewedAt: "2026-05-20T12:00:00.000Z",
    },
  ];
}
