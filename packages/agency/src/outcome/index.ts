import type { OutcomeInput, OutcomeLabel, OutcomeResult } from "../types";

export function resolveOutcome(input: OutcomeInput = {}): OutcomeResult {
  const success = input.success ?? null;
  const reward = optionalNonNegative(input.reward, "reward");
  const loss = optionalNonNegative(input.loss, "loss");
  const durationMs = optionalNonNegative(input.durationMs, "durationMs");
  const outcomeLabel = input.outcomeLabel ?? inferOutcomeLabel(success, reward, loss);

  return {
    success,
    ...(reward === undefined ? {} : { reward }),
    ...(loss === undefined ? {} : { loss }),
    ...(durationMs === undefined ? {} : { durationMs }),
    outcomeLabel,
  };
}

function inferOutcomeLabel(
  success: boolean | null,
  reward: number | undefined,
  loss: number | undefined,
): OutcomeLabel {
  if (success === true) {
    return "positive";
  }

  if (success === false) {
    return "negative";
  }

  if (reward === undefined && loss === undefined) {
    return "unknown";
  }

  const resolvedReward = reward ?? 0;
  const resolvedLoss = loss ?? 0;
  if (resolvedReward > resolvedLoss) {
    return "positive";
  }

  if (resolvedLoss > resolvedReward) {
    return "negative";
  }

  return "neutral";
}

function optionalNonNegative(value: number | undefined, label: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return value;
}
