# Signal

Signal is a backend framework for explicit named queries, named mutations, and replay-safe events.

It is designed for serverless and horizontally scaled environments where predictability, idempotency, and clear failure modes matter more than hidden magic.

## Why Signal

- Named queries and mutations only
- Mutations are the only write path
- Mutations can be idempotent with request keys, payload fingerprints, and stored result replay
- Events are replay-safe and emitted from mutations
- Per-consumer event deduplication is supported when a transport provides a stable consumer id
- Configuration is immutable after startup
- Database and transport layers are swappable
- Works well in serverless, edge, and traditional Node.js apps

## Core Flow

1. Create a `Signal` instance.
2. Configure it with a database adapter and optional transport.
3. Register collections, queries, mutations, and access rules.
4. Call `start()`.
5. Execute `query()` and `mutation()` with a request context.

## Quick Start

```ts
import {
  Signal,
  MemoryAdapter,
  InMemoryTransport,
  AuthProvider,
  createContext,
} from "./index";

const signal = new Signal();

signal.configure({
  db: new MemoryAdapter(),
  transport: new InMemoryTransport(),
});

signal
  .collection("posts")
  .access({
    query: { list: "public" },
    mutation: { create: "auth" },
  })
  .query("list", async (_, ctx) => {
    return ctx.db.find("posts", { published: true });
  })
  .mutation("create", async (params, ctx) => {
    const id = await ctx.db.insert("posts", {
      title: params.title,
      authorId: ctx.auth.user?.id,
    });

    await ctx.emit("posts.created", { id });
    return { id };
  });

await signal.start();

const ctx = createContext()
  .withDB(signal.getConfig().db)
  .withAuth(AuthProvider.authenticated("user123"))
  .withEmit(async () => {})
  .build();

const posts = await signal.query("posts.list", {}, ctx);
const result = await signal.mutation("posts.create", { title: "Hello" }, ctx);
```

## What To Read Next

- `START_HERE.md` for the best reading order
- `QUICK_REFERENCE.md` for the API cheat sheet
- `ARCHITECTURE.md` for how the system fits together
- `DESIGN.md` for the design trade-offs
- `EXTENDING.md` for custom adapters and integrations

## Main Concepts

- **Signal instance**: the framework entry point
- **Collection**: a namespace for related operations
- **Query**: a read-only named operation
- **Mutation**: a write operation and the only place events should be emitted
- **Context**: immutable request-scoped data passed into handlers
- **Access control**: declarative rules that run before handlers

## Reliability Model

Signal adds a few small primitives so the framework stays explicit without becoming fragile:

- idempotent mutations use an idempotency key plus a payload fingerprint
- repeated mutation requests can replay the stored result instead of re-running handlers
- stale writes can fail fast with explicit version mismatch errors
- event execution is replay-safe and out-of-order tolerant
- transports can dedupe events per consumer when they have a stable consumer id
- audit hooks append to a read-only trail instead of mutating prior entries

## Public Packages

Signal is split into a few focused layers:

- `core` for orchestration, registry, lifecycle, and types
- `db` for the database abstraction and adapters
- `transport` for event delivery
- `http` for request handling and validation
- `security` for auth and access control
- `utils` for immutability, hashing, logging, and assertions

## Platform Fit

Signal works well with:

- Vercel
- Fly.io
- AWS Lambda
- Cloudflare Workers
- Express
- Fastify
- Hono
- Raw Node.js HTTP servers

## Safety Guarantees

- Immutable configuration
- Registry locked after startup
- Deterministic error codes
- Safe error serialization
- Request-scoped context
- Input validation before execution
- Explicit optimistic concurrency checks
- Append-only mutation and audit records
