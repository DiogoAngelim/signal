# Signal Protocol v1

Signal is a transport-independent application protocol for queries, mutations, and events.

Signal defines how messages are structured and processed:

- envelope format
- naming rules
- response template
- idempotence behavior
- forms of integration through bindings

The Node.js implementation is a reference, not a limitation.

## Getting Started

If you want to use Signal in your own application, install the reference runtime package:

```bash
pnpm add @signal/sdk-node
```

If you want to read the contract first, start with:

- [Introduction](docs/docs/introduction.md)
- [Envelope reference](docs/docs/reference/envelope.md)
- [Quickstart](docs/docs/guides/quickstart.md)
- [RFCs](spec/)
- [Runnable examples](packages/examples/)

## Designed for Adoption

The protocol is simple by design:

- easy to read
- easy to implement
- easy to extend

Each part can be understood in isolation. You can read the envelope without reading the runtime, or read the HTTP binding without adopting the reference server.

## Protocol First

Signal does not start with implementation.

It starts with the definition:

- public RFCs describe the contract
- behavior is standardized before code
- different runtimes can coexist

That makes the protocol portable. A Node.js runtime, a Python runtime, or a Rust runtime can all follow the same public rules.

## Versioned Operations

Each operation is explicit and versioned:

- `payment.capture.v1`
- `payment.status.v1`

This avoids ambiguity and allows evolution without breaking existing consumers.

Rules:

- use lowercase names
- separate segments with dots
- keep the action explicit
- include the version suffix every time
- use past tense where it helps describe an event, such as `payment.captured.v1`

## Standard Envelope

Every message follows the same structure:

- `protocol` -> protocol version
- `kind` -> `query`, `mutation`, or `event`
- `name` -> versioned operation name
- `messageId` -> unique identifier
- `timestamp` -> time of execution
- `payload` -> operation data
- `context` -> correlation and causation metadata
- `delivery` -> delivery metadata
- `auth` -> security context
- `meta` -> extension metadata

Nothing happens outside this format.

The runtime uses Zod schemas for validation in code. The public schema artifacts in [`schemas/`](schemas/) use JSON Schema Draft 2020-12.

## Idempotent Mutations

Each mutation declares its behavior:

- `required` -> must be idempotent and must receive an idempotency key
- `optional` -> can be idempotent if the caller provides a key
- `none` -> does not guarantee idempotence

Retries are not an exception. They are part of the flow.

Same key + same normalized payload -> same logical result.

Same key + different payload -> conflict.

See [Idempotency](docs/docs/concepts/idempotency.md) for the storage and replay rules.

## Replay-Safe Events

Consumers must:

- tolerate duplication
- not assume global order
- process events resiliently

The system is designed for the real world, not ideal conditions.

See [Events](docs/docs/concepts/events.md) and [Order and Replay](docs/docs/concepts/order-and-replay.md).

## Capability Documents

Each system clearly states what it supports:

- available queries
- available mutations
- published events
- subscriptions

Nothing is implied. Consumers can inspect capabilities before sending requests.

## Bindings

The protocol can be executed in two ways:

### In-process

Local execution using the runtime:

```ts
await runtime.query("payment.status.v1", input);
```

This is ideal for tests and direct execution.

### HTTP

Exposure via API without changing the protocol:

- `POST /signal/query/:name`
- `POST /signal/mutation/:name`
- `GET /signal/capabilities`

The transport changes, but the protocol does not.

## Complete Flow: Record -> Run -> Replay

The cycle is unique and consistent:

```ts
const first = await runtime.mutation(
  "payment.capture.v1",
  { paymentId: "pay_1001", amount: 120, currency: "USD" },
  { idempotencyKey: "capture-pay_1001-001" }
);

const replay = await runtime.mutation(
  "payment.capture.v1",
  { paymentId: "pay_1001", amount: 120, currency: "USD" },
  { idempotencyKey: "capture-pay_1001-001" }
);

// The second call returns the same logical result.
```

The first call executes the mutation. The second call should return the stored logical result, not duplicate the effect.

## Separation of Responsibilities

Each layer of the system is isolated:

- protocol -> contract definition
- runtime -> execution
- bindings -> transport
- docs -> specification

This allows each part to be implemented independently.

## Packages

Core packages in the repository:

- `packages/protocol` -> envelope, naming, results, errors, capabilities, and public schemas
- `packages/runtime` -> Node.js runtime, registry, query, mutation, event, dispatcher, and idempotency helpers
- `packages/sdk-node` -> convenience helpers for Node applications
- `packages/binding-http` -> Fastify-based HTTP binding
- `packages/idempotency-postgres` -> PostgreSQL-backed idempotency store
- `packages/examples` -> runnable domain flows and example adapters
- `apps/reference-server` -> reference HTTP server

## Life Cycle

1. Specified

The protocol is defined via public RFCs.

```ts
const runtime = new SignalRuntime();
```

