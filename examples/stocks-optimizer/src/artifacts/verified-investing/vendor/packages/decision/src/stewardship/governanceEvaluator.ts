import { asScore, average, uniqueStrings } from "../utils";
import { qualityLabel } from "./stewardshipCopy";
import type {
  StewardshipConcentrationRisk,
  StewardshipContext,
  StewardshipEvidence,
  StewardshipEvidenceQuality,
  StewardshipGovernanceAssessment,
  StewardshipGovernanceInputs,
  StewardshipLesson,
  StewardshipProtection,
  StewardshipReversibility,
  StewardshipSeverity,
  StewardshipThreat,
  StewardshipUncertainty,
  StewardshipVisibility,
} from "./types";

export function evaluateStewardshipGovernance(input: {
  evidence: StewardshipEvidence[];
  lessons: StewardshipLesson[];
  threats: StewardshipThreat[];
  protections: StewardshipProtection[];
  uncertainties: StewardshipUncertainty[];
  context?: StewardshipContext;
  governance?: StewardshipGovernanceInputs;
}): StewardshipGovernanceAssessment {
  const evidenceQuality = qualityFromOverride(
    input.governance?.evidenceQuality,
    average(
      input.evidence.map((item) => qualityScore(item.quality)),
      0,
    ),
  );
  const evidenceDurability = qualityFromOverride(
    input.governance?.evidenceDurability,
    average(
      input.evidence.map((item) => qualityScore(item.durability)),
      0,
    ),
  );
  const reviewDepth = qualityFromOverride(
    input.governance?.reviewDepth,
    Math.min(100, input.lessons.length * 18 + input.evidence.length * 7),
  );
  const repetitionStrength = qualityFromOverride(
    input.governance?.repetitionStrength,
    Math.min(
      100,
      Math.max(0, ...input.lessons.map((lesson) => lesson.repetition)) * 25,
    ),
  );
  const uncertaintyVisibility = visibilityFromOverride(
    input.governance?.uncertaintyVisibility,
    input.uncertainties.length > 0 ? "explicit" : "partial",
  );
  const riskVisibility = visibilityFromOverride(
    input.governance?.riskVisibility,
    input.threats.length > 0 ? "explicit" : "partial",
  );
  const reversibility = reversibilityFromOverride(
    input.governance?.reversibility ?? input.context?.reversibility,
  );
  const concentrationRisk = concentrationFromOverride(
    input.governance?.concentrationRisk ?? input.context?.concentrationRisk,
  );
  const accountabilityClarity = qualityFromOverride(
    input.governance?.accountabilityClarity,
    input.context?.accountabilityOwner ? 80 : 20,
  );
  const policyCompliance =
    input.governance?.policyCompliance ??
    input.context?.policyCompliance ??
    "unknown";
  const missingInformation = uniqueStrings([
    ...(input.context?.missingInformation ?? []),
    ...(input.governance?.missingInformation ?? []),
  ]);
  const contradictionLevel = severityFromOverride(
    input.governance?.contradictionLevel,
    inferContradictionScore(input.evidence, input.lessons),
  );
  const warnings = governanceWarnings({
    evidenceQuality,
    evidenceDurability,
    reviewDepth,
    repetitionStrength,
    uncertaintyVisibility,
    riskVisibility,
    reversibility,
    concentrationRisk,
    accountabilityClarity,
    policyCompliance,
    missingInformation,
    contradictionLevel,
  });
  const blockers = governanceBlockers({
    evidenceQuality,
    reversibility,
    concentrationRisk,
    accountabilityClarity,
    policyCompliance,
    contradictionLevel,
    threats: input.threats,
  });
  const status = governanceStatus(blockers, warnings, {
    evidenceQuality,
    policyCompliance,
    accountabilityClarity,
  });

  return {
    trustworthyEnough: status === "acceptable" || status === "caution",
    status,
    evidenceQuality,
    evidenceDurability,
    reviewDepth,
    repetitionStrength,
    uncertaintyVisibility,
    riskVisibility,
    reversibility,
    concentrationRisk,
    accountabilityClarity,
    policyCompliance,
    missingInformation,
    contradictionLevel,
    warnings,
    blockers,
    rationale: [
      `Evidence quality is ${evidenceQuality}; durability is ${evidenceDurability}.`,
      `Review depth is ${reviewDepth}; repetition strength is ${repetitionStrength}.`,
      `Uncertainty visibility is ${uncertaintyVisibility}; risk visibility is ${riskVisibility}.`,
      `Reversibility is ${reversibility}; concentration risk is ${concentrationRisk}.`,
    ],
  };
}

export function qualityScore(
  value: StewardshipEvidenceQuality | number | undefined,
): number {
  if (typeof value === "number") return asScore(value, 0);
  if (value === "strong") return 88;
  if (value === "adequate") return 68;
  if (value === "limited") return 48;
  if (value === "weak") return 24;
  return 0;
}

function qualityFromOverride(
  value: StewardshipEvidenceQuality | number | undefined,
  fallback: number,
): StewardshipEvidenceQuality {
  if (typeof value === "string") return value;
  return qualityLabel(
    typeof value === "number" ? asScore(value, fallback) : fallback,
  );
}

function visibilityFromOverride(
  value: StewardshipVisibility | number | undefined,
  fallback: StewardshipVisibility,
): StewardshipVisibility {
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const score = asScore(value, 50);
    if (score >= 70) return "explicit";
    if (score >= 35) return "partial";
    return "hidden";
  }
  return fallback;
}

function reversibilityFromOverride(
  value: StewardshipReversibility | number | undefined,
): StewardshipReversibility {
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const score = asScore(value, 50);
    if (score >= 70) return "high";
    if (score >= 35) return "medium";
    return "low";
  }
  return "unknown";
}

