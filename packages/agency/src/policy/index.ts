import type { PolicyConfig, PolicyEvaluationInput, PolicyResult } from "../types";

const DEFAULT_MINIMUM_CONFIDENCE = 0;

export function evaluatePolicy(input: PolicyEvaluationInput): PolicyResult {
  const config = input.config ?? {};
  const violations: string[] = [];
  const minimumConfidence = unitValue(
    config.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE,
    "minimumConfidence",
  );
  const confidence = unitValue(input.decision.confidence, "decision.confidence");
  const maximumSize = optionalNonNegative(config.maximumSize, "maximumSize");
  const requestedSize = input.sizing === undefined
    ? undefined
    : nonNegative(input.sizing.size, "sizing.size");
  const configuredBlockReasons = config.blockReasons ?? [];
  const inputBlockReasons = input.blockReasons ?? [];
  const allBlockReasons = [...configuredBlockReasons, ...inputBlockReasons].filter((reason) => reason.length > 0);
  const requiresApproval = config.humanApprovalRequired === true;

  if (confidence < minimumConfidence) {
    violations.push("confidence_below_minimum");
  }

  if (maximumSize !== undefined && requestedSize !== undefined && requestedSize > maximumSize) {
    violations.push("size_above_maximum");
  }

  for (const reason of allBlockReasons) {
    violations.push(`blocked:${reason}`);
  }

  if (requiresApproval && input.approvalGranted !== true) {
    violations.push("human_approval_required");
  }

  const recommendedSize = maximumSize !== undefined && requestedSize !== undefined && requestedSize > maximumSize
    ? maximumSize
    : undefined;
  const allowed = violations.length === 0;

  return {
    allowed,
    ...(maximumSize === undefined ? {} : { maxSize: maximumSize }),
    ...(recommendedSize === undefined ? {} : { recommendedSize }),
    requiresApproval,
    reason: policyReason(violations),
    violations,
  };
}

function policyReason(violations: string[]) {
  if (violations.length === 0) {
    return "Policy allowed action.";
  }

  return `Policy blocked action: ${violations.join(", ")}.`;
}

function optionalNonNegative(value: number | undefined, label: string) {
  if (value === undefined) {
    return undefined;
  }

  return nonNegative(value, label);
}

function nonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return value;
}

function unitValue(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }

  return value;
}
