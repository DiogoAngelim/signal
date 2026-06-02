import { describe, expect, it } from "vitest";
import { interpretStewardshipOutcomes } from "../outcomeInterpreter";

describe("interpretStewardshipOutcomes", () => {
  it("turns incomplete reviews into provisional lessons and explicit uncertainty", () => {
    const result = interpretStewardshipOutcomes([
      {
        id: "review:partial",
        label: "Partial review",
        summary: "The outcome is incomplete.",
        known: false,
        reviewDepth: 20,
      },
    ]);

    expect(result.lessons[0]?.outcome).toBe("unknown");
    expect(result.uncertainties[0]?.visibility).toBe("explicit");
    expect(result.uncertainties[0]?.description).toContain("outcome is not known");
  });

  it("keeps too-early outcomes visible as uncertainty", () => {
    const result = interpretStewardshipOutcomes([
      {
        id: "review:early",
        outcome: "too_early",
        lessons: ["The early result should not be over-weighted."],
        uncertainty: "Too early to judge durability.",
      },
    ]);

    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0]?.summary).toBe("The early result should not be over-weighted.");
    expect(result.uncertainties[0]?.description).toBe("Too early to judge durability.");
  });

  it("maps repeated confirmed and contradicted reviews into lessons", () => {
    const result = interpretStewardshipOutcomes([
      {
        id: "review:confirmed",
        outcome: "confirmed",
        repeated: 3,
        lessons: ["The protection held through repeated stress."],
      },
      {
        id: "review:contradicted",
        outcome: "contradicted",
        repeated: 2,
        lessons: ["The earlier assumption failed under review."],
      },
    ]);

    expect(result.lessons.map((lesson) => lesson.outcome)).toEqual(["confirmed", "contradicted"]);
    expect(result.lessons.map((lesson) => lesson.repetition)).toEqual([3, 2]);
  });
});
