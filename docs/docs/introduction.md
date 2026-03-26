---
title: Signal Protocol v1
---

# Signal Protocol v1

Signal is a transport-independent application protocol for queries, mutations, and events.

Signal defines how messages are structured and processed:

- envelope format
- naming rules
- response template
- idempotence behavior
- forms of integration through bindings

The Node.js implementation serves as a reference, not a limitation.

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

This avoids ambiguity and allows for evolution without breaking existing consumers.

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

The runtime uses Zod schemas for validation in code. The public schema artifacts in [`schemas/`](https://github.com/DiogoAngelim/signal/tree/main/schemas/) use JSON Schema Draft 2020-12.

## Idempotent Mutations

Each mutation declares its behavior:

- `required` -> must be idempotent and must receive an idempotency key
- `optional` -> can be idempotent if the caller provides a key
- `none` -> does not guarantee idempotence

Retries are no exception. They are part of the flow.

Same key + same normalized payload -> same logical result.

Same key + different payload -> conflict.

See [Idempotency](./concepts/idempotency.md) for the storage and replay rules.

## Replay-Safe Events

Consumers must:

- tolerate duplication
- not assume global order
- process events resiliently

The system is designed for the real world, not ideal conditions.

See [Events](./concepts/events.md) and [Order and Replay](./concepts/order-and-replay.md).

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

This is ideal for testing and direct execution.

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

This allows independent implementation of each part.

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

Run the full implementation with:

```bash
pnpm --filter @signal/reference-server dev
```

The server demonstrates:

- two queries
- three mutations
- three events
- capability retrieval
- HTTP query and mutation execution

## Central Principle

The protocol defines the behavior.
The implementation just follows the contract.

## Next Step

Read the protocol, run it locally, and compare it to your own implementation.
