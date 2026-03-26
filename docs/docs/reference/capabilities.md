---
title: Capabilities
---

# Capabilities

## Shape

Capability documents list the runtime surface:

- supported queries
- supported mutations
- published events
- subscribed events
- bindings

## Use

Publish capabilities at startup and expose them through the HTTP binding. Consumers can inspect the document before sending requests.

## Avoid

- hiding supported operations
- treating capabilities as optional metadata
- coupling capabilities to transport-specific paths
