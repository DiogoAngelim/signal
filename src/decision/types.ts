/**
 * @signal/decision — Core Types
 *
 * Unified type system for the Decision + Resource Allocation Engine.
 * Collapsed from: @signal/decision, @signal/commitment, @signal/agency
 */

// ─── Resource Constraints (NEW CORE LAYER) ─────────────────────

export type ResourceConstraintType = "time" | "money" | "compute" | "team" | "risk";

export type ResourceConstraint = {
  type: ResourceConstraintType;
  limit: number;
  unit?: string;
  label?: string;
  enforced?: boolean;
};

// ─── Intent ──────────────────────────────────────────────────────

export type Intent = {
  goal: string;
  context?: Record<string, unknown>;
  constraints: ResourceConstraint[];
};

export type IntentInput = {
  goal: string;
  context?: Record<string, unknown>;
  constraints?: ResourceConstraint[];
};

// ─── Options ────────────────────────────────────────────────────

export type OptionCategory = "fast" | "conservative" | "default";

export type Option = {
  id: string;
  label: string;
  category: OptionCategory;
  description: string;
  estimatedValue: number;
  estimatedCost: number;
  estimatedRisk: number;
  timeRequired: number;
  resourceRequired: number;
  constraints: ResourceConstraint[];
  reversible: boolean;
  metadata?: Record<string, unknown>;
};

// ─── Evaluation ─────────────────────────────────────────────────

export type ConstraintViolation = {
  constraint: ResourceConstraint;
  excess: number;
  penalty: number;
};

export type EvaluatedOption = Option & {
  score: number;
  valid: boolean;
  violations: ConstraintViolation[];
  adjustedScore: number;
};

export type EvaluationResult = {
  options: EvaluatedOption[];
  validOptions: EvaluatedOption[];
  invalidOptions: EvaluatedOption[];
  selected: EvaluatedOption;
  constraintViolations: ConstraintViolation[];
};

// ─── Execution Plan ─────────────────────────────────────────────

export type ExecutionStep = {
  stepId: string;
  action: string;
  optionId: string;
  estimatedCost: number;
  estimatedTime: number;
  dependencies: string[];
  reversible: boolean;
};

export type ExecutionPlan = {
  planId: string;
  decisionId: string;
  steps: ExecutionStep[];
  totalEstimatedCost: number;
  totalEstimatedTime: number;
  constraints: ResourceConstraint[];
  createdAt: string;
};

// ─── Feedback ───────────────────────────────────────────────────

export type DecisionOutcome = "success" | "failure" | "partial" | "unknown";

export type FeedbackRecord = {
  decisionId: string;
  intent: Intent;
  selectedOption: EvaluatedOption;
  executionPlan: ExecutionPlan;
  outcome?: {
    result: DecisionOutcome;
    actualCost?: number;
    actualTime?: number;
    constraintViolations?: ConstraintViolation[];
    observedAt: string;
    notes?: string;
  };
  recordedAt: string;
  metadata?: Record<string, unknown>;
};

export type FeedbackStore = {
  save(record: FeedbackRecord): FeedbackRecord;
  get(decisionId: string): FeedbackRecord | undefined;
  list(): FeedbackRecord[];
  clear(): void;
};

// ─── Decision Result ────────────────────────────────────────────

export type DecisionResult = {
  decisionId: string;
  intent: Intent;
  options: EvaluatedOption[];
  selected: EvaluatedOption;
  executionPlan: ExecutionPlan;
  feedbackRecord: FeedbackRecord;
  constraintViolations: ConstraintViolation[];
  createdAt: string;
};

// ─── Decision Input ─────────────────────────────────────────────

export type DecideInput = {
  goal: string;
  context?: Record<string, unknown>;
  constraints?: ResourceConstraint[];
};