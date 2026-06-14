/**
 * @signal/decision — Intent Module
 *
 * Normalizes raw input into structured Intent with constraints.
 * Collapsed from: @signal/decision (reality), @signal/semantic-state
 */

import type { Intent, IntentInput, ResourceConstraint, ResourceConstraintType } from "./types";

/**
 * Normalize raw input into a structured Intent.
 * Ensures constraints are always present (defaults to risk=1.0 if none provided).
 */
export function normalizeIntent(input: IntentInput): Intent {
  const constraints = normalizeConstraints(input.constraints);
  return {
    goal: normalizeGoal(input.goal),
    context: input.context,
    constraints,
  };
}

/**
 * Validate that an intent has minimum required data.
 */
export function validateIntent(intent: Intent): string[] {
  const errors: string[] = [];
  if (!intent.goal || intent.goal.trim().length === 0) {
    errors.push("Intent must have a non-empty goal.");
  }
  if (intent.constraints.length === 0) {
    errors.push("Intent must have at least one constraint (implicit risk=1.0 added if none).");
  }
  for (const constraint of intent.constraints) {
    if (constraint.limit < 0) {
      errors.push(`Constraint "${constraint.label || constraint.type}" has negative limit.`);
    }
  }
  return errors;
}

/**
 * Extract constraints of a specific type from an intent.
 */
export function getConstraintsByType(
  intent: Intent,
  type: ResourceConstraintType,
): ResourceConstraint[] {
  return intent.constraints.filter((c) => c.type === type);
}

// ─── Internal ───────────────────────────────────────────────────

function normalizeGoal(goal: string): string {
  return goal.trim();
}

function normalizeConstraints(
  constraints?: ResourceConstraint[],
): ResourceConstraint[] {
  if (!constraints || constraints.length === 0) {
    // Default: implicit risk constraint
    return [{ type: "risk", limit: 1.0, label: "default-risk", enforced: true }];
  }
  return constraints.map((c, i) => ({
    type: c.type,
    limit: c.limit,
    unit: c.unit,
    label: c.label || `${c.type}-${i + 1}`,
    enforced: c.enforced !== false,
  }));
}