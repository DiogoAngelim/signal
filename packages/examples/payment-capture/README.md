# Payment Capture Example

This example models a single payment capture flow from query to mutation to replay-safe event consumption.

## What It Demonstrates

- a read-only query for payment status
- an idempotent mutation for payment capture
- a published `payment.captured.v1` event
- a replay-safe subscriber that deduplicates by `messageId`

## Operations

- `payment.status.v1` query
- `payment.capture.v1` mutation
- `payment.captured.v1` event

## Retry Behavior

- the mutation requires an idempotency key
- repeating the same request returns the stored logical result
- reusing the key with different payload data conflicts
- the `payment.captured.v1` subscriber tolerates duplicate deliveries

## Event Flow

1. `payment.capture.v1` changes the payment state
2. the mutation emits `payment.captured.v1`
3. the subscriber records the event `messageId` once

## Where The Example Fits

Use this example if you want to see:

- how a query and mutation pair model a real domain flow
- how retry safety works with idempotency
- how event emission and replay-safe consumption fit together

See also:

- `docs/docs/examples/payment-capture-flow.md`
- `packages/examples/test/e2e.test.ts`
