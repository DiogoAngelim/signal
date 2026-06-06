import { describe, expect, it } from "vitest";
import { evaluateStewardshipGovernance } from "../governanceEvaluator";

const baseThreats = [
  {
    id: "threat:stress",
    label: "Stress event",
    severity: "medium" as const,
  },
];

describe("evaluateStewardshipGovernance", () => {
  it("flags weak evidence even when confidence is high", () => {
    const governance = evaluateStewardshipGovernance({
      evidence: [
        {
          id: "evidence:thin",
          label: "Thin evidence",
          summary: "One observation is being over-weighted.",
          quality: "weak",
          durability: "weak",
          confidence: 95,
        },
      ],
      lessons: [],
      threats: baseThreats,
      protections: [],
      uncertainties: [],
      context: { accountabilityOwner: "reviewer", policyCompliance: "compliant", reversibility: "high" },
    });

    expect(governance.evidenceQuality).toBe("weak");
    expect(governance.status).toBe("weak");
    expect(governance.warnings).toContain("Evidence quality is not yet durable enough for a larger step.");
  });

  it("keeps strong evidence cautious when review depth is still limited", () => {
    const governance = evaluateStewardshipGovernance({
      evidence: [
        {
          id: "evidence:strong",
          label: "Strong evidence",
          summary: "Evidence was reviewed from multiple sources.",
          quality: "strong",
          durability: "strong",
        },
      ],
      lessons: [{ id: "lesson:1", label: "Lesson", summary: "Lesson held.", outcome: "confirmed", repetition: 3 }],
      threats: baseThreats,
      protections: [],
      uncertainties: [{ id: "uncertainty:1", label: "Open condition", severity: "high", visibility: "explicit" }],
      context: { accountabilityOwner: "reviewer", policyCompliance: "compliant", reversibility: "high" },
    });

    expect(governance.evidenceQuality).toBe("strong");
    expect(governance.uncertaintyVisibility).toBe("explicit");
    expect(governance.status).toBe("caution");
  });

  it("blocks policy violations and irreversible critical downside", () => {
    const policyViolation = evaluateStewardshipGovernance({
      evidence: [],
      lessons: [],
      threats: baseThreats,
      protections: [],
      uncertainties: [],
      context: { policyCompliance: "violated" },
    });
    const irreversible = evaluateStewardshipGovernance({
      evidence: [{ id: "evidence:1", label: "Review", summary: "Review exists.", quality: "limited", durability: "limited" }],
      lessons: [],
      threats: [{ id: "threat:critical", label: "Critical downside", severity: "critical", mitigated: false }],
      protections: [],
      uncertainties: [],
      context: { policyCompliance: "compliant", reversibility: "low" },
    });

    expect(policyViolation.status).toBe("blocked");
    expect(policyViolation.blockers).toContain("Policy compliance is violated.");
    expect(irreversible.status).toBe("blocked");
    expect(irreversible.blockers).toContain("A critical threat is paired with low reversibility.");
  });

  it("surfaces concentration risk and missing accountability", () => {
    const governance = evaluateStewardshipGovernance({
      evidence: [{ id: "evidence:1", label: "Review", summary: "Review exists.", quality: "adequate", durability: "adequate" }],
      lessons: [],
      threats: [{ id: "threat:critical", label: "Critical downside", severity: "critical", mitigated: false }],
      protections: [],
      uncertainties: [],
      context: {
        concentrationRisk: "critical",
        policyCompliance: "compliant",
        missingInformation: ["No owner has accepted follow-up."],
      },
      governance: { accountabilityClarity: "absent" },
    });

    expect(governance.status).toBe("blocked");
    expect(governance.concentrationRisk).toBe("critical");
    expect(governance.missingInformation).toContain("No owner has accepted follow-up.");
    expect(governance.blockers).toContain("Critical risk has no clear accountability.");
  });
});
