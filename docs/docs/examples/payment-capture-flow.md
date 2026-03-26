---
title: Payment Capture Flow
---

# Payment Capture Flow

This example shows a common commerce flow: read the payment, capture it once, publish an event, and survive retries without duplicating the effect.

## Operations involved

- `payment.status.v1`: query that reads the current payment state
- `payment.capture.v1`: mutation that changes the payment state to captured
- `payment.captured.v1`: event that records the fact that the payment was captured

## Event flow

1. the client reads the payment with `payment.status.v1`
2. the client sends `payment.capture.v1` with an idempotency key
3. the runtime validates the payload and reserves the idempotency key
4. the repository updates the payment state to `captured`
5. the handler emits `payment.captured.v1`
6. a replay-safe subscriber records the projection or ledger entry

## Expected retry behavior

- same key + same payload -> same logical result
- same key + different payload -> conflict
- event delivery more than once -> the consumer must not duplicate the effect

## Example request

```json
{
  "payload": {
    "paymentId": "pay_1001",
    "amount": 120,
    "currency": "USD"
  },
  "idempotencyKey": "capture-pay_1001-001"
}
```

## What to observe in the code

- the schema validates `paymentId`, `amount`, and `currency`
- the mutation handler emits the event only after the state change is known
- the subscriber uses replay-safe handling
- the second execution should return a result that is logically consistent with the first one

## What to avoid

- capturing a payment without idempotency
- emitting the event before the state update
- updating a projection without deduplication

## Where it lives in the repository

- [`packages/examples/payment-capture/`](https://github.com/DiogoAngelim/signal/tree/main/packages/examples/payment-capture/)
- [`packages/examples/test/e2e.test.ts`](https://github.com/DiogoAngelim/signal/tree/main/packages/examples/test/e2e.test.ts)
