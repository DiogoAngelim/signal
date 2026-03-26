---
title: Quickstart
---

# Quickstart

This guide shows the minimum path to a running Signal reference server, capability discovery, and an idempotent mutation call.

## Prerequisites

- Node.js 20 or newer
- `pnpm`
- PostgreSQL if you want durable idempotency
- Kafka if you want to run the Kafka + PostgreSQL example

## 1. Install dependencies

```bash
pnpm install
```

## 2. Build the workspace

```bash
pnpm build
```

## 3. Start the reference server

```bash
pnpm --filter @signal/reference-server start
```

If `DATABASE_URL` is set, the server uses PostgreSQL for idempotency. If it is not set, the server falls back to the in-memory store so you can still exercise the flow locally.

## 4. Inspect capabilities

```bash
curl http://127.0.0.1:3001/signal/capabilities
```

The capability document tells you which queries, mutations, events, and bindings the server exposes.

## 5. Execute a mutation

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "paymentId": "pay_1001",
      "amount": 120,
      "currency": "USD"
    },
    "idempotencyKey": "capture-pay_1001-001",
    "context": {
      "correlationId": "corr-1001"
    }
  }'
```

## 6. Execute the same mutation again

Send the same request with the same idempotency key. The runtime should return the same logical result, not create a second capture.

## 7. Execute a query

```bash
curl -X POST http://127.0.0.1:3001/signal/query/payment.status.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "paymentId": "pay_1001"
    }
  }'
```

## What to observe

- the mutation must be explicit about its idempotency key
- the query must not change state
- the server must return a structured result envelope
- emitted events should be visible to registered subscribers

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/payment.capture.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"paymentId":"pay_1001","amount":120,"currency":"USD"},"idempotencyKey":"capture-pay_1001-001"}'
```
