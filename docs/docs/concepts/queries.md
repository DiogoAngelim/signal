---
title: Queries
---

# Queries

## What It Is

A query is a read-only operation. It returns information that already exists without changing durable state and without emitting domain events.

## Rules

- Queries MUST be safe to retry.
- Queries MUST use a versioned name.
- Queries MUST return a result that matches the declared result schema.
- Queries MUST NOT change durable state.
- Queries MUST NOT emit domain events.
- Queries MAY use transient local cache, as long as the external behavior remains read-only.

## How It Is Used

Define a query with an input schema and a result schema, register it on the runtime, and execute it through an HTTP binding or through the in-process binding.

Example:

```ts
runtime.registerQuery(
  defineQuery({
    name: "payment.status.v1",
    kind: "query",
    inputSchema: paymentStatusInputSchema,
    resultSchema: paymentStatusResultSchema,
    handler: async (input) => repository.getPayment(input.paymentId),
  })
);
```

The handler receives validated input. The return value must satisfy the result schema before the runtime sends it back.

## What To Avoid

- hidden writes inside a query handler
- event emission from query handlers
- names without a version suffix
- using a query for behavior that changes domain state

## Example

`payment.status.v1` reads the current payment state. If the record is missing, the implementation can return a structured `NOT_FOUND` error. The important point is that the query remains a query: it does not create a payment, change a balance, or publish a domain event.
