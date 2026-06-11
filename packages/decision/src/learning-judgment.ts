import type {
  DecisionReversibility,
  SignalAssumption,
  SignalConstraint,
  SignalEvaluation,
  SignalEvidence,
  SignalJudgment,
  SignalLearningRuntimeInput,
  SignalLearningRuntimeResult,
  SignalLesson,
  SignalLessonSurvival,
  SignalLineage,
  SignalRelationship,
  SignalRelationshipExplanation,
  SignalRelationshipLookup,
  SignalRelationshipMemory,
  SignalReviewRef,
  SignalReviewedHistory,
  SignalReviewedSituation,
  SignalSimilarityMatch,
  SignalState,
  SignalStrategy,
  SignalThreat,
  SignalTradeoff,
} from "./types";
import {
  asScore,
  average,
  clamp,
  nowIso,
  stableId,
  uniqueStrings,
} from "./utils";

export const SIGNAL_UNIVERSAL_LIFECYCLE = [
  "Objective",
  "Resources",
  "Allocation",
  "Position",
  "State",
  "Evaluation",
  "Constraints",
  "Threats",
  "Assumptions",
  "Similarity",
  "Reviewed History",
  "Judgment",
  "Tradeoffs",
  "Strategies",
  "Execution",
  "Outcome",
  "Observation",
  "Review",
  "Verification",
  "Lesson",
] as const;

export function createSignalRelationshipMemory(
  relationships: readonly SignalRelationship[] = [],
): SignalRelationshipMemory {
  const snapshot = [...relationships];

  return {
    relationships: snapshot,
    lookup(query: SignalRelationshipLookup = {}) {
      return lookupSignalRelationships(snapshot, query);
    },
    explain(query: SignalRelationshipLookup = {}) {
      return explainSignalRelationships(snapshot, query);
    },
    lineage(entityId: string) {
      return traceSignalLineage(snapshot, entityId);
    },
  };
}

export function lookupSignalRelationships(
  relationships: readonly SignalRelationship[],
  query: SignalRelationshipLookup = {},
): SignalRelationship[] {
  return relationships.filter((relationship) => {
    if (
      query.sourceId !== undefined &&
      relationship.sourceId !== query.sourceId
    )
      return false;
    if (
      query.targetId !== undefined &&
      relationship.targetId !== query.targetId
    )
      return false;
    if (
      query.relationType !== undefined &&
      relationship.relationType !== query.relationType
    )
      return false;
    if (
      query.entityId !== undefined &&
      relationship.sourceId !== query.entityId &&
      relationship.targetId !== query.entityId
    )
      return false;
    if (
      query.reviewId !== undefined &&
      !relationship.reviewRefs.some(
        (review) => review.reviewId === query.reviewId,
      )
    )
      return false;
    return true;
  });
}

export function explainSignalRelationships(
  relationships: readonly SignalRelationship[],
  query: SignalRelationshipLookup = {},
): SignalRelationshipExplanation[] {
  return lookupSignalRelationships(relationships, query).map(
    (relationship) => ({
      relationshipId: relationship.id,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      relationType: relationship.relationType,
      explanation: relationship.explanation.join(" "),
      reviewRefs: [...relationship.reviewRefs],
      strength: relationship.strength,
      confidence: relationship.confidence,
    }),
  );
}

export function traceSignalLineage(
  relationships: readonly SignalRelationship[],
  entityId: string,
): SignalLineage {
  const explanations = explainSignalRelationships(relationships, { entityId });
  const related = lookupSignalRelationships(relationships, { entityId });
  const reviewRefs = uniqueReviewRefs(
    related.flatMap((relationship) => relationship.reviewRefs),
  );
  const lessonRefs = uniqueStrings(
    related.flatMap((relationship) => {
      const refs: string[] = [];
      if (relationship.sourceType === "Lesson")
        refs.push(relationship.sourceId);
      if (relationship.targetType === "Lesson")
        refs.push(relationship.targetId);
      return refs;
    }),
  );
  const judgmentRefs = uniqueStrings(
    related.flatMap((relationship) => {
      const refs: string[] = [];
      if (relationship.sourceType === "Judgment")
        refs.push(relationship.sourceId);
      if (relationship.targetType === "Judgment")
        refs.push(relationship.targetId);
      return refs;
    }),
  );
  const similarityRefs = uniqueStrings(
    related.flatMap((relationship) => {
      const refs: string[] = [];
      if (relationship.sourceType === "Similarity")
        refs.push(relationship.sourceId);
      if (relationship.targetType === "Similarity")
        refs.push(relationship.targetId);
      return refs;
    }),
  );

  return {
    entityId,
    relationships: explanations,
    reviewRefs,
    lessonRefs,
    judgmentRefs,
    similarityRefs,
    explanation: explanations.length
      ? explanations.map(
          (item) =>
            `${item.sourceId} ${item.relationType} ${item.targetId}: ${item.explanation}`,
        )
      : [`No reviewed relationship lineage is recorded for ${entityId}.`],
  };
}

export function assessSignalLessonSurvival(
  lessons: readonly SignalLesson[] = [],
): SignalLessonSurvival[] {
  return lessons
    .map((lesson) => {
      const reviewCount = Math.max(0, Math.round(lesson.reviewCount));
      const survivalCount = Math.max(0, Math.round(lesson.survivalCount));
      const failureCount = Math.max(0, Math.round(lesson.failureCount));
      const denominator = survivalCount + failureCount;
      const survivalRate =
        denominator === 0 ? 0 : Math.round((survivalCount / denominator) * 100);
      const reviewedWeight = Math.min(20, reviewCount * 4);
      const repeatedWeight = Math.min(20, survivalCount * 5);
      const applicabilityWeight = Math.min(10, lesson.applicability.length * 2);
      const coverageWeight = Math.min(10, lesson.domainCoverage.length * 2);
      const failurePenalty = Math.min(25, failureCount * 6);
      const preferenceScore = Math.round(
        clamp(
          asScore(lesson.confidence, 50) * 0.35 +
            survivalRate * 0.25 +
            reviewedWeight +
            repeatedWeight +
            applicabilityWeight +
            coverageWeight -
            failurePenalty,
        ),
      );

      return {
        lessonId: lesson.id,
        survivalCount,
        failureCount,
        reviewCount,
        confidence: asScore(lesson.confidence, 50),
        survivalRate,
        applicability: [...lesson.applicability],
        domainCoverage: [...lesson.domainCoverage],
        preferenceScore,
        explanation: `Lesson ${lesson.id} is preferred at ${preferenceScore}/100 because it has ${reviewCount} reviews, ${survivalCount} survivals, and ${failureCount} failures.`,
      };
    })
    .sort(
      (a, b) =>
        b.preferenceScore - a.preferenceScore ||
        a.lessonId.localeCompare(b.lessonId),
    );
}

