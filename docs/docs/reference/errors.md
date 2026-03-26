---
title: Errors
---

# Errors

## What It Is

Signal uses a structured error envelope so that both humans and machines can understand failures without relying on free-form text.

## Shape

Fields:

- `code`: machine-readable error code
- `message`: human-readable message
- `retryable`: whether the caller may try again safely
- `details`: structured extra information

## Codes in v1

- `BAD_REQUEST`
- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `IDEMPOTENCY_CONFLICT`
- `INTERNAL_ERROR`
- `RETRYABLE_ERROR`
- `UNSUPPORTED_OPERATION`

## How It Is Used

The result model always uses one of two shapes:

- success: `{ ok: true, result: ... }`
- failure: `{ ok: false, error: ... }`

Example:

```json
{
  "ok": false,
  "error": {
    "code": "IDEMPOTENCY_CONFLICT",
    "message": "The idempotency key was reused with different input",
    "retryable": false
  }
}
```

## Rules

- `code` MUST be stable and machine-readable
- `message` SHOULD explain the problem without external context
- `retryable` SHOULD be set when a new attempt can reasonably succeed
- `details` MAY include validation issues or correlation data
- HTTP status codes are a binding detail, not the protocol itself

## What To Avoid

- returning unstructured errors for public protocol calls
- relying on HTTP status as the primary contract
- hiding idempotency conflict behind a generic failure
- using human-only messages as the only error signal
