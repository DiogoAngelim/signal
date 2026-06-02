import { describe, expect, it } from "vitest";
import {
  buildCalibrationBuckets,
  evaluateSignalEvidence,
  summarizeOutcomeReviews,
} from "./engine";

const NOW = "2026-06-02T12:00:00.000Z";

describe("Signal evidence engine", () => {
  it("caps confidence when evidence is weak and does not force action", () => {
    const result = evaluateSignalEvidence({
      now: NOW,
      confidence: 92,
      supportingEvidence: [
        {
          id: "single-weak-source",
          label: "Single weak source",
          summary: "Only one weak source supports this.",
          strength: 14,
        },
      ],
      assumptions: ["The source remains representative."],
      unknowns: ["Whether independent sources agree."],
    });

    expect(result.evidence.confidence).toBeLessThanOrEqual(result.evidence.confidenceLimit);
    expect(result.evidence.confidenceLimit).toBeLessThan(40);
    expect(result.action).toBe("insufficient_evidence");
    expect(result.narrative.nextReasonableStep).toMatch(/insufficient/i);
  });

  it("treats unknown as a healthy explicit state", () => {
    const result = evaluateSignalEvidence({
      now: NOW,
      confidence: 80,
      supportingEvidence: [
        {
          id: "developing",
          label: "Developing evidence",
          summary: "Some evidence exists, but it has not matured.",
          strength: 30,
        },
      ],
      unknowns: ["Whether the pattern survives review.", "Whether another source agrees."],
      assumptions: ["Similarity is not enough."],
    });

    expect(result.action).toBe("unknown");
    expect(result.warnings).toContain("unknown is a valid state");
    expect(result.evidence.confidence).toBeLessThanOrEqual(result.evidence.confidenceLimit);
  });

  it("uses stale evidence to lower the cap and support waiting", () => {
    const result = evaluateSignalEvidence({
      now: NOW,
      confidence: 88,
      supportingEvidence: [
        {
          id: "old-review",
          label: "Old review",
          summary: "The strongest support is no longer fresh.",
          strength: 88,
          observedAt: "2026-03-01T12:00:00.000Z",
          source: "review",
        },
      ],
      outcomeReviews: [
        {
          reviewId: "review:1",
          outcomeResult: "right",
          confidenceAtDecision: 70,
          lessonSurvived: true,
          reviewedAt: "2026-04-01T12:00:00.000Z",
        },
      ],
      invalidationConditions: ["Evidence becomes stale."],
    });

    expect(result.evidence.evidenceFreshness).toBeLessThan(35);
    expect(result.evidence.confidenceLimit).toBeLessThanOrEqual(45);
    expect(result.action).toBe("wait");
  });

  it("keeps contradictions visible and reduces confidence", () => {
    const result = evaluateSignalEvidence({
      now: NOW,
      confidence: 90,
      supportingEvidence: [
        {
          id: "support",
          label: "Support",
          summary: "The main evidence supports the conclusion.",
          strength: 82,
          observedAt: NOW,
          source: "primary",
        },
      ],
      contradictingEvidence: [
        {
          id: "contradiction",
          label: "Contradiction",
          summary: "A strong source conflicts with the conclusion.",
          strength: 90,
          observedAt: NOW,
          source: "disconfirming",
          invalidates: true,
        },
      ],
      outcomeReviews: [
        {
          reviewId: "review:1",
          outcomeResult: "right",
          confidenceAtDecision: 75,
          lessonSurvived: true,
        },
      ],
      invalidationConditions: ["The contradiction remains unresolved."],
    });

    expect(result.action).toBe("reduce");
    expect(result.evidence.contradictingEvidence).toHaveLength(1);
    expect(result.evidence.confidenceLimit).toBeLessThanOrEqual(30);
    expect(result.narrative.whatWeakensThis.join(" ")).toContain("conflicts");
  });

  it("builds calibration buckets and lets poor calibration lower confidence ceilings", () => {
    const reviews = [
      { reviewId: "r1", outcomeResult: "wrong" as const, confidenceAtDecision: 90 },
      { reviewId: "r2", outcomeResult: "wrong" as const, confidenceAtDecision: 92 },
      { reviewId: "r3", outcomeResult: "partially_right" as const, confidenceAtDecision: 90 },
    ];
    const buckets = buildCalibrationBuckets(reviews);
    const result = evaluateSignalEvidence({
      now: NOW,
      confidence: 95,
      supportingEvidence: [
        {
          id: "support",
          label: "Support",
          summary: "Support exists.",
          strength: 78,
          observedAt: NOW,
        },
      ],
      outcomeReviews: reviews,
    });

    expect(buckets[9].reviewedCount).toBe(3);
    expect(buckets[9].failureCount).toBe(2);
    expect(buckets[9].observedSuccessRate).toBeCloseTo(16.67, 1);
    expect(result.evidence.calibration).toBeLessThan(35);
    expect(result.evidence.confidenceLimit).toBeLessThanOrEqual(result.evidence.calibration + 15);
  });

  it("counts lesson survival only from reviewed outcomes", () => {
    const summary = summarizeOutcomeReviews([
      {
        reviewId: "similarity-only",
        outcomeResult: "unknown",
        lessonSurvived: true,
      },
      {
        reviewId: "reviewed-success",
        outcomeResult: "right",
        lessonSurvived: true,
      },
      {
        reviewId: "reviewed-failure",
        outcomeResult: "wrong",
        lessonFailed: true,
      },
    ]);

    expect(summary.outcomeReviewCount).toBe(2);
    expect(summary.lessonSurvivalCount).toBe(1);
    expect(summary.lessonFailureCount).toBe(1);
  });

  it("returns explainable deterministic governance scores", () => {
    const result = evaluateSignalEvidence({
      now: NOW,
      confidence: 62,
      supportingEvidence: [
        {
          id: "support",
          label: "Support",
          summary: "Support is fresh and reviewed.",
          strength: 72,
          observedAt: NOW,
          source: "review",
        },
      ],
      unknowns: ["Whether the lesson keeps surviving."],
      invalidationConditions: ["A reviewed outcome fails."],
      outcomeReviews: [
        {
          reviewId: "review:1",
          outcomeResult: "right",
          confidenceAtDecision: 60,
          lessonSurvived: true,
        },
      ],
    });

    expect(result.governance.evidenceQuality.explanation).toContain("averages");
    expect(result.governance.decisionQuality.supportingFactors.join(" ")).toContain("Confidence is capped");
    expect(result.governance.lessonSurvival.supportingFactors.join(" ")).toContain("reviewed outcome");
  });
});
