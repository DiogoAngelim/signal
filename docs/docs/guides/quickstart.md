---
title: Quickstart
---

# Quickstart

```bash
pnpm install
pnpm build
pnpm --filter @signal/reference-server start
```

Inspect capabilities:

```bash
curl http://127.0.0.1:3001/signal/capabilities
```

Run a query:

```bash
curl -X POST http://127.0.0.1:3001/signal/query/note.get.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"noteId":"note_1001"}}'
```

Run an idempotent mutation:

```bash
curl -X POST http://127.0.0.1:3001/signal/mutation/post.publish.v1 \
  -H 'content-type: application/json' \
  -d '{
    "payload": {
      "postId": "post_1001",
      "title": "Protocol first",
      "body": "Signal keeps transport and execution concerns separate."
    },
    "idempotencyKey": "publish-post_1001-001"
  }'
```
