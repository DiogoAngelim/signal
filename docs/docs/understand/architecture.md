---
title: Architecture
---

# Architecture

<figure className="signal-architecture-diagram">
  <img src="/signal/img/signal-architecture.svg" alt="Signal architecture flow from Application to Result" />
</figure>

Read it from top to bottom:

```txt
Application
Source
Signal
Runtime
Action
Adapter
Result
```

Queries, Mutations, and Events move through the same basic flow. The runtime
validates the operation, runs the handler, emits events when needed, and returns
a structured result.

## What You Learned

Signal separates the application, runtime, action, adapter, and result.

## Next Recommended Page

[API Reference](../reference/api.md)

Estimated reading time: 3 minutes.
