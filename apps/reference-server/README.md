# Reference Server

This app wires the Signal Node reference runtime to Fastify and exposes the protocol over HTTP.

## What It Demonstrates

- two queries
- three mutations
- three events
- capability retrieval
- HTTP execution for queries and mutations
- PostgreSQL-backed idempotency when `DATABASE_URL` is set
- in-memory fallback for local exploration when `DATABASE_URL` is not set

## What It Is For

The reference server is a runnable example of the contract described in the docs and RFCs. It is useful when you want to:

- inspect the public HTTP surface
- see how idempotency is handled in practice
- verify event emission and replay-safe consumption
- compare the reference implementation with your own runtime

## Run Locally

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

## Environment

- `DATABASE_URL` configures PostgreSQL-backed idempotency and storage
- `SIGNAL_HTTP_PORT` changes the listening port

If `DATABASE_URL` is set, the server uses the PostgreSQL-backed idempotency store. If it is not set, the server falls back to the in-memory idempotency store so the flow can still be exercised locally.

## Try A Mutation

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "paymentId": "pay_1001",
      "amount": 120,
      "currency": "USD"
    },
    "idempotencyKey": "capture-pay_1001-001"
  }'
```

## What To Observe

- the request body contains a `payload`
- the mutation requires an idempotency key
- the response returns a structured Signal result
- repeating the same request returns the same logical outcome
