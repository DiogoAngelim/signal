---
title: Errors
---

# Errors

Signal errors are structured.

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "category": "validation",
    "message": "Invalid Signal HTTP request body",
    "retryable": false
  }
}
```

Common codes:

- `VALIDATION_ERROR`: the payload or envelope was invalid
- `NOT_FOUND`: the target resource does not exist
- `BUSINESS_REJECTION`: the handler rejected the request
- `IDEMPOTENCY_CONFLICT`: the same key was reused with different input
- `DEADLINE_EXCEEDED`: the request deadline passed
- `UNSUPPORTED_OPERATION`: no registered operation matches the name
- `INTERNAL_ERROR`: something unexpected failed

Treat `retryable` as a hint. Your app still decides retry policy, timeouts, and
user messaging.

## What You Learned

Signal failures are predictable objects, not mystery exceptions.

## Next Recommended Page

[Repository Map](../contribute/repository-map.md)

Estimated reading time: 3 minutes.
