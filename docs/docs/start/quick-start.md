---
title: Quick Start
---

# Quick Start

Goal: run Signal, send one Query, publish one Event, and see the Event.

## Step 1: Install Signal

```bash
pnpm install
```

## Step 2: Start Signal

Build the reference server and its local packages:

```bash
pnpm --filter @signal/reference-server... build
```

Start the server:

```bash
pnpm --filter @signal/reference-server start
```

Signal is now running at `http://127.0.0.1:3001`.

## Step 3: Create Your First Query

Open a second terminal:

```bash
curl -X POST http://127.0.0.1:3001/signal/query/note.get.v1 \
  -H 'content-type: application/json' \
  -d '{"payload":{"noteId":"note_1001"}}'
```

## Step 4: Receive The Result

You should see a successful result with this body:

```json
{
  "noteId": "note_1001",
  "body": "Signal keeps protocol contracts explicit.",
  "version": "v1"
}
```

## Step 5: Create Your First Event

This Mutation publishes `post.published.v1`:

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

## Step 6: Observe The Event

```bash
curl http://127.0.0.1:3001/signal/observed-events
```

You should see at least one event id:

```json
{
  "ok": true,
  "eventIds": ["..."],
  "count": 1
}
```

## What You Learned

You ran Signal, sent a Query, ran a Mutation, and observed the Event it
published.

## Next Recommended Page

[Build Your First App](../build/first-app.md)

Estimated reading time: 5 minutes.
