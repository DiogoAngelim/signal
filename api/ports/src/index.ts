/**
 * @signal/ports — Pure port interfaces for dependency inversion.
 *
 * This package defines ONLY interfaces. No implementations, no runtime
 * imports, no domain imports. All port interfaces depend only on
 * @signal/protocol types.
 *
 * Architecture rules:
 * - runtime → ports only (depends on these interfaces)
 * - interface → ports only (adapters implement these interfaces)
 * - domain → protocol only (domain uses protocol types, not ports)
 * - ports → protocol only (ports reference protocol types)
 * - protocol → nothing (leaf dependency)
 */
export type {
  DecisionPort,
  DecisionInput,
  DecisionOutput,
} from "./decision-port";

export type { EventPort } from "./event-port";

export type {
  ObservabilityPort,
  ObservabilityContext,
  RuntimeLifecycleEvent,
} from "./observability-port";

export type {
  RuntimePort,
  RuntimePortConfig,
  RuntimeMode,
} from "./runtime-port";

export type {
  StoragePort,
  IdempotencyRecord,
  IdempotencyReservation,
} from "./storage-port";
