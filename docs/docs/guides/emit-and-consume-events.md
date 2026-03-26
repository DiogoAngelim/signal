---
title: Emit and Consume Events
---

# Emit and Consume Events

Use versioned event names and replay-safe subscribers.

```ts
runtime.subscribe(
  "post.published.v1",
  async (event) => {
    projection.push(event.messageId);
  },
  {
    consumerId: "post-projection",
    replaySafe: true,
  }
);
```
