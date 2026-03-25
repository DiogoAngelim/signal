/**
 * Signal - Main Export
 * 
 * Production-grade backend framework for serverless environments.
 * Meteor-like DX, stateless & database-agnostic.
 */

// Core
export { Signal } from "./packages/core/Signal";
export { Registry } from "./packages/core/Registry";
export { Collection } from "./packages/core/Collection";
export { Lifecycle } from "./packages/core/Lifecycle";
export { Config } from "./packages/core/Config";
export { ContextBuilder, createContext } from "./packages/core/Context";
export { ReactiveCore } from "./packages/core/ReactiveCore";

// Types
export type {
  SignalPhase,
  SignalAuth,
  SignalContext,
  Document,
  DocumentId,
  QueryHandler,
  MutationHandler,
  AccessRule,
  AccessControlDef,
  CollectionDef,
  QueryDef,
  MutationDef,
  SignalEvent,
  EventSubscriber,
  SignalDB,
  HTTPResponse,
  SignalRegistry,
  SignalConfig,
  SignalTransport,
  SignalLogger,
  ValidationResult,
  SignalRequestContext,
  SignalWriteOptions,
  SignalTransportSubscribeOptions,
  SignalMutationRecord,
  SignalOutboxRecord,
  SignalInboxRecord,
  SignalAuditEntry,
  SignalAuditHook,
} from "./packages/core/Types";

// Errors
export {
  SignalError,
  SignalAuthError,
  SignalForbiddenError,
  SignalValidationError,
  SignalNotFoundError,
  SignalConflictError,
  SignalIdempotencyConflictError,
  SignalVersionMismatchError,
  SignalInternalError,
  SignalLifecycleError,
  SignalRegistryError,
  isSignalError,
  buildErrorResponse,
} from "./packages/core/Errors";

// Database
export { MemoryAdapter } from "./packages/db/adapters/MemoryAdapter";
export { SqlAdapterBase } from "./packages/db/adapters/SqlAdapterBase";

// Transport
export { EventBus } from "./packages/transport/EventBus";
export { InMemoryTransport } from "./packages/transport/adapters/InMemoryTransport";
export type { SignalTransport as TransportInterface } from "./packages/core/Types";

// Security
export { AuthProvider } from "./packages/security/AuthProvider";
export { AccessControl } from "./packages/security/AccessControl";

// HTTP
export { createHandler } from "./packages/http/handler";
export { SignalRouter } from "./packages/http/router";
export { validateInput, validateBody, validateQueryKey, validateMutationKey } from "./packages/http/validation";

// Utils
export { deepFreeze, isFrozen, isDeepFrozen } from "./packages/utils/deepFreeze";
export { stableHash, stableId, generateId } from "./packages/utils/stableHash";
export { invariant, assertNonNull, unreachable, assertType } from "./packages/utils/invariant";
export { ConsoleLogger, NoOpLogger, LogLevel } from "./packages/utils/logger";
export type { SignalLogger as Logger } from "./packages/utils/logger";
