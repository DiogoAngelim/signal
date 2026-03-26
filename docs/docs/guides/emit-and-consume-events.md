---
title: Emit and Consume Events
---

# Emit and Consume Events

Events are immutable facts. This guide shows how to publish them from a mutation and how to consume them safely when replay or duplication happens.

## What this guide covers

You will:

1. register an event
2. emit the event from a mutation
3. subscribe with a replay-safe consumer
4. avoid duplicate side effects

## Example

```ts
import { defineEvent, defineMutation } from "@signal/sdk-node";
import { createReplaySafeSubscriber } from "@signal/runtime";

runtime.registerEvent(
  defineEvent({
    name: "payment.captured.v1",
    kind: "event",
    inputSchema: paymentCapturedEventSchema,
    resultSchema: paymentCapturedEventSchema,
    handler: (payload) => payload,
  })
);

runtime.registerMutation(
  defineMutation({
    name: "payment.capture.v1",
    kind: "mutation",
    idempotency: "required",
    inputSchema: paymentCaptureInputSchema,
    resultSchema: paymentStatusResultSchema,
    handler: async (input, context) => {
      const captured = await repository.capturePayment(input);

      await context.emit("payment.captured.v1", {
        paymentId: captured.paymentId,
        amount: captured.amount,
        currency: captured.currency,
        capturedAt: captured.capturedAt ?? new Date().toISOString(),
      });

      return captured;
    },
  })
);

runtime.subscribe(
  "payment.captured.v1",
  createReplaySafeSubscriber(async (envelope) => {
    await ledger.append(envelope.messageId, envelope.payload);
  })
);
```

## Rules

- events MUST be treated as immutable facts
- consumers MUST tolerate duplicates
- consumers MUST be able to receive the same `messageId` more than once without duplicating the final effect
- the protocol does not define a global total order
- `correlationId` and `causationId` SHOULD be used when a flow needs to be traceable

## How to think about the consumer

The consumer should not depend on exactly-once delivery. It should be idempotent on its own or persist the fact that it already processed a given `messageId`.

That pattern matters for projections, third-party integrations, audit logs, and accounting sinks.

## What to avoid

- treating events as commands
- assuming exactly-once delivery
- depending on global ordering across streams
- reprocessing an event without protection against duplication

## Expected result

An event published by a mutation can be replayed later without creating inconsistency. The subscriber handler should produce the same logical effect when the event appears again.
