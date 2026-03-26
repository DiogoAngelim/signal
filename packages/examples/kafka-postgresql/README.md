# Kafka + PostgreSQL Example

This example shows a Signal runtime that writes payment state in PostgreSQL, publishes `payment.captured.v1` to Kafka, and records a replay-safe projection from Kafka back into PostgreSQL.

## What It Includes

- `payment.status.v1` query
- `payment.capture-log.v1` query
- `payment.capture.v1` mutation
- `payment.captured.v1` event
- PostgreSQL-backed idempotency through `@signal/idempotency-postgres`
- Kafka event publishing and consuming

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

## Run

```bash
pnpm --filter @signal/examples build
pnpm --filter @signal/examples kafka-postgresql
```

## Retry Behavior

- `payment.capture.v1` requires an idempotency key.
- Reusing the same key with the same payload returns the same logical result.
- Reusing the same key with a different payload conflicts.
- The Kafka projection stores `messageId` values in PostgreSQL so duplicate deliveries are ignored.
