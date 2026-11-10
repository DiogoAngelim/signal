# Signal PostgreSQL transactional outbox operations

## Required adapter

For idempotent mutations that emit events, use
`createPostgresTransactionalStore` from `@signal/idempotency-postgres`.
The older `createPostgresIdempotencyStore` persists idempotency records only
and is not sufficient for mutations that emit events.

Apply the PostgreSQL adapter migrations in numeric order before enabling the related capabilities:

1. `0000_initial.sql`
2. `0001_transactional_outbox.sql`
3. `0002_outbox_lease_fencing.sql`
4. `0003_idempotency_reservation_leases.sql`
5. `0004_distributed_circuit_breakers.sql`
6. `0005_append_only_audit_ledger.sql`
7. `0006_immutable_replay_evidence.sql`

The runtime refuses to dispatch emitted events from an idempotent mutation
unless the injected storage adapter implements both transactional completion
and the outbox lease contract. This prevents a non-atomic adapter from
silently presenting itself as durable.

## Runtime wiring

```ts
import { createPostgresTransactionalStore } from "@signal/idempotency-postgres";
import { createSignalRuntime } from "@signal/sdk-node";

const storagePort = createPostgresTransactionalStore({
  connectionString: process.env.DATABASE_URL!,
  maxConnections: 10,
});

const runtime = createSignalRuntime({
  storagePort,
  // Supply the application's EventPort and other required options.
});
```

Close the adapter during graceful shutdown with `await storagePort.close()`.

## Delivery worker

The mutation path makes one bounded best-effort dispatch pass after commit.
A separate long-running worker must continuously call
`dispatchOutboxBatch(storagePort, eventPort, { limit, leaseMs })` and sleep
between polls according to the host scheduler. The worker must be deployed
independently of request lifetimes; a serverless request finishing is not a
durable worker guarantee.

The dispatcher:
- Claims rows with PostgreSQL `FOR UPDATE SKIP LOCKED`.
- Uses expiring worker leases so abandoned claims become eligible again.
- Acknowledges only when the worker still owns the lease.
- Retries failures with capped exponential backoff.
- Moves records to `dead-letter` after the configured attempt limit.

Read `await storagePort.getStats()` for pending, processing, delivered,
dead-lettered, and oldest-pending-age metrics. Export these values to a durable
monitoring system and combine them with delivery latency and retry rate from
the worker. Alert on sustained queue age or any dead letters. Define an
operator-owned replay procedure before enabling delivery.

## Delivery semantics

The outbox provides **durable at-least-once delivery**, not exactly-once
delivery. If a consumer performs its side effect and the dispatcher crashes
before acknowledging the event, the event is delivered again. Every consumer
that performs a non-idempotent side effect must deduplicate using the stable
`envelope.messageId` in the same transaction as its own side effect.

Do not mark a message delivered before the consumer finishes. Do not delete
dead-lettered records automatically. Preserve the envelope and failure
history for investigation and controlled redrive.

## Operational limits

- A lease must exceed the expected dispatch duration or be renewed by a
  future lease-extension capability; long handlers can otherwise be reclaimed.
- The worker identifier must be unique per active worker process.
- Database availability is required to claim and acknowledge messages.
- The outbox shares the database transaction boundary with idempotency state;
  it does not atomically include arbitrary external side effects performed
  inside a mutation handler.
- Do not run schema migrations automatically from request handlers.
