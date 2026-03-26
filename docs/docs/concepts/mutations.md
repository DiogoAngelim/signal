---
title: Mutations
---

# Mutations

## What It Is

A mutation is an explicit state-changing command. It may also emit events after the state change is known.

## Rules

- Mutations MUST declare an idempotency mode.
- Mutations with `required` idempotency MUST reject requests without an idempotency key.
- Same key plus same normalized payload MUST resolve to the same logical result.
- Same key plus different normalized payload MUST conflict.
- Mutations MAY emit events after the state change is known.
- Mutations MUST use versioned names.

## How It Is Used

Register the mutation with input and result schemas, pass the idempotency key through the request context, and emit events through `context.emit()`.

Example:

```ts
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

## What To Avoid

- silent retries without idempotency
- write logic hidden inside queries
- unversioned command names
- changing the payload format without a new version
- emitting events before the state change is known

## Example

`payment.capture.v1` receives an authorized payment, marks it as captured, and publishes `payment.captured.v1`. If the client sends the same request again with the same idempotency key, the system should return the same logical result, not capture the payment a second time.
