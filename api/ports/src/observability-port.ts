/**
 * ObservabilityPort — Abstraction for runtime lifecycle observation.
 *
 * Runtime emits lifecycle hooks through this port. No direct logging
 * inside runtime — all observability flows through this interface.
 *
 * Rules:
 * - Implementations must not affect runtime behavior
 * - Must be safe to call during replay (implementations check isReplay)
 * - No side effects that could break determinism
 */

/**
 * Lifecycle events emitted by the runtime.
 */
export type RuntimeLifecycleEvent =
  | "command.received"
  | "execution.start"
  | "execution.end"
  | "event.emitted"
  | "replay.mode.active"
  | "idempotency.hit"
  | "idempotency.reserved"
  | "idempotency.conflict"
  | "error.occurred";

/**
 * Context provided with each observability event.
 */
export interface ObservabilityContext {
  /** The lifecycle event type */
  event: RuntimeLifecycleEvent;
  /** Operation name being executed */
  operationName?: string;
  /** Operation kind (query/mutation/event) */
  operationKind?: string;
  /** Message ID of the envelope */
  messageId?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Execution duration in milliseconds (for execution.end) */
  durationMs?: number;
  /** Whether this is a replay execution */
  isReplay?: boolean;
  /** Outcome status (completed, replayed, failed) */
  outcome?: string;
  /** Additional metadata */
  meta?: Record<string, unknown>;
}

/**
 * Observability port for runtime lifecycle hooks.
 * Replaces direct logging inside runtime with structured observability.
 */
export interface ObservabilityPort {
  /**
   * Emit a lifecycle event.
   * Implementations must not throw or affect runtime behavior.
   * Must be safe to call during replay.
   */
  emit(context: ObservabilityContext): void;
}