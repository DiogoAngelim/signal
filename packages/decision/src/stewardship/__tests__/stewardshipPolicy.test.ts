import { describe, expect, it } from "vitest";
import { selectStewardshipAction } from "../stewardshipPolicy";
import type { StewardshipGovernanceAssessment, StewardshipLesson } from "../types";

function governance(overrides: Partial<StewardshipGovernanceAssessment> = {}): StewardshipGovernanceAssessment {
  return {
    trustworthyEnough: true,
    status: "acceptable",
    evidenceQuality: "strong",
    evidenceDurability: "strong",
    reviewDepth: "strong",
    repetitionStrength: "strong",
    uncertaintyVisibility: "explicit",
    riskVisibility: "explicit",
    reversibility: "high",
    concentrationRisk: "low",
    accountabilityClarity: "strong",
    policyCompliance: "compliant",
    missingInformation: [],
    contradictionLevel: "low",
    warnings: [],
    blockers: [],
    rationale: [],
    ...overrides,
  };
}

function lesson(outcome: StewardshipLesson["outcome"], repetition = 1): StewardshipLesson {
  return {
    id: `lesson:${outcome}:${repetition}`,
    label: "Lesson",
    summary: "The lesson has been reviewed.",
    outcome,
    repetition,
  };
}

describe("selectStewardshipAction", () => {
  it("recommends gradual progress for repeated confirmed lessons", () => {
    expect(
      selectStewardshipAction({
        governance: governance(),
        lessons: [lesson("confirmed", 3)],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("proceed_gradually");
  });

  it("reduces exposure for repeated contradicted lessons and concentration risk", () => {
    expect(
      selectStewardshipAction({
        governance: governance(),
        lessons: [lesson("contradicted", 3)],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("reduce_exposure");

    expect(
      selectStewardshipAction({
        governance: governance({ concentrationRisk: "high", warnings: ["Concentration risk is elevated."] }),
        lessons: [],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("reduce_exposure");
  });

  it("reviews again for conflicting lessons", () => {
    expect(
      selectStewardshipAction({
        governance: governance({ contradictionLevel: "high", warnings: ["Contradictory evidence needs review."] }),
        lessons: [lesson("confirmed", 2), lesson("mixed", 3)],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("review_again");
  });

  it("monitors unknown and too-early outcomes", () => {
    expect(
      selectStewardshipAction({
        governance: governance(),
        lessons: [lesson("unknown"), lesson("too_early")],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("monitor");
  });

  it("pauses for missing accountability and stops for policy violations", () => {
    expect(
      selectStewardshipAction({
        governance: governance({ accountabilityClarity: "weak", status: "weak", trustworthyEnough: false }),
        lessons: [],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("pause");

    expect(
      selectStewardshipAction({
        governance: governance({ policyCompliance: "violated", status: "blocked", blockers: ["Policy compliance is violated."] }),
        lessons: [],
        threats: [],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("stop");
  });

  it("preserves when evidence is durable and threats are manageable", () => {
    expect(
      selectStewardshipAction({
        governance: governance(),
        lessons: [],
        threats: [{ id: "threat:1", label: "Small stress", severity: "low" }],
        uncertainties: [],
        evidenceCount: 2,
      }),
    ).toBe("preserve");
  });
});
