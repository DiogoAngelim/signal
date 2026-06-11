import type {
  StewardshipEvidenceQuality,
  StewardshipGovernanceAssessment,
  StewardshipRecommendation,
  StewardshipRecommendationAction,
  StewardshipSubject,
} from "./types";

export function defaultSubject(): StewardshipSubject {
  return {
    id: "subject:unknown",
    label: "Important subject",
    importance: "medium",
    desiredState: "healthy, useful, and available",
  };
}

export function normalizeSubject(
  subject?: Partial<StewardshipSubject>,
): StewardshipSubject {
  return {
    ...defaultSubject(),
    ...removeUndefined(subject ?? {}),
    id: nonEmpty(subject?.id, "subject:unknown"),
    label: nonEmpty(subject?.label, "Important subject"),
    importance: subject?.importance ?? "medium",
    desiredState: nonEmpty(
      subject?.desiredState,
      "healthy, useful, and available",
    ),
  };
}

export function actionSummary(
  action: StewardshipRecommendationAction,
  subject: StewardshipSubject,
): string {
  const target = subject.label;
  switch (action) {
    case "observe":
      return `Observe ${target} until basic evidence is available.`;
    case "monitor":
      return `Monitor ${target} while the outcome remains unclear.`;
    case "preserve":
      return `Preserve ${target} and keep the protective posture in place.`;
    case "proceed_gradually":
      return `Proceed gradually while keeping ${target} protected.`;
    case "reduce_exposure":
      return `Reduce exposure to the stressed path and protect ${target}.`;
    case "intervene":
      return `Intervene to protect ${target} before the threat compounds.`;
    case "pause":
      return "Pause until the decision process is trustworthy enough to continue.";
    case "stop":
      return "Stop this path because it fails stewardship requirements.";
    case "review_again":
      return "Review again before increasing commitment.";
  }
}

export function nextStepDescription(
  action: StewardshipRecommendationAction,
  subject: StewardshipSubject,
): string {
  switch (action) {
    case "observe":
      return `Name the next evidence needed for ${subject.label} and do not expand commitment yet.`;
    case "monitor":
      return `Keep monitoring ${subject.label} and wait for a reviewed outcome.`;
    case "preserve":
      return `Maintain the current protection and check whether it still serves ${subject.desiredState}.`;
    case "proceed_gradually":
      return `Take only the smallest reversible step that keeps ${subject.label} protected.`;
    case "reduce_exposure":
      return "Lower the exposed commitment before adding any new dependency.";
    case "intervene":
      return "Apply the nearest protective control and assign follow-up review.";
    case "pause":
      return "Pause action and resolve the governance gap first.";
    case "stop":
      return "End this path unless a future review removes the blocker.";
    case "review_again":
      return "Run another review after the contradiction or missing information is resolved.";
  }
}

export function reviewTrigger(action: StewardshipRecommendationAction): string {
  switch (action) {
    case "observe":
      return "Review when first evidence is available.";
    case "monitor":
      return "Review after the next material outcome or condition change.";
    case "preserve":
      return "Review on the next cadence or when protection weakens.";
    case "proceed_gradually":
      return "Review before increasing commitment.";
    case "reduce_exposure":
      return "Review after exposure has been reduced and risk is visible.";
    case "intervene":
      return "Review immediately after the protective control is applied.";
    case "pause":
      return "Review when governance blockers are resolved.";
    case "stop":
      return "Review only if the path is materially redesigned.";
    case "review_again":
      return "Review when the conflicting lesson has been checked.";
  }
}

export function governanceSentence(
  governance: StewardshipGovernanceAssessment,
): string {
  if (governance.status === "blocked")
    return "The process is not trustworthy enough to continue.";
  if (governance.status === "weak")
    return "The process has material gaps that need protection before action expands.";
  if (governance.status === "caution")
    return "The process is usable only with explicit uncertainty and a small next step.";
  return "The process is acceptable, but it still should not be treated as certainty.";
}

export function qualityLabel(score: number): StewardshipEvidenceQuality {
  if (score >= 78) return "strong";
  if (score >= 58) return "adequate";
  if (score >= 35) return "limited";
  if (score > 0) return "weak";
  return "absent";
}

export function recommendationConfidence(
  governance: StewardshipGovernanceAssessment,
): StewardshipRecommendation["confidence"] {
  if (
    governance.status === "acceptable" &&
    governance.evidenceQuality === "strong"
  )
    return "high";
  if (
    governance.status === "blocked" ||
    governance.evidenceQuality === "absent"
  )
    return "low";
  return "medium";
}

export function defaultDisclaimers(): string[] {
  return [
    "This is a decision-support stewardship review, not a prediction.",
    "It does not claim certainty and should be rechecked as conditions change.",
  ];
}

function nonEmpty(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function removeUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
