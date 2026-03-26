# Signal

Signal is a transport-agnostic application protocol for versioned queries, explicit mutations, and immutable events.

## What Lives Where

- [Protocol specs](spec/) define the public contract.
- [Schemas](schemas/) publish JSON Schema artifacts for protocol documents.
- [Reference packages](packages/) implement the contract in TypeScript.
- [Reference server](apps/reference-server/) shows the HTTP binding and runtime together.
- [Docs site](docs/) explains the protocol for adoption.
- [Examples](packages/examples/) show runnable domain flows.

## 1. Preparation

Before you install or run anything, make sure you have:

- Node.js 20 or newer
- `pnpm` 9.9.0
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

### Variables

In the examples below, each value is defined once with `const` and then reused by the runtime. If you are new to the library, read them in this order: define the variables, create the runtime, register the handlers, then run the runtime from HTTP or in-process code.

```ts
const runtimeName = "signal-reference";
const dispatcher = createMemoryDispatcher();
const repository = createPaymentRepository();
const databaseUrl = process.env.DATABASE_URL;
```

- `runtimeName` is a string variable. Use a stable label such as `"signal-reference"` for this repo, `"signal-local"` for local development, or `"signal-http"` for an HTTP server.
- `dispatcher` is a variable that points to the event publisher. Common choices are `createMemoryDispatcher()` for local tests, a Kafka dispatcher for a broker-backed app, or another adapter that matches your transport.
- `repository` is a variable that points to your domain storage layer. In this example it reads and writes payment data, but the same pattern can use a user repository, order repository, or any other domain store.
- `databaseUrl` is a string variable that may be `undefined` until configured. A typical value is `"postgresql://postgres:postgres@localhost:5432/signal"`.

When a callback receives variables, the input is usually a validated payload object and the output is usually a result object, a domain record, or a protocol error.

### 4.1 Minimal

The smallest useful setup is an in-process runtime with one query, one mutation, and one event.

```ts
import { createSignalRuntime, defineMutation, defineQuery } from "@signal/sdk-node";
import { createMemoryIdempotencyStore } from "@signal/runtime";

const runtimeName = "signal-reference";
const dispatcher = createMemoryDispatcher();
const repository = createPaymentRepository();

const runtime = createSignalRuntime({
  // String value: a stable runtime label. Use a name such as "signal-reference" for this repo,
  // "signal-local" for local runs, or "signal-http" for a server process.
  runtimeName,
  // Variable choice: the event dispatcher. Use createMemoryDispatcher() for local demos,
  // a Kafka adapter for a broker-backed deployment, or another transport adapter if you add one.
  dispatcher,
  // Variable choice: the idempotency store. Use createMemoryIdempotencyStore() for tests and
  // local development, or a PostgreSQL-backed store when you need persistent retry handling.
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

### 4.2 Advanced

The advanced setup uses the PostgreSQL idempotency store, the HTTP binding, and the runnable reference server.

```ts
import { createPostgresIdempotencyStore } from "@signal/idempotency-postgres";
import { createSignalRuntime } from "@signal/sdk-node";

const runtimeName = "signal-reference";
const dispatcher = createKafkaDispatcher();
const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/signal";

const runtime = createSignalRuntime({
  // String value: a stable runtime label. Common choices are "signal-reference",
  // "signal-http", or another name that matches the service you are running.
  runtimeName,
  // Variable choice: the dispatcher. Use a Kafka adapter for a broker-backed app,
  // an in-process bus for local runs, or another adapter if your transport differs.
  dispatcher,
  // Variable choice: the idempotency store. Use PostgreSQL when you need persistence
  // across restarts, or an in-memory store for quick local experiments.
  idempotencyStore: createPostgresIdempotencyStore({
    // String value: a PostgreSQL connection string.
    // Example: "postgresql://postgres:postgres@localhost:5432/signal".
    connectionString,
  }),
});
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

Build and run the HTTP reference server with:

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

## Start Reading

- [Introduction](docs/docs/introduction.md)
- [Envelope reference](docs/docs/reference/envelope.md)
- [Quickstart](docs/docs/guides/quickstart.md)
- [RFC-0001: Protocol core](spec/RFC-0001-signal-protocol-core.md)
- [RFC-0002: HTTP binding](spec/RFC-0002-signal-http-binding.md)
- [Reference server runbook](apps/reference-server/README.md)
- [Kafka + PostgreSQL example](packages/examples/kafka-postgresql/README.md)

## Repository Layout

- `spec/` holds the public RFCs.
- `schemas/` holds JSON Schema artifacts for public protocol documents.
- `packages/protocol` holds envelope, naming, result, capability, and error validation.
- `packages/runtime` holds the Node reference runtime.
- `packages/binding-http` holds the HTTP binding.
- `packages/idempotency-postgres` holds the PostgreSQL idempotency store.
- `packages/sdk-node` holds convenience helpers for Node applications.
- `packages/examples` holds runnable example flows.
- `apps/reference-server` holds the runnable HTTP reference server.
- `docs/` holds the Docusaurus documentation site.
- `landing/` holds the public homepage.
