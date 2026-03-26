---
title: HTTP Binding
---

# HTTP Binding

The HTTP binding exposes the same protocol contract through predictable routes. It does not redefine the protocol; it only transports it.

## Routes

- `POST /signal/query/:name` executes a query
- `POST /signal/mutation/:name` executes a mutation
- `GET /signal/capabilities` exposes the capability document

## Request shape

The request body uses a simple shape:

```json
{
  "payload": { "paymentId": "pay_1001" },
  "idempotencyKey": "capture-pay_1001-001",
  "context": {
    "correlationId": "corr-123",
    "causationId": "cmd-456",
    "traceId": "trace-789"
  }
}
```

- `payload` contains the operation input
- `idempotencyKey` matters for mutations
- `context` carries correlation, causation, trace, and metadata

## Example

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

## How to use it

In the reference runtime, the HTTP server receives the request, validates the payload, calls `runtime.query()` or `runtime.mutation()`, and returns a structured result.

That means the HTTP binding:

- does not define the protocol contract
- does not invent new semantics for query or mutation
- does not change the result model

## Rules

- the path must select the operation
- the body must carry the validated payload
- the response must preserve `ok`, `result`, or `error`
- HTTP status is a binding detail, not the primary contract

## What to avoid

- mixing HTTP authentication with the envelope format
- coupling the protocol semantics to status codes
- hiding a mutation behind a read route
- accepting requests without validating the payload

## Expected result

The HTTP binding lets you integrate external clients without giving up the protocol. If the system exposes `GET /signal/capabilities`, a consumer can discover the surface before it calls any operation.

## Avoid

- embedding transport rules into the protocol
- depending on HTTP headers for the contract itself
