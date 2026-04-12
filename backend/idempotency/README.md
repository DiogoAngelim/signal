# @digelim/14.idempotency

Idempotency key utilities for duplicate-safe processing and sync retries.

## What it does

- Defines idempotency key semantics
- Stores and looks up idempotency records
- Makes replays and at-least-once delivery safe

## What it does not do

- Persist lifecycle records
- Deliver messages externally
- Enforce business validation rules

## Public API

- `IdempotencyStore`
- `IdempotencyRecord`
- `createIdempotencyKey()`
- `isDuplicate()`
- `rememberIdempotency()`
- `InMemoryIdempotencyStore`

## Key rules

- Prefer `meta.idempotencyKey` when provided.
- Queries return `null` (no idempotency key).
- Mutations and events fall back to `messageId`.

## Example

```ts
import {
  InMemoryIdempotencyStore,
  createIdempotencyKey,
  rememberIdempotency,
} from "@digelim/14.idempotency";

const store = new InMemoryIdempotencyStore();
const key = createIdempotencyKey({
  kind: "mutation",
  messageId: "message-1",
  meta: { idempotencyKey: "deposit-1" },
});

if (key) {
  await rememberIdempotency(store, {
    key,
    messageId: "message-1",
    traceId: "trace-1",
    createdAt: new Date().toISOString(),
  });
}
```
