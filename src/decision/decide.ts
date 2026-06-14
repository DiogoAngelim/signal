/**
 * @signal/decision — SINGLE ORCHESTRATOR
 *
 * The ONLY execution spine for the Decision + Resource Allocation Engine.
 *
 * Executes: normalize intent → generate options → validate ≥2 →
 *   evaluate under constraints → discard invalid → select best →
 *   build execution plan → persist decision → return result
 *
 * HARD INVARIANTS:
 * - options.length ≥ 2 OR throw
 * - at least one valid constrained option must exist OR throw
 * - selected option required OR throw
 * - execution plan required OR throw
 */

import { buildExecutionPlan } from "./execution";
import { createFeedbackRecord, inMemoryFeedbackStore, persistFeedback } from "./feedback";
import { normalizeIntent } from "./intent";
import { generateOptions, validateOptions } from "./options";
import { evaluateOptions } from "./evaluation";
import type {
  ConstraintViolation,
  DecideInput,
  DecisionResult,
  EvaluatedOption,
  ExecutionPlan,
  FeedbackRecord,
  FeedbackStore,
  Intent,
} from "./types";

let decisionCounter = 0;

/**
 * decide() — The single entry point for all decisions.
 *
 * Takes a goal + optional constraints, produces a deterministic
 * decision result with constraint-aware evaluation.
 */
export function decide(input: DecideInput): DecisionResult {
  // 1. Normalize intent
  const intent = normalizeIntent(input);

  // 2. Generate options (always ≥3: fast, conservative, default)
  const rawOptions = generateOptions(intent);

  // 3. Validate ≥2 options (HARD INVARIANT)
  const options = validateOptions(rawOptions);

  // 4. Evaluate options under constraints
  const evaluation = evaluateOptions(intent, options);

  // 5. At least one valid constrained option must exist (HARD INVARIANT)
  if (evaluation.validOptions.length === 0) {
    throw new Error(
      "No valid options after constraint evaluation. " +
      "All options violate at least one enforced constraint. " +
      "Relax constraints or provide different input.",
    );
  }

  // 6. Select highest valid score (already done by evaluateOptions)
  const selected = evaluation.selected;
  if (!selected) {
    throw new Error("Selected option is required but was not produced.");
  }

  // 7. Build execution plan
  const decisionId = generateDecisionId();
  const executionPlan = buildExecutionPlan(decisionId, intent, selected);

  // 8. Execution plan required (HARD INVARIANT)
  if (!executionPlan || executionPlan.steps.length === 0) {
    throw new Error("Execution plan is required but was not produced.");
  }

  // 9. Persist decision
  const feedbackRecord = createFeedbackRecord(
    decisionId,
    intent,
    selected,
    executionPlan,
    evaluation.constraintViolations,
  );
  persistFeedback(inMemoryFeedbackStore, feedbackRecord);

  // 10. Return result
  return {
    decisionId,
    intent,
    options: evaluation.options,
    selected,
    executionPlan,
    feedbackRecord,
    constraintViolations: evaluation.constraintViolations,
    createdAt: new Date().toISOString(),
  };
}

// ─── ID Generation ──────────────────────────────────────────────

function generateDecisionId(): string {
  decisionCounter += 1;
  return `decision-${Date.now()}-${decisionCounter}`;
}