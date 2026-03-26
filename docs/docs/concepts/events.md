---
title: Events
---

# Events

## What It Is

An event is an immutable fact. It records that something happened and should be consumed as history, not as a command.

## Rules

- Events MUST be replay-safe to consume.
- Consumers MUST tolerate duplicates.
- The protocol does not define a global total order.
- Events SHOULD use past tense when the naming makes the fact clearer, for example `payment.captured.v1`.
- Events SHOULD carry enough metadata to support tracing and causality when needed.

## How It Is Used

Emit events from mutations, attach correlation and causation data, and consume them through subscribed handlers.

Example:

```ts
runtime.registerEvent(
  defineEvent({
    name: "payment.captured.v1",
    kind: "event",
    inputSchema: paymentCapturedEventSchema,
    resultSchema: paymentCapturedEventSchema,
    handler: (payload) => payload,
  })
);

runtime.subscribe(
  "payment.captured.v1",
  createReplaySafeSubscriber(async (envelope) => {
    await ledger.append(envelope.messageId, envelope.payload);
  })
);
```

The replay-safe wrapper ignores the same `messageId` if it appears more than once.

## What To Avoid

- treating events as commands
- assuming exactly-once delivery
- depending on global ordering
- writing consumers that break when the same event arrives again

## Example

`payment.captured.v1` can feed an audit log, a ledger projection, or an integration sink. The consumer should tolerate duplicates, because transport, broker retries, and replay can all re-deliver the same event.
