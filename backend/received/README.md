# @digelim/02.received

Intake module for the Signal lifecycle. It accepts raw or semi-structured envelopes and returns a `received` lifecycle state.

## What it does

- Applies minimal structural checks
- Normalizes protocol metadata when allowed
- Stamps `lifecycle: "received"` and `receivedAt`
- Persists locally when a store is provided

## What it does not do

- Validate domain payload semantics
- Enforce business rules
- Perform side effects

## Lifecycle position

received -> validated -> enriched -> evaluated -> decided -> executed -> completed

## Example usage

```ts
import { receiveEnvelope } from "@digelim/02.received";
import { InMemorySignalStore } from "@digelim/13.store";

const store = new InMemorySignalStore();
const result = await receiveEnvelope(
  {
    kind: "query",
    name: "portfolio.evaluate.v1",
    payload: { accountId: "acc-1" },
  },
  { store },
);

if (!result.ok) {
  console.error(result.error);
} else {
  console.log(result.value.lifecycle); // "received"
}
```

## Integration notes

- Use this module before `@digelim/03.validated`.
- If a store is provided, records are appended locally before any sync work.
