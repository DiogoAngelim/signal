# Post Publication Example

This example keeps the domain simple while exercising the full Signal flow: query, idempotent mutation, event emission, replay-safe consumption, conflict detection, and capabilities.

## What It Demonstrates

- `post.get.v1` query
- `post.publish.v1` mutation with required idempotency
- `post.published.v1` event emission
- replay-safe subscriber deduping by `messageId`
- replay vs conflict outcomes for the same idempotency key

## Run

```bash
pnpm --filter @signal/examples build
node packages/examples/dist/post-publication/index.js
```
