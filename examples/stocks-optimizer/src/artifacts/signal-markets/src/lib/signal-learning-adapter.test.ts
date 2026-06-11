import { describe, expect, it } from "vitest";
import {
  type ReviewedInvestmentSituation,
  type StockAllocationSituation,
  createReviewedLearningDemo,
  evaluateStocksLearningJudgment,
  mapStockAllocationToSignalInput,
} from "./signal-learning-adapter";

const currentSituation: StockAllocationSituation = {
  ticker: "XYZ",
  price: 124,
  shares: 12,
  portfolioExposurePct: 16,
  volatilityPct: 68,
  concentrationPct: 38,
  drawdownPct: 14,
  marketRiskPct: 61,
  liquidityRiskPct: 32,
  investmentThesis:
    "The thesis is improving, but the allocation should stay reviewable.",
  allocationAdjustment: "hold",
  tags: ["momentum-rebound", "post-drawdown"],
  observedAt: "2026-06-06T12:00:00.000Z",
};

const reviewedHistory: ReviewedInvestmentSituation[] = [
  {
    id: "xyz-prior-review",
    ticker: "XYZ",
    label: "XYZ prior recovery allocation",
    investmentOutcome: "survived",
    postmortem:
      "A prior recovery allocation worked only after exposure stayed capped.",
    investmentLesson:
      "Keep exposure capped until liquidity and momentum both survive review.",
    tags: [
      "capital-allocation",
      "reviewable-allocation",
      "high-volatility",
      "post-drawdown",
    ],
    reviewCount: 4,
    survivalCount: 3,
    failureCount: 0,
    confidence: 84,
    reviewedAt: "2026-05-15T12:00:00.000Z",
  },
];

describe("Signal learning adapter", () => {
  it("maps stock concepts into Signal contracts at the app boundary", () => {
    const input = mapStockAllocationToSignalInput(
      currentSituation,
      reviewedHistory,
    );

    expect(input.objective.type).toBe("Objective");
    expect(input.positions?.[0]?.type).toBe("Position");
    expect(input.state?.type).toBe("State");
    expect(input.evaluation?.type).toBe("Evaluation");
    expect(input.threats?.map((threat) => threat.type)).toEqual([
      "Threat",
      "Threat",
    ]);
    expect(input.assumptions?.[0]?.type).toBe("Assumption");
    expect(input.priorReviews?.[0]?.type).toBe("Review");
    expect(input.lessons?.[0]?.type).toBe("Lesson");
    expect(
      input.relationships?.some(
        (relationship) =>
          relationship.sourceType === "Review" &&
          relationship.targetType === "Lesson",
      ),
    ).toBe(true);
  });

  it("uses reviewed history before a new investment outcome exists", () => {
    const judgment = evaluateStocksLearningJudgment(
      currentSituation,
      reviewedHistory,
    );

    expect(judgment.signalResult.reviewedHistory.reviewRefs).toHaveLength(1);
    expect(judgment.signalResult.similarityMatches[0]?.score).toBeGreaterThan(
      0,
    );
    expect(judgment.signalResult.judgment.futureOutcomeRequired).toBe(false);
    expect(judgment.signalResult.judgment.reviewedHistoryRefs).toContain(
      "reviewed-history:current",
    );
    expect(judgment.signalResult.judgment.lessonRefs).toContain(
      "lesson:xyz-prior-review",
    );
    expect(judgment.signalResult.judgment.relationshipRefs).toEqual(
      expect.arrayContaining([
        "relationship:review:xyz-prior-review:lesson:xyz-prior-review",
        "relationship:lesson:xyz-prior-review:current-judgment",
      ]),
    );
    expect(judgment.reviewableLanguage.join(" ")).toContain(
      "Previously reviewed situations suggest",
    );
  });

  it("keeps Signal-generated product language reviewable instead of predictive", () => {
    const demo = createReviewedLearningDemo();
    const text = demo.reviewableLanguage.join(" ");

    expect(text).toContain("This resembles");
    expect(text).toContain("The strongest surviving lesson is");
    expect(text).toContain("The current judgment is");
    expect(text).not.toMatch(/\b(Buy|Sell|Guaranteed|Prediction)\b/i);
    expect(text).not.toMatch(/\bwill happen\b/i);
  });
});
