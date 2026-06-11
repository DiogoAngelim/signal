/**
 * DecisionPort — Abstraction for invoking pure decision logic.
 *
 * Domain packages (@signal/decision, @signal/decision-memory, etc.)
 * are invoked ONLY through this port. Runtime never imports domain
 * directly — it calls through the DecisionPort interface.
 *
 * Rules:
 * - Implementations must be pure functions (no side effects)
 * - No event emission from decision logic
 * - No runtime imports in implementations
 * - Deterministic: same input → same output, always
 */

/**
 * Input to a decision evaluation.
 */
export interface DecisionInput {
  /** The decision operation to evaluate */
  operationName: string;
  /** Input payload for the decision */
  payload: unknown;
  /** Current state snapshot (read-only) */
  state?: Record<string, unknown>;
  /** Execution context metadata (correlation, trace, etc.) */
  context?: Record<string, unknown>;
}

/**
 * Output from a decision evaluation.
 */
export interface DecisionOutput {
  /** Whether the decision was successfully evaluated */
  ok: boolean;
  /** The decision result (if ok) */
  result?: unknown;
  /** Error details (if not ok) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** State updates produced by the decision (if any) */
  stateUpdates?: Record<string, unknown>;
  /** Metadata about the decision execution */
  meta?: Record<string, unknown>;
}

/**
 * Decision port for invoking pure decision logic.
 * Runtime delegates all decision-making through this port.
 */
export interface DecisionPort {
  /**
   * Evaluate a decision operation.
   * Must be deterministic: same input always produces same output.
   * Must not emit events or cause side effects.
   */
  evaluate(input: DecisionInput): Promise<DecisionOutput>;
}