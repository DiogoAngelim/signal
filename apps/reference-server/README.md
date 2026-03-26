# Reference Server

This app wires the Signal Node reference runtime to Fastify.

## What It Demonstrates

- two queries
- three mutations
- three events
- capability retrieval
- HTTP query and mutation execution

## Run Locally

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

If `DATABASE_URL` is set, the server uses the PostgreSQL-backed idempotency store. If it is not set, the server falls back to the in-memory idempotency store so the flow can still be exercised locally.

## Try A Mutation

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"paymentId":"pay_1001","amount":120,"currency":"USD"},"idempotencyKey":"capture-pay_1001-001"}'
```