2. Registered

Operations are registered.

```ts
runtime.registerMutation("payment.capture.v1", mutation);
```

3. Running

Execution and replay begin.

```ts
await runtime.mutation(name, payload, { idempotencyKey });
```

## Reference Server

Run the full implementation:

```bash
pnpm --filter @signal/reference-server dev
```

The server demonstrates:

- two queries
- three mutations
- three events
- capability retrieval
- HTTP query and mutation execution

## HTTP Endpoints

- `POST /signal/query` -> queries
- `POST /signal/mutation` -> mutations
- `GET /signal/capabilities` -> discovery

## Central Principle

The protocol defines the behavior.
The implementation just follows the contract.

## Next Step

Read the protocol, run it locally, and compare it to your own implementation.

## 1. Preparation

Before you install or run anything, make sure you have:

- Node.js 20 or newer
- `pnpm` 9.9.0 or newer
- PostgreSQL 14 or newer if you want the PostgreSQL-backed examples or reference server

Clone the repository and move into the workspace root:

```bash
git clone https://github.com/DiogoAngelim/signal.git
cd signal
```

### 1.1 Database and Schema Set Up

The reference server and the Kafka + PostgreSQL example can use PostgreSQL for idempotency and projections.

Create a database for local work:

```bash
createdb signal
```

If you want the PostgreSQL-backed idempotency store, point `DATABASE_URL` at that database and push the schema:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/signal
pnpm dlx drizzle-kit push --config apps/reference-server/drizzle.config.ts
```

If you do not set `DATABASE_URL`, the reference server falls back to the in-memory idempotency store.

## 2. Installation

Install workspace dependencies once at the root:

```bash
pnpm install
```

Useful verification commands:

```bash
pnpm build
pnpm test
pnpm check
```

## 3. Configuration

Signal uses explicit environment variables instead of hidden defaults.

Common variables:

- `DATABASE_URL` for PostgreSQL-backed idempotency and example storage
- `SIGNAL_HTTP_PORT` for the reference server port
- `KAFKA_BROKERS` for Kafka-backed examples
- `KAFKA_TOPIC` for the example event topic
- `KAFKA_CLIENT_ID` for the Kafka producer client id
- `KAFKA_GROUP_ID` for the Kafka consumer group id

Examples are documented in:

- [`.env.example`](.env.example)
- [`apps/reference-server/.env.example`](apps/reference-server/.env.example)
- [`packages/examples/kafka-postgresql/.env.example`](packages/examples/kafka-postgresql/.env.example)

## 4. Usage

### 4.1 Minimal

The smallest useful setup is an in-process runtime with one query, one mutation, and one emitted event.

```ts
import { createSignalRuntime, defineMutation, defineQuery } from "@signal/sdk-node";
import {
  createInProcessDispatcher,
  createMemoryIdempotencyStore,
} from "@signal/runtime";

const runtimeName = "signal-reference";
const dispatcher = createInProcessDispatcher();
const repository = createPaymentRepository();

const runtime = createSignalRuntime({
  // String value: a stable runtime label. Example options are "signal-reference",
  // "signal-local", or "signal-http".
  runtimeName,
  // Variable choice: the event dispatcher. Use createInProcessDispatcher() for local runs,
  // createKafkaSignalDispatcher() for a broker-backed deployment, or a custom SignalDispatcher.
  dispatcher,
  // Variable choice: the idempotency store. Use createMemoryIdempotencyStore() for tests and
  // local development, or createPostgresIdempotencyStore() when you need persistent retry handling.
  idempotencyStore: createMemoryIdempotencyStore(),
});

runtime.registerQuery(
  defineQuery({
    // String value: the operation name in <domain>.<action>.<version> form.
    // Examples: "payment.status.v1", "user.profile.v1", "order.summary.v1".
    name: "payment.status.v1",
    // Variable value: the operation kind. Use "query" for read-only reads,
    // "mutation" for state-changing commands, and "event" for immutable facts.
    kind: "query",
    inputSchema: paymentStatusInputSchema,
    resultSchema: paymentStatusResultSchema,
    // Callback input: a validated query payload, for example { paymentId: "pay_123" }.
    // Callback output: the matching result, such as a payment record, or a protocol error if your
    // implementation reports missing data that way.
    handler: async (input) => repository.getPayment(input.paymentId),
  })
);

