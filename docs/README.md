# Signal Developer Documentation

Signal is a TypeScript workspace for building applications around explicit
operational contracts. A Signal application defines:

- **Queries** for reading state.
- **Mutations** for intentional state changes.
- **Events** for facts that already happened.

This document is the developer-oriented source of truth for the repository
shape, module architecture, application build flow, examples, runtime usage,
and validation commands.

## Index

- [Folder Structure](#folder-structure)
- [Architecture](#architecture)
- [Install And Build](#install-and-build)
- [Build An Application On Signal](#build-an-application-on-signal)
- [HTTP Usage](#http-usage)
- [Runtime Usage](#runtime-usage)
- [Idempotency](#idempotency)
- [Events And Subscribers](#events-and-subscribers)
- [Examples](#examples)
- [Developer Checks](#developer-checks)

## Folder Structure

The workspace is organized by ownership boundary. Keep new code inside the
folder that owns its runtime responsibility.

| Folder | Owns | Put Code Here When |
| --- | --- | --- |
| `api/` | Client/server interface packages | The package defines protocol, runtime, SDK, HTTP binding, or adapters that both apps and servers can use. |
| `client/` | Frontend applications | The code is a user-facing browser application. |
| `server/` | Backend services and server-only packages | The code runs on the backend, owns persistence, exposes a service, or belongs to the backend pipeline. |
| `examples/` | Runnable examples and example-only integrations | The code demonstrates Signal usage or is not intended as a reusable package API. |
| `packages/` | Reusable domain packages | The package is reusable application/domain logic that is not tied to a specific server, client, or example. |
| `docs/` | Developer documentation | Documentation belongs in this single Markdown file unless generated docs are intentionally introduced later. |
| `schemas/` | Published JSON schemas | The file describes protocol payloads or envelope schemas. |
| `spec/` | Protocol RFCs and fixtures | The file captures protocol design decisions or compatibility fixtures. |
| `fixtures/` | Shared test fixtures | The file is reusable test data. |
| `scripts/` | Workspace automation | The script validates or maintains the repo. |

Important package locations:

| Package | Path | Purpose |
| --- | --- | --- |
| `@signal/protocol` | `api/protocol` | Operation names, envelopes, errors, result metadata, and capability contracts. |
| `@signal/runtime` | `api/runtime` | Query, mutation, event execution, dispatch, idempotency, and capability discovery. |
| `@signal/sdk-node` | `api/sdk-node` | Node helpers for defining operations and creating a runtime. |
| `@signal/binding-http` | `api/binding-http` | Fastify HTTP routes for Signal runtimes. |
| `@signal/idempotency-postgres` | `api/idempotency-postgres` | PostgreSQL idempotency storage. |
| `@signal/reference-server` | `server/reference-server` | Minimal backend service that exposes Signal over HTTP. |
| `@signal/examples` | `examples/runtime` | Runnable operation and transport examples. |
| `@signal/climate-forecast` | `examples/climate-forecast` | Example-only forecast normalization package. |
| `@signal/aware` | `examples/aware` | Product-style example application. |
| `@signal/emergency-awareness` | `client/emergency-awareness` | Frontend application consuming Signal-style domain logic. |
| `@signal/framework` | `packages/framework` | Preserved framework package, including compatibility modules such as `legacy` and the Stocks Optimizer adapter. |

Create a `public/` folder inside an app only when that app owns static assets.
There are no root-level shared public assets in the current workspace.

## Architecture

The diagram below is Mermaid, so Markdown viewers that support Mermaid render it
as an illustration instead of ASCII art.

```mermaid
flowchart LR
  Developer["Developer application<br/>client, server, or example"]
  Domain["packages/*<br/>domain logic"]
  SDK["@signal/sdk-node<br/>defineQuery / defineMutation / defineEvent"]
  Protocol["@signal/protocol<br/>names, schemas, envelopes, errors"]
  Runtime["@signal/runtime<br/>execution, metadata, capabilities"]
  Dispatcher["event dispatcher<br/>subscribers and replay safety"]
  Idempotency["idempotency store<br/>memory or Postgres"]
  HTTP["@signal/binding-http<br/>Fastify routes"]
  Server["server/reference-server<br/>default HTTP service"]
  Client["HTTP client or frontend"]
  Examples["examples/*<br/>runnable integrations"]
  Schemas["schemas/ and spec/<br/>published contracts"]

  Developer --> SDK
  Developer --> Domain
  Examples --> SDK
  Examples --> Domain
  SDK --> Runtime
  Protocol --> SDK
  Protocol --> Runtime
  Runtime --> Protocol
  Runtime --> Dispatcher
  Runtime --> Idempotency
  HTTP --> Runtime
  Server --> HTTP
  Server --> SDK
  Client --> HTTP
  Schemas --> Protocol
```

Dependency direction should stay simple:

- `api/protocol` defines the contract surface.
- `api/runtime` executes the contract surface.
- `api/sdk-node` makes operation definitions ergonomic.
- `api/binding-http` adapts HTTP requests into runtime calls.
- `server/*` composes backend services and persistence.
- `client/*` and `examples/*` consume core packages.
- `packages/*` holds reusable domain logic.

Core packages must not depend on product apps or examples.

## Install And Build

Install dependencies from the repository root:

```bash
pnpm install
```

Build everything:

```bash
pnpm build
```

Build only the core runtime surface:

```bash
pnpm --filter @signal/protocol... build
pnpm --filter @signal/runtime... build
pnpm --filter @signal/sdk-node... build
pnpm --filter @signal/binding-http... build
```

Build and run the reference server:

```bash
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start
```

The reference server listens on `127.0.0.1:3001` unless `SIGNAL_HTTP_PORT` is
set.

## Build An Application On Signal

1. Choose the owner folder.
   - Frontend application: `client/<app-name>`.
   - Backend service: `server/<service-name>`.
   - Reusable domain package: `packages/<package-name>`.
   - Runnable demo or integration: `examples/<example-name>`.

2. Depend on the Signal packages you need.

```json
{
  "dependencies": {
    "@signal/protocol": "workspace:*",
    "@signal/runtime": "workspace:*",
    "@signal/sdk-node": "workspace:*",
    "@signal/binding-http": "workspace:*"
  }
}
```

3. Define operations with schemas and versioned names.

```ts
import { z } from "zod";
import { createSignalHttpServer } from "@signal/binding-http";
import { createProtocolError } from "@signal/protocol";
import { createSignalRuntime, defineEvent, defineMutation, defineQuery } from "@signal/sdk-node";

const orderInputSchema = z.object({
  orderId: z.string().min(1),
});

const orderResultSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["draft", "submitted"]),
});

type Order = z.infer<typeof orderResultSchema>;

const orders = new Map<string, Order>([
  ["order_1001", { orderId: "order_1001", status: "draft" }],
]);

const runtime = createSignalRuntime({
  runtimeName: "orders-api",
});

runtime.registerQuery(defineQuery({
  name: "order.get.v1",
  kind: "query",
  inputSchema: orderInputSchema,
  resultSchema: orderResultSchema,
  handler: (input) => {
    const order = orders.get(input.orderId);
    if (!order) {
      throw createProtocolError("NOT_FOUND", `Unknown order ${input.orderId}`);
    }
    return order;
  },
}));

runtime.registerEvent(defineEvent({
  name: "order.submitted.v1",
  kind: "event",
  inputSchema: orderResultSchema,
  resultSchema: orderResultSchema,
  handler: (payload) => payload,
}));

runtime.registerMutation(defineMutation({
  name: "order.submit.v1",
  kind: "mutation",
  idempotency: "required",
  emits: ["order.submitted.v1"],
  inputSchema: orderInputSchema,
  resultSchema: orderResultSchema,
  handler: async (input, context) => {
    const order = orders.get(input.orderId);
    if (!order) {
      throw createProtocolError("NOT_FOUND", `Unknown order ${input.orderId}`);
    }

    order.status = "submitted";
    await context.emit("order.submitted.v1", order);
    return order;
  },
}));

const app = createSignalHttpServer(runtime);
await app.listen({ port: 3001, host: "127.0.0.1" });
```

4. Add tests around the runtime, not only around HTTP.

```ts
const result = await runtime.query("order.get.v1", {
  orderId: "order_1001",
});
```

5. Add HTTP tests when you expose an application server.

```ts
const response = await app.inject({
  method: "POST",
  url: "/signal/query/order.get.v1",
  payload: {
    payload: {
      orderId: "order_1001",
    },
  },
});
```

## HTTP Usage

The default HTTP binding exposes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Basic process health. |
| `GET` | `/signal/capabilities` | Runtime operation discovery. |
| `POST` | `/signal/query/:name` | Execute a query. |
| `POST` | `/signal/mutation/:name` | Execute a mutation. |
| `GET` | `/signal/observed-events` | Reference-server observed event list. |

Request bodies use this shape:

```json
{
  "payload": {},
  "context": {
    "correlationId": "corr-1001",
    "traceId": "trace-1001"
  },
  "meta": {},
  "idempotencyKey": "logical-request-1001"
}
```

Query example:

```bash
curl -X POST http://127.0.0.1:3001/signal/query/note.get.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"noteId":"note_1001"}}'
```

Mutation example:

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/post.publish.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"postId":"post_1001","title":"Protocol first","body":"Signal keeps transport and execution concerns separate."},"idempotencyKey":"publish-post_1001-001"}'
```

Successful responses preserve the same envelope shape:

```json
{
  "ok": true,
  "result": {},
  "envelope": {},
  "meta": {}
}
```

Failures use:

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "category": "validation",
    "message": "Invalid Signal HTTP request body",
    "retryable": false
  }
}
```

## Runtime Usage

Use `runtime.capabilities()` to inspect registered operations:

```ts
const capabilities = runtime.capabilities();
```

Use direct runtime calls when testing or embedding Signal inside another
service:

```ts
await runtime.query("note.get.v1", { noteId: "note_1001" });

await runtime.mutation(
  "post.publish.v1",
  {
    postId: "post_1001",
    title: "Protocol first",
    body: "Signal keeps transport and execution concerns separate.",
  },
  {
    idempotencyKey: "publish-post_1001-001",
    correlationId: "corr-post-1001",
  }
);
```

Operation naming rules:

- Use `domain.action.v1` or `resource.fact.v1`.
- Add a new version instead of changing an existing public contract.
- Use query names for reads, mutation names for commands, and event names for
  completed facts.
- Keep payload schemas explicit with `zod`.

## Idempotency

Mutations can declare idempotency as `required`, `optional`, or `none`.

Use required idempotency when callers may retry the same logical mutation:

```ts
runtime.registerMutation(defineMutation({
  name: "payment.capture.v1",
  kind: "mutation",
  idempotency: "required",
  inputSchema,
  resultSchema,
  handler,
}));
```

Local examples can use the in-memory store. Production-like services should use
`@signal/idempotency-postgres` and set `DATABASE_URL`.

```ts
import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";
import { createSignalRuntime } from "@signal/sdk-node";

const runtime = createSignalRuntime({
  idempotencyStore: createPostgresIdempotencyStore({
    connectionString: process.env.DATABASE_URL,
  }),
});
```

## Events And Subscribers

Events record facts. They should be named in past tense:

- `post.published.v1`
- `payment.captured.v1`
- `order.submitted.v1`

Emit from a mutation through the execution context:

```ts
await context.emit("post.published.v1", {
  postId: "post_1001",
  title: "Protocol first",
  publishedAt: new Date().toISOString(),
});
```

Subscribe when an event must update a projection or notify another system:

```ts
runtime.subscribe("post.published.v1", async (event) => {
  console.log(event.messageId);
}, {
  consumerId: "post-projection",
  replaySafe: true,
});
```

Subscriber code must be replay-safe. Store enough metadata to avoid duplicating
side effects when the same event is delivered again.

## Examples

Build the runtime examples first:

```bash
pnpm --filter @signal/examples... build
```

Runnable examples in `examples/runtime`:

| Example | Command | Notes |
| --- | --- | --- |
| Minimal runtime | `pnpm --filter @signal/examples minimal-runtime` | Registers and executes `note.get.v1`. |
| Post publication | `pnpm --filter @signal/examples post-publication` | Query, mutation, emitted event, replay, and idempotency conflict. |
| HTTP post publication | `pnpm --filter @signal/examples http-post-publication` | Uses the Fastify HTTP binding with injected requests. |
| Capabilities inspection | `pnpm --filter @signal/examples capabilities-inspection` | Prints registered operation capabilities. |
| Storage-backed idempotency | `DATABASE_URL=postgresql://... pnpm --filter @signal/examples storage-backed-idempotency` | Requires PostgreSQL. |
| Custom transport skeleton | `pnpm --filter @signal/examples custom-transport-skeleton` | Shows where a non-HTTP transport plugs in. |
| Payment capture | `pnpm --filter @signal/examples payment-capture` | Payment-style mutation and event flow. |
| Escrow release | `pnpm --filter @signal/examples escrow-release` | Multi-step domain workflow. |
| User onboarding | `pnpm --filter @signal/examples user-onboarding` | User lifecycle flow. |
| Kafka/PostgreSQL | `DATABASE_URL=postgresql://... KAFKA_BROKERS=localhost:9092 pnpm --filter @signal/examples kafka-postgresql` | Uses PostgreSQL and Kafka-compatible brokers. |

Application examples:

| Example | Path | Command | Live URL |
| --- | --- | --- | --- |
| Aware | `examples/aware` | `pnpm --filter @signal/aware dev` | <https://aware-guide.vercel.app> |
| Climate Forecast | `examples/climate-forecast` | `pnpm --filter @signal/climate-forecast test` | Code/package example; no Vercel app. |
| Emergency Awareness | `client/emergency-awareness` | `pnpm --filter @signal/emergency-awareness dev` | <https://weather-awareness.vercel.app> |
| Stocks Optimizer | `examples/stocks-optimizer` | Preserved example state in this checkout; it is not currently a pnpm workspace package. | <https://stocks-optimizer.vercel.app> |

Reference server:

```bash
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start
```

## Developer Checks

Use these before publishing structural or contract changes:

```bash
pnpm test
pnpm -r --if-present --sort run test:coverage
pnpm typecheck
pnpm lint
pnpm verify:exports
git diff --check && git diff --cached --check
```

Use these targeted checks while developing:

```bash
pnpm --filter @signal/protocol test
pnpm --filter @signal/runtime test
pnpm --filter @signal/sdk-node test
pnpm --filter @signal/binding-http test
pnpm --filter @signal/reference-server test
pnpm --filter @signal/examples test
```

`pnpm verify:exports` checks package `main`, `types`, `exports`, and `bin`
targets for all workspace packages. Run it after moving packages or changing
build output paths.
