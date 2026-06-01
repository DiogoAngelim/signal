---
title: What Is Signal?
sidebar_position: 1
---

# What Is Signal?

Signal helps applications communicate through **Queries**, **Mutations**, and
**Events** using a predictable protocol.

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

Use Signal when your app needs one clear contract for:

- reading data
- changing data
- announcing facts
- exposing the same behavior through HTTP or another transport

Signal is small on purpose. It gives you names, payloads, results, errors,
idempotency, and capability discovery. Your application keeps its own database,
business rules, auth, jobs, and UI.

<div className="signal-next">

## What You Learned

Signal is a predictable way to run Queries, Mutations, and Events.

## Next Recommended Page

[Quick Start](start/quick-start.md)

Estimated reading time: 1 minute.

</div>
