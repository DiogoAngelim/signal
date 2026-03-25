/**
 * Signal - Main Framework Class
 * 
 * Production-grade backend framework for serverless environments.
 * 
 * Usage:
 *   const signal = new Signal();
 *   signal.configure({ db, transport });
 *   signal.collection("posts").query("list", ...).mutation("create", ...);
 *   await signal.start();
 *   
 *   const result = await signal.query("posts.list", params, context);
 */

import {
  SignalConfig,
  SignalPhase,
  SignalEvent,
  EventSubscriber,
  SignalAuditEntry,
  SignalAuditHook,
  SignalMutationRecord,
  SignalOutboxRecord,
} from "./Types";
import { Lifecycle } from "./Lifecycle";
import { Registry } from "./Registry";
import { Collection } from "./Collection";
import { Config } from "./Config";
import {
  SignalError,
  SignalRegistryError,
  SignalForbiddenError,
  SignalInternalError,
  SignalConflictError,
  SignalIdempotencyConflictError,
  isSignalError,
} from "./Errors";
import { deepFreeze } from "../utils/deepFreeze";
import { ConsoleLogger, SignalLogger, NoOpLogger } from "../utils/logger";
import { invariant } from "../utils/invariant";
import { generateId, stableHash } from "../utils/stableHash";
import { ReactiveCore } from "./ReactiveCore";

const MUTATION_LEDGER = "__signal_mutations__";
const OUTBOX_LEDGER = "__signal_outbox__";
const AUDIT_LEDGER = "__signal_audit__";

export class Signal {
  private static instance?: Signal;

  private lifecycle: Lifecycle;
  private registry: Registry;
  private config?: Config;
  private logger: SignalLogger;
  private reactiveCore: ReactiveCore;
  private eventBuffer: SignalEvent[] = [];
  private auditTrail: SignalAuditEntry[] = [];
  private auditHooks = new Set<SignalAuditHook>();

  constructor() {
    if (Signal.instance) {
      throw new Error("Signal instance already exists. Use Signal.getInstance()");
    }

    this.lifecycle = new Lifecycle();
    this.registry = new Registry(this.lifecycle);
    this.logger = new NoOpLogger();
    this.reactiveCore = new ReactiveCore();

    Signal.instance = this;
  }

  /**
   * Get or create Signal instance (singleton-like, but explicit)
   */
  static getInstance(): Signal {
    if (!Signal.instance) {
      Signal.instance = new Signal();
    }
    return Signal.instance;
  }

  /**
   * Configure Signal with database, transport, logger, etc.
   */
  configure(config: SignalConfig): this {
    this.lifecycle.require(
      SignalPhase.CONFIGURING,
      "configure"
    );

    this.config = new Config(config);
    this.logger = config.logger || new ConsoleLogger();

    this.logger.info("Signal configured");

    // Move to REGISTERING phase
    this.lifecycle.startRegistering();

    return this;
  }

  /**
   * Get configuration
   */
  getConfig(): Config {
    invariant(this.config, "Signal not configured");
    return this.config;
  }

  /**
   * Get logger
   */
  getLogger(): SignalLogger {
    return this.logger;
  }

  /**
   * Get ReactiveCore (framework-owned reactivity engine)
   */
  getReactiveCore(): ReactiveCore {
    return this.reactiveCore;
  }

  /**
   * Expose emit function for request contexts (application-level signals only)
   */
  getEmitFn(): (name: string, payload: any) => Promise<void> {
    return async (name: string, payload: any) => {
      await this.emitDomainEvent(name, payload);
    };
  }

  /**
   * Get lifecycle state
   */
  getPhase(): SignalPhase {
    return this.lifecycle.getPhase();
  }

  /**
   * Create and register a collection
   */
  collection(name: string): Collection {
    const col = new Collection(name, this.registry, this.lifecycle);
    return col;
  }

