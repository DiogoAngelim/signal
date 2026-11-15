/**
 * RuntimePort — Abstraction for runtime construction and lifecycle.
 *
 * Defines the contract for creating and managing a Signal runtime
 * with injected ports. Replaces direct construction with
 * dependency-inverted factory pattern.
 *
 * Rules:
 * - All ports must be injected at construction time
 * - No globals or singletons
 * - Runtime is the ONLY event authority
 * - Supports both live and replay execution modes
 */
import type { SignalCapabilities } from "@signal/protocol";
import type { DecisionPort } from "./decision-port";
import type { EventPort } from "./event-port";
import type { ObservabilityPort } from "./observability-port";
import type { StoragePort } from "./storage-port";

/**
 * Execution mode for the runtime.
 * - "live": normal execution with side effects
 * - "replay": deterministic replay from stored events, no external side effects
 * - "audit": read-only audit reconstruction
 */
export type RuntimeMode = "live" | "replay" | "audit";

/**
 * Configuration for creating a runtime instance.
 * All ports are injected — no globals allowed.
 */
export interface RuntimePortConfig {
  /** Event dispatch/subscription port (required) */
  eventPort: EventPort;
  /** Storage/idempotency port (optional — idempotency disabled if absent) */
  storagePort?: StoragePort;
  /** Decision logic port (optional — decision operations fail if absent) */
  decisionPort?: DecisionPort;
  /** Observability port (optional — no-op if absent) */
  observabilityPort?: ObservabilityPort;
  /** Runtime name identifier */
  runtimeName?: string;
  /** Execution mode */
  mode?: RuntimeMode;
  /** Bindings configuration for capabilities */
  bindings?: SignalCapabilities["bindings"];
}

/**
 * Runtime port — the top-level abstraction for runtime construction.
 * Implementations create a fully-wired runtime from the injected ports.
 */
export interface RuntimePort {
  /**
   * The current execution mode.
   */
  readonly mode: RuntimeMode;

  /**
   * Whether the runtime is in replay mode.
   * In replay mode, no external side effects are allowed.
   */
  readonly isReplay: boolean;
}
