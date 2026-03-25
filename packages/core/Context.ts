/**
 * Signal Context
 * 
 * Request-scoped context builder.
 * Must be immutable and serializable where possible.
 */

import { SignalContext, SignalAuth, SignalDB } from "./Types";
import { deepFreeze } from "../utils/deepFreeze";
import { invariant } from "../utils/invariant";

/**
 * Context builder (mutable during construction)
 */
export class ContextBuilder {
  private auth: SignalAuth = {};
  private dbInstance?: SignalDB;
  private emitFn?: (name: string, payload: any) => Promise<void>;
  private request?: SignalContext["request"];
  private env?: Record<string, any>;

  /**
   * Set authentication
   */
  withAuth(auth: SignalAuth): this {
    this.auth = { ...auth };
    return this;
  }

  /**
   * Set database instance
   */
  withDB(db: SignalDB): this {
    this.dbInstance = db;
    return this;
  }

  /**
   * Set emit function
   */
  withEmit(fn: (name: string, payload: any) => Promise<void>): this {
    this.emitFn = fn;
    return this;
  }

  /**
   * Set request context
   */
  withRequest(req: SignalContext["request"]): this {
    this.request = req;
    return this;
  }

  /**
   * Set environment
   */
  withEnv(env: Record<string, any>): this {
    this.env = { ...env };
    return this;
  }

  /**
   * Build immutable context
   */
  build(): SignalContext {
    invariant(this.dbInstance, "DB instance is required");
    invariant(this.emitFn, "Emit function is required");

    const context: SignalContext = {
      db: this.dbInstance,
      auth: this.auth,
      emit: this.emitFn,
      request: this.request,
      env: this.env,
    };

    // Freeze to ensure immutability
    return deepFreeze(context) as SignalContext;
  }
}

/**
 * Create context builder
 */
export function createContext(): ContextBuilder {
  return new ContextBuilder();
}
