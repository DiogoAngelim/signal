---
title: Idempotency
---

# Idempotency

## What It Is

Idempotency lets a mutation reuse the same logical result when the same request is retried.

## Rules

- `required`, `optional`, and `none` are the only supported modes.
- The idempotency key MUST be combined with a normalized payload fingerprint.
- A payload mismatch for an existing key MUST return conflict.
- Stores MUST persist idempotency records durably when the runtime requires retry safety.
- The store MAY keep the first successful result, the first failure, and the `messageId` used to complete the request.
- The record SHOULD be keyed by `operationName + idempotencyKey`.

## How It Is Used

Use `required` for capture, release, onboarding, or any mutation that may be retried by clients or infrastructure.

Flow:

1. the runtime validates the input
2. the runtime reserves `operationName + idempotencyKey`
3. the runtime fingerprints the normalized payload
4. the runtime replays the stored result when the same key and same fingerprint appear again
5. the runtime returns conflict when the same key is reused with different input

Example storage shape in PostgreSQL:

- table: `signal_idempotency_records`
- columns: `operation_name`, `idempotency_key`, `payload_fingerprint`, `status`, `result`, `error`, `message_id`
- unique index: `operation_name + idempotency_key`

## What To Avoid

- reusing a key for different input
- storing only the key without the fingerprint
- assuming the transport prevents duplicate requests
- treating `optional` as if it were the same as `required`

## Modes

- `required`: the caller must send a key
- `optional`: the caller may send a key and the runtime may use it
- `none`: the mutation does not provide key-based deduplication

## Example

If `payment.capture.v1` receives the same idempotency key twice with the same payload, the second call should return the same logical result. If the second call keeps the key but changes `amount` or `currency`, the runtime should return conflict instead of capturing the payment again.
