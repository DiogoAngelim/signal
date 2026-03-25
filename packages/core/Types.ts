/**
 * Signal Core Types
 * 
 * Production-grade type definitions for Signal framework.
 * Emphasis on explicitness and correctness.
 */

/**
 * Lifecycle phase of Signal instance
 */
export enum SignalPhase {
  CONFIGURING = "CONFIGURING",
  REGISTERING = "REGISTERING",
  RUNNING = "RUNNING",
  FAILED = "FAILED",
}

/**
 * Authentication context
 */
export interface SignalAuth {
  user?: {
    id: string;
    roles?: string[];
    [key: string]: any;
  };
  token?: string;
}

/**
 * Request context
 * Immutable, serializable (where possible), request-scoped
 */
export interface SignalContext {
  readonly db: SignalDB;
  readonly auth: SignalAuth;
  readonly emit: (name: string, payload: any) => Promise<void>;
  readonly request?: SignalRequestContext;
  readonly env?: Record<string, any>;
}

/**
 * Request-scoped execution metadata.
 * Keep this explicit so idempotency and replay controls remain visible.
 */
export interface SignalRequestContext {
  readonly method?: string;
  readonly url?: string;
  readonly headers?: Record<string, string>;
  readonly idempotencyKey?: string;
  readonly expectedVersion?: number;
  readonly consumerId?: string;
  readonly replay?: boolean;
  [key: string]: any;
}

/**
 * Document identifier
 */
export type DocumentId = string;

/**
 * Document with metadata
 */
export interface Document<T = any> {
  readonly _id: DocumentId;
  readonly _createdAt?: number;
  readonly _updatedAt?: number;
  [key: string]: any;
}

/**
 * Query handler function
 */
export type QueryHandler<Params = any, Result = any> = (
  params: Params,
  ctx: SignalContext
) => Promise<Result>;

/**
 * Mutation handler function
 */
export type MutationHandler<Params = any, Result = any> = (
  params: Params,
  ctx: SignalContext
) => Promise<Result>;

/**
 * Access rule: either a permission string or a function
 */
export type AccessRule = string | ((ctx: SignalContext) => boolean | Promise<boolean>);

/**
 * Access control definition
 */
export interface AccessControlDef {
  query?: Record<string, AccessRule>;
  mutation?: Record<string, AccessRule>;
}

/**
 * Collection definition
 */
export interface CollectionDef<T = any> {
  name: string;
  access?: AccessControlDef;
  validator?: (doc: any) => boolean | { valid: boolean; errors?: string[] };
}

/**
 * Query definition
 */
export interface QueryDef<Params = any, Result = any> {
  name: string;
  collectionName: string;
  handler: QueryHandler<Params, Result>;
}

/**
 * Mutation definition
 */
export interface MutationDef<Params = any, Result = any> {
  name: string;
  collectionName: string;
  handler: MutationHandler<Params, Result>;
}

/**
 * Event structure
 * Emitted only from mutations, immutable, at-least-once delivery
 */
export interface SignalEvent {
  readonly id: string;
  readonly name: string; // e.g., "posts.create"
  readonly payload: any;
  readonly timestamp: number;
  /** Logical resource name extracted from name prefix (e.g., "posts") */
  readonly resource?: string;
  /** Logical action extracted from name suffix (e.g., "created") */
  readonly action?: string;
  /** Optional resource identifier used for optimistic versioning */
  readonly resourceId?: string;
  /** Monotonic version for the resource when available */
  readonly version?: number;
  readonly _metadata?: {
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly mutationKey?: string;
    readonly idempotencyKey?: string;
    readonly payloadFingerprint?: string;
    readonly consumerId?: string;
    readonly outboxId?: string;
    readonly replayed?: boolean;
    readonly stale?: boolean;
    /** Resource version snapshot for resync */
    readonly resourceVersion?: number;
    /** Resource key used by ReactiveCore for consistency */
    readonly resourceKey?: string;
    /** Query key invalidated by this event (set by ReactiveCore) */
    readonly affectedQuery?: string;
    /** Subscription version used for optimistic client resync */
    readonly subscriptionVersion?: number;
  };
}

