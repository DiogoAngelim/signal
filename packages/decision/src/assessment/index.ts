import type {
  AssessmentFact,
  AssessmentFactInput,
  AssessmentFactStatus,
  DecisionAssessment,
  DecisionAssessmentInput,
  DecisionConfidenceDiscipline,
  DecisionEvidence,
  DecisionEvidenceInput,
  DecisionEvidenceQualityAssessment,
  DecisionGovernanceAssessment,
  DecisionJournal,
  DecisionJournalTraceRef,
  DecisionJournalTraceRefType,
  DecisionJournalTraceability,
  DecisionLearning,
  DecisionLearningOutcome,
  DecisionLearningPattern,
  DecisionNextBestEvidence,
  DecisionOutcomeReview,
  DecisionOutcomeReviewInput,
  DecisionReversibility,
  DecisionReversibilityAssessment,
  DecisionReversibilityInput,
  DecisionStewardshipAssessment,
  DecisionThreat,
  DecisionThreatInput,
} from "../types";
import {
  asScore,
  average,
  clamp,
  nowIso,
  stableId,
  uniqueStrings,
} from "../utils";

type EvidenceReferenceTraceability = DecisionJournalTraceability & {
  traceRefs: DecisionJournalTraceRef[];
};

export function assessDecisionEvidence(
  input: DecisionAssessmentInput = {},
): DecisionAssessment {
  const createdAt = input.createdAt ?? nowIso();
  const evidence = normalizeEvidence(input.evidence ?? []);
  const known = normalizeFacts(input.known ?? [], "known", "known");
  const unknowns = normalizeFacts(input.unknowns ?? [], "unknown", "unknown");
  const assumptions = normalizeFacts(
    input.assumptions ?? [],
    "assumed",
    "assumption",
  );
  const contradicted = normalizeFacts(
    input.contradicted ?? [],
    "contradicted",
    "contradiction",
  );
  const threats = normalizeThreats(input.threats ?? []);
  const referenceTraceability = assessEvidenceReferenceTraceability(
    evidence,
    { known, unknowns, assumptions, contradicted },
    threats,
  );
  const evidenceQuality = assessEvidenceQuality(
    evidence,
    contradicted,
    referenceTraceability,
  );
  const confidence = assessConfidence(
    input.desiredConfidence,
    evidenceQuality,
    assumptions,
    unknowns,
  );
  const nextBestEvidence = chooseNextBestEvidence(
    input.nextBestEvidence,
    evidenceQuality,
    assumptions,
    unknowns,
    contradicted,
  );
  const governance = assessGovernance(
    evidenceQuality,
    confidence,
    assumptions,
    unknowns,
    contradicted,
    nextBestEvidence,
  );
  const stewardship = assessStewardshipFromAssessment(
    input,
    threats,
    evidenceQuality,
    confidence,
    governance,
  );
  const journal = createDecisionJournal({
    decisionId: input.decisionId ?? "decision:unassigned",
    createdAt,
    evidence,
    known,
    assumptions,
    unknowns,
    contradicted,
    threats,
    traceability: referenceTraceability,
    reasoningSummary: input.reasoningSummary,
  });

  return {
    ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
    createdAt,
    evidence,
    known,
    unknowns,
    assumptions,
    contradicted,
    evidenceQuality,
    confidence,
    governance,
    stewardship,
    nextBestEvidence,
    journal,
    explanation: [
      `Evidence quality is ${evidenceQuality.quality}/100.`,
      `Confidence is capped at ${confidence.cap}/100 by visible evidence limits.`,
      `Governance visibility is ${governance.score}/100.`,
      `Stewardship recommends ${stewardship.recommendation}.`,
    ],
  };
}

