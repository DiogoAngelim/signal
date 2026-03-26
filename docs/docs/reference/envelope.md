---
title: Envelope
---

# Envelope

## Shape

Every Signal message uses a standard envelope with:

- `protocol`
- `kind`
- `name`
- `messageId`
- `timestamp`
- `source`
- `context`
- `delivery`
- `auth`
- `payload`
- `meta`

At minimum, `protocol`, `kind`, `name`, `messageId`, `timestamp`, and `payload` are required.

## Example

```json
{
  "protocol": "signal.v1",
  "kind": "mutation",
  "name": "payment.capture.v1",
  "messageId": "7c1f2a6f-7ec1-4f89-8e0f-9d0f4a97c9a1",
  "timestamp": "2026-03-25T12:00:00.000Z",
  "payload": {
    "paymentId": "pay_1001",
    "amount": 120,
    "currency": "USD"
  }
}
```

## Notes

- `context.correlationId` tracks a flow.
- `context.causationId` points to the message that caused the current one.
- `traceId` MAY be supplied by upstream tracing systems.
