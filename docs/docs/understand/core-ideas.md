---
title: Core Ideas
---

# Core Ideas

## Query

A Query reads data.

```ts
runtime.query("note.get.v1", { noteId: "note_1001" });
```

Queries should not change application state.

## Mutation

A Mutation changes data.

```ts
runtime.mutation("post.publish.v1", payload, {
  idempotencyKey: "publish-post_1001-001",
});
```

Mutations can require idempotency so retries do not create duplicate logical
changes.

## Event

An Event announces a fact.

```ts
runtime.publish("post.published.v1", {
  postId: "post_1001",
});
```

Events are for subscribers, projections, logs, integrations, and anything else
that reacts to facts.

## Capability

Capabilities tell callers what a runtime supports.

```bash
curl http://127.0.0.1:3001/signal/capabilities
```

## What You Learned

Signal has four beginner concepts: Query, Mutation, Event, and Capability.

## Next Recommended Page

[Architecture](architecture.md)

Estimated reading time: 4 minutes.
