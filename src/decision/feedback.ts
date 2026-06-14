/**
 * @signal/decision — Feedback Module
 *
 * Stores: decision, selected option, outcome, constraint violations.
 * Collapsed from: @signal/decision (outcomes, accountability, decision-record, human-language),
 *   @signal/agency (agency, calibration, learning, memory, outcome, self-diagnosis),
 *   @signal/decision-memory
 */

import type {
  ConstraintViolation,
  DecisionOutcome,
  EvaluatedOption,
  ExecutionPlan,
  FeedbackRecord,
  FeedbackStore,
  Intent,
} from "./types";

// ─── In-Memory Feedback Store ───────────────────────────────────

const records = new Map<string, FeedbackRecord>();

export const inMemoryFeedbackStore: FeedbackStore = {
  save(record: FeedbackRecord): FeedbackRecord {
    records.set(record.decisionId, record);
    return record;
  },
  get(decisionId: string): FeedbackRecord | undefined {
    return records.get(decisionId);
  },
  list(): FeedbackRecord[] {
    return [...records.values()];
  },
  clear(): void {
    records.clear();
  },
};

// ─── Feedback Creation ──────────────────────────────────────────

/**
 * Create a feedback record for a decision.
 */
export function createFeedbackRecord(
  decisionId: string,
  intent: Intent,
  selectedOption: EvaluatedOption,
  executionPlan: ExecutionPlan,
  violations: ConstraintViolation[],
): FeedbackRecord {
  return {
    decisionId,
    intent,
    selectedOption,
    executionPlan,
    outcome: undefined, // Outcome is recorded later
    recordedAt: new Date().toISOString(),
    metadata: {
      constraintViolations: violations.length,
      validOptionCount: 1,
    },
  };
}

/**
 * Record an outcome for an existing decision.
 */
export function recordOutcome(
  store: FeedbackStore,
  decisionId: string,
  outcome: {
    result: DecisionOutcome;
    actualCost?: number;
    actualTime?: number;
    notes?: string;
  },
): FeedbackRecord {
  const record = store.get(decisionId);
  if (!record) {
    throw new Error(`No feedback record found for decision: ${decisionId}`);
  }

  const violations: ConstraintViolation[] = [];
  // Check if actual cost/time exceeded constraints
  for (const constraint of record.intent.constraints) {
    if (constraint.type === "money" && outcome.actualCost !== undefined && outcome.actualCost > constraint.limit) {
      violations.push({
        constraint,
        excess: outcome.actualCost - constraint.limit,
        penalty: 0,
      });
    }
    if (constraint.type === "time" && outcome.actualTime !== undefined && outcome.actualTime > constraint.limit) {
      violations.push({
        constraint,
        excess: outcome.actualTime - constraint.limit,
        penalty: 0,
      });
    }
  }

  record.outcome = {
    result: outcome.result,
    actualCost: outcome.actualCost,
    actualTime: outcome.actualTime,
    constraintViolations: violations.length > 0 ? violations : undefined,
    observedAt: new Date().toISOString(),
    notes: outcome.notes,
  };

  store.save(record);
  return record;
}

/**
 * Persist a feedback record to the store.
 */
export function persistFeedback(
  store: FeedbackStore,
  record: FeedbackRecord,
): FeedbackRecord {
  return store.save(record);
}

/**
 * Generate a human-readable summary of a decision.
 */
export function summarizeDecision(record: FeedbackRecord): string {
  const parts: string[] = [
    `Decision: ${record.intent.goal}`,
    `Selected: ${record.selectedOption.label} (score: ${record.selectedOption.adjustedScore.toFixed(3)})`,
    `Plan: ${record.executionPlan.steps.length} step(s), estimated cost: ${record.executionPlan.totalEstimatedCost}`,
  ];

  if (record.outcome) {
    parts.push(`Outcome: ${record.outcome.result}`);
    if (record.outcome.actualCost !== undefined) {
      parts.push(`Actual cost: ${record.outcome.actualCost}`);
    }
  }

  if (record.selectedOption.violations.length > 0) {
    parts.push(`Constraint violations: ${record.selectedOption.violations.length}`);
  }

  return parts.join(" | ");
}