export function createDecisionJournal(input: {
  decisionId: string;
  createdAt?: string;
  evidence: readonly DecisionEvidence[];
  known?: readonly AssessmentFact[];
  assumptions: readonly AssessmentFact[];
  unknowns: readonly AssessmentFact[];
  contradicted: readonly AssessmentFact[];
  threats?: readonly DecisionThreat[];
  traceability?: EvidenceReferenceTraceability;
  reasoningSummary?: string;
}): DecisionJournal {
  const contradictionEvidence = input.evidence
    .filter((item) => item.direction === "contradicting")
    .map((item) => item.label);
  const traceability =
    input.traceability ??
    assessEvidenceReferenceTraceability(
      input.evidence,
      {
        known: input.known ?? [],
        unknowns: input.unknowns,
        assumptions: input.assumptions,
        contradicted: input.contradicted,
      },
      input.threats ?? [],
    );

  return {
    decisionId: input.decisionId,
    createdAt: input.createdAt ?? nowIso(),
    evidenceUsed: input.evidence.map((item) => item.evidenceId),
    assumptionsUsed: input.assumptions.map((item) => item.label),
    contradictionsPresent: uniqueStrings([
      ...input.contradicted.map((item) => item.label),
      ...contradictionEvidence,
    ]),
    unknownsPresent: input.unknowns.map((item) => item.label),
    reasoningSummary:
      input.reasoningSummary?.trim() ||
      "Decision context captured before the outcome was known.",
    traceRefs: traceability.traceRefs,
    traceability: journalTraceability(traceability),
  };
}

export function reviewDecisionOutcome(
  input: DecisionOutcomeReviewInput,
): DecisionOutcomeReview {
  const assumptions = input.assumptions ?? [];
  const evidence = input.evidence ?? [];
  const assumptionFailures = assumptions.filter(
    (item) => item.status === "failed",
  );
  const assumptionSurvivals = assumptions.filter(
    (item) => item.status === "survived",
  );
  const evidenceThatMattered = evidence.filter(
    (item) => item.role === "mattered",
  );
  const evidenceThatMisled = evidence.filter(
    (item) => item.role === "misleading",
  );
  const learning = generateDecisionLearning(input);
  const lessons = uniqueStrings([
    ...(input.lessons ?? []),
    learning.whatShouldChange,
    ...assumptionFailures.map(
      (item) => `Review assumption next time: ${item.label}.`,
    ),
    ...evidenceThatMisled.map(
      (item) => `Treat this evidence more cautiously next time: ${item.label}.`,
    ),
  ]);

  return {
    reviewId: input.reviewId ?? stableId("review", input.decisionId),
    decisionId: input.decisionId,
    reviewedAt: input.reviewedAt ?? nowIso(),
    whatHappened: input.whatHappened,
    why:
      input.why?.trim() ||
      "The outcome review did not identify a single cause yet.",
    surprises: uniqueStrings(input.surprises ?? []),
    assumptionFailures,
    assumptionSurvivals,
    evidenceThatMattered,
    evidenceThatMisled,
    lessons,
    learning,
  };
}

export function generateDecisionLearning(
  input: DecisionOutcomeReviewInput,
): DecisionLearning {
  const assumptions = input.assumptions ?? [];
  const evidence = input.evidence ?? [];
  const failed = assumptions.some((item) => item.status === "failed");
  const survived = assumptions.some((item) => item.status === "survived");
  const misleading = evidence.some((item) => item.role === "misleading");
  const mattered = evidence.some((item) => item.role === "mattered");
  const outcome: DecisionLearningOutcome =
    failed || misleading
      ? survived || mattered
        ? "mixed"
        : "contradicted"
      : survived || mattered
        ? "confirmed"
        : "unknown";

  return {
    learningId: stableId("learning", input.reviewId ?? input.decisionId),
    decisionId: input.decisionId,
    whatHappened: input.whatHappened,
    why: input.why?.trim() || "The reason is still uncertain.",
    whatShouldChange: input.whatShouldChange?.trim() || defaultChange(outcome),
    outcome,
  };
}

export function deriveLearningPatterns(
  learnings: readonly DecisionLearning[],
): DecisionLearningPattern[] {
  const groups = new Map<string, DecisionLearning[]>();
  for (const learning of learnings) {
    const key = learning.whatShouldChange.trim().toLowerCase();
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(learning);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const confirmations = group.filter(
        (item) => item.outcome === "confirmed",
      ).length;
      const contradictions = group.filter(
        (item) => item.outcome === "contradicted" || item.outcome === "mixed",
      ).length;
      const denominator = confirmations + contradictions;
      const survivalRate =
        denominator === 0 ? 0 : Math.round((confirmations / denominator) * 100);
      const lesson = group[0]?.whatShouldChange ?? key;

      return {
        patternId: stableId("pattern", key),
        lesson,
        frequency: group.length,
        confirmations,
        contradictions,
        survivalRate,
        explanation:
          "Repeated lessons improve process quality; they do not increase decision confidence by themselves.",
      };
    })
    .sort(
      (a, b) => b.frequency - a.frequency || a.lesson.localeCompare(b.lesson),
    );
}

