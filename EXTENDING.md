/**
 * Extending Signal - Guide for Custom Implementations
 * 
 * Signal is designed for extensibility without requiring framework changes.
 */

// ============================================
// 1. Custom Database Adapter
// ============================================

import { SignalDB, DocumentId } from "./packages/core/Types";

/**
 * Example: PostgreSQL Adapter
 */
export class PostgresAdapter implements SignalDB {
  private pool: any; // pg.Pool
  
  constructor(connectionString: string) {
    // Initialize pool
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async find<T = any>(collection: string, query: any): Promise<T[]> {
    const whereClause = this.buildWhere(query);
    const result = await this.pool.query(
      `SELECT * FROM "${collection}" ${whereClause.sql}`,
      whereClause.params
    );
    return result.rows as T[];
  }

  async findOne<T = any>(collection: string, query: any): Promise<T | null> {
    const results = await this.find<T>(collection, query);
    return results[0] || null;
  }

  async findById<T = any>(collection: string, id: DocumentId): Promise<T | null> {
    return this.findOne(collection, { _id: id });
  }

  async insert<T = any>(collection: string, doc: Partial<T>): Promise<DocumentId> {
    const id = doc._id || this.generateId();
    const keys = Object.keys({ ...doc, _id: id, _createdAt: Date.now() });
    const values = keys.map(k => doc[k as keyof typeof doc]);
    
    await this.pool.query(
      `INSERT INTO "${collection}" (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i+1}`).join(",")})`,
      values
    );
    
    return id as DocumentId;
  }

  async update<T = any>(collection: string, id: DocumentId, update: Partial<T>): Promise<void> {
    const keys = Object.keys(update);
    const setClause = keys.map((k, i) => `"${k}" = $${i+1}`).join(",");
    const values = [...Object.values(update), id];
    
    await this.pool.query(
      `UPDATE "${collection}" SET ${setClause} WHERE "_id" = $${keys.length + 1}`,
      values
    );
  }

  async delete(collection: string, id: DocumentId): Promise<void> {
    await this.pool.query(`DELETE FROM "${collection}" WHERE "_id" = $1`, [id]);
  }

  async count(collection: string, query: any): Promise<number> {
    const whereClause = this.buildWhere(query);
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM "${collection}" ${whereClause.sql}`,
      whereClause.params
    );
    return parseInt(result.rows[0].count, 10);
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  private buildWhere(query: Record<string, any>) {
    if (Object.keys(query).length === 0) {
      return { sql: "", params: [] };
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let index = 1;

    for (const [key, value] of Object.entries(query)) {
      if (value === null) {
        conditions.push(`"${key}" IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => `$${index++}`).join(",");
        conditions.push(`"${key}" IN (${placeholders})`);
        params.push(...value);
      } else {
        conditions.push(`"${key}" = $${index++}`);
        params.push(value);
      }
    }

    return {
      sql: `WHERE ${conditions.join(" AND ")}`,
      params,
    };
  }

  private generateId(): DocumentId {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

// Usage:
// const signal = new Signal();
// signal.configure({
//   db: new PostgresAdapter("postgres://...");
// });

// ============================================
// 2. Custom Transport Adapter
// ============================================

import { SignalTransport, SignalEvent, EventSubscriber } from "./packages/core/Types";

/**
 * Example: Redis Transport for multi-instance deployments
 */
export class RedisTransport implements SignalTransport {
  private redis: any; // ioredis.Redis
  private channelHandlers: Map<string, EventSubscriber[]> = new Map();

  constructor(redisClient: any) {
    this.redis = redisClient;
  }

  async emit(event: SignalEvent): Promise<void> {
    // Publish to Redis channel
    await this.redis.publish(
      `signal:events`,
      JSON.stringify(event)
    );
  }

  async subscribe(pattern: string, handler: EventSubscriber): Promise<() => void> {
    // Store handler
    if (!this.channelHandlers.has(pattern)) {
      this.channelHandlers.set(pattern, []);
    }
    this.channelHandlers.get(pattern)!.push(handler);

    // Subscribe to Redis channel if not already
    if (this.channelHandlers.get(pattern)!.length === 1) {
      this.redis.on("message", (channel: string, message: string) => {
        if (channel === "signal:events") {
          try {
            const event = JSON.parse(message);
            const handlers = this.channelHandlers.get(pattern) || [];
            for (const h of handlers) {
              h(event).catch(console.error);
            }
          } catch (error) {
            console.error("Failed to parse event:", error);
          }
        }
      });
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.channelHandlers.get(pattern) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  async unsubscribe(pattern: string): Promise<void> {
    this.channelHandlers.delete(pattern);
  }
}

// ============================================
// 3. Custom Logger
// ============================================

import { SignalLogger } from "./packages/utils/logger";

/**
 * Example: Structured JSON logger for cloud deployments
 */
export class CloudLogger implements SignalLogger {
  private context: string;

  constructor(serviceName: string) {
    this.context = serviceName;
  }

  debug(msg: string, data?: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "DEBUG",
      service: this.context,
      message: msg,
      data,
    }));
  }

  info(msg: string, data?: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      service: this.context,
      message: msg,
      data,
    }));
  }

  warn(msg: string, data?: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "WARN",
      service: this.context,
      message: msg,
      data,
    }));
  }

  error(msg: string, data?: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      service: this.context,
      message: msg,
      data,
    }));
  }
}

// ============================================
// 4. Custom Access Control Rule
// ============================================

/**
 * Example: Owner-based access control
 */
signal
  .collection("posts")
  .access({
    query: { mine: (ctx) => ctx.auth.user != null },
    mutation: {
      create: "auth",
      update: (ctx) => {
        // Check if user is author
        const postId = (ctx.request?.body as any)?.postId;
        // In real app, fetch post and check ownership
        return true; // Simplified
      },
      delete: async (ctx) => {
        // Admin or owner
        if (ctx.auth.user?.roles?.includes("admin")) {
          return true;
        }
        // Check ownership
        return false;
      },
    },
  });

// ============================================
// 5. Middleware Pattern
// ============================================

/**
 * Example: Wrap Signal for middleware
 */
export class SignalWithMiddleware {
  private signal: Signal;
  private beforeQuery: ((key: string, params: any, ctx: any) => Promise<void>)[] = [];
  private beforeMutation: ((key: string, params: any, ctx: any) => Promise<void>)[] = [];
  private afterQuery: ((key: string, result: any, ctx: any) => Promise<void>)[] = [];
  private afterMutation: ((key: string, result: any, ctx: any) => Promise<void>)[] = [];

  constructor(signal: Signal) {
    this.signal = signal;
  }

  addBeforeQuery(fn: (key: string, params: any, ctx: any) => Promise<void>) {
    this.beforeQuery.push(fn);
  }

  addBeforeMutation(fn: (key: string, params: any, ctx: any) => Promise<void>) {
    this.beforeMutation.push(fn);
  }

  addAfterQuery(fn: (key: string, result: any, ctx: any) => Promise<void>) {
    this.afterQuery.push(fn);
  }

  addAfterMutation(fn: (key: string, result: any, ctx: any) => Promise<void>) {
    this.afterMutation.push(fn);
  }

  async query(key: string, params: any, ctx: any) {
    for (const fn of this.beforeQuery) {
      await fn(key, params, ctx);
    }
    const result = await this.signal.query(key, params, ctx);
    for (const fn of this.afterQuery) {
      await fn(key, result, ctx);
    }
    return result;
  }

  async mutation(key: string, params: any, ctx: any) {
    for (const fn of this.beforeMutation) {
      await fn(key, params, ctx);
    }
    const result = await this.signal.mutation(key, params, ctx);
    for (const fn of this.afterMutation) {
      await fn(key, result, ctx);
    }
    return result;
  }
}

// Usage:
// const wrapped = new SignalWithMiddleware(signal);
// wrapped.addBeforeQuery(async (key, params, ctx) => {
//   console.log(`Query: ${key}`, params);
// });

// ============================================
// 6. Error Mapping
// ============================================

/**
 * Example: Map framework errors to custom format
 */
export async function executeQuery(signal: Signal, key: string, params: any, ctx: any) {
  try {
    return await signal.query(key, params, ctx);
  } catch (error) {
    if (error instanceof SignalAuthError) {
      throw new CustomAuthError(error.message);
    }
    if (error instanceof SignalValidationError) {
      throw new CustomValidationError(error.message);
    }
    throw error;
  }
}

// ============================================
// 7. Batch Operations
// ============================================

/**
 * Example: Batch operations on top of Signal
 */
export async function batchQuery(
  signal: Signal,
  queries: Array<{ key: string; params: any }>,
  ctx: any
): Promise<any[]> {
  return Promise.all(
    queries.map(({ key, params }) => signal.query(key, params, ctx))
  );
}

export async function batchMutation(
  signal: Signal,
  mutations: Array<{ key: string; params: any }>,
  ctx: any
): Promise<any[]> {
  const results: any[] = [];
  for (const { key, params } of mutations) {
    results.push(await signal.mutation(key, params, ctx));
  }
  return results;
}

// ============================================
// 8. Testing Utilities
// ============================================

/**
 * Example: Test helpers
 */
export function createTestContext(overrides?: any) {
  return createContext()
    .withDB(new MemoryAdapter())
    .withAuth(AuthProvider.anonymous())
    .withEmit(async () => {})
    .build();
}

export async function expectQuery(
  signal: Signal,
  key: string,
  params: any,
  ctx: any,
  expectedResult?: any
) {
  const result = await signal.query(key, params, ctx);
  if (expectedResult !== undefined) {
    if (JSON.stringify(result) !== JSON.stringify(expectedResult)) {
      throw new Error(`Query ${key} returned unexpected result`);
    }
  }
  return result;
}

export async function expectMutationError(
  signal: Signal,
  key: string,
  params: any,
  ctx: any,
  expectedError?: string
) {
  try {
    await signal.mutation(key, params, ctx);
    throw new Error(`Mutation ${key} should have thrown`);
  } catch (error: any) {
    if (expectedError && !error.message.includes(expectedError)) {
      throw new Error(`Expected error containing "${expectedError}"`);
    }
  }
}

// ============================================
// 9. Schema Validation Layer
// ============================================

/**
 * Example: Zod integration for schema validation
 */
import type { z } from "zod"; // Optional dependency

export function validateWithSchema<T extends z.ZodType>(schema: T) {
  return (params: unknown): z.infer<T> => {
    const result = schema.safeParse(params);
    if (!result.success) {
      throw new SignalValidationError(
        "Validation failed",
        Object.fromEntries(
          Object.entries(result.error.flatten().fieldErrors).map(
            ([key, errors]) => [key, errors || []]
          )
        )
      );
    }
    return result.data;
  };
}

// Usage:
// const createPostSchema = z.object({
//   title: z.string(),
//   content: z.string(),
// });
//
// .mutation("create", async (params, ctx) => {
//   const validated = validateWithSchema(createPostSchema)(params);
//   ...
// })

// ============================================
// 10. Observability & Tracing
// ============================================

/**
 * Example: Request tracing
 */
export class TracedSignal {
  private signal: Signal;
  private tracer: any; // OpenTelemetry or similar

  constructor(signal: Signal, tracer: any) {
    this.signal = signal;
    this.tracer = tracer;
  }

  async query(key: string, params: any, ctx: any) {
    const span = this.tracer.startSpan(`signal.query.${key}`);
    try {
      span.addEvent("query_start", { key, params });
      const result = await this.signal.query(key, params, ctx);
      span.addEvent("query_success", { resultSize: JSON.stringify(result).length });
      return result;
    } catch (error) {
      span.addEvent("query_error", { error: String(error) });
      throw error;
    } finally {
      span.end();
    }
  }

  async mutation(key: string, params: any, ctx: any) {
    const span = this.tracer.startSpan(`signal.mutation.${key}`);
    try {
      span.addEvent("mutation_start", { key });
      const result = await this.signal.mutation(key, params, ctx);
      span.addEvent("mutation_success");
      return result;
    } catch (error) {
      span.addEvent("mutation_error", { error: String(error) });
      throw error;
    } finally {
      span.end();
    }
  }
}

// ============================================
// Summary
// ============================================

/*
 * Signal is designed to be extended at multiple levels:
 *
 * 1. Database: Implement SignalDB interface
 * 2. Transport: Implement SignalTransport interface
 * 3. Logger: Implement SignalLogger interface
 * 4. Auth: Use custom AuthProvider methods or create auth
 * 5. Access Rules: Use custom rule functions
 * 6. Middleware: Wrap Signal methods
 * 7. Error Handling: Catch and map errors
 * 8. Batch Operations: Create helper functions
 * 9. Testing: Create test utilities
 * 10. Observability: Wrap for tracing/monitoring
 *
 * All without modifying Signal internals!
 */
