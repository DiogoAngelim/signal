---
title: Idempotency
---

# Idempotency

Signal makes mutation idempotency explicit.

## Modes

- `required`
- `optional`
- `none`

## Rules

- the runtime fingerprints the normalized mutation input
- the idempotency store reserves a key before executing the mutation
- completed logical results may be replayed later
- same key plus different fingerprint is a conflict
- replayed success results include replay metadata

## Example

`post.publish.v1` with the same idempotency key and the same normalized payload returns the same logical publication result. Reusing the key with a changed body returns `IDEMPOTENCY_CONFLICT`.