function normalizeEvidence(
  values: readonly DecisionEvidenceInput[],
): DecisionEvidence[] {
  return values.map((value, index) => {
    const quality = asScore(value.quality, 50);
    const reliability = asScore(value.reliability, quality);
    const freshness = asScore(value.freshness, quality);
    const independence = asScore(value.independence, quality);
    const replication = asScore(value.replication, quality);
    const calibration = asScore(value.calibration, quality);
    const traceability = asScore(value.traceability, quality);

    return {
      evidenceId: value.evidenceId ?? `evidence:${index + 1}`,
      label: value.label,
      summary: value.summary ?? value.label,
      direction: value.direction ?? "neutral",
      quality,
      reliability,
      freshness,
      independence,
      replication,
      calibration,
      traceability,
      strength: asScore(value.strength, quality),
      ...(value.source === undefined ? {} : { source: value.source }),
      ...(value.observedAt === undefined
        ? {}
        : { observedAt: value.observedAt }),
      supports: [...(value.supports ?? [])],
      contradicts: [...(value.contradicts ?? [])],
      ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
    };
  });
}

function normalizeFacts(
  values: readonly AssessmentFactInput[],
  status: AssessmentFactStatus,
  prefix: string,
): AssessmentFact[] {
  return values.map((value, index) => {
    if (typeof value === "string") {
      return {
        factId: `${prefix}:${index + 1}`,
        label: value,
        summary: value,
        status,
        evidenceIds: [],
      };
    }

    return {
      factId: value.factId ?? `${prefix}:${index + 1}`,
      label: value.label,
      summary: value.summary ?? value.label,
      status,
      evidenceIds: [...(value.evidenceIds ?? [])],
      ...(value.reviewAfter === undefined
        ? {}
        : { reviewAfter: value.reviewAfter }),
      ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
    };
  });
}

function assessEvidenceQuality(
  evidence: readonly DecisionEvidence[],
  contradicted: readonly AssessmentFact[],
  traceability: EvidenceReferenceTraceability,
): DecisionEvidenceQualityAssessment {
  const reliability = averageEvidence(evidence, "reliability");
  const freshness = averageEvidence(evidence, "freshness");
  const independence = averageEvidence(evidence, "independence");
  const replication = averageEvidence(evidence, "replication");
  const calibration = averageEvidence(evidence, "calibration");
  const evidenceTraceabilityScore = averageEvidence(evidence, "traceability");
  const rawQuality = averageEvidence(evidence, "quality");
  const contradictionPressure = assessContradictionPressure(
    evidence,
    contradicted,
  );
  const referenceCoverage = traceability.evidenceReferenceCoverage;
  const quality = Math.round(
    clamp(
      average(
        [
          rawQuality,
          reliability,
          freshness,
          independence,
          replication,
          calibration,
          evidenceTraceabilityScore,
          referenceCoverage,
        ],
        0,
      ) -
        contradictionPressure * 0.12,
    ),
  );
  const explanation = [
    evidence.length
      ? `${evidence.length} evidence item(s) were assessed.`
      : "No evidence was supplied, so quality is capped at zero.",
    contradictionPressure > 0
      ? `Contradiction pressure is ${Math.round(contradictionPressure)}/100.`
      : "No contradictory evidence was declared.",
    `Traceability is ${Math.round(evidenceTraceabilityScore)}/100.`,
    ...traceability.explanation,
  ];

  return {
    quality,
    reliability: Math.round(reliability),
    freshness: Math.round(freshness),
    independence: Math.round(independence),
    replication: Math.round(replication),
    contradictionPressure: Math.round(contradictionPressure),
    calibration: Math.round(calibration),
    traceability: Math.round(evidenceTraceabilityScore),
    coverage: referenceCoverage,
    missingEvidenceReferences: traceability.missingEvidenceReferences,
    explanation,
  };
}

