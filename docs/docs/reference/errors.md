---
title: Errors
---

# Errors

## Shape

Signal uses a structured error envelope with:

- `code`
- `message`
- `retryable`
- `details`

## Notes

- `code` MUST be machine-readable.
- `retryable` SHOULD be set when the caller may safely try again.
- HTTP status codes are a binding detail, not the protocol itself.
