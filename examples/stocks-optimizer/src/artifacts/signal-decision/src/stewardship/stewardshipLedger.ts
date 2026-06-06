import { clamp, stableId, uniqueStrings } from "../utils";
import type {
  StewardshipContext,
  StewardshipEvidence,
  StewardshipLedger,
  StewardshipLedgerEvidenceTrace,
  StewardshipLedgerLessonTrace,
  StewardshipLedgerOutcomeTrace,
  StewardshipLesson,
  StewardshipOutcomeReview,
  StewardshipProtection,
  StewardshipSubject,
  StewardshipThreat,
} from "./types";

export function createStewardshipLedger(input: {
  subject: StewardshipSubject;
  context?: StewardshipContext;
  evidence: StewardshipEvidence[];
  lessons: StewardshipLesson[];
  outcomeReviews?: StewardshipOutcomeReview[];
  threats?: StewardshipThreat[];
  protections?: StewardshipProtection[];
}): StewardshipLedger {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const lessonsById = new Map(input.lessons.map((lesson) => [lesson.id, lesson]));
  const outcomes = buildOutcomeTraces(input.outcomeReviews ?? [], lessonsById, evidenceById);
  const lessons = buildLessonTraces(input.lessons, evidenceById);
  const evidence = buildEvidenceTraces(input.evidence, lessons, input.threats ?? [], input.protections ?? []);
  const missingEvidenceReferences = uniqueStrings([
    ...outcomes.flatMap((outcome) => outcome.missingEvidenceIds),
    ...lessons.flatMap((lesson) => lesson.missingEvidenceIds),
  ]);
  const gaps = ledgerGaps({
    decisionLinked: Boolean(input.context?.decisionId),
    outcomeCount: outcomes.length,
    lessonCount: lessons.length,
    evidenceCount: evidence.length,
    lessons,
    missingEvidenceReferences,
  });
  const warnings = ledgerWarnings(evidence, input.threats ?? [], input.protections ?? []);
  const checks = [
    Boolean(input.context?.decisionId),
    outcomes.length > 0,
    lessons.length > 0,
    evidence.length > 0,
    lessons.length > 0 && lessons.every((lesson) => lesson.linkedEvidenceIds.length > 0),
    missingEvidenceReferences.length === 0,
  ];
  const score = Math.round(clamp((checks.filter(Boolean).length / checks.length) * 100));

  return {
    decision: {
      id: input.context?.decisionId ?? "decision:unknown",
      subjectId: input.subject.id,
      subjectLabel: input.subject.label,
      linked: Boolean(input.context?.decisionId),
      missing: input.context?.decisionId ? [] : ["decisionId"],
    },
    outcomes,
    lessons,
    evidence,
    traceability: {
      decisionLinked: Boolean(input.context?.decisionId),
      outcomeReviewed: outcomes.length > 0,
      lessonLinked: lessons.length > 0,
      evidenceLinked: evidence.length > 0 && lessons.length > 0 && lessons.every((lesson) => lesson.linkedEvidenceIds.length > 0),
      missingEvidenceReferences,
      score,
      complete: checks.every(Boolean),
    },
    gaps,
    warnings,
  };
}

function buildOutcomeTraces(
  reviews: StewardshipOutcomeReview[],
  lessonsById: Map<string, StewardshipLesson>,
  evidenceById: Map<string, StewardshipEvidence>,
): StewardshipLedgerOutcomeTrace[] {
  return reviews.map((review, index) => {
    const reviewId = review.id ?? stableId("review", `${index}`);
    const lessonIds = outcomeLessonIds(review, reviewId).filter((lessonId) => lessonsById.has(lessonId));
    const evidenceIds = uniqueStrings(review.evidenceIds ?? []);
    const linkedEvidenceIds = evidenceIds.filter((evidenceId) => evidenceById.has(evidenceId));

    return {
      id: reviewId,
      label: review.label ?? `Outcome review ${index + 1}`,
      outcome: review.known === false ? "unknown" : review.outcome ?? "mixed",
      known: review.known ?? (review.outcome !== undefined),
      lessonIds,
      evidenceIds,
      linkedEvidenceIds,
      missingEvidenceIds: evidenceIds.filter((evidenceId) => !evidenceById.has(evidenceId)),
    };
  });
}

function outcomeLessonIds(review: StewardshipOutcomeReview, reviewId: string): string[] {
  const statements = uniqueStrings(review.lessons ?? []);
  if (statements.length === 0) return [stableId("lesson", reviewId)];
  return statements.map((_, lessonIndex) => stableId("lesson", `${reviewId}:${lessonIndex}`));
}

