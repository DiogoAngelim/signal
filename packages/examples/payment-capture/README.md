# Payment Capture Example

This example models a single payment capture flow.

## Operations

- `payment.status.v1` query
- `payment.capture.v1` mutation
- `payment.captured.v1` event

## Retry Behavior

- The mutation requires an idempotency key.
- Repeating the same request returns the stored result.
- Reusing the key with different payload data conflicts.
- The `payment.captured.v1` subscriber tolerates duplicate deliveries.

## Event Flow

1. `payment.capture.v1` changes the payment state.
2. The mutation emits `payment.captured.v1`.
3. The subscriber records the event message id once.
