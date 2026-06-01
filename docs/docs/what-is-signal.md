---
title: What Is Signal?
sidebar_position: 1
---

# What Is Signal?

Signal helps teams understand what is happening across a workflow before they
ask the system to act again.

Its default view is simple:

> Current state should be readable. Important changes should be explicit. Facts
> should remain visible after the moment passes.

Signal does this with three ordinary concepts.

## Understanding

Queries observe current state without changing it.

Mutations describe intentional changes. When a mutation is retried, idempotency
can help the system return the same logical result instead of creating a second
change.

Events preserve facts so other systems can react, replay, or inspect what
happened later.

```ts
runtime.query("note.get.v1", { noteId: "note_1001" });

runtime.mutation("post.publish.v1", {
  postId: "post_1001",
  title: "Protocol first",
  body: "Signal keeps transport and execution concerns separate.",
});

runtime.publish("post.published.v1", {
  postId: "post_1001",
  publishedAt: new Date().toISOString(),
});
```

## Reasoning

Use Signal when your app needs one clear contract for:

- reading data
- changing data
- announcing facts
- exposing the same behavior through HTTP or another transport

## Evidence

Signal is small on purpose. It gives you names, payloads, results, errors,
idempotency, and capability discovery. Your application keeps its own database,
business rules, auth, jobs, and UI.

<div className="signal-next">

## What You Learned

Signal keeps understanding first, with reasoning and evidence available when you
need more detail.

## Next Recommended Page

[Quick Start](start/quick-start.md)

Estimated reading time: 2 minutes.

</div>