runtime.registerMutation(
  defineMutation({
    // String value: the operation name in the same <domain>.<action>.<version> form.
    // Examples: "payment.capture.v1", "order.cancel.v1", "user.activate.v1".
    name: "payment.capture.v1",
    // Variable value: the operation kind. Use "mutation" here because this handler changes state.
    // Other valid values are "query" and "event".
    kind: "mutation",
    // Variable value: the idempotency mode. Use "required" when callers must send an idempotency
    // key, "optional" when callers may send one, and "none" when no idempotency key is used.
    idempotency: "required",
    inputSchema: paymentCaptureInputSchema,
    resultSchema: paymentStatusResultSchema,
    // Callback input: a validated mutation payload plus an execution context. The context gives you
    // helpers such as emit(), message metadata, and correlation data.
    // Callback output: the stored mutation result. Use context.emit() to publish follow-up events,
    // such as "payment.captured.v1", during the same operation.
    handler: async (input, context) => {
      const captured = await repository.capturePayment(input);
      await context.emit("payment.captured.v1", {
        paymentId: captured.paymentId,
        amount: captured.amount,
        currency: captured.currency,
        capturedAt: captured.capturedAt ?? new Date().toISOString(),
      });
      return captured;
    },
  })
);
```

This mode is useful when you want:

- local development without external services
- fast tests for protocol behavior
- a simple way to prove envelope validation and idempotency handling

Schema note: `inputSchema` and `resultSchema` are Zod schemas in code. They validate plain JSON objects before the handler runs. The public schema artifacts in `/schemas` use JSON Schema Draft 2020-12. For example, `payment.status.v1` accepts `{ paymentId: "pay_123" }` because `paymentId` is a required non-empty string.

### 4.2 Advanced

The advanced setup uses the PostgreSQL idempotency store, the Kafka example dispatcher, the HTTP binding, and the runnable reference server.

```ts
import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";
import { createSignalRuntime } from "@signal/sdk-node";
import { createKafkaSignalDispatcher } from "@signal/examples/kafka-postgresql";

async function main() {
  const runtimeName = "signal-reference";
  const dispatcher = await createKafkaSignalDispatcher({
    brokers: ["localhost:9092"], // one or more Kafka brokers
    topic: "signal.events", // the topic used for Signal event envelopes
  });
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/signal";

  const runtime = createSignalRuntime({
    // String value: a stable runtime label. Common choices are "signal-reference",
    // "signal-http", or another name that matches the service you are running.
    runtimeName,
    // Variable choice: the dispatcher. Use the Kafka example adapter for a broker-backed app,
    // createInProcessDispatcher() for local runs, or another SignalDispatcher implementation.
    dispatcher,
    // Variable choice: the idempotency store. Use PostgreSQL when you need persistence
    // across restarts, or an in-memory store for quick local experiments.
    idempotencyStore: createPostgresIdempotencyStore({
      // String value: a PostgreSQL connection string.
      // Example: "postgresql://postgres:postgres@localhost:5432/signal".
      connectionString,
    }),
  });
}
```

In this mode, query callbacks receive validated input and return a result value, while mutation callbacks receive validated input plus an execution context and return the stored result after any event emission.

For a full example that includes Kafka, PostgreSQL, queries, mutations, and replay-safe event handling, see:

- [`packages/examples/kafka-postgresql/`](packages/examples/kafka-postgresql/)
- [`apps/reference-server/`](apps/reference-server/)

## 5. Deployment

### Landing Site

The public landing site is deployed to GitHub Pages.

```bash
pnpm --filter @signal/landing build
```

The Pages workflow runs on `main` and publishes the static export from `landing/out`.

### Reference Server

```bash
pnpm --filter @signal/reference-server build
pnpm --filter @signal/reference-server start
```

Set `DATABASE_URL` before starting if you want PostgreSQL-backed idempotency. Leave it unset if you want the in-memory fallback for local exploration.

### Examples

The runnable examples are meant for local evaluation and extension:

- [`packages/examples/payment-capture/`](packages/examples/payment-capture/)
- [`packages/examples/escrow-release/`](packages/examples/escrow-release/)
- [`packages/examples/user-onboarding/`](packages/examples/user-onboarding/)
- [`packages/examples/kafka-postgresql/`](packages/examples/kafka-postgresql/)

## Quickstart

If you want the shortest path to a running server:

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

Then inspect the envelope, read the quickstart guide, and compare the reference runtime with your own implementation.

## Repository

Repository layout:

- `spec/` holds the public RFCs
- `schemas/` holds JSON Schema artifacts for public protocol documents
- `packages/protocol` holds envelope, naming, result, capability, and error validation
- `packages/runtime` holds the Node reference runtime
- `packages/binding-http` holds the HTTP binding
- `packages/idempotency-postgres` holds the PostgreSQL idempotency store
- `packages/sdk-node` holds convenience helpers for Node applications
- `packages/examples` holds runnable example flows
- `apps/reference-server` holds the runnable HTTP reference server
- `docs/` holds the Docusaurus documentation site
- `landing/` holds the public homepage

## Envelope

The standard envelope in v1 carries:

- `protocol`
- `kind`
- `name`
- `messageId`
- `timestamp`
- `payload`

It may also carry:

- `source`
- `context`
- `delivery`
- `auth`
- `meta`

The runtime validates these shapes with Zod, and the public schema artifacts in [`schemas/`](schemas/) are published as JSON Schema Draft 2020-12.
