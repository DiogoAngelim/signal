---
title: Order and Replay
---

# Order and Replay

## What It Is

Signal separates execution order from delivery assumptions.

## Rules

- A mutation MAY emit several events in order.
- Consumers MUST tolerate replay and duplicates.
- The protocol does not require a stable global event order.

## How It Is Used

Use message identifiers, correlation identifiers, and causation identifiers to reconstruct a flow without depending on a single shared sequence.

## What To Avoid

- cross-stream ordering assumptions
- consumers that assume a single delivery
- writing logic that only works once
