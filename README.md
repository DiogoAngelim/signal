# Signal Protocol v1

Signal is a protocol-first, transport-independent application protocol and Node.js reference runtime for versioned queries, mutations, and events.

Signal is not a payments framework. It is the execution kernel and public contract that downstream systems can build on.

## What Signal Is

- a public protocol contract for messages, names, results, errors, and capabilities
- a reference runtime for explicit query, mutation, and event execution
- a thin binding model for HTTP and future transports
- a pluggable foundation for idempotency storage, replay-safe consumers, and delivery metadata

## What Signal Is Not

- not a payment processor
- not a retry scheduler
- not a workflow engine
- not an ORM or dependency injection container
- not a broker-specific framework

## Core Guarantees

- operations are explicit and versioned: `note.get.v1`, `post.publish.v1`, `post.published.v1`
- every message uses the standard Signal structure
- queries are read-only
- mutations declare idempotency explicitly: `required`, `optional`, or `none`
- same idempotency key plus same normalized payload yields the same logical result
- same idempotency key plus different normalized payload yields conflict
- events are immutable facts and consumers must be replay-safe
- context, auth, meta, and delivery metadata remain explicit and transport-independent
- capabilities are derived from the actual runtime surface

## Layering

- Protocol: public contract
- Runtime: execution kernel
- Bindings: transport adapters
- Storage: pluggable persistence for idempotency and replay state
- Domain modules: downstream systems built on top of Signal

## Packages

- `packages/protocol`: messages, names, results, errors, capabilities, and JSON-schema artifacts
- `packages/runtime`: Node.js reference runtime, idempotency helpers, dispatcher, replay-safe utilities
- `packages/sdk-node`: explicit registration helpers for Node applications
- `packages/binding-http`: thin Fastify binding for Signal queries, mutations, and capabilities
- `packages/idempotency-postgres`: PostgreSQL-backed idempotency store
- `packages/examples`: runnable generic examples
- `apps/reference-server`: runnable reference server

## Quick Start

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

Inspect the runtime surface:

```bash
curl http://127.0.0.1:3001/signal/capabilities
```

Run a query:

```bash
curl -X POST http://127.0.0.1:3001/signal/query/note.get.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "noteId": "note_1001"
    }
  }'
```

Run an idempotent mutation:

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/post.publish.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "postId": "post_1001",
      "title": "Protocol first",
      "body": "Signal keeps transport and execution concerns separate."
    },
    "idempotencyKey": "publish-post_1001-001",
    "context": {
      "correlationId": "corr-post-1001"
    }
  }'
```

## In-Process Usage

```ts
import { createSignalRuntime, defineMutation, defineQuery } from "@signal/sdk-node";
import { createInProcessDispatcher, createMemoryIdempotencyStore } from "@signal/runtime";
import { z } from "zod";

const runtime = createSignalRuntime({
  dispatcher: createInProcessDispatcher(),
  idempotencyStore: createMemoryIdempotencyStore(),
  runtimeName: "signal-local",
});

runtime.registerQuery(
  defineQuery({
    name: "note.get.v1",
    kind: "query",
    inputSchema: z.object({ noteId: z.string().min(1) }),
    resultSchema: z.object({
      noteId: z.string().min(1),
      body: z.string().min(1),
    }),
    handler: async (input) => ({
      noteId: input.noteId,
      body: "Signal keeps protocol contracts explicit.",
    }),
  })
);

runtime.registerMutation(
  defineMutation({
    name: "post.publish.v1",
    kind: "mutation",
    idempotency: "required",
    emits: ["post.published.v1"],
    inputSchema: z.object({
      postId: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    }),
    resultSchema: z.object({
      postId: z.string().min(1),
      status: z.literal("published"),
    }),
    handler: async (input, context) => {
      await context.emit("post.published.v1", {
        postId: input.postId,
        title: input.title,
        publishedAt: new Date().toISOString(),
      });

      return {
        postId: input.postId,
        status: "published",
      };
    },
  })
);
```

## Protocol Surface

The v1 envelope includes:

- `protocol`
- `kind`
- `name`
- `messageId`
- `timestamp`
- `payload`
- optional `source`
- optional `context`
- optional `delivery`
- optional `auth`
- optional `meta`

The reference runtime also recognizes:

- `context.idempotencyKey`
- `context.deadlineAt`
- `context.trace`
- `delivery.attempt`
- `delivery.consumerId`
- `delivery.replayed`

Successful results can include logical outcome metadata such as:

- `meta.outcome = "completed"`
- `meta.outcome = "replayed"`

Failures are structured and categorized, for example:

- `VALIDATION_ERROR`
- `BUSINESS_REJECTION`
- `IDEMPOTENCY_CONFLICT`
- `DEADLINE_EXCEEDED`
- `CANCELLED`
- `UNSUPPORTED_OPERATION`

## Examples

Runnable examples live in `packages/examples/`:

- `minimal-runtime`
- `post-publication`
- `http-post-publication`
- `capabilities-inspection`
- `storage-backed-idempotency`
- `custom-transport-skeleton`

## Specs And Docs

- `spec/`: RFCs and conformance fixtures
- `schemas/`: published JSON-schema artifacts
- `docs/`: Docusaurus docs
- `START_HERE.md`: repo reading path
- `QUICK_REFERENCE.md`: API and contract cheat sheet

## Conformance Direction

A Signal-compatible implementation must preserve:

- envelope validation
- versioned names
- query, mutation, and event semantics
- structured results and errors
- explicit idempotency semantics
- replay-safe event consumption assumptions
- capability discovery

The Node runtime is the reference implementation, not the only valid one.
# Example Apps

Signal no longer includes a standalone frontend workspace. UI demos live in `examples/`:

- `examples/weather/` - Weather Signal app + server. See `examples/weather/replit.md` for setup and commands.
- `examples/stocks/` - Signal Markets UI demo. See `examples/stocks/src/replit.md` for details.

## npm Module: signal-protocol

This repo includes a publishable package at [packages/signal-protocol](packages/signal-protocol).
It bundles the API routes plus the built client assets to avoid shipping frontend dependencies.

Build the package (includes client assets):

```
pnpm -C packages/signal-protocol run prepack
```

Publish (run this manually):

```
pnpm -C packages/signal-protocol publish --access public
```
