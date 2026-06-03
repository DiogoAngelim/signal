import { describe, expect, it } from "vitest";
import { createStewardshipLedger } from "../stewardshipLedger";

describe("createStewardshipLedger", () => {
  it("proves a complete decision to outcome to lesson to evidence chain", () => {
    const ledger = createStewardshipLedger({
      subject: {
        id: "subject:water",
        label: "Water system",
        importance: "critical",
        desiredState: "safe and available",
      },
      context: { decisionId: "decision:water:1" },
      evidence: [
        {
          id: "evidence:inspection",
          label: "Inspection",
          summary: "Inspection found the control working.",
          quality: "strong",
          durability: "strong",
        },
      ],
      outcomeReviews: [
        {
          id: "review:water:1",
          label: "Control review",
          outcome: "confirmed",
          lessons: ["The control preserved availability."],
          evidenceIds: ["evidence:inspection"],
        },
      ],
      lessons: [
        {
          id: "lesson:review:water:1:0",
          label: "Control review",
          summary: "The control preserved availability.",
          outcome: "confirmed",
          repetition: 2,
          sourceOutcomeReviewId: "review:water:1",
          evidenceIds: ["evidence:inspection"],
        },
      ],
      threats: [{ id: "threat:demand", label: "Demand spike", severity: "medium", evidenceIds: ["evidence:inspection"] }],
      protections: [{ id: "protection:buffer", label: "Capacity buffer", strength: "strong", evidenceIds: ["evidence:inspection"] }],
    });

    expect(ledger.traceability.complete).toBe(true);
    expect(ledger.traceability.score).toBe(100);
    expect(ledger.gaps).toEqual([]);
    expect(ledger.outcomes[0]?.lessonIds).toEqual(["lesson:review:water:1:0"]);
    expect(ledger.lessons[0]?.linkedEvidenceIds).toEqual(["evidence:inspection"]);
    expect(ledger.evidence[0]?.orphaned).toBe(false);
  });

  it("surfaces missing proof without blocking assessment construction", () => {
    const ledger = createStewardshipLedger({
      subject: {
        id: "subject:knowledge",
        label: "Knowledge base",
        importance: "high",
        desiredState: "accurate and available",
      },
      evidence: [],
      lessons: [
        {
          id: "lesson:knowledge:1",
          label: "Freshness",
          summary: "Freshness mattered.",
          outcome: "mixed",
          repetition: 1,
          evidenceIds: ["evidence:missing"],
        },
      ],
    });

    expect(ledger.traceability.complete).toBe(false);
    expect(ledger.traceability.decisionLinked).toBe(false);
    expect(ledger.traceability.missingEvidenceReferences).toEqual(["evidence:missing"]);
    expect(ledger.gaps.join(" ")).toContain("Decision id is missing");
    expect(ledger.gaps.join(" ")).toContain("Outcome review is missing");
    expect(ledger.gaps.join(" ")).toContain("Referenced evidence evidence:missing is missing");
  });
});
