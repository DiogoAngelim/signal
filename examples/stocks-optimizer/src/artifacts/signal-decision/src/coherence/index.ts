import type {
  CoherenceAssessment,
  CoherenceConflict,
  CoherenceStatus,
  DecisionModuleInputs,
  DecisionModuleName,
  NormalizedModuleState,
} from "../types";
import {
  average,
  clamp,
  moduleScore,
  normalizeModuleInputs,
  severityWeight,
  standardDeviation,
} from "../utils";

type RuleContext = Partial<Record<DecisionModuleName, NormalizedModuleState>>;

export function assessCoherence(
  input: DecisionModuleInputs,
): CoherenceAssessment {
  const modules = normalizeModuleInputs(input);
  const moduleValues = Object.values(modules);
  const scores = moduleValues.map((module) => module.score);
  const baseScore = average(scores);
  const dispersion = standardDeviation(scores);
  const conflicts = detectCoherenceConflicts(modules);
  const penalty = conflicts.reduce(
    (sum, conflict) => sum + severityWeight(conflict.severity),
    0,
  );
  const reflectionJudgmentBonus = reflectiveJudgmentBonus(modules);
  const consensusLevel = clamp(100 - dispersion * 1.45 - conflicts.length * 4);
  const score = clamp(
    baseScore * 0.62 +
      consensusLevel * 0.38 -
      penalty +
      reflectionJudgmentBonus,
  );
  const hasCritical = conflicts.some(
    (conflict) => conflict.severity === "critical",
  );
  const actionAllowed =
    !hasCritical &&
    score >= 40 &&
    moduleValues.every((module) => module.allowed || module.score >= 35);
  const actionScale = actionAllowed ? actionScaleFor(score, conflicts) : 0;
  const status = coherenceStatusFor(score, conflicts, actionAllowed);
  const conflictPenalty = conflicts.reduce(
    (sum, conflict) => sum + severityWeight(conflict.severity) / 4,
    0,
  );
  const trustAdjustment = clamp(
    reflectionJudgmentBonus - conflictPenalty,
    -30,
    20,
  );
  const agencyAdjustment = clamp((actionScale - 1) * 100, -100, 25);
  const confidenceAdjustment = clamp(
    calibrationConfidenceAdjustment(modules) - conflictPenalty,
    -40,
    20,
  );

  return {
    score: Math.round(score),
    status,
    contradictions: conflicts,
    consensusLevel: Math.round(consensusLevel),
    actionAllowed,
    actionScale,
    trustAdjustment: Math.round(trustAdjustment),
    agencyAdjustment: Math.round(agencyAdjustment),
    confidenceAdjustment: Math.round(confidenceAdjustment),
    explanation: coherenceExplanation(
      score,
      status,
      conflicts,
      actionScale,
      reflectionJudgmentBonus,
    ),
  };
}

export function detectCoherenceConflicts(
  modules: RuleContext,
): CoherenceConflict[] {
  const conflicts: CoherenceConflict[] = [];
  addIf(conflicts, highDiscoveryLowTrust(modules));
  addIf(conflicts, highAgencyWeakPurpose(modules));
  addIf(conflicts, highConfidenceLowCalibration(modules));
  addIf(conflicts, lowRecoveryHighAgency(modules));
  addIf(conflicts, weakNeedStrongAgency(modules));
  addIf(conflicts, weakIdentityStrongAgency(modules));
  addIf(conflicts, lowAwarenessHighJudgment(modules));
  return conflicts;
}

function highDiscoveryLowTrust(modules: RuleContext): CoherenceConflict | null {
  if (
    moduleScore(modules, "discovery") < 75 ||
    moduleScore(modules, "trust") > 45
  )
    return null;
  return conflict(
    "high-discovery-low-trust",
    ["discovery", "trust"],
    "high",
    "Discovery sees opportunity before trust has earned permission.",
    "Reduce or pause action until trust catches up.",
  );
}

function highAgencyWeakPurpose(modules: RuleContext): CoherenceConflict | null {
  if (
    moduleScore(modules, "agency") < 75 ||
    moduleScore(modules, "purpose") > 45
  )
    return null;
  return conflict(
    "high-agency-weak-purpose",
    ["agency", "purpose"],
    "critical",
    "Agency is trying to act without a strong purpose.",
    "Block or sharply reduce agency until purpose is explicit.",
  );
}

