---
title: HTTP Binding
---

# HTTP Binding

## Steps

1. Start the reference server.
2. POST to `/signal/query/:name` for reads.
3. POST to `/signal/mutation/:name` for writes.
4. GET `/signal/capabilities` to inspect the surface.

## Avoid

- embedding transport rules into the protocol
- depending on HTTP headers for the contract itself
