---
title: Order and Replay
---

# Order and Replay

## What It Is

Signal separates execution order from delivery assumptions. The protocol models replay, duplication, and delayed delivery as normal cases, not edge cases.

## Rules

- A mutation MAY emit several events in order.
- Consumers MUST tolerate replay and duplicates.
- The protocol does not require a stable global event order.
- `messageId` SHOULD be used for deduplication when the consumer needs it.
- `correlationId` and `causationId` SHOULD be used to rebuild a flow.
- `traceId` MAY be carried through when upstream tracing is present.

## How It Is Used

Use message identifiers, correlation identifiers, and causation identifiers to reconstruct a flow without depending on a single shared sequence.

Practical strategy:

1. treat each event as potentially duplicated
2. make projections idempotent
3. store the last processed message when it helps the projection
4. use the payload plus `messageId` to decide whether the effect has already been applied

Example:

`payment.capture.v1` may emit `payment.captured.v1` and then `ledger.entry.created.v1`. A consumer should still work if those events arrive again, arrive later than expected, or arrive in a different relative order from another stream.

## What To Avoid

- cross-stream ordering assumptions
- consumers that assume a single delivery
- writing logic that only works once
- using `timestamp` as if it guaranteed causal order
