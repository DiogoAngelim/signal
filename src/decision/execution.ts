/**
 * @signal/decision — Execution Module
 *
 * Only produces structured execution plans.
 * STRICT RULE: NO execution, NO side effects, NO external calls.
 * Collapsed from: @signal/decision (decision-record), @signal/commitment
 */

import type {
  EvaluatedOption,
  ExecutionPlan,
  ExecutionStep,
  Intent,
  ResourceConstraint,
} from "./types";

/**
 * Build an execution plan from a selected option.
 * This is a PLAN only — no execution is performed.
 */
export function buildExecutionPlan(
  decisionId: string,
  intent: Intent,
  selected: EvaluatedOption,
): ExecutionPlan {
  const steps = buildSteps(selected);
  const totalEstimatedCost = round(
    steps.reduce((sum, step) => sum + step.estimatedCost, 0),
  );
  const totalEstimatedTime = round(
    steps.reduce((sum, step) => sum + step.estimatedTime, 0),
  );

  return {
    planId: `plan-${decisionId}`,
    decisionId,
    steps,
    totalEstimatedCost,
    totalEstimatedTime,
    constraints: intent.constraints,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validate an execution plan has required properties.
 */
export function validateExecutionPlan(plan: ExecutionPlan): string[] {
  const errors: string[] = [];
  if (!plan.planId) errors.push("Execution plan must have a planId.");
  if (!plan.decisionId) errors.push("Execution plan must have a decisionId.");
  if (plan.steps.length === 0) errors.push("Execution plan must have at least one step.");
  if (plan.totalEstimatedCost < 0) errors.push("Total estimated cost cannot be negative.");
  if (plan.totalEstimatedTime < 0) errors.push("Total estimated time cannot be negative.");
  return errors;
}

// ─── Internal ───────────────────────────────────────────────────

function buildSteps(selected: EvaluatedOption): ExecutionStep[] {
  const baseStep: ExecutionStep = {
    stepId: `step-${selected.id}-1`,
    action: `Execute: ${selected.label}`,
    optionId: selected.id,
    estimatedCost: selected.estimatedCost,
    estimatedTime: selected.timeRequired,
    dependencies: [],
    reversible: selected.reversible,
  };

  // If the option is reversible, add a rollback step
  if (selected.reversible) {
    const rollbackStep: ExecutionStep = {
      stepId: `step-${selected.id}-rollback`,
      action: `Rollback: ${selected.label}`,
      optionId: selected.id,
      estimatedCost: selected.estimatedCost * 0.1, // Rollback is cheaper
      estimatedTime: selected.timeRequired * 0.2,
      dependencies: [baseStep.stepId],
      reversible: false,
    };
    return [baseStep, rollbackStep];
  }

  return [baseStep];
}

function round(value: number): number {
  return Number(value.toFixed(6));
}