function buildLessonTraces(
  lessons: StewardshipLesson[],
  evidenceById: Map<string, StewardshipEvidence>,
): StewardshipLedgerLessonTrace[] {
  return lessons.map((lesson) => {
    const evidenceIds = uniqueStrings(lesson.evidenceIds ?? []);
    const linkedEvidenceIds = evidenceIds.filter((evidenceId) => evidenceById.has(evidenceId));

    return {
      id: lesson.id,
      label: lesson.label,
      outcome: lesson.outcome,
      summary: lesson.summary,
      repetition: lesson.repetition,
      evidenceIds,
      linkedEvidenceIds,
      missingEvidenceIds: evidenceIds.filter((evidenceId) => !evidenceById.has(evidenceId)),
      ...(lesson.sourceOutcomeReviewId === undefined ? {} : { sourceOutcomeReviewId: lesson.sourceOutcomeReviewId }),
    };
  });
}

function buildEvidenceTraces(
  evidence: StewardshipEvidence[],
  lessons: StewardshipLedgerLessonTrace[],
  threats: StewardshipThreat[],
  protections: StewardshipProtection[],
): StewardshipLedgerEvidenceTrace[] {
  const lessonUsage = buildUsageIndex(lessons, (lesson) => lesson.evidenceIds, (lesson) => lesson.id);
  const threatUsage = buildUsageIndex(threats, (threat) => threat.evidenceIds, (threat) => threat.id);
  const protectionUsage = buildUsageIndex(protections, (protection) => protection.evidenceIds, (protection) => protection.id);

  return evidence.map((item) => {
    const usedByLessonIds = lessonUsage.get(item.id) ?? [];
    const usedByThreatIds = threatUsage.get(item.id) ?? [];
    const usedByProtectionIds = protectionUsage.get(item.id) ?? [];

    return {
      id: item.id,
      label: item.label,
      quality: item.quality,
      durability: item.durability,
      usedByLessonIds,
      usedByThreatIds,
      usedByProtectionIds,
      orphaned: usedByLessonIds.length === 0 && usedByThreatIds.length === 0 && usedByProtectionIds.length === 0,
    };
  });
}

function buildUsageIndex<T>(
  items: T[],
  evidenceIdsFor: (item: T) => readonly string[] | undefined,
  idFor: (item: T) => string,
): Map<string, string[]> {
  const usage = new Map<string, string[]>();

  for (const item of items) {
    for (const evidenceId of uniqueStrings(evidenceIdsFor(item) ?? [])) {
      const usedBy = usage.get(evidenceId);
      if (usedBy) {
        usedBy.push(idFor(item));
      } else {
        usage.set(evidenceId, [idFor(item)]);
      }
    }
  }

  return usage;
}

function ledgerGaps(input: {
  decisionLinked: boolean;
  outcomeCount: number;
  lessonCount: number;
  evidenceCount: number;
  lessons: StewardshipLedgerLessonTrace[];
  missingEvidenceReferences: string[];
}): string[] {
  return uniqueStrings([
    input.decisionLinked ? "" : "Decision id is missing, so the ledger cannot prove which decision was reviewed.",
    input.outcomeCount > 0 ? "" : "Outcome review is missing, so learning cannot be proven yet.",
    input.lessonCount > 0 ? "" : "No lesson has survived an outcome review yet.",
    input.evidenceCount > 0 ? "" : "Evidence is missing, so the ledger cannot prove why the lesson should be trusted.",
    ...input.lessons
      .filter((lesson) => lesson.evidenceIds.length === 0)
      .map((lesson) => `Lesson ${lesson.id} has no evidence link.`),
    ...input.missingEvidenceReferences.map((evidenceId) => `Referenced evidence ${evidenceId} is missing from the ledger.`),
  ]);
}

function ledgerWarnings(
  evidence: StewardshipLedgerEvidenceTrace[],
  threats: StewardshipThreat[],
  protections: StewardshipProtection[],
): string[] {
  return uniqueStrings([
    ...evidence.filter((item) => item.orphaned).map((item) => `Evidence ${item.id} is present but not linked to a lesson, threat, or protection.`),
    ...threats.filter((threat) => !threat.evidenceIds?.length).map((threat) => `Threat ${threat.id} has no evidence link.`),
    ...protections
      .filter((protection) => !protection.evidenceIds?.length)
      .map((protection) => `Protection ${protection.id} has no evidence link.`),
  ]);
}
