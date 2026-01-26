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

import { SignalConfig, SignalPhase, SignalEvent, EventSubscriber } from "./Types";
import { Lifecycle } from "./Lifecycle";
import { Registry } from "./Registry";
import { Collection } from "./Collection";
import { Config } from "./Config";
import { ContextBuilder } from "./Context";
import {
  SignalError,
  SignalRegistryError,
  SignalAuthError,
  SignalForbiddenError,
  SignalInternalError,
  isSignalError,
} from "./Errors";
import { deepFreeze, isDeepFrozen } from "../utils/deepFreeze";
import { ConsoleLogger, SignalLogger, NoOpLogger } from "../utils/logger";
import { invariant } from "../utils/invariant";
import { generateId } from "../utils/stableHash";
import { ReactiveCore } from "./ReactiveCore";

export class Signal {
  private static instance?: Signal;

  private lifecycle: Lifecycle;
  private registry: Registry;
  private config?: Config;
  private logger: SignalLogger;
  private reactiveCore: ReactiveCore;
  private eventBuffer: SignalEvent[] = [];

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

    // Execute handler
    try {
      const result = await mutationDef.handler(params, ctx);

      // Emit event (at-least-once semantics)
      await this.emitEvent(collectionName, mutationName, params, result);

      return result;
    } catch (error) {
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
   * Emit event from mutation
   */
  private async emitEvent(
    collection: string,
    action: string,
    params: any,
    result: any
  ): Promise<void> {
    const resourceId =
      result?._id || params?._id || params?.id || (typeof result === "string" ? result : undefined);

    // Make copies of params and result to avoid issues with frozen objects
    const paramsCopy = params && typeof params === "object" ? JSON.parse(JSON.stringify(params)) : params;
    const resultCopy = result && typeof result === "object" ? JSON.parse(JSON.stringify(result)) : result;

    const event: SignalEvent = {
      id: generateId("evt"),
      name: `${collection}.${action}`,
      payload: { params: paramsCopy, result: resultCopy, id: resourceId },
      timestamp: Date.now(),
      resource: collection,
      action,
      resourceId,
    };

    const enrichedEvent = await this.reactiveCore.emitSignal(event);
    await this.dispatchToTransport(enrichedEvent);

    // Buffer for in-memory consumers (used for testing/replay)
    this.eventBuffer.push(enrichedEvent);
  }

  /**
   * Emit a domain-level signal outside mutation helpers (still framework-owned)
   */
  private async emitDomainEvent(name: string, payload: any): Promise<void> {
    // Make a copy of the payload to avoid issues with frozen objects
    const payloadCopy = payload && typeof payload === "object" ? JSON.parse(JSON.stringify(payload)) : payload;

    const event: SignalEvent = {
      id: generateId("evt"),
      name,
      payload: payloadCopy,
      timestamp: Date.now(),
    };

    const enrichedEvent = await this.reactiveCore.emitSignal(event);
    await this.dispatchToTransport(enrichedEvent);
    this.eventBuffer.push(enrichedEvent);
  }

  /**
   * Dispatch event to configured transports (never to the database)
   */
  private async dispatchToTransport(event: SignalEvent): Promise<void> {
    if (this.config?.transport) {
      try {
        await this.config.transport.emit(event);
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
    return this.eventBuffer;
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
  getResourceVersion(resourceKey: string) {
    return this.reactiveCore.getResourceVersion(resourceKey);
  }
}
