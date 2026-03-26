---
title: Order and Replay
---

# Order and Replay

Signal treats replay and duplicate delivery as normal conditions.

## Rules

- consumers must not assume exactly-once delivery
- consumers must not assume global event ordering
- `messageId` should be used for dedupe when needed
- `correlationId` and `causationId` should be used for lineage
- replayed logical mutation results should surface replay metadata explicitly
