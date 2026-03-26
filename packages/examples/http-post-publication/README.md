# HTTP Post Publication Example

This example exposes the post publication runtime through the HTTP binding and exercises the same query and mutation contract over Fastify.

## What It Demonstrates

- `POST /signal/query/post.get.v1`
- `POST /signal/mutation/post.publish.v1`
- `GET /signal/capabilities`
- thin HTTP mapping over the same protocol/runtime behavior

## Run

```bash
pnpm --filter @signal/examples build
node packages/examples/dist/http-post-publication/index.js
```
