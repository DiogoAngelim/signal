/**
 * Signal HTTP Router
 * 
 * Routes POST requests to Signal queries and mutations.
 * 
 * Endpoints:
 *   POST /signal/query   { key, params }
 *   POST /signal/mutation { key, params }
 */

import { Signal } from "../core/Signal";
import { createContext } from "../core/Context";
import { AuthProvider } from "../security/AuthProvider";
import { validateQueryKey, validateMutationKey, validateBody } from "./validation";
import { SignalValidationError, isSignalError, buildErrorResponse } from "../core/Errors";

export interface HTTPRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Record<string, any>;
}

export interface HTTPRequestWithBody extends HTTPRequest {
  body: Record<string, any>;
}

/**
 * Signal Router
 */
export class SignalRouter {
  private signal: Signal;
  private basePath: string;

  constructor(signal: Signal, basePath = "/signal") {
    this.signal = signal;
    this.basePath = basePath;
  }

  /**
   * Route a request
   */
  async route(req: HTTPRequest): Promise<any> {
    // Parse path
    const pathname = new URL(`http://localhost${req.path}`).pathname;

    // Route to handlers
    if (pathname === `${this.basePath}/query` && req.method === "POST") {
      return this.handleQuery(req as HTTPRequestWithBody);
    }

    if (pathname === `${this.basePath}/mutation` && req.method === "POST") {
      return this.handleMutation(req as HTTPRequestWithBody);
    }

    if (pathname === `${this.basePath}/introspect` && req.method === "GET") {
      return this.handleIntrospect();
    }

    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    };
  }

  /**
   * Handle query request
   */
  private async handleQuery(req: HTTPRequestWithBody): Promise<any> {
    try {
      const { key, params } = req.body;

      // Validate key
      if (!validateQueryKey(key)) {
        throw new SignalValidationError("Invalid query key", { key: ["Invalid format"] });
      }

      // Build context
      const ctx = createContext()
        .withDB(this.signal.getConfig().db)
        .withAuth(AuthProvider.fromHeaders(req.headers))
        .withEmit(this.signal.getEmitFn())
        .withRequest(this.buildRequestContext(req))
        .withEnv(this.signal.getConfig().env || {})
        .build();

      // Execute query
      const result = await this.signal.query(key, params || {}, ctx);

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      const isProd = typeof globalThis !== "undefined" && (globalThis as any).process?.env?.NODE_ENV === "production";
      return buildErrorResponse(error, isProd);
    }
  }

  /**
   * Handle mutation request
   */
  private async handleMutation(req: HTTPRequestWithBody): Promise<any> {
    try {
      const { key, params } = req.body;

      // Validate key
      if (!validateMutationKey(key)) {
        throw new SignalValidationError("Invalid mutation key", { key: ["Invalid format"] });
      }

      // Build context
      const ctx = createContext()
        .withDB(this.signal.getConfig().db)
        .withAuth(AuthProvider.fromHeaders(req.headers))
        .withEmit(this.signal.getEmitFn())
        .withRequest(this.buildRequestContext(req))
        .withEnv(this.signal.getConfig().env || {})
        .build();

      // Execute mutation
      const result = await this.signal.mutation(key, params || {}, ctx);

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      const isProd = typeof globalThis !== "undefined" && (globalThis as any).process?.env?.NODE_ENV === "production";
      return buildErrorResponse(error, isProd);
    }
  }

  /**
   * Handle introspection request
   */
  private handleIntrospect(): any {
    const registry = this.signal.getRegistry();
    return {
      ok: true,
      data: registry.introspect(),
    };
  }

  /**
   * Build request metadata with reliability hints.
   */
  private buildRequestContext(req: HTTPRequest): Record<string, any> {
    const headers = req.headers || {};
    const expectedVersionHeader =
      headers["if-match"] ||
      headers["x-expected-version"] ||
      headers["x-resource-version"];

    return {
      method: req.method,
      url: req.path,
      headers,
      idempotencyKey: headers["idempotency-key"] || headers["x-idempotency-key"],
      expectedVersion:
        expectedVersionHeader != null && expectedVersionHeader !== ""
          ? Number(expectedVersionHeader)
          : undefined,
      consumerId: headers["x-consumer-id"],
      replay: headers["x-replay"] === "true",
    };
  }
}
