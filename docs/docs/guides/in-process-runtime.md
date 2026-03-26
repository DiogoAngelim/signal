---
title: In-Process Runtime
---

# In-Process Runtime

The in-process runtime executes queries, mutations, and events in the same process as the application. It is the simplest path for tests, local integration, and embedded use.

## When to use it

- unit and integration tests
- local development
- applications that want to execute the protocol without a network hop
- examples and demos

## Example

```ts
import { createSignalRuntime, defineQuery, defineMutation } from "@signal/sdk-node";
import { createInProcessDispatcher, createMemoryIdempotencyStore } from "@signal/runtime";

const runtime = createSignalRuntime({
  runtimeName: "signal-local",
  dispatcher: createInProcessDispatcher(),
  idempotencyStore: createMemoryIdempotencyStore(),
});

runtime.registerQuery(
  defineQuery({
    name: "payment.status.v1",
    kind: "query",
    inputSchema: paymentStatusInputSchema,
    resultSchema: paymentStatusResultSchema,
    handler: async (input) => repository.getPayment(input.paymentId),
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

const status = await runtime.query("payment.status.v1", { paymentId: "pay_1001" });
const capture = await runtime.mutation(
  "payment.capture.v1",
  { paymentId: "pay_1001", amount: 120, currency: "USD" },
  { idempotencyKey: "capture-pay_1001-001" }
);
```

## How to use it

1. create the runtime
2. register queries, mutations, and events
3. call `runtime.query()` and `runtime.mutation()` directly
4. subscribe to events with `runtime.subscribe()`

## Rules

- the in-process runtime SHOULD share the same validations as the HTTP binding
- the dispatcher can be in memory
- the idempotency store can be in memory for tests
- the public semantics stay the same

## What to avoid

- creating special code paths only for local execution
- accepting payloads that differ from the real contract
- hiding contract bugs behind in-process execution

## Expected result

If an operation works in-process, it still has to remain correct when exposed through HTTP or another binding. The local runtime is an execution reference, not an exception to the contract.