function highConfidenceLowCalibration(
  modules: RuleContext,
): CoherenceConflict | null {
  const confidence = Math.max(
    moduleScore(modules, "judgment"),
    moduleScore(modules, "trust"),
  );
  if (confidence < 75 || moduleScore(modules, "calibration") > 55) return null;
  return conflict(
    "high-confidence-low-calibration",
    ["judgment", "trust", "calibration"],
    "high",
    "Confidence is higher than calibration can justify.",
    "Suppress confidence until outcomes validate the current judgment.",
  );
}

function lowRecoveryHighAgency(modules: RuleContext): CoherenceConflict | null {
  if (
    moduleScore(modules, "recovery") > 40 ||
    moduleScore(modules, "agency") < 65
  )
    return null;
  return conflict(
    "low-recovery-high-agency",
    ["recovery", "agency"],
    "critical",
    "Recovery capacity is low while agency wants to take meaningful action.",
    "Block aggressive action and protect the system first.",
  );
}

function weakNeedStrongAgency(modules: RuleContext): CoherenceConflict | null {
  if (moduleScore(modules, "need") > 45 || moduleScore(modules, "agency") < 70)
    return null;
  return conflict(
    "weak-need-strong-agency",
    ["need", "agency"],
    "medium",
    "Agency is stronger than the demonstrated need.",
    "Scale action to the need rather than the impulse to act.",
  );
}

function weakIdentityStrongAgency(
  modules: RuleContext,
): CoherenceConflict | null {
  if (
    moduleScore(modules, "identity") > 45 ||
    moduleScore(modules, "agency") < 70
  )
    return null;
  return conflict(
    "weak-identity-strong-agency",
    ["identity", "agency"],
    "medium",
    "The action does not clearly fit the system identity.",
    "Require a clearer mandate before increasing agency.",
  );
}

function lowAwarenessHighJudgment(
  modules: RuleContext,
): CoherenceConflict | null {
  if (
    moduleScore(modules, "awareness") > 45 ||
    moduleScore(modules, "judgment") < 70
  )
    return null;
  return conflict(
    "low-awareness-high-judgment",
    ["awareness", "judgment"],
    "medium",
    "Judgment is confident while awareness of the current context is weak.",
    "Treat the decision as tentative until awareness improves.",
  );
}

function reflectiveJudgmentBonus(modules: RuleContext): number {
  return moduleScore(modules, "reflection") >= 70 &&
    moduleScore(modules, "judgment") >= 70
    ? 8
    : 0;
}

function calibrationConfidenceAdjustment(modules: RuleContext): number {
  const calibration = moduleScore(modules, "calibration");
  const judgment = moduleScore(modules, "judgment");
  if (judgment >= 75 && calibration < 60) return -18;
  if (judgment >= 65 && calibration >= 75) return 8;
  return 0;
}

function actionScaleFor(score: number, conflicts: CoherenceConflict[]): number {
  const critical = conflicts.some(
    (conflict) => conflict.severity === "critical",
  );
  if (critical || score < 40) return 0;
  if (score < 60) return 0.15;
  if (score < 75) return 0.45;
  if (score < 90) return 0.75;
  return 1;
}

function coherenceStatusFor(
  score: number,
  conflicts: CoherenceConflict[],
  actionAllowed: boolean,
): CoherenceStatus {
  if (!actionAllowed) return "blocked";
  if (
    conflicts.some(
      (conflict) =>
        conflict.severity === "critical" || conflict.severity === "high",
    )
  )
    return "contradictory";
  if (score < 40) return "unstable";
  if (score < 60) return "tension";
  if (score < 75) return "stable";
  return "aligned";
}

function coherenceExplanation(
  score: number,
  status: CoherenceStatus,
  conflicts: CoherenceConflict[],
  actionScale: number,
  bonus: number,
): string[] {
  const lines = [
    `Coherence is ${Math.round(score)}/100 and the system is ${status}.`,
    actionScale <= 0
      ? "Action should pause until the contradiction clears."
      : actionScale < 1
        ? `Action can continue only at ${Math.round(actionScale * 100)}% scale.`
        : "Action can proceed at normal scale.",
  ];
  if (bonus > 0)
    lines.push("Reflection and judgment agree, which modestly improves trust.");
  for (const conflict of conflicts) {
    lines.push(conflict.description);
  }
  return lines;
}

function conflict(
  conflictId: string,
  modules: DecisionModuleName[],
  severity: CoherenceConflict["severity"],
  description: string,
  recommendation: string,
): CoherenceConflict {
  return { conflictId, modules, severity, description, recommendation };
}

function addIf(
  conflicts: CoherenceConflict[],
  conflictValue: CoherenceConflict | null,
): void {
  if (conflictValue) conflicts.push(conflictValue);
}
