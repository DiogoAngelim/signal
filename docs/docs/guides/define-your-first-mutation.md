---
title: Define Your First Mutation
---

# Define Your First Mutation

This guide shows the complete mutation flow: declare idempotency, change state, emit an event, and survive retries.

## What this guide covers

You will:

1. define the input schema
2. define the result schema
3. choose the idempotency mode
4. emit a domain event
5. execute the same mutation twice without duplicating the effect

## Example

```ts
import { z } from "zod";
import { createSignalRuntime, defineMutation } from "@signal/sdk-node";

const paymentCaptureInputSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
});

const paymentStatusResultSchema = z.object({
  paymentId: z.string().min(1),
  status: z.enum(["authorized", "captured"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
});

const runtime = createSignalRuntime();

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
```

## Idempotency modes

- `required`: the idempotency key is mandatory
- `optional`: the key is allowed but not required
- `none`: the runtime does not deduplicate by key

With `required`, the request must fail before execution if the key is missing.

## How retries work

If the same key returns with the same normalized payload, the runtime should return the same logical result. If the same key returns with different data, the runtime should return conflict instead of applying the mutation again.

This applies to client retries, gateway retries, proxy retries, scheduled retries, and infrastructure retries.

## How to think about the handler

The handler receives validated input and an execution context. The context lets you:

- read request metadata
- emit events through `context.emit()`
- propagate correlation and causation identifiers

## What to avoid

- using a mutation without idempotency when retries are likely
- publishing the event before the state update is complete
- hiding writes behind a query
- changing the payload without changing the version

## Expected result

A well-implemented mutation returns `ok: true` and, when sent again with the same key, remains logically consistent. The emitted event must also be replay-safe.
