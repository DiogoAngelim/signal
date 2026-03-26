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

## How It Is Used

Use `required` for capture, release, onboarding, or any mutation that may be retried by clients or infrastructure.

## What To Avoid

- reusing a key for different input
- storing only the key without the fingerprint
- assuming the transport prevents duplicate requests