function concentrationFromOverride(
  value: StewardshipConcentrationRisk | number | undefined,
): StewardshipConcentrationRisk {
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const score = asScore(value, 50);
    if (score >= 88) return "critical";
    if (score >= 68) return "high";
    if (score >= 38) return "medium";
    return "low";
  }
  return "unknown";
}

function severityFromOverride(
  value: StewardshipSeverity | number | undefined,
  fallback: number,
): StewardshipSeverity {
  if (typeof value === "string") return value;
  const score = typeof value === "number" ? asScore(value, fallback) : fallback;
  if (score >= 82) return "critical";
  if (score >= 62) return "high";
  if (score >= 32) return "medium";
  return "low";
}

function inferContradictionScore(
  evidence: StewardshipEvidence[],
  lessons: StewardshipLesson[],
): number {
  const evidenceContradictions = evidence.reduce(
    (sum, item) => sum + (item.contradicts?.length ?? 0),
    0,
  );
  const contradictedLessons = lessons.filter(
    (lesson) => lesson.outcome === "contradicted",
  ).length;
  const mixedLessons = lessons.filter(
    (lesson) => lesson.outcome === "mixed",
  ).length;
  return Math.min(
    100,
    evidenceContradictions * 25 + contradictedLessons * 28 + mixedLessons * 12,
  );
}

function governanceWarnings(input: {
  evidenceQuality: StewardshipEvidenceQuality;
  evidenceDurability: StewardshipEvidenceQuality;
  reviewDepth: StewardshipEvidenceQuality;
  repetitionStrength: StewardshipEvidenceQuality;
  uncertaintyVisibility: StewardshipVisibility;
  riskVisibility: StewardshipVisibility;
  reversibility: StewardshipReversibility;
  concentrationRisk: StewardshipConcentrationRisk;
  accountabilityClarity: StewardshipEvidenceQuality;
  policyCompliance: StewardshipGovernanceAssessment["policyCompliance"];
  missingInformation: string[];
  contradictionLevel: StewardshipSeverity;
}): string[] {
  const warnings: string[] = [];
  if (["absent", "weak", "limited"].includes(input.evidenceQuality))
    warnings.push(
      "Evidence quality is not yet durable enough for a larger step.",
    );
  if (["absent", "weak", "limited"].includes(input.evidenceDurability))
    warnings.push("Evidence durability is limited.");
  if (["absent", "weak", "limited"].includes(input.reviewDepth))
    warnings.push("Review depth is incomplete.");
  if (["absent", "weak", "limited"].includes(input.repetitionStrength))
    warnings.push("Repeated lesson strength is limited.");
  if (input.uncertaintyVisibility !== "explicit")
    warnings.push("Uncertainty is not explicit enough.");
  if (input.riskVisibility !== "explicit")
    warnings.push("Risk is not explicit enough.");
  if (input.reversibility === "low" || input.reversibility === "unknown")
    warnings.push("Reversibility is limited or unknown.");
  if (
    input.concentrationRisk === "high" ||
    input.concentrationRisk === "critical"
  )
    warnings.push("Concentration risk is elevated.");
  if (["absent", "weak", "limited"].includes(input.accountabilityClarity))
    warnings.push("Accountability is not clear enough.");
  if (
    input.policyCompliance === "needs_review" ||
    input.policyCompliance === "unknown"
  )
    warnings.push("Policy compliance needs review.");
  if (input.missingInformation.length > 0)
    warnings.push("Missing information remains visible.");
  if (
    input.contradictionLevel === "high" ||
    input.contradictionLevel === "critical"
  )
    warnings.push("Contradictory evidence needs review.");
  return uniqueStrings(warnings);
}

function governanceBlockers(input: {
  evidenceQuality: StewardshipEvidenceQuality;
  reversibility: StewardshipReversibility;
  concentrationRisk: StewardshipConcentrationRisk;
  accountabilityClarity: StewardshipEvidenceQuality;
  policyCompliance: StewardshipGovernanceAssessment["policyCompliance"];
  contradictionLevel: StewardshipSeverity;
  threats: StewardshipThreat[];
}): string[] {
  const blockers: string[] = [];
  const criticalThreat = input.threats.some(
    (threat) => threat.severity === "critical" && threat.mitigated !== true,
  );
  if (input.policyCompliance === "violated")
    blockers.push("Policy compliance is violated.");
  if (criticalThreat && input.reversibility === "low")
    blockers.push("A critical threat is paired with low reversibility.");
  if (input.concentrationRisk === "critical")
    blockers.push("Concentration risk is critical.");
  if (input.accountabilityClarity === "absent" && criticalThreat)
    blockers.push("Critical risk has no clear accountability.");
  if (
    input.contradictionLevel === "critical" &&
    ["absent", "weak", "limited"].includes(input.evidenceQuality)
  ) {
    blockers.push(
      "Contradictions are too severe for the current evidence base.",
    );
  }
  return blockers;
}

function governanceStatus(
  blockers: string[],
  warnings: string[],
  input: {
    evidenceQuality: StewardshipEvidenceQuality;
    policyCompliance: StewardshipGovernanceAssessment["policyCompliance"];
    accountabilityClarity: StewardshipEvidenceQuality;
  },
): StewardshipGovernanceAssessment["status"] {
  if (blockers.length > 0) return "blocked";
  if (input.policyCompliance === "violated") return "blocked";
  if (
    input.evidenceQuality === "absent" ||
    input.accountabilityClarity === "absent"
  )
    return "weak";
  if (warnings.length >= 5) return "weak";
  if (warnings.length > 0) return "caution";
  return "acceptable";
}