  /**
   * Start the framework - registry becomes immutable
   */
  async start(): Promise<void> {
    this.lifecycle.require(
      SignalPhase.REGISTERING,
      "start"
    );

    invariant(this.config, "Must configure before starting");

    // Verify database connectivity
    try {
      const isConnected = await this.config.db.isConnected?.();
      if (!isConnected) {
        throw new Error("Database not connected");
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.lifecycle.fail(err);
      throw new SignalError(
        "DB_CONNECT_FAILED",
        `Failed to connect to database: ${err.message}`,
        500,
        err
      );
    }

    // Freeze registry
    deepFreeze(this.registry);

    // Move to RUNNING phase
    this.lifecycle.start();

    this.logger.info("Signal started", {
      collections: this.registry.introspect().collections.length,
      queries: this.registry.introspect().queries.length,
      mutations: this.registry.introspect().mutations.length,
    });
  }

  /**
   * Execute a query
   */
  async query<Result = any, Params = any>(
    key: string,
    params: Params,
    ctx: any
  ): Promise<Result> {
    this.lifecycle.requireRunning("execute query");

    const [collectionName, queryName] = key.split(".");
    if (!collectionName || !queryName) {
      throw new SignalRegistryError(`Invalid query key: ${key}`);
    }

    // Get query definition
    const queryDef = this.registry.getQuery(collectionName, queryName);

    // Check access control
    const collection = this.registry.getCollection(collectionName);
    if (collection.access?.query?.[queryName]) {
      const rule = collection.access.query[queryName];
      const allowed = await this.checkAccess(rule, ctx);
      if (!allowed) {
        throw new SignalForbiddenError(`Access denied to query ${key}`);
      }
    }

    // Validate input
    this.validateInput(params);

    // Execute handler
    try {
      const result = await queryDef.handler(params, ctx);
      return result;
    } catch (error) {
      this.logger.error(`Query ${key} failed`, { error: String(error) });
      if (isSignalError(error)) {
        throw error;
      }
      throw new SignalInternalError(
        `Query ${key} failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Execute a mutation (the only write path)
   */
  async mutation<Result = any, Params = any>(
    key: string,
    params: Params,
    ctx: any
  ): Promise<Result> {
    this.lifecycle.requireRunning("execute mutation");

    const [collectionName, mutationName] = key.split(".");
    if (!collectionName || !mutationName) {
      throw new SignalRegistryError(`Invalid mutation key: ${key}`);
    }

    // Get mutation definition
    const mutationDef = this.registry.getMutation(collectionName, mutationName);

    // Check access control
    const collection = this.registry.getCollection(collectionName);
    if (collection.access?.mutation?.[mutationName]) {
      const rule = collection.access.mutation[mutationName];
      const allowed = await this.checkAccess(rule, ctx);
      if (!allowed) {
        throw new SignalForbiddenError(`Access denied to mutation ${key}`);
      }
    }

    // Validate input
    this.validateInput(params);

    const fingerprint = stableHash(params);
    const idempotencyKey = this.resolveIdempotencyKey(ctx);
    const mutationRecordId = this.getMutationRecordId(key, idempotencyKey);
    const hasIdempotencyKey = idempotencyKey.length > 0;

    let mutationRecord: SignalMutationRecord | undefined;
    let createdMutationRecord = false;
    if (hasIdempotencyKey) {
      mutationRecord = await this.getMutationRecord(ctx.db, mutationRecordId);

      if (mutationRecord) {
        if (mutationRecord.payloadFingerprint !== fingerprint) {
          const error = new SignalIdempotencyConflictError(
            `Mutation ${key} already executed with a different payload fingerprint`
          );
          await this.recordAudit({
            type: "mutation.idempotency_conflict",
            timestamp: Date.now(),
            key,
            mutationKey: key,
            details: {
              idempotencyKey,
              expectedFingerprint: mutationRecord.payloadFingerprint,
              actualFingerprint: fingerprint,
            },
          });
          throw error;
        }

        if (mutationRecord.status === "completed") {
          await this.recordAudit({
            type: "mutation.replayed",
            timestamp: Date.now(),
            key,
            mutationKey: key,
            details: {
              idempotencyKey,
              fingerprint,
              eventId: mutationRecord.eventId,
            },
          });
          return this.cloneValue(mutationRecord.result) as Result;
        }

        if (mutationRecord.status === "pending") {
          const error = new SignalConflictError(
            `Mutation ${key} is already in progress for idempotency key ${idempotencyKey}`
          );
          await this.recordAudit({
            type: "mutation.pending",
            timestamp: Date.now(),
            key,
            mutationKey: key,
            details: { idempotencyKey, fingerprint },
          });
          throw error;
        }

        if (mutationRecord.status === "failed" && mutationRecord.error) {
          await this.recordAudit({
            type: "mutation.replayed_failure",
            timestamp: Date.now(),
            key,
            mutationKey: key,
            details: {
              idempotencyKey,
              fingerprint,
              message: mutationRecord.error.message,
            },
          });
          throw new SignalError(
            mutationRecord.error.code || "INTERNAL_ERROR",
            mutationRecord.error.message,
            mutationRecord.error.statusCode || 500
          );
        }
      } else {
        const created = await this.createMutationRecord(ctx.db, {
          id: mutationRecordId,
          mutationKey: key,
          idempotencyKey,
          payloadFingerprint: fingerprint,
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        mutationRecord = created.record;
        createdMutationRecord = created.created;
      }
    }

    if (hasIdempotencyKey && mutationRecord && (!createdMutationRecord || mutationRecord.status !== "pending")) {
      if (mutationRecord.payloadFingerprint !== fingerprint) {
        const error = new SignalIdempotencyConflictError(
          `Mutation ${key} already executed with a different payload fingerprint`
        );
        await this.recordAudit({
          type: "mutation.idempotency_conflict",
          timestamp: Date.now(),
          key,
          mutationKey: key,
          details: {
            idempotencyKey,
            expectedFingerprint: mutationRecord.payloadFingerprint,
            actualFingerprint: fingerprint,
          },
        });
        throw error;
      }

      if (mutationRecord.status === "pending") {
        const error = new SignalConflictError(
          `Mutation ${key} is already in progress for idempotency key ${idempotencyKey}`
        );
        await this.recordAudit({
          type: "mutation.pending",
          timestamp: Date.now(),
          key,
          mutationKey: key,
          details: { idempotencyKey, fingerprint },
        });
        throw error;
      }

      if (mutationRecord.status === "completed") {
        await this.recordAudit({
          type: "mutation.replayed",
          timestamp: Date.now(),
          key,
          mutationKey: key,
          details: {
            idempotencyKey,
            fingerprint,
            eventId: mutationRecord.eventId,
          },
        });
        return this.cloneValue(mutationRecord.result) as Result;
      }

      if (mutationRecord.status === "failed" && mutationRecord.error) {
        await this.recordAudit({
          type: "mutation.replayed_failure",
          timestamp: Date.now(),
          key,
          mutationKey: key,
          details: {
            idempotencyKey,
            fingerprint,
            message: mutationRecord.error.message,
          },
        });
        throw new SignalError(
          mutationRecord.error.code || "INTERNAL_ERROR",
          mutationRecord.error.message,
          mutationRecord.error.statusCode || 500
        );
      }
    }

    await this.recordAudit({
      type: "mutation.started",
      timestamp: Date.now(),
      key,
      mutationKey: key,
      details: hasIdempotencyKey
        ? { idempotencyKey, fingerprint }
        : { fingerprint },
    });

    try {
      const result = await mutationDef.handler(params, ctx);

      // Emit event (replay-safe via ledger + reactive core)
      const emittedEvent = await this.emitEvent(collectionName, mutationName, params, result, {
        mutationKey: key,
        idempotencyKey: hasIdempotencyKey ? idempotencyKey : undefined,
        payloadFingerprint: fingerprint,
      });

      if (mutationRecord) {
        await this.completeMutationRecord(ctx.db, mutationRecord.id, {
          result,
          eventId: emittedEvent.id,
        });
      }

      await this.recordAudit({
        type: "mutation.completed",
        timestamp: Date.now(),
        key,
        mutationKey: key,
        eventId: emittedEvent.id,
        details: {
          fingerprint,
          idempotencyKey: hasIdempotencyKey ? idempotencyKey : undefined,
        },
      });

      return result;
    } catch (error) {
      if (mutationRecord) {
        await this.failMutationRecord(ctx.db, mutationRecord.id, error);
      }
      await this.recordAudit({
        type: "mutation.failed",
        timestamp: Date.now(),
        key,
        mutationKey: key,
        details: {
          fingerprint,
          idempotencyKey: hasIdempotencyKey ? idempotencyKey : undefined,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.error(`Mutation ${key} failed`, { error: String(error) });
      if (isSignalError(error)) {
        throw error;
      }
      throw new SignalInternalError(
        `Mutation ${key} failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Subscribe to a query's invalidations. Signal owns subscription lifecycle.
   */
  subscribeQuery(
    key: string,
    params: any,
    handler: EventSubscriber
  ): { unsubscribe: () => void; subscriptionId: string } {
    this.lifecycle.requireRunning("subscribe to query");

    const [collectionName, queryName] = key.split(".");
    if (!collectionName || !queryName) {
      throw new SignalRegistryError(`Invalid query key: ${key}`);
    }

    // Ensure query exists (framework-owned)
    this.registry.getQuery(collectionName, queryName);

    return this.reactiveCore.registerSubscription(key, params, handler);
  }

  /**
   * Check if user has access based on rule
   */
  private async checkAccess(rule: any, ctx: any): Promise<boolean> {
    if (typeof rule === "string") {
      return this.checkAccessRule(rule, ctx);
    }
    if (typeof rule === "function") {
      return await rule(ctx);
    }
    return false;
  }

  /**
   * Check string-based access rules
   */
  private checkAccessRule(rule: string, ctx: any): boolean {
    switch (rule) {
      case "public":
        return true;
      case "auth":
      case "authenticated":
        return ctx.auth?.user != null;
      default:
        this.logger.warn(`Unknown access rule: ${rule}`);
        return false;
    }
  }

  /**
   * Validate input shape
   */
  private validateInput(input: any): void {
    // Reject unknown fields at root level
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      // This is a light validation - deeper validation should be app-specific
      for (const key of Object.keys(input)) {
        if (typeof key !== "string") {
          throw new Error(`Invalid input: key must be string`);
        }
      }
    }
  }

  /**
   * Resolve an idempotency key from the request context.
   */
  private resolveIdempotencyKey(ctx: any): string {
    const headers = ctx?.request?.headers || {};
    return String(
      ctx?.request?.idempotencyKey ||
      headers["idempotency-key"] ||
      headers["x-idempotency-key"] ||
      ""
    );
  }

  /**
   * Build a deterministic mutation record ID.
   */
  private getMutationRecordId(key: string, idempotencyKey: string): string {
    return `mutation:${key}:${idempotencyKey}`;
  }

  /**
   * Read a mutation ledger record.
   */
  private async getMutationRecord(db: any, id: string): Promise<SignalMutationRecord | undefined> {
    const record = await db.findOne?.(MUTATION_LEDGER, { _id: id });
    return record || undefined;
  }

  /**
   * Create a pending mutation record.
   */
  private async createMutationRecord(
    db: any,
    record: SignalMutationRecord
  ): Promise<{ record: SignalMutationRecord; created: boolean }> {
    const stored: Record<string, any> = {
      ...record,
      _id: record.id,
      _createdAt: record.createdAt,
      _updatedAt: record.updatedAt,
      _version: 1,
    };

    try {
      await db.insert(MUTATION_LEDGER, stored);
      return { record: stored as SignalMutationRecord, created: true };
    } catch (error) {
      if (error instanceof SignalConflictError) {
        const existing = await this.getMutationRecord(db, record.id);
        if (existing) {
          return { record: existing, created: false };
        }
      }
      throw error;
    }
  }

  /**
   * Mark a mutation record completed.
   */
  private async completeMutationRecord(
    db: any,
    id: string,
    input: { result: any; eventId?: string }
  ): Promise<void> {
    await db.update(MUTATION_LEDGER, id, {
      status: "completed",
      result: this.cloneValue(input.result),
      eventId: input.eventId,
      updatedAt: Date.now(),
    });
  }

  /**
   * Mark a mutation record failed.
   */
  private async failMutationRecord(db: any, id: string, error: unknown): Promise<void> {
    await db.update(MUTATION_LEDGER, id, {
      status: "failed",
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: isSignalError(error) ? error.code : undefined,
        statusCode: isSignalError(error) ? error.statusCode : undefined,
      },
      updatedAt: Date.now(),
    });
  }

  /**
   * Append an event to the outbox.
   */
  private async appendOutbox(event: SignalEvent): Promise<void> {
    const record: SignalOutboxRecord = {
      id: event.id,
      eventId: event.id,
      event: this.cloneValue(event),
      mutationKey: event._metadata?.mutationKey,
      payloadFingerprint: event._metadata?.payloadFingerprint,
      createdAt: event.timestamp,
    };

    this.eventBuffer.push(event);

    try {
      await this.config?.db.insert(OUTBOX_LEDGER, {
        ...record,
        _id: record.id,
        _createdAt: record.createdAt,
      });
    } catch (error) {
      this.logger.warn("Failed to persist outbox record", {
        eventId: event.id,
        error: String(error),
      });
    }
  }

  /**
   * Update an outbox record after transport publication.
   */
  private async markOutboxPublished(eventId: string): Promise<void> {
    try {
      await this.config?.db.update(OUTBOX_LEDGER, eventId, {
        publishedAt: Date.now(),
      });
    } catch (error) {
      this.logger.warn("Failed to update outbox record", {
        eventId,
        error: String(error),
      });
    }
  }

  /**
   * Append an immutable audit record and fan it out to hooks.
   */
  private async recordAudit(entry: Omit<SignalAuditEntry, "id">): Promise<void> {
    const auditEntry: SignalAuditEntry = deepFreeze({
      id: generateId("audit"),
      ...entry,
    }) as SignalAuditEntry;

    this.auditTrail.push(auditEntry);

    try {
      await this.config?.db.insert(AUDIT_LEDGER, {
        ...auditEntry,
        _id: auditEntry.id,
        _createdAt: auditEntry.timestamp,
      });
    } catch (error) {
      this.logger.warn("Failed to persist audit entry", {
        type: auditEntry.type,
        error: String(error),
      });
    }

    for (const hook of this.auditHooks) {
      try {
        await hook(auditEntry);
      } catch (error) {
        this.logger.warn("Audit hook failed", {
          type: auditEntry.type,
          error: String(error),
        });
      }
    }
  }

  /**
   * Clone values for safe storage and replay.
   */
  private cloneValue<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== "object") {
      return value;
    }

    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Emit event from mutation
   */
  private async emitEvent(
    collection: string,
    action: string,
    params: any,
    result: any,
    metadata: {
      mutationKey?: string;
      idempotencyKey?: string;
      payloadFingerprint?: string;
    } = {}
  ): Promise<SignalEvent> {
    const resourceId =
      result?._id || params?._id || params?.id || (typeof result === "string" ? result : undefined);

    // Make copies of params and result to avoid issues with frozen objects
    const paramsCopy = this.cloneValue(params);
    const resultCopy = this.cloneValue(result);

    const event: SignalEvent = {
      id: generateId("evt"),
      name: `${collection}.${action}`,
      payload: { params: paramsCopy, result: resultCopy, id: resourceId },
      timestamp: Date.now(),
      resource: collection,
      action,
      resourceId,
      _metadata: {
        mutationKey: metadata.mutationKey,
        idempotencyKey: metadata.idempotencyKey,
        payloadFingerprint: metadata.payloadFingerprint,
      },
    };

    const enrichedEvent = await this.reactiveCore.emitSignal(event);
    await this.appendOutbox(enrichedEvent);
    await this.dispatchToTransport(enrichedEvent);
    await this.recordAudit({
      type: "event.emitted",
      timestamp: enrichedEvent.timestamp,
      key: enrichedEvent.name,
      mutationKey: metadata.mutationKey,
      eventId: enrichedEvent.id,
      resourceKey: enrichedEvent._metadata?.resourceKey,
      details: {
        idempotencyKey: metadata.idempotencyKey,
        payloadFingerprint: metadata.payloadFingerprint,
      },
    });
    return enrichedEvent;
  }

  /**
   * Emit a domain-level signal outside mutation helpers (still framework-owned)
   */
  private async emitDomainEvent(name: string, payload: any): Promise<SignalEvent> {
    // Make a copy of the payload to avoid issues with frozen objects
    const payloadCopy = this.cloneValue(payload);

    const event: SignalEvent = {
      id: generateId("evt"),
      name,
      payload: payloadCopy,
      timestamp: Date.now(),
    };

    const enrichedEvent = await this.reactiveCore.emitSignal(event);
    await this.appendOutbox(enrichedEvent);
    await this.dispatchToTransport(enrichedEvent);
    await this.recordAudit({
      type: "event.emitted",
      timestamp: enrichedEvent.timestamp,
      key: enrichedEvent.name,
      eventId: enrichedEvent.id,
      resourceKey: enrichedEvent._metadata?.resourceKey,
    });
    return enrichedEvent;
  }

  /**
   * Dispatch event to configured transports (never to the database)
   */
  private async dispatchToTransport(event: SignalEvent): Promise<void> {
    if (this.config?.transport) {
      try {
        await this.config.transport.emit(event);
        await this.markOutboxPublished(event.id);
      } catch (error) {
        this.logger.error("Failed to emit event", { event, error: String(error) });
        // Don't fail caller if transport delivery fails (at-least-once guarantee)
      }
    }
  }

  /**
   * Get registry for introspection
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Reset (for testing)
   */
  static reset(): void {
    Signal.instance = undefined;
  }

  /**
   * Get event buffer (for testing)
   */
  getEventBuffer(): SignalEvent[] {
    return [...this.eventBuffer];
  }

  /**
   * Clear event buffer (for testing)
   */
  clearEventBuffer() {
    this.eventBuffer = [];
  }

  /**
   * Expose event history for resync/optimistic reconciliation
   */
  getEventHistory(since?: number): SignalEvent[] {
    return this.reactiveCore.getEventHistory(since);
  }

  /**
   * Inspect resource version (used by transports/clients for consistency checks)
   */
  getResourceVersion(resourceKey: string): number | undefined {
    return this.reactiveCore.getResourceVersion(resourceKey)?._version;
  }

  /**
   * Inspect full resource version details.
   */
  getResourceVersionInfo(resourceKey: string) {
    return this.reactiveCore.getResourceVersion(resourceKey);
  }

  /**
   * Register an append-only audit hook.
   */
  registerAuditHook(hook: SignalAuditHook): () => void {
    this.auditHooks.add(hook);
    return () => {
      this.auditHooks.delete(hook);
    };
  }

  /**
   * Get the in-memory audit trail.
   */
  getAuditTrail(): SignalAuditEntry[] {
    return [...this.auditTrail];
  }
}
