---
title: Core Ideas
---

# Core Ideas

Signal is easiest to understand in three layers.

## Understanding

The first question is always:

> What do we currently understand about this workflow?

A reader should be able to see whether the system is observing state, changing
state, or announcing a fact without learning the implementation first.

## Reasoning

Reasoning explains why the current view is reasonable.

Queries should make state visible without changing it.

```ts
runtime.query("note.get.v1", { noteId: "note_1001" });
```

Mutations should make important changes explicit. They can require idempotency
so retries remain understandable.

```ts
runtime.mutation("post.publish.v1", payload, {
  idempotencyKey: "publish-post_1001-001",
});
```

Events should preserve facts for subscribers, projections, logs, integrations,
and anything else that reacts to what happened.

```ts
runtime.publish("post.published.v1", {
  postId: "post_1001",
});
```

## Evidence

Capabilities tell callers what a runtime supports.

```bash
curl http://127.0.0.1:3001/signal/capabilities
```

This evidence matters, but it should support understanding rather than replace
it.

## What You Learned

Signal has four beginner concepts: Query, Mutation, Event, and Capability. The
experience should reveal them in the order a person needs them: understanding,
reasoning, then evidence.

## Next Recommended Page

[Architecture](architecture.md)

Estimated reading time: 4 minutes.
