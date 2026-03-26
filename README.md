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

```ts
const runtimeName = "signal-reference";
const dispatcher = createMemoryDispatcher();
const repository = createPaymentRepository();
const databaseUrl = process.env.DATABASE_URL;
```

- `runtimeName` is a string variable.
- `dispatcher` is an object variable that can publish events.
- `repository` is an object variable that reads and writes domain state.
- `databaseUrl` is a string variable that may be `undefined` until configured.

When a callback receives variables, the callback input is usually a validated payload and the callback output is usually a result object.

### 4.1 Minimal

The smallest useful setup is an in-process runtime with one query, one mutation, and one event.

```ts
import { createSignalRuntime, defineMutation, defineQuery } from "@signal/sdk-node";
import { createMemoryIdempotencyStore } from "@signal/runtime";

const runtimeName = "signal-reference";
const dispatcher = createMemoryDispatcher();
const repository = createPaymentRepository();

const runtime = createSignalRuntime({
  // String: any stable runtime label, for example "signal-reference" or "signal-local".
  runtimeName,
  // Variable: a dispatcher implementation, for example a memory dispatcher or Kafka adapter.
  dispatcher,
  // Variable value: memory store for local runs and tests, or a PostgreSQL-backed store in advanced setups.
  idempotencyStore: createMemoryIdempotencyStore(),
});

runtime.registerQuery(
  defineQuery({
    // String: protocol name in the form <domain>.<action>.<version>.
    // Example possibilities: "payment.status.v1", "user.profile.v1".
    name: "payment.status.v1",
    // Variable value: the operation kind must be "query" for read-only reads; if the operation changes state, use "mutation"; if it publishes an immutable fact, use "event".
    kind: "query",
    inputSchema: paymentStatusInputSchema,
    resultSchema: paymentStatusResultSchema,
    // Callback input: a validated query payload.
    // Callback output: the query result, or a protocol error if the record is missing.
    handler: async (input) => repository.getPayment(input.paymentId),
  })
);

runtime.registerMutation(
  defineMutation({
    // String: protocol name in the same <domain>.<action>.<version> form.
    // Example possibilities: "payment.capture.v1", "order.cancel.v1".
    name: "payment.capture.v1",
    // Variable value: the operation kind must be "mutation" for state-changing commands; other supported kind values are "query" and "event".
    kind: "mutation",
    // Variable value: "required" means the caller must send an idempotency key; the other idempotency modes are "optional" and "none".
    idempotency: "required",
    inputSchema: paymentCaptureInputSchema,
    resultSchema: paymentStatusResultSchema,
    // Callback input: validated mutation payload plus an execution context.
    // Callback output: the stored mutation result, plus any emitted events through context.emit().
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
  // String: any stable runtime label, for example "signal-reference" or "signal-http".
  runtimeName,
  // Variable: the dispatcher can be a Kafka adapter, an in-process bus, or another binding.
  dispatcher,
  // Variable value: PostgreSQL-backed idempotency store for retry-safe mutations, or an in-memory store for local runs.
  idempotencyStore: createPostgresIdempotencyStore({
    // String: a PostgreSQL connection string, for example "postgresql://postgres:postgres@localhost:5432/signal".
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
