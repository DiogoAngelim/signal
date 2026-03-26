---
title: Events
---

# Events

## What It Is

An event is an immutable fact. It records that something happened.

## Rules

- Events MUST be replay-safe to consume.
- Consumers MUST tolerate duplicates.
- The protocol does not define a global total order.

## How It Is Used

Emit events from mutations, attach correlation and causation data, and consume them through subscribed handlers.

## What To Avoid

- treating events as commands
- assuming exactly-once delivery
- depending on global ordering
