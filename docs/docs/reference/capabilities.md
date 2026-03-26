---
title: Capabilities
---

# Capabilities

## What It Is

Capability documents list the runtime surface. They tell consumers exactly which operations are available and which bindings are exposed.

## Shape

A capability document typically includes:

- supported queries
- supported mutations
- published events
- subscribed events
- bindings
- schema ids when they exist

Example:

```json
{
  "protocol": "signal.v1",
  "version": "v1",
  "queries": [
    {
      "name": "payment.status.v1",
      "kind": "query",
      "inputSchemaId": "payment-status-input",
      "resultSchemaId": "payment-status-result"
    }
  ],
  "mutations": [
    {
      "name": "payment.capture.v1",
      "kind": "mutation",
      "inputSchemaId": "payment-capture-input",
      "resultSchemaId": "payment-capture-result",
      "idempotency": "required"
    }
  ],
  "publishedEvents": [
    {
      "name": "payment.captured.v1",
      "kind": "event"
    }
  ],
  "subscribedEvents": [
    {
      "name": "ledger.entry.created.v1",
      "kind": "event"
    }
  ],
  "bindings": {
    "inProcess": true,
    "http": {
      "basePath": "/signal"
    }
  }
}
```

## How It Is Used

Publish capabilities at startup and expose them through a binding. Consumers can inspect the document before sending requests, which makes discovery explicit instead of implicit.

In the reference runtime, capabilities are derived from the registered operations. That keeps the published document aligned with what the runtime actually accepts.

## Rules

- capability documents MUST reflect the runtime surface
- the document SHOULD include schema ids when they exist
- bindings SHOULD be listed separately
- published and subscribed events SHOULD be listed separately

## What To Avoid

- hiding supported operations
- treating capabilities as optional metadata
- coupling capabilities to transport-specific paths
- publishing a document that does not match the runtime
