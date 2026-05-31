export type GuidedStepId =
  | "choose-market"
  | "review-current-conditions"
  | "explore-opportunities"
  | "understand-reasoning"
  | "decide-what-to-do";

export type GuidedStepStatus =
  | "notStarted"
  | "inProgress"
  | "completed"
  | "needsAttention";

export type GuidedStep = {
  id: GuidedStepId;
  title: string;
  description: string;
};

export const GUIDED_STEPS: GuidedStep[] = [
  {
    id: "choose-market",
    title: "Choose Market",
    description: "Start with the market and venue you want to review.",
  },
  {
    id: "review-current-conditions",
    title: "Review Current Conditions",
    description: "Check the current read before looking for ideas.",
  },
  {
    id: "explore-opportunities",
    title: "Explore Opportunities",
    description: "Find the opportunities that deserve attention.",
  },
  {
    id: "understand-reasoning",
    title: "Understand Reasoning",
    description: "Review why the recommendation is being made.",
  },
  {
    id: "decide-what-to-do",
    title: "Decide What To Do",
    description: "Turn the evidence into a clear next action.",
  },
];

export const DEFAULT_GUIDED_STEP_ID: GuidedStepId = GUIDED_STEPS[0].id;

export const GUIDED_STEP_STATUS_LABELS: Record<GuidedStepStatus, string> = {
  notStarted: "Not started",
  inProgress: "In progress",
  completed: "Completed",
  needsAttention: "Needs attention",
};

export function getGuidedStepIndex(stepId: GuidedStepId) {
  return Math.max(
    0,
    GUIDED_STEPS.findIndex((step) => step.id === stepId),
  );
}

export function getGuidedStepNumber(stepId: GuidedStepId) {
  return getGuidedStepIndex(stepId) + 1;
}

export function getGuidedStepById(stepId: GuidedStepId) {
  return (
    GUIDED_STEPS.find((step) => step.id === stepId) ?? GUIDED_STEPS[0]
  );
}

export function createGuidedStepStatuses(input: {
  activeStepId: GuidedStepId;
  visitedStepIds: Iterable<GuidedStepId>;
  marketAndVenueSelected: boolean;
}) {
  const visited = new Set(input.visitedStepIds);
  const statuses = Object.fromEntries(
    GUIDED_STEPS.map((step) => [step.id, "notStarted"]),
  ) as Record<GuidedStepId, GuidedStepStatus>;

  if (input.marketAndVenueSelected) {
    statuses["choose-market"] = "completed";
  } else if (
    input.activeStepId === "choose-market" ||
    visited.has("choose-market")
  ) {
    statuses["choose-market"] = "inProgress";
  }

  for (const step of GUIDED_STEPS) {
    if (step.id === "choose-market") continue;
    if (step.id === input.activeStepId || visited.has(step.id)) {
      statuses[step.id] = "inProgress";
    }
  }

  return statuses;
}
