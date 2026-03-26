---
title: Envelope
---

# Envelope

## What It Is

Every Signal message uses a standard envelope. The envelope is the outer contract for queries, mutations, and events.

The envelope separates the protocol contract from transport details. HTTP, Kafka, in-process dispatch, and any future binding all carry the same public shape.

## Shape

Fields in v1:

- `protocol`: protocol version
- `kind`: `query`, `mutation`, or `event`
- `name`: versioned operation name
- `messageId`: unique message identifier
- `timestamp`: execution or creation time in ISO-8601
- `payload`: operation data
- `source`: optional origin metadata
- `context`: optional correlation and causation metadata
- `delivery`: optional delivery metadata
- `auth`: optional security context
- `meta`: optional extension metadata

Required in v1:

- `protocol`
- `kind`
- `name`
- `messageId`
- `timestamp`
- `payload`

## Example

```json
{
  "protocol": "signal.v1",
  "kind": "mutation",
  "name": "payment.capture.v1",
  "messageId": "7c1f2a6f-7ec1-4f89-8e0f-9d0f4a97c9a1",
  "timestamp": "2026-03-25T12:00:00.000Z",
  "context": {
    "correlationId": "corr-123",
    "causationId": "cmd-456"
  },
  "payload": {
    "paymentId": "pay_1001",
    "amount": 120,
    "currency": "USD"
  }
}
```

## Rules

- `protocol` MUST be `signal.v1`
- `kind` MUST be a supported message kind
- `name` MUST follow `<domain>.<action>.<version>`
- `messageId` MUST uniquely identify the message
- `timestamp` MUST represent when the message was created
- `payload` MUST satisfy the schema for that operation
- `context.correlationId` SHOULD track a flow
- `context.causationId` SHOULD point to the message that caused the current one
- `traceId` MAY be supplied by upstream tracing systems

## How It Is Used

The runtime validates the envelope before it executes a handler. A binding can serialize the envelope over HTTP, a broker, an outbox, or any other transport without changing the protocol itself.

TypeScript example:

```ts
const envelope = createSignalEnvelope({
  kind: "mutation",
  name: "payment.capture.v1",
  payload: {
    paymentId: "pay_1001",
    amount: 120,
    currency: "USD",
  },
});
```

## What To Avoid

- creating public messages outside the envelope
- using `timestamp` as a unique identifier
- inventing transport-specific envelope shapes for public operations
- omitting `messageId`

## Notes

- `context.correlationId` tracks a flow.
- `context.causationId` points to the message that caused the current one.
- `delivery.attempt` can be used to observe retries.
- `auth` is intentionally opaque to the protocol; the binding or application owns its exact shape.
