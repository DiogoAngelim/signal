import { describe, expect, it } from "vitest";
import { assessStewardship } from "../stewardshipAdvisor";

describe("assessStewardship", () => {
  it("handles empty input with a stable domain-agnostic contract", () => {
    const assessment = assessStewardship();

    expect(assessment.subject.label).toBe("Important subject");
    expect(assessment.recommendation.action).toBe("observe");
    expect(assessment.uncertaintySummary).toContain("Decision memory is missing or not yet useful.");
    expect(assessment.disclaimers.join(" ")).toContain("not a prediction");
  });

  it("converts memory, governance, context, and reviews into a gradual assessment", () => {
    const assessment = assessStewardship({
      subject: {
        id: "subject:water-system",
        label: "Water system",
        importance: "critical",
        desiredState: "safe, useful, and available",
      },
      context: {
        accountabilityOwner: "Operations lead",
        policyCompliance: "compliant",
        reversibility: "high",
        concentrationRisk: "low",
        monitoringCadence: "Review every week.",
      },
      memory: {
        evidence: [
          {
            id: "evidence:1",
            label: "Inspection record",
            summary: "Independent inspection found the protective control working.",
            quality: "strong",
            durability: "strong",
          },
        ],
        lessons: [
          {
            id: "lesson:1",
            label: "Gradual change",
            summary: "Small reversible changes preserved availability.",
            outcome: "confirmed",
            repetition: 3,
          },
        ],
      },
      threats: [{ id: "threat:1", label: "Demand spike", severity: "medium", mitigated: true }],
      protections: [{ id: "protection:1", label: "Capacity buffer", strength: "strong", durability: "strong" }],
    });

    expect(assessment.whatMatters[0]).toContain("Water system should remain safe, useful, and available.");
    expect(assessment.governance.trustworthyEnough).toBe(true);
    expect(assessment.recommendation.action).toBe("proceed_gradually");
    expect(assessment.smallestResponsibleNextStep.description).toContain("smallest reversible step");
    expect(assessment.monitoringPlan[0]).toBe("Use cadence: Review every week.");
  });

  it("monitors strong evidence when material uncertainty remains", () => {
    const assessment = assessStewardship({
      subject: { label: "Knowledge base", desiredState: "accurate and available", importance: "high" },
      context: { accountabilityOwner: "Maintainer", policyCompliance: "compliant", reversibility: "high" },
      evidence: [
        {
          id: "evidence:strong",
          label: "Review",
          summary: "The review was broad.",
          quality: "strong",
          durability: "strong",
        },
      ],
      outcomeReviews: [
        {
          id: "review:unknown",
          known: false,
          uncertainty: "The downstream effect is still unknown.",
        },
      ],
      uncertainties: [{ id: "uncertainty:material", label: "Dependency change", severity: "high", visibility: "explicit" }],
    });

    expect(assessment.governance.evidenceQuality).toBe("strong");
    expect(assessment.recommendation.action).toBe("monitor");
    expect(assessment.uncertaintySummary.join(" ")).toContain("downstream effect");
  });

  it("stops on policy violation without claiming certainty", () => {
    const assessment = assessStewardship({
      subject: { label: "Safety control", desiredState: "operational", importance: "critical" },
      context: { policyCompliance: "violated", accountabilityOwner: "Safety lead" },
      threats: [{ id: "threat:critical", label: "Unsafe bypass", severity: "critical", mitigated: false }],
    });

    expect(assessment.recommendation.action).toBe("stop");
    expect(assessment.governance.status).toBe("blocked");
    expect(assessment.rationale.join(" ")).not.toMatch(/\bcertainty\b/i);
    expect(assessment.disclaimers.join(" ")).toContain("does not claim certainty");
  });
});