function assessConfidence(
  desiredConfidence: number | undefined,
  evidenceQuality: DecisionEvidenceQualityAssessment,
  assumptions: readonly AssessmentFact[],
  unknowns: readonly AssessmentFact[],
): DecisionConfidenceDiscipline {
  const requested = Math.round(
    asScore(desiredConfidence, evidenceQuality.quality),
  );
  const evidenceQualityCap = evidenceQuality.quality;
  const contradictionCap = Math.round(
    clamp(100 - evidenceQuality.contradictionPressure * 0.65),
  );
  const assumptionCap = Math.round(
    clamp(100 - assumptionExposure(assumptions) * 0.5),
  );
  const unknownCoverageCap = Math.round(
    clamp(100 - unknownExposure(unknowns) * 0.45),
  );
  const cap = Math.min(
    evidenceQualityCap,
    contradictionCap,
    assumptionCap,
    unknownCoverageCap,
  );
  const capped = Math.min(requested, cap);
  const explanation = [
    `Requested confidence was ${requested}/100.`,
    `Evidence quality caps confidence at ${evidenceQualityCap}/100.`,
  ];
  if (capped < requested)
    explanation.push(
      `Visible uncertainty lowered confidence to ${capped}/100.`,
    );

  return {
    requested,
    capped,
    cap,
    evidenceQualityCap,
    contradictionCap,
    assumptionCap,
    unknownCoverageCap,
    explanation,
  };
}

function chooseNextBestEvidence(
  requested: Partial<DecisionNextBestEvidence> | undefined,
  evidenceQuality: DecisionEvidenceQualityAssessment,
  assumptions: readonly AssessmentFact[],
  unknowns: readonly AssessmentFact[],
  contradicted: readonly AssessmentFact[],
): DecisionNextBestEvidence {
  const inferred = inferNextBestEvidence(
    evidenceQuality,
    assumptions,
    unknowns,
    contradicted,
  );
  return {
    question: requested?.question ?? inferred.question,
    whyItMatters: requested?.whyItMatters ?? inferred.whyItMatters,
    expectedImpact: requested?.expectedImpact ?? inferred.expectedImpact,
    expectedUncertaintyReduction: Math.round(
      asScore(
        requested?.expectedUncertaintyReduction,
        inferred.expectedUncertaintyReduction,
      ),
    ),
  };
}

function assessGovernance(
  evidenceQuality: DecisionEvidenceQualityAssessment,
  confidence: DecisionConfidenceDiscipline,
  assumptions: readonly AssessmentFact[],
  unknowns: readonly AssessmentFact[],
  contradicted: readonly AssessmentFact[],
  nextBestEvidence: DecisionNextBestEvidence,
): DecisionGovernanceAssessment {
  const assumptionVisibility = assumptions.length
    ? average(
        assumptions.map((item) => (item.summary ? 85 : 65)),
        70,
      )
    : 55;
  const contradictionVisibility =
    evidenceQuality.contradictionPressure > 0
      ? contradicted.length > 0
        ? 100
        : 70
      : 100;
  const unknownVisibility = unknowns.length ? 90 : 60;
  const auditability = average([
    evidenceQuality.traceability,
    evidenceQuality.coverage,
  ]);
  const explainability = average([
    assumptionVisibility,
    contradictionVisibility,
    unknownVisibility,
    evidenceQuality.coverage,
  ]);
  const challengeability = average([
    contradictionVisibility,
    unknownVisibility,
    nextBestEvidence.question ? 95 : 50,
  ]);
  const score = Math.round(
    average([
      auditability,
      explainability,
      challengeability,
      evidenceQuality.traceability,
      evidenceQuality.coverage,
      contradictionVisibility,
      assumptionVisibility,
    ]),
  );
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!assumptions.length)
    warnings.push("No assumptions were declared; verify this is intentional.");
  if (!unknowns.length)
    warnings.push("No unknowns were declared; hidden uncertainty may remain.");
  if (evidenceQuality.contradictionPressure >= 45)
    warnings.push(
      "Contradiction pressure is high enough to require challenge.",
    );
  if (evidenceQuality.missingEvidenceReferences?.length) {
    warnings.push(
      `Missing evidence references: ${evidenceQuality.missingEvidenceReferences.join(", ")}.`,
    );
  }
  if (evidenceQuality.quality <= 20)
    blockers.push("Evidence quality is too weak to support confident action.");
  if (confidence.cap <= 25)
    blockers.push("Confidence is capped too low for a strong decision.");

  return {
    score,
    auditability: Math.round(auditability),
    explainability: Math.round(explainability),
    challengeability: Math.round(challengeability),
    traceability: evidenceQuality.traceability,
    evidenceCoverage: evidenceQuality.coverage,
    contradictionVisibility: Math.round(contradictionVisibility),
    assumptionVisibility: Math.round(assumptionVisibility),
    warnings,
    blockers,
    explanation: [
      `Auditability is ${Math.round(auditability)}/100.`,
      `Assumption visibility is ${Math.round(assumptionVisibility)}/100.`,
      `Contradiction visibility is ${Math.round(contradictionVisibility)}/100.`,
    ],
  };
}

