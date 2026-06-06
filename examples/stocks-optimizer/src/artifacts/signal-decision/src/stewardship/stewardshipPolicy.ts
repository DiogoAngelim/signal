import type {
  StewardshipGovernanceAssessment,
  StewardshipLesson,
  StewardshipRecommendationAction,
  StewardshipThreat,
  StewardshipUncertainty,
} from "./types";

export function selectStewardshipAction(input: {
  governance: StewardshipGovernanceAssessment;
  lessons: StewardshipLesson[];
  threats: StewardshipThreat[];
  uncertainties: StewardshipUncertainty[];
  evidenceCount: number;
}): StewardshipRecommendationAction {
  if (input.governance.policyCompliance === "violated") return "stop";
  if (input.governance.blockers.some((blocker) => /critical threat|policy|concentration risk is critical/i.test(blocker))) {
    return input.governance.blockers.some((blocker) => /policy/i.test(blocker)) ? "stop" : "pause";
  }

  const criticalThreat = input.threats.some((threat) => threat.severity === "critical" && threat.mitigated !== true);
  const highThreat = input.threats.some((threat) => (threat.severity === "high" || threat.severity === "critical") && threat.mitigated !== true);
  const confirmedStrength = lessonStrength(input.lessons, "confirmed");
  const contradictedStrength = lessonStrength(input.lessons, "contradicted");
  const mixedStrength = lessonStrength(input.lessons, "mixed");
  const unknownOrEarly = input.lessons.some((lesson) => lesson.outcome === "unknown" || lesson.outcome === "too_early");
  const materialUncertainty = input.uncertainties.some(
    (uncertainty) => uncertainty.severity === "high" || uncertainty.severity === "critical",
  );

  if (criticalThreat && input.governance.reversibility !== "high") return "intervene";
  if (input.evidenceCount === 0 || input.governance.evidenceQuality === "absent") return "observe";
  if (input.governance.accountabilityClarity === "absent" || input.governance.accountabilityClarity === "weak") return "pause";
  if (input.governance.concentrationRisk === "critical" || input.governance.concentrationRisk === "high") return "reduce_exposure";
  if (contradictedStrength >= Math.max(2, confirmedStrength)) return "reduce_exposure";
  if (input.governance.contradictionLevel === "high" || input.governance.contradictionLevel === "critical" || mixedStrength >= 3) return "review_again";
  if (unknownOrEarly || materialUncertainty) return highThreat ? "monitor" : "monitor";
  if (input.governance.status === "weak") return "pause";
  if (confirmedStrength >= 3 && input.governance.trustworthyEnough && input.governance.reversibility !== "low") return "proceed_gradually";
  if (!highThreat && input.governance.evidenceDurability === "strong") return "preserve";
  return "monitor";
}

function lessonStrength(lessons: StewardshipLesson[], outcome: StewardshipLesson["outcome"]): number {
  return lessons
    .filter((lesson) => lesson.outcome === outcome)
    .reduce((sum, lesson) => sum + Math.max(1, lesson.repetition), 0);
}
