import { stableId, uniqueStrings } from "../utils";
import type { StewardshipLesson, StewardshipOutcomeReview, StewardshipUncertainty } from "./types";

export function interpretStewardshipOutcomes(reviews: StewardshipOutcomeReview[] = []): {
  lessons: StewardshipLesson[];
  uncertainties: StewardshipUncertainty[];
} {
  const lessons: StewardshipLesson[] = [];
  const uncertainties: StewardshipUncertainty[] = [];

  reviews.forEach((review, index) => {
    const reviewId = review.id ?? stableId("review", `${index}`);
    const known = review.known ?? review.outcome !== undefined;
    const outcome = known ? review.outcome ?? "mixed" : "unknown";
    const label = review.label ?? `Outcome review ${index + 1}`;
    const statements = uniqueStrings(review.lessons ?? []);

    if (statements.length === 0) {
      lessons.push({
        id: stableId("lesson", reviewId),
        label,
        summary: review.summary ?? "Outcome review did not produce a durable lesson yet.",
        outcome,
        repetition: Math.max(1, Math.round(Number(review.repeated) || 1)),
        ...(review.confidence === undefined ? {} : { confidence: review.confidence }),
        ...(review.durability === undefined ? {} : { durability: review.durability }),
      });
    } else {
      statements.forEach((summary, lessonIndex) => {
        lessons.push({
          id: stableId("lesson", `${reviewId}:${lessonIndex}`),
          label,
          summary,
          outcome,
          repetition: Math.max(1, Math.round(Number(review.repeated) || 1)),
          ...(review.confidence === undefined ? {} : { confidence: review.confidence }),
          ...(review.durability === undefined ? {} : { durability: review.durability }),
        });
      });
    }

    if (!known || outcome === "unknown" || outcome === "too_early" || review.uncertainty) {
      uncertainties.push({
        id: stableId("uncertainty", reviewId),
        label: review.uncertainty ? "Outcome uncertainty" : "Outcome not yet reviewed",
        description: review.uncertainty ?? "The outcome is not known enough to treat the lesson as durable.",
        severity: outcome === "unknown" ? "medium" : "low",
        visibility: "explicit",
      });
    }
  });

  return { lessons, uncertainties };
}