/**
 * Event subscriber function
 */
export type EventSubscriber = (event: SignalEvent) => Promise<void>;

/**
 * Database adapter interface
 */
export interface SignalDB {
  // Query operations (pure reads, no reactivity hooks)
  find<T = any>(collection: string, query: any): Promise<T[]>;
  findOne<T = any>(collection: string, query: any): Promise<T | null>;
  findById<T = any>(collection: string, id: DocumentId): Promise<T | null>;

  // Write operations (invoked only via Signal mutations)
  insert<T = any>(collection: string, doc: Partial<T>): Promise<DocumentId>;
  update<T = any>(
    collection: string,
    id: DocumentId,
    update: Partial<T>,
    options?: SignalWriteOptions
  ): Promise<void>;
  remove(collection: string, id: DocumentId): Promise<void>;
  /** @deprecated Use remove(); kept for backward compatibility */
  delete(collection: string, id: DocumentId): Promise<void>;

  // Aggregation
  count(collection: string, query: any): Promise<number>;

  // Connection management
  isConnected(): Promise<boolean>;
  disconnect(): Promise<void>;
}

/**
 * HTTP Response format
 */
export interface HTTPResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Registry interface
 */
export interface SignalRegistry {
  readonly phase: SignalPhase;
  readonly collections: Map<string, CollectionDef>;
  readonly queries: Map<string, QueryDef>;
  readonly mutations: Map<string, MutationDef>;
  getKey(collection: string, name: string): string;
}

/**
 * Config passed to Signal.configure()
 */
export interface SignalConfig {
  db: SignalDB;
  transport?: SignalTransport;
  logger?: SignalLogger;
  env?: Record<string, any>;
}

/**
 * Optional write controls for optimistic concurrency.
 */
export interface SignalWriteOptions {
  readonly expectedVersion?: number;
}

/**
 * Transport interface for events
 */
export interface SignalTransport {
  emit(event: SignalEvent): Promise<void>;
  subscribe(
    pattern: string,
    handler: EventSubscriber,
    options?: SignalTransportSubscribeOptions
  ): Promise<() => void>;
  unsubscribe(pattern: string): Promise<void>;
}

/**
 * Transport subscription options.
 */
export interface SignalTransportSubscribeOptions {
  readonly consumerId?: string;
  readonly dedupe?: boolean;
  readonly replay?: boolean;
}

/**
 * Append-only mutation ledger entry.
 */
export interface SignalMutationRecord {
  readonly id: string;
  readonly mutationKey: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint: string;
  readonly status: "pending" | "completed" | "failed";
  readonly result?: any;
  readonly error?: {
    readonly code?: string;
    readonly message: string;
    readonly statusCode?: number;
  };
  readonly eventId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly version?: number;
}

/**
 * Append-only outbox entry.
 */
export interface SignalOutboxRecord {
  readonly id: string;
  readonly eventId: string;
  readonly event: SignalEvent;
  readonly mutationKey?: string;
  readonly payloadFingerprint?: string;
  readonly createdAt: number;
  readonly publishedAt?: number;
}

/**
 * Per-consumer inbox entry.
 */
export interface SignalInboxRecord {
  readonly id: string;
  readonly consumerId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly resourceKey?: string;
  readonly eventVersion?: number;
  readonly processedAt: number;
}

/**
 * Append-only audit trail entry.
 */
export interface SignalAuditEntry {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly key?: string;
  readonly resourceKey?: string;
  readonly consumerId?: string;
  readonly eventId?: string;
  readonly mutationKey?: string;
  readonly details?: Record<string, any>;
}

export type SignalAuditHook = (entry: SignalAuditEntry) => Promise<void> | void;

/**
 * Logger interface
 */
export interface SignalLogger {
  debug(msg: string, data?: any): void;
  info(msg: string, data?: any): void;
  warn(msg: string, data?: any): void;
  error(msg: string, data?: any): void;
}

/**
 * Input validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
