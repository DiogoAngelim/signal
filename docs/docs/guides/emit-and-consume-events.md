---
title: Emit and Consume Events
---

# Emit and Consume Events

## Steps

1. Emit an event from a mutation.
2. Include correlation and causation identifiers.
3. Subscribe with a replay-safe consumer.
4. Ignore duplicates.

## Example

Use `payment.captured.v1` as an immutable fact that a payment was captured.
