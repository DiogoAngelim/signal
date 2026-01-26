/**
 * Signal Architecture Overview
 * 
 * STRUCTURE:
 * 
 * ┌─────────────────────────────────────────────────────────┐
 * │                      HTTP Layer                          │
 * │  handler.ts (serverless-ready) → router.ts → validation  │
 * └────────────────┬────────────────────────────────────────┘
 *                  │
 * ┌────────────────┴────────────────────────────────────────┐
 * │                   Signal Core (Main)                     │
 * │  Signal.ts (main instance)                              │
 * │  ├─ Registry (collections, queries, mutations)          │
 * │  ├─ Lifecycle (phase management)                        │
 * │  ├─ Collection (fluent API)                             │
 * │  └─ Config (immutable configuration)                    │
 * └────────────┬────────────────┬────────────────┬──────────┘
 *              │                │                │
 *    ┌─────────┴─────────┐   ┌──┴──────────┐  ┌──┴──────────────┐
 *    │  Database Layer   │   │   Security  │  │  Transport      │
 *    │  ─────────────    │   │  ────────── │  │  ─────────      │
 *    │ SignalDB (I/F)    │   │ AuthProvider│  │ EventBus        │
 *    │ MemoryAdapter     │   │ AccessCtrl  │  │ InMemoryTranspt │
 *    │ SqlAdapterBase    │   │             │  │ NoOpTransport   │
 *    └───────────────────┘   └─────────────┘  └─────────────────┘
 * 
 * FLOW:
 * 
 * 1. HTTP Request comes in
 * 2. handler.ts parses and validates
 * 3. router.ts dispatches to query or mutation
 * 4. AccessControl checks permissions
 * 5. Handler executes with immutable Context
 * 6. If mutation:
 *    - Database updated via db.insert/update/delete
 *    - Event emitted via transport
 * 7. Response sent back
 * 
 * LIFECYCLE:
 * 
 * new Signal()
 *     ↓
 * signal.configure({ db, transport, logger })
 *     ↓
 * signal.collection("posts")
 *   .access(...)
 *   .query(...)
 *   .mutation(...)
 *     ↓
 * await signal.start()
 *     ↓
 * signal.query("posts.list", params, context)
 * signal.mutation("posts.create", params, context)
 * 
 * 
 * GUARANTEES:
 * 
 * ✓ Immutability      - Config frozen, registry locked after start
 * ✓ Type Safety       - Full TypeScript, strict mode
 * ✓ Access Control    - Enforced before execution
 * ✓ Error Handling    - Deterministic, safe serialization
 * ✓ Statelessness     - No hidden globals, no side effects
 * ✓ Determinism       - Same input = same output
 * ✓ Event Discipline  - At-least-once, stable naming
 * ✓ DB Abstraction    - No SQL leak, adapter-based
 * 
 * 
 * PACKAGES:
 * 
 * /packages/core
 *   ├─ Signal.ts          ─ Main class
 *   ├─ Registry.ts        ─ Tracks collections/queries/mutations
 *   ├─ Collection.ts      ─ Fluent collection builder
 *   ├─ Lifecycle.ts       ─ Phase management
 *   ├─ Context.ts         ─ Request context builder
 *   ├─ Config.ts          ─ Configuration holder
 *   ├─ Types.ts           ─ Core interfaces
 *   └─ Errors.ts          ─ Error classes
 * 
 * /packages/db
 *   ├─ SignalDB.ts        ─ DB interface + helpers
 *   └─ /adapters
 *      ├─ MemoryAdapter.ts    ─ In-memory for dev/test
 *      └─ SqlAdapterBase.ts   ─ Abstract SQL base class
 * 
 * /packages/transport
 *   ├─ SignalTransport.ts  ─ Transport interface + EventBus
 *   ├─ EventBus.ts         ─ Event pub/sub
 *   └─ /adapters
 *      └─ InMemoryTransport.ts ─ In-memory event store
 * 
 * /packages/http
 *   ├─ handler.ts      ─ Serverless HTTP handler
 *   ├─ router.ts       ─ Request routing
 *   └─ validation.ts   ─ Input validation
 * 
 * /packages/security
 *   ├─ AuthProvider.ts     ─ Auth extraction & management
 *   └─ AccessControl.ts    ─ Access rule evaluation
 * 
 * /packages/utils
 *   ├─ deepFreeze.ts   ─ Recursive object freezing
 *   ├─ stableHash.ts   ─ Deterministic hashing
 *   ├─ invariant.ts    ─ Runtime assertions
 *   └─ logger.ts       ─ Structured logging
 * 
 * 
 * DATABASE OPERATIONS:
 * 
 * Query (read-only):
 *   ctx.db.find(collection, query)
 *   ctx.db.findOne(collection, query)
 *   ctx.db.findById(collection, id)
 *   ctx.db.count(collection, query)
 * 
 * Mutation (write-only):
 *   ctx.db.insert(collection, doc)
 *   ctx.db.update(collection, id, update)
 *   ctx.db.delete(collection, id)
 * 
 * All operations async, error-safe
 * 
 * 
 * EVENTS:
 * 
 * Emitted only from mutations:
 *   await ctx.emit("posts.created", { id, title, ... })
 * 
 * Event structure:
 *   {
 *     id: string                    ─ Unique event ID
 *     name: string                  ─ Stable name (collection.action)
 *     payload: any                  ─ Event data
 *     timestamp: number             ─ Emission time
 *   }
 * 
 * Subscriptions support patterns:
 *   "posts.created"     ─ Exact match
 *   "posts.*"           ─ Wildcard
 *   "*"                 ─ All events
 * 
 * At-least-once delivery semantics
 * 
 * 
 * CONTEXT SCOPE:
 * 
 * Per-request, immutable, never shared:
 *   {
 *     db: SignalDB              ─ Database adapter
 *     auth: SignalAuth          ─ Current user
 *     emit: (name, payload) => Promise<void>
 *     request?: {               ─ Original HTTP request
 *       method, url, headers
 *     }
 *     env?: Record<string, any> ─ Environment variables
 *   }
 * 
 * Built with ContextBuilder, frozen after creation
 * 
 * 
 * ACCESS CONTROL:
 * 
 * Declarative rules per collection:
 * 
 *   .access({
 *     query: {
 *       public: "public",
 *       mine: (ctx) => ctx.auth.user != null,
 *     },
 *     mutation: {
 *       create: "auth",
 *       delete: (ctx) => ctx.auth.user?.roles?.includes("admin"),
 *     },
 *   })
 * 
 * Built-in rules:
 *   "public"       ─ Always allowed
 *   "auth"         ─ User must be authenticated
 *   "admin"        ─ User must have admin role
 * 
 * Custom functions:
 *   (ctx) => boolean | Promise<boolean>
 * 
 * Evaluated before handler execution
 * 
 * 
 * ERROR HANDLING:
 * 
 * Deterministic error codes:
 *   AUTH_REQUIRED
 *   FORBIDDEN
 *   VALIDATION_ERROR
 *   NOT_FOUND
 *   CONFLICT
 *   INTERNAL_ERROR
 * 
 * Safe response format (no stack traces in production):
 *   {
 *     ok: false,
 *     error: {
 *       code: "...",
 *       message: "..."
 *     }
 *   }
 * 
 * 
 * TESTING:
 * 
 * Example test scenario in test/production.test.ts:
 *   ✓ Framework boot
 *   ✓ Collection registration
 *   ✓ Query execution
 *   ✓ Mutation execution
 *   ✓ Access control
 *   ✓ Event emission
 *   ✓ Registry immutability
 * 
 * 
 * DEPLOYMENT OPTIONS:
 * 
 * ✓ Vercel    - createHandler(signal) in API route
 * ✓ Fly.io    - Deno.serve with handler
 * ✓ Express   - app.post("/signal/*", handler)
 * ✓ Fastify   - fastify.post("/signal/*", handler)
 * ✓ AWS       - Lambda handler wrapper
 * ✓ VPS       - Any Node.js HTTP server
 * 
 * Stateless, no server affinity required
 */
