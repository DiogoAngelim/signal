---
title: Mutations
---

# Mutations

## What It Is

A mutation is an explicit state-changing command. It may emit events.

## Rules

- Mutations MUST declare an idempotency mode.
- Mutations with `required` idempotency MUST reject requests without an idempotency key.
- Same key plus same normalized payload MUST resolve to the same logical result.
- Same key plus different normalized payload MUST conflict.

## How It Is Used

Register the mutation with input and result schemas, then pass the idempotency key through the request context.

## What To Avoid

- silent retries without idempotency
- write logic hidden inside queries
- unversioned command names
