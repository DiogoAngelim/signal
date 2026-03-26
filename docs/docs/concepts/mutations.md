---
title: Mutations
---

# Mutations

Mutations are explicit state-changing commands.

## Rules

- every mutation declares `required`, `optional`, or `none` idempotency
- same key plus same normalized payload returns the same logical result
- same key plus different normalized payload conflicts
- emitted events happen after logical state is established
- mutation names must be versioned

## Example

`post.publish.v1` publishes a draft post, emits `post.published.v1`, and replays safely when the caller retries the same logical request.
