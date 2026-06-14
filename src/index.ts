/**
 * @signal/decision — Decision + Resource Allocation Engine
 *
 * Single entrypoint. No alternative entrypoints.
 */
export { decide } from "./decision/decide";
export type {
  ConstraintViolation,
  DecideInput,
  DecisionOutcome,
  DecisionResult,
  EvaluatedOption,
  ExecutionPlan,
  ExecutionStep,
  FeedbackRecord,
  FeedbackStore,
  Intent,
  IntentInput,
  Option,
  OptionCategory,
  ResourceConstraint,
  ResourceConstraintType,
} from "./decision/types";