function assessStewardshipFromAssessment(
  input: DecisionAssessmentInput,
  threats: readonly DecisionThreat[],
  evidenceQuality: DecisionEvidenceQualityAssessment,
  confidence: DecisionConfidenceDiscipline,
  governance: DecisionGovernanceAssessment,
): DecisionStewardshipAssessment {
  const threatPressure = Math.round(
    average(
      threats.map((item) => (item.severity * item.likelihood) / 100),
      0,
    ),
  );
  const importance = Math.round(asScore(input.importance, 50));
  const optionality = Math.round(asScore(input.optionality, 50));
  const resilience = Math.round(asScore(input.resilience, 50));
  const reversibility = assessReversibility(input.reversibility);
  const recommendation = stewardshipRecommendation({
    confidence,
    governance,
    evidenceQuality,
    importance,
    threatPressure,
    optionality,
    resilience,
    reversibility,
  });

  return {
    importance,
    threatPressure,
    optionality,
    resilience,
    reversibility,
    recommendation,
    explanation: [
      `Importance is ${importance}/100 and threat pressure is ${threatPressure}/100.`,
      `Reversibility is ${reversibility.level} at ${reversibility.score}/100.`,
      evidenceQuality.quality < 60 && reversibility.score >= 60
        ? "Weak evidence favors a reversible next step."
        : "Stewardship favors preserving what matters while evidence improves.",
    ],
  };
}

function inferNextBestEvidence(
  evidenceQuality: DecisionEvidenceQualityAssessment,
  assumptions: readonly AssessmentFact[],
  unknowns: readonly AssessmentFact[],
  contradicted: readonly AssessmentFact[],
): DecisionNextBestEvidence {
  if (evidenceQuality.quality <= 20) {
    return {
      question: "What direct, traceable evidence supports this decision?",
      whyItMatters:
        "The current assessment cannot distinguish evidence from assertion.",
      expectedImpact: "Establishes a minimum audit trail before action.",
      expectedUncertaintyReduction: 45,
    };
  }
  if (contradicted.length || evidenceQuality.contradictionPressure >= 45) {
    return {
      question:
        "Which contradictory evidence would change the decision if true?",
      whyItMatters:
        "Contradictions are the fastest way to expose a brittle decision.",
      expectedImpact:
        "Clarifies whether to wait, reduce, or proceed reversibly.",
      expectedUncertaintyReduction: 35,
    };
  }
  const assumption = assumptions[0];
  if (assumption) {
    return {
      question: `How can we test this assumption: ${assumption.label}?`,
      whyItMatters:
        "Untested assumptions can make confidence look stronger than evidence allows.",
      expectedImpact:
        "Turns an assumption into known, contradicted, or still-unknown evidence.",
      expectedUncertaintyReduction: 30,
    };
  }
  const unknown = unknowns[0];
  if (unknown) {
    return {
      question: `What would resolve this unknown: ${unknown.label}?`,
      whyItMatters: "Visible unknowns define the current uncertainty boundary.",
      expectedImpact:
        "Improves the next decision without pretending certainty now.",
      expectedUncertaintyReduction: 25,
    };
  }
  return {
    question: "What outcome signal should be reviewed after the decision?",
    whyItMatters:
      "Decision quality improves when outcomes are compared with the original reasoning.",
    expectedImpact:
      "Creates a simple learning loop for the next similar decision.",
    expectedUncertaintyReduction: 20,
  };
}

function normalizeThreats(
  values: readonly DecisionThreatInput[],
): DecisionThreat[] {
  return values.map((value, index) => {
    if (typeof value === "string") {
      return {
        threatId: `threat:${index + 1}`,
        label: value,
        severity: 50,
        likelihood: 50,
        evidenceIds: [],
      };
    }

    return {
      threatId: value.threatId ?? `threat:${index + 1}`,
      label: value.label,
      severity: asScore(value.severity, 50),
      likelihood: asScore(value.likelihood, 50),
      evidenceIds: [...(value.evidenceIds ?? [])],
      ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
    };
  });
}

