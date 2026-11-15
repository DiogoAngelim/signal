import { describe, expect, it } from "vitest";
import { consumeStewardshipMemory } from "../memoryConsumer";

describe("consumeStewardshipMemory", () => {
  it("marks missing memory without crashing", () => {
    const result = consumeStewardshipMemory();

    expect(result.missingMemory).toBe(true);
    expect(result.evidence).toEqual([]);
    expect(result.lessons).toEqual([]);
  });

  it("deduplicates memory and normalizes lesson repetition", () => {
    const result = consumeStewardshipMemory({
      evidence: [
        {
          id: "evidence:1",
          label: "Inspection",
          summary: "The system was inspected.",
          quality: "adequate",
          durability: "limited",
        },
        {
          id: "evidence:1",
          label: "Duplicate",
          summary: "Duplicate evidence should be ignored.",
          quality: "strong",
          durability: "strong",
        },
      ],
      lessons: [
        {
          id: "lesson:1",
          label: "Gradual change",
          summary: "Small reversible steps preserved availability.",
          outcome: "confirmed",
          repetition: 2.7,
        },
        {
          id: "lesson:1",
          label: "Duplicate",
          summary: "Duplicate lesson should be ignored.",
          outcome: "contradicted",
          repetition: 1,
        },
      ],
    });

    expect(result.missingMemory).toBe(false);
    expect(result.evidence).toHaveLength(1);
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0]?.repetition).toBe(3);
  });
});