export function findSignalSimilarityMatches(input: {
  objectiveId: string;
  currentTags?: readonly string[];
  reviewedSituations?: readonly SignalReviewedSituation[];
  lessons?: readonly SignalLesson[];
  relationships?: readonly SignalRelationship[];
  now?: string;
}): SignalSimilarityMatch[] {
  const tags = normalizeTags(input.currentTags ?? []);
  const lessonSurvival = assessSignalLessonSurvival(input.lessons ?? []);
  const lessonById = new Map(
    lessonSurvival.map((lesson) => [lesson.lessonId, lesson]),
  );
  const now = input.now ?? nowIso();

  return (input.reviewedSituations ?? [])
    .map((situation) => {
      const situationTags = normalizeTags(situation.tags);
      const sharedTags = tags.filter((tag) => situationTags.includes(tag));
      const tagScore =
        tags.length === 0
          ? 0
          : Math.round(
              (sharedTags.length /
                Math.max(tags.length, situationTags.length, 1)) *
                100,
            );
      const relationshipScore = relationshipSimilarityScore(
        input.relationships ?? [],
        situation.relationshipRefs ?? [],
      );
      const score = Math.round(clamp(tagScore * 0.8 + relationshipScore * 0.2));
      const lessons = uniqueStrings(situation.lessonRefs ?? [])
        .map((lessonId) => lessonById.get(lessonId))
        .filter(
          (lesson): lesson is SignalLessonSurvival => lesson !== undefined,
        );
      const reviewRefs =
        situation.reviewRef === undefined ? [] : [situation.reviewRef];

      return {
        id: stableId("similarity", situation.id),
        type: "Similarity" as const,
        label: `Similarity to ${situation.label}`,
        sourceId: input.objectiveId,
        targetId: situation.id,
        score,
        basis: sharedTags.length
          ? sharedTags
          : ["reviewed situation available"],
        lessonRefs: lessons.map((lesson) => lesson.lessonId),
        traceRefs: [
          { refId: input.objectiveId, refType: "Objective", role: "current" },
          {
            refId: situation.id,
            refType: "ReviewedHistory",
            role: "historical",
          },
        ],
        reviewRefs,
        explanation: [
          score > 0
            ? `This resembles ${situation.label} through ${sharedTags.join(", ") || "recorded relationship context"}.`
            : `${situation.label} is reviewed history but has weak similarity to the current tags.`,
        ],
        situation,
        lessons,
        metadata: {
          createdAt: now,
        },
      };
    })
    .filter((match) => match.score > 0 || match.lessons.length > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

export function buildSignalReviewedHistory(input: {
  id?: string;
  label?: string;
  situations?: readonly SignalReviewedSituation[];
  reviews?: readonly SignalReviewRef[];
  relationships?: readonly SignalRelationship[];
  now?: string;
}): SignalReviewedHistory {
  const situations = input.situations ?? [];
  const relationshipRefs = uniqueStrings([
    ...situations.flatMap((situation) => situation.relationshipRefs ?? []),
    ...(input.relationships ?? []).map((relationship) => relationship.id),
  ]);
  const reviewRefs = uniqueReviewRefs([
    ...situations.flatMap((situation) =>
      situation.reviewRef === undefined ? [] : [situation.reviewRef],
    ),
    ...(input.reviews ?? []),
  ]);

  return {
    id: input.id ?? "reviewed-history:current",
    type: "ReviewedHistory",
    label: input.label ?? "Reviewed history for current judgment",
    createdAt: input.now ?? nowIso(),
    traceRefs: situations.map((situation) => ({
      refId: situation.id,
      refType: "ReviewedHistory",
      role: "source",
    })),
    reviewRefs,
    explanation: [
      `Reviewed history contains ${situations.length} situations, ${reviewRefs.length} reviews, and ${relationshipRefs.length} relationships.`,
    ],
    decisionRefs: uniqueStrings(
      situations.flatMap((situation) => situation.decisionRef ?? []),
    ),
    outcomeRefs: uniqueStrings(
      situations.flatMap((situation) => situation.outcomeRef ?? []),
    ),
    assumptionRefs: uniqueStrings(
      situations.flatMap((situation) => situation.assumptionRefs ?? []),
    ),
    lessonRefs: uniqueStrings(
      situations.flatMap((situation) => situation.lessonRefs ?? []),
    ),
    relationshipRefs,
  };
}

export function evaluateLearningJudgment(
  input: SignalLearningRuntimeInput,
): SignalLearningRuntimeResult {
  const now = input.now ?? nowIso();
  const relationships = input.relationships ?? [];
  const relationshipMemory = createSignalRelationshipMemory(relationships);
  const state = input.state ?? buildState(input, now);
  const lessonSurvival = assessSignalLessonSurvival(input.lessons ?? []);
  const similarityMatches = findSignalSimilarityMatches({
    objectiveId: input.objective.id,
    currentTags: input.currentTags,
    reviewedSituations: input.reviewedSituations,
    lessons: input.lessons,
    relationships,
    now,
  });
  const reviewedHistory = buildSignalReviewedHistory({
    situations: input.reviewedSituations,
    reviews: input.priorReviews?.map((review) => ({
      reviewId: review.id,
      reviewedAt: review.createdAt,
    })),
    relationships,
    now,
  });
  const evaluation =
    input.evaluation ??
    buildEvaluation(input, state, lessonSurvival, similarityMatches, now);
  const constraints = [...(input.constraints ?? [])];
  const threats = [...(input.threats ?? [])];
  const assumptions = [...(input.assumptions ?? [])];
  const judgment = buildJudgment({
    input,
    state,
    evaluation,
    constraints,
    threats,
    assumptions,
    similarityMatches,
    reviewedHistory,
    lessonSurvival,
    relationships,
    now,
  });
  const tradeoffs = buildTradeoffs(judgment, constraints, threats, now);
  const strategies = buildStrategies(judgment, tradeoffs, now);
  const strongestLesson = lessonSurvival[0];
  const strongestSimilarity = similarityMatches[0];
  const lineage = relationshipMemory.lineage(judgment.id);
  const rationale = uniqueStrings([
    `The current judgment is ${judgment.posture} with ${judgment.confidence}/100 confidence and ${judgment.uncertainty}/100 uncertainty.`,
    strongestSimilarity === undefined
      ? "No strong reviewed similarity was found."
      : `Previously reviewed situations suggest: ${strongestSimilarity.label}.`,
    strongestLesson === undefined
      ? "No surviving lesson was available."
      : `The strongest surviving lesson is ${strongestLesson.lessonId} at ${strongestLesson.preferenceScore}/100.`,
    "The next allocation should remain reviewable and reversible where possible.",
    ...lineage.explanation,
  ]);

  return {
    state,
    evaluation,
    constraints,
    threats,
    assumptions,
    similarityMatches,
    reviewedHistory,
    judgment,
    tradeoffs,
    strategies,
    rationale,
  };
}

function buildState(
  input: SignalLearningRuntimeInput,
  now: string,
): SignalState {
  const evidenceQuality = average(
    (input.evidence ?? []).map((item) =>
      asScore(item.confidence, item.strength),
    ),
    50,
  );

  return {
    id: stableId("state", input.objective.id),
    type: "State",
    label: "Current reviewed state",
    createdAt: now,
    positionIds: (input.positions ?? []).map((position) => position.id),
    quality: Math.round(evidenceQuality),
    uncertainty: Math.round(clamp(100 - evidenceQuality)),
    traceRefs: [
      { refId: input.objective.id, refType: "Objective", role: "state-input" },
      ...(input.evidence ?? []).map((evidence) => ({
        refId: evidence.id,
        refType: "Evidence" as const,
        role: "state-evidence",
      })),
    ],
    reviewRefs: [],
    explanation: [
      "State was assembled from the current objective, positions, and evidence before any new outcome exists.",
    ],
  };
}

function buildEvaluation(
  input: SignalLearningRuntimeInput,
  state: SignalState,
  lessonSurvival: readonly SignalLessonSurvival[],
  similarityMatches: readonly SignalSimilarityMatch[],
  now: string,
): SignalEvaluation {
  const lessonScore = average(
    lessonSurvival.slice(0, 3).map((lesson) => lesson.preferenceScore),
    50,
  );
  const similarityScore = average(
    similarityMatches.slice(0, 3).map((match) => match.score),
    50,
  );
  const score = Math.round(
    clamp(average([state.quality, lessonScore, similarityScore])),
  );
  const confidence = Math.round(
    clamp(average([state.quality, lessonScore]) - state.uncertainty * 0.15),
  );

  return {
    id: stableId("evaluation", input.objective.id),
    type: "Evaluation",
    label: "Learning-informed evaluation",
    createdAt: now,
    stateId: state.id,
    score,
    confidence,
    traceRefs: [
      { refId: state.id, refType: "State", role: "current-state" },
      ...lessonSurvival.slice(0, 3).map((lesson) => ({
        refId: lesson.lessonId,
        refType: "Lesson" as const,
        role: "surviving-lesson",
      })),
    ],
    reviewRefs: [],
    explanation: [
      `Evaluation combines current state quality ${state.quality}/100 with reviewed lesson and similarity evidence.`,
    ],
  };
}

function buildJudgment(input: {
  input: SignalLearningRuntimeInput;
  state: SignalState;
  evaluation: SignalEvaluation;
  constraints: readonly SignalConstraint[];
  threats: readonly SignalThreat[];
  assumptions: readonly SignalAssumption[];
  similarityMatches: readonly SignalSimilarityMatch[];
  reviewedHistory: SignalReviewedHistory;
  lessonSurvival: readonly SignalLessonSurvival[];
  relationships: readonly SignalRelationship[];
  now: string;
}): SignalJudgment {
  const bindingConstraint = input.constraints.some(
    (constraint) => constraint.binding && constraint.severity >= 70,
  );
  const threatPressure = average(
    input.threats.map(
      (threat) => (asScore(threat.severity) * asScore(threat.likelihood)) / 100,
    ),
    0,
  );
  const failedAssumptionPressure =
    input.assumptions.filter((assumption) => assumption.status === "failed")
      .length * 12;
  const lessonSupport = average(
    input.lessonSurvival.slice(0, 3).map((lesson) => lesson.preferenceScore),
    50,
  );
  const similaritySupport = average(
    input.similarityMatches.slice(0, 3).map((match) => match.score),
    50,
  );
  const relationshipSupport = average(
    input.relationships
      .filter(
        (relationship) =>
          relationship.targetType === "Judgment" ||
          relationship.relationType === "applies_to",
      )
      .map((relationship) =>
        asScore(relationship.confidence, relationship.strength),
      ),
    50,
  );
  const confidence = Math.round(
    clamp(
      average([
        input.evaluation.confidence,
        lessonSupport,
        similaritySupport,
        relationshipSupport,
      ]) -
        threatPressure * 0.2 -
        failedAssumptionPressure,
    ),
  );
  const uncertainty = Math.round(
    clamp(100 - confidence + threatPressure * 0.2),
  );
  const posture = choosePosture(
    bindingConstraint,
    confidence,
    uncertainty,
    threatPressure,
  );

  return {
    id: stableId("judgment", input.input.objective.id),
    type: "Judgment",
    label: "Learning-informed judgment",
    createdAt: input.now,
    objectiveRefs: uniqueStrings([
      input.input.objective.id,
      ...(input.input.objectives ?? []).map((objective) => objective.id),
    ]),
    evidenceRefs: (input.input.evidence ?? []).map((evidence) => evidence.id),
    stateRef: input.state.id,
    constraintRefs: input.constraints.map((constraint) => constraint.id),
    threatRefs: input.threats.map((threat) => threat.id),
    assumptionRefs: input.assumptions.map((assumption) => assumption.id),
    reviewedHistoryRefs: [input.reviewedHistory.id],
    lessonRefs: input.lessonSurvival
      .slice(0, 5)
      .map((lesson) => lesson.lessonId),
    relationshipRefs: input.relationships.map(
      (relationship) => relationship.id,
    ),
    confidence,
    uncertainty,
    posture,
    futureOutcomeRequired: false,
    traceRefs: [
      { refId: input.state.id, refType: "State", role: "current-state" },
      {
        refId: input.evaluation.id,
        refType: "Evaluation",
        role: "current-evaluation",
      },
      {
        refId: input.reviewedHistory.id,
        refType: "ReviewedHistory",
        role: "reviewed-history",
      },
      ...input.lessonSurvival.slice(0, 3).map((lesson) => ({
        refId: lesson.lessonId,
        refType: "Lesson" as const,
        role: "surviving-lesson",
      })),
    ],
    reviewRefs: input.reviewedHistory.reviewRefs,
    explanation: [
      "Judgment uses current evidence, state, constraints, threats, assumptions, reviewed history, similarity, surviving lessons, and relationship memory.",
      "It is a present judgment, not a claim about a future outcome.",
      `Posture ${posture} reflects confidence ${confidence}/100 and uncertainty ${uncertainty}/100.`,
    ],
  };
}

function buildTradeoffs(
  judgment: SignalJudgment,
  constraints: readonly SignalConstraint[],
  threats: readonly SignalThreat[],
  now: string,
): SignalTradeoff[] {
  const highestThreat = [...threats].sort((a, b) => b.severity - a.severity)[0];
  const bindingConstraint = constraints.find(
    (constraint) => constraint.binding,
  );
  const reversibility: DecisionReversibility =
    judgment.posture === "proceed" ? "medium" : "high";

  return [
    {
      id: stableId("tradeoff", judgment.id),
      type: "Tradeoff",
      label: "Discipline versus optionality",
      createdAt: now,
      optionIds: [judgment.id],
      benefit: "Uses reviewed learning while preserving a clear review trail.",
      cost:
        highestThreat?.label ??
        bindingConstraint?.label ??
        "Some uncertainty remains unresolved.",
      reversibility,
      traceRefs: [{ refId: judgment.id, refType: "Judgment", role: "basis" }],
      reviewRefs: [...judgment.reviewRefs],
      explanation: [
        "The tradeoff keeps the current decision reviewable instead of treating the rationale as settled.",
      ],
    },
  ];
}

function buildStrategies(
  judgment: SignalJudgment,
  tradeoffs: readonly SignalTradeoff[],
  now: string,
): SignalStrategy[] {
  const quality = Math.round(
    clamp(judgment.confidence - judgment.uncertainty * 0.2),
  );

  return [
    {
      id: stableId("strategy", judgment.id),
      type: "Strategy",
      label: strategyLabel(judgment.posture),
      createdAt: now,
      judgmentId: judgment.id,
      tradeoffIds: tradeoffs.map((tradeoff) => tradeoff.id),
      quality,
      reversible: judgment.posture !== "proceed",
      traceRefs: [
        { refId: judgment.id, refType: "Judgment", role: "strategy-source" },
      ],
      reviewRefs: [...judgment.reviewRefs],
      explanation: [
        "Strategy quality is evaluated separately from execution quality; no execution quality is assumed before action.",
      ],
    },
  ];
}

function choosePosture(
  bindingConstraint: boolean,
  confidence: number,
  uncertainty: number,
  threatPressure: number,
): SignalJudgment["posture"] {
  if (bindingConstraint || threatPressure >= 80 || confidence < 25)
    return "avoid";
  if (confidence < 45 || uncertainty >= 75) return "wait";
  if (threatPressure >= 60 || uncertainty >= 55) return "reduce";
  if (uncertainty >= 35) return "proceed-reversibly";
  return "proceed";
}

function strategyLabel(posture: SignalJudgment["posture"]): string {
  if (posture === "avoid") return "Do not allocate new resources";
  if (posture === "wait") return "Wait for better evidence";
  if (posture === "reduce") return "Reduce exposure to unresolved uncertainty";
  if (posture === "proceed-reversibly") return "Proceed in a reversible way";
  return "Proceed with reviewable discipline";
}

function normalizeTags(tags: readonly string[]): string[] {
  return uniqueStrings(tags.map((tag) => tag.toLowerCase()));
}

function relationshipSimilarityScore(
  relationships: readonly SignalRelationship[],
  relationshipRefs: readonly string[],
): number {
  if (!relationshipRefs.length) return 0;
  const refs = new Set(relationshipRefs);
  const matched = relationships.filter((relationship) =>
    refs.has(relationship.id),
  );
  if (!matched.length) return 0;
  return Math.round(
    average(
      matched.map((relationship) =>
        average([
          asScore(relationship.strength),
          asScore(relationship.confidence),
        ]),
      ),
    ),
  );
}

function uniqueReviewRefs(refs: readonly SignalReviewRef[]): SignalReviewRef[] {
  const seen = new Set<string>();
  const result: SignalReviewRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.reviewId)) continue;
    seen.add(ref.reviewId);
    result.push(ref);
  }
  return result;
}