function assessReversibility(
  input: DecisionReversibilityInput | undefined,
): DecisionReversibilityAssessment {
  if (input === undefined) {
    return {
      level: "unknown",
      score: 35,
      canUndo: false,
      cost: 65,
      speed: 35,
      notes: [],
    };
  }
  if (typeof input === "number") {
    const score = Math.round(asScore(input));
    return {
      level: reversibilityLevel(score),
      score,
      canUndo: score >= 50,
      cost: 100 - score,
      speed: score,
      notes: [],
    };
  }
  if (typeof input === "string") {
    const score =
      input === "high"
        ? 90
        : input === "medium"
          ? 65
          : input === "low"
            ? 35
            : 25;
    return {
      level: input,
      score,
      canUndo: score >= 50,
      cost: 100 - score,
      speed: score,
      notes: [],
    };
  }

  const cost = asScore(input.cost, input.canUndo === false ? 80 : 50);
  const speed = asScore(input.speed, input.canUndo === false ? 25 : 60);
  const score = Math.round(
    asScore(
      input.score,
      average([input.canUndo === false ? 25 : 75, 100 - cost, speed]),
    ),
  );

  return {
    level: reversibilityLevel(score),
    score,
    canUndo: input.canUndo ?? score >= 50,
    cost: Math.round(cost),
    speed: Math.round(speed),
    notes: [...(input.notes ?? [])],
  };
}

function stewardshipRecommendation(input: {
  confidence: DecisionConfidenceDiscipline;
  governance: DecisionGovernanceAssessment;
  evidenceQuality: DecisionEvidenceQualityAssessment;
  importance: number;
  threatPressure: number;
  optionality: number;
  resilience: number;
  reversibility: DecisionReversibilityAssessment;
}): DecisionStewardshipAssessment["recommendation"] {
  if (input.governance.blockers.length || input.confidence.cap < 30)
    return "wait";
  if (
    input.importance >= 75 &&
    input.threatPressure >= 70 &&
    input.resilience < 45
  )
    return "avoid";
  if (input.evidenceQuality.quality < 55 && input.reversibility.score >= 60)
    return "proceed-reversibly";
  if (
    input.evidenceQuality.quality < 55 ||
    input.threatPressure >= 65 ||
    input.reversibility.score < 40
  )
    return "reduce";
  if (input.optionality < 35 && input.importance >= 70)
    return "proceed-reversibly";
  return "proceed";
}

function reversibilityLevel(score: number): DecisionReversibility {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "unknown";
}

function averageEvidence(
  evidence: readonly DecisionEvidence[],
  key: keyof Pick<
    DecisionEvidence,
    | "quality"
    | "reliability"
    | "freshness"
    | "independence"
    | "replication"
    | "calibration"
    | "traceability"
  >,
): number {
  return evidence.length
    ? average(
        evidence.map((item) => item[key]),
        0,
      )
    : 0;
}

function assessContradictionPressure(
  evidence: readonly DecisionEvidence[],
  contradicted: readonly AssessmentFact[],
): number {
  const contradictoryEvidence = evidence.filter(
    (item) => item.direction === "contradicting",
  );
  const evidencePressure = contradictoryEvidence.length
    ? average(
        contradictoryEvidence.map((item) =>
          average([item.strength, item.quality], 0),
        ),
        0,
      )
    : 0;
  return clamp(evidencePressure + contradicted.length * 12);
}

