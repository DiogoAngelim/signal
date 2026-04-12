# @digelim/03.validated

Framework validation module in the Signal lifecycle. It accepts `received` envelopes and enforces protocol and structural rules.

## What it does

- Validates framework fields and operation naming
- Rejects invalid lifecycle transitions
- Stamps `lifecycle: "validated"` and `validatedAt`
- Updates local persistence when a store is provided

## What it does not do

- Execute business logic
- Call external systems
- Make policy decisions

## Lifecycle position

received -> validated -> enriched -> evaluated -> decided -> executed -> completed

## Example usage

```ts
import { validateEnvelope } from "@digelim/03.validated";
import { InMemorySignalStore } from "@digelim/13.store";

const store = new InMemorySignalStore();
const result = await validateEnvelope(
  {
    protocol: "signal.v1",
    kind: "query",
    name: "portfolio.evaluate.v1",
    messageId: "message-1",
    timestamp: new Date().toISOString(),
    traceId: "trace-1",
    payload: { accountId: "acc-1" },
    lifecycle: "received",
    receivedAt: new Date().toISOString(),
  },
  { store },
);

if (!result.ok) {
  console.error(result.error, result.issues);
} else {
  console.log(result.value.lifecycle); // "validated"
}
```

## Integration notes

- Use this module immediately after `@digelim/02.received`.
- If validation fails, the stored `received` record is left intact.
