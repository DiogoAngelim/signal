# Kafka + PostgreSQL Example

This example shows a Signal runtime that writes payment state in PostgreSQL, publishes `payment.captured.v1` to Kafka, and records a replay-safe projection from Kafka back into PostgreSQL.

## What It Demonstrates

- `payment.status.v1` query
- `payment.capture-log.v1` query
- `payment.capture.v1` mutation
- `payment.captured.v1` event
- PostgreSQL-backed idempotency through `@signal/idempotency-postgres`
- Kafka event publishing and consuming
- replay-safe projection handling from Kafka back into PostgreSQL

## Required Services

- PostgreSQL
- Kafka

## Environment

Use `DATABASE_URL` for PostgreSQL and `KAFKA_BROKERS` for Kafka brokers.

Example:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/signal
KAFKA_BROKERS=localhost:9092
```

Optional variables:

- `KAFKA_TOPIC`
- `KAFKA_CLIENT_ID`
- `KAFKA_GROUP_ID`

## Run

```bash
pnpm --filter @signal/examples build
pnpm --filter @signal/examples kafka-postgresql
```

## Retry Behavior

- `payment.capture.v1` requires an idempotency key
- reusing the same key with the same payload returns the same logical result
- reusing the same key with a different payload conflicts
- the Kafka projection stores `messageId` values in PostgreSQL so duplicate deliveries are ignored

## Event Flow

1. the runtime captures the payment in PostgreSQL
2. the mutation publishes `payment.captured.v1`
3. Kafka delivers the event to the consumer
4. the consumer writes a replay-safe capture log entry
5. duplicate deliveries are ignored by the projection

See also:

- `docs/docs/examples/payment-capture-flow.md`
- `apps/reference-server/`
