/**
 * @signal/decision — Evaluation Module
 *
 * Deterministic scoring: score = value - (cost + risk)
 * Options violating constraints are penalized or invalidated.
 * Collapsed from: @signal/decision (coherence, assessment, prediction, simulation, wisdom),
 *   @signal/commitment (engine, policy)
 */

import type {
  ConstraintViolation,
  EvaluatedOption,
  EvaluationResult,
  Intent,
  Option,
  ResourceConstraint,
} from "./types";

/**
 * Evaluate all options under constraints.
 * Deterministic: same input always produces same output.
 */
export function evaluateOptions(
  intent: Intent,
  options: Option[],
): EvaluationResult {
  const evaluated = options.map((option) => evaluateOption(intent, option));
  const validOptions = evaluated.filter((o) => o.valid);
  const invalidOptions = evaluated.filter((o) => !o.valid);
  const allViolations = evaluated.flatMap((o) => o.violations);

  if (validOptions.length === 0) {
    throw new Error(
      "No valid options after constraint evaluation. " +
      "All options violate at least one enforced constraint. " +
      "Relax constraints or provide different options.",
    );
  }

  const selected = selectBest(validOptions);

  return {
    options: evaluated,
    validOptions,
    invalidOptions,
    selected,
    constraintViolations: allViolations,
  };
}

/**
 * Score a single option: score = value - (cost + risk)
 * Then check constraints and apply penalties.
 */
export function evaluateOption(
  intent: Intent,
  option: Option,
): EvaluatedOption {
  // Base deterministic score
  const baseScore = option.estimatedValue - (option.estimatedCost + option.estimatedRisk);

  // Check constraint violations
  const violations = checkConstraintViolations(intent, option);

  // Calculate penalty from violations
  const penalty = violations.reduce((sum, v) => sum + v.penalty, 0);
  const adjustedScore = baseScore - penalty;

  // Option is invalid if any enforced constraint is violated
  const hasEnforcedViolation = violations.some(
    (v) => v.constraint.enforced !== false,
  );
  const valid = !hasEnforcedViolation;

  return {
    ...option,
    score: round(baseScore),
    valid,
    violations,
    adjustedScore: round(adjustedScore),
  };
}

// ─── Constraint Checking ────────────────────────────────────────

function checkConstraintViolations(
  intent: Intent,
  option: Option,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const constraint of intent.constraints) {
    const violation = checkConstraint(constraint, option);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

function checkConstraint(
  constraint: ResourceConstraint,
  option: Option,
): ConstraintViolation | undefined {
  switch (constraint.type) {
    case "time":
      return checkTimeConstraint(constraint, option);
    case "money":
      return checkMoneyConstraint(constraint, option);
    case "compute":
      return checkComputeConstraint(constraint, option);
    case "team":
      return checkTeamConstraint(constraint, option);
    case "risk":
      return checkRiskConstraint(constraint, option);
    default:
      return undefined;
  }
}

function checkTimeConstraint(
  constraint: ResourceConstraint,
  option: Option,
): ConstraintViolation | undefined {
  if (option.timeRequired > constraint.limit) {
    const excess = option.timeRequired - constraint.limit;
    return {
      constraint,
      excess: round(excess),
      penalty: round(excess * 2), // Time overruns are heavily penalized
    };
  }
  return undefined;
}

function checkMoneyConstraint(
  constraint: ResourceConstraint,
  option: Option,
): ConstraintViolation | undefined {
  if (option.estimatedCost > constraint.limit) {
    const excess = option.estimatedCost - constraint.limit;
    return {
      constraint,
      excess: round(excess),
      penalty: round(excess * 1.5), // Cost overruns are penalized
    };
  }
  return undefined;
}

function checkComputeConstraint(
  constraint: ResourceConstraint,
  option: Option,
): ConstraintViolation | undefined {
  if (option.resourceRequired > constraint.limit) {
    const excess = option.resourceRequired - constraint.limit;
    return {
      constraint,
      excess: round(excess),
      penalty: round(excess * 1.0),
    };
  }
  return undefined;
}

function checkTeamConstraint(
  constraint: ResourceConstraint,
  option: Option,
): ConstraintViolation | undefined {
  // Team constraint: resourceRequired represents team capacity usage
  if (option.resourceRequired > constraint.limit) {
    const excess = option.resourceRequired - constraint.limit;
    return {
      constraint,
      excess: round(excess),
      penalty: round(excess * 1.2),
    };
  }
  return undefined;
}

function checkRiskConstraint(
  constraint: ResourceConstraint,
  option: Option,
): ConstraintViolation | undefined {
  if (option.estimatedRisk > constraint.limit) {
    const excess = option.estimatedRisk - constraint.limit;
    return {
      constraint,
      excess: round(excess),
      penalty: round(excess * 3), // Risk overruns are most heavily penalized
    };
  }
  return undefined;
}

// ─── Selection ──────────────────────────────────────────────────

function selectBest(validOptions: EvaluatedOption[]): EvaluatedOption {
  // Select highest adjustedScore; break ties by lower risk, then lower cost
  const sorted = [...validOptions].sort((a, b) => {
    const scoreDiff = b.adjustedScore - a.adjustedScore;
    if (Math.abs(scoreDiff) > 1e-10) return scoreDiff;
    const riskDiff = a.estimatedRisk - b.estimatedRisk;
    if (Math.abs(riskDiff) > 1e-10) return riskDiff;
    return a.estimatedCost - b.estimatedCost;
  });
  return sorted[0] as EvaluatedOption;
}

// ─── Helpers ────────────────────────────────────────────────────

function round(value: number): number {
  return Number(value.toFixed(6));
}