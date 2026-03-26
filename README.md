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

## 4. Using

### 4.1 Minimal

The smallest useful setup is an in-process runtime with one query, one mutation, and one event.

```ts
import { createSignalRuntime, defineMutation, defineQuery } from "@signal/sdk-node";
import { createMemoryIdempotencyStore } from "@signal/runtime";

const runtime = createSignalRuntime({
  runtimeName: "signal-reference",
  dispatcher,
  idempotencyStore: createMemoryIdempotencyStore(),
});

runtime.registerQuery(
  defineQuery({
    name: "payment.status.v1",
    kind: "query",
    inputSchema: paymentStatusInputSchema,
    resultSchema: paymentStatusResultSchema,
    handler: async (input) => repository.getPayment(input.paymentId),
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

const runtime = createSignalRuntime({
  runtimeName: "signal-reference",
  dispatcher,
  idempotencyStore: createPostgresIdempotencyStore({
    connectionString: process.env.DATABASE_URL!,
  }),
});
```

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
