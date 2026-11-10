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
delivery. Signal provides createPostgresConsumerInbox from
`@signal/idempotency-postgres` as a transactional consumer-side deduplication
adapter. Apply `0008_transactional_consumer_inbox.sql` and wrap the consumer's
database writes in `processOnce({ consumerName, messageId }, handler)`. The
inbox identity and the handler's PostgreSQL side effects commit or roll back
in one transaction. All replicas of a consumer must use the same consumerName
and messageId namespace. If a consumer performs its side effect and the dispatcher crashes
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


## Transactional consumer inbox

The inbox adapter prevents duplicate deliveries from repeating database
side-effects when the inbox claim and those side-effects share the same
PostgreSQL transaction. If the handler throws, the inbox claim rolls back and
the message can be retried. If a later delivery finds the same consumerName
and messageId, the handler is skipped and the outcome is `duplicate`.

This does not make third-party HTTP calls, emails, payments, or other external
side-effects atomic with PostgreSQL. Use the destination's idempotency key or
a durable command/outbox plus reconciliation protocol for those actions.
Inbox retention must exceed the maximum broker redelivery and replay horizon;
deleting inbox rows too early re-enables duplicate processing. Apply retention
only under an explicit, reviewed policy.