function assessEvidenceReferenceTraceability(
  evidence: readonly DecisionEvidence[],
  facts: {
    known: readonly AssessmentFact[];
    unknowns: readonly AssessmentFact[];
    assumptions: readonly AssessmentFact[];
    contradicted: readonly AssessmentFact[];
  },
  threats: readonly DecisionThreat[],
): EvidenceReferenceTraceability {
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  const evidenceTraces = evidence.map(
    (item): DecisionJournalTraceRef => ({
      refId: item.evidenceId,
      refType: "evidence",
      label: item.label,
      evidenceIds: [item.evidenceId],
      linkedEvidenceIds: [item.evidenceId],
      missingEvidenceIds: [],
    }),
  );
  const referenceTraces: DecisionJournalTraceRef[] = [
    ...facts.known.map((fact) => factTrace(fact, "known", evidenceIds)),
    ...facts.unknowns.map((fact) => factTrace(fact, "unknown", evidenceIds)),
    ...facts.assumptions.map((fact) =>
      factTrace(fact, "assumption", evidenceIds),
    ),
    ...facts.contradicted.map((fact) =>
      factTrace(fact, "contradiction", evidenceIds),
    ),
    ...threats.map((threat) => threatTrace(threat, evidenceIds)),
  ];
  const missingEvidenceReferences = uniqueStrings(
    referenceTraces.flatMap((trace) => trace.missingEvidenceIds),
  );
  const uncoveredReferences = referenceTraces.filter(
    (trace) => trace.linkedEvidenceIds.length === 0,
  );
  const evidenceReferenceCoverage = !evidence.length
    ? 0
    : referenceTraces.length
      ? Math.round(
          clamp(
            ((referenceTraces.length - uncoveredReferences.length) /
              referenceTraces.length) *
              100,
          ),
        )
      : 60;
  const complete =
    missingEvidenceReferences.length === 0 && uncoveredReferences.length === 0;

  return {
    traceRefs: [...evidenceTraces, ...referenceTraces],
    complete,
    evidenceReferenceCoverage,
    missingEvidenceReferences,
    explanation: [
      `Evidence reference coverage is ${evidenceReferenceCoverage}/100.`,
      uncoveredReferences.length
        ? `${uncoveredReferences.length} assessment reference(s) are not linked to supplied evidence.`
        : "All assessment references are linked to supplied evidence.",
      missingEvidenceReferences.length
        ? `Missing evidence references: ${missingEvidenceReferences.join(", ")}.`
        : "All declared evidence references resolve to supplied evidence.",
    ],
  };
}

function factTrace(
  fact: AssessmentFact,
  refType: DecisionJournalTraceRefType,
  evidenceIds: ReadonlySet<string>,
): DecisionJournalTraceRef {
  return referenceTrace({
    refId: fact.factId,
    refType,
    label: fact.label,
    referencedEvidenceIds: fact.evidenceIds,
    evidenceIds,
  });
}

function threatTrace(
  threat: DecisionThreat,
  evidenceIds: ReadonlySet<string>,
): DecisionJournalTraceRef {
  return referenceTrace({
    refId: threat.threatId,
    refType: "threat",
    label: threat.label,
    referencedEvidenceIds: threat.evidenceIds,
    evidenceIds,
  });
}

function referenceTrace(input: {
  refId: string;
  refType: DecisionJournalTraceRefType;
  label: string;
  referencedEvidenceIds: readonly string[];
  evidenceIds: ReadonlySet<string>;
}): DecisionJournalTraceRef {
  const referencedEvidenceIds = uniqueStrings(input.referencedEvidenceIds);
  return {
    refId: input.refId,
    refType: input.refType,
    label: input.label,
    evidenceIds: referencedEvidenceIds,
    linkedEvidenceIds: referencedEvidenceIds.filter((evidenceId) =>
      input.evidenceIds.has(evidenceId),
    ),
    missingEvidenceIds: referencedEvidenceIds.filter(
      (evidenceId) => !input.evidenceIds.has(evidenceId),
    ),
  };
}

function journalTraceability(
  traceability: EvidenceReferenceTraceability,
): DecisionJournalTraceability {
  return {
    complete: traceability.complete,
    evidenceReferenceCoverage: traceability.evidenceReferenceCoverage,
    missingEvidenceReferences: traceability.missingEvidenceReferences,
    explanation: [...traceability.explanation],
  };
}

function assumptionExposure(assumptions: readonly AssessmentFact[]): number {
  if (!assumptions.length) return 20;
  const withoutEvidence = assumptions.filter(
    (item) => item.evidenceIds.length === 0,
  ).length;
  const withoutReview = assumptions.filter((item) => !item.reviewAfter).length;
  return clamp(
    assumptions.length * 12 + withoutEvidence * 8 + withoutReview * 5,
  );
}

function unknownExposure(unknowns: readonly AssessmentFact[]): number {
  if (!unknowns.length) return 25;
  const withoutEvidence = unknowns.filter(
    (item) => item.evidenceIds.length === 0,
  ).length;
  return clamp(unknowns.length * 10 + withoutEvidence * 6);
}

function defaultChange(outcome: DecisionLearningOutcome): string {
  if (outcome === "confirmed")
    return "Keep the reasoning, but continue reviewing outcomes.";
  if (outcome === "contradicted")
    return "Change the decision rule before repeating this decision.";
  if (outcome === "mixed")
    return "Separate what worked from what failed before increasing confidence.";
  return "Capture more outcome evidence before changing the process.";
}
