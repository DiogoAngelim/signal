---
title: Conformance
---

# Conformance

A Signal-compatible implementation preserves the public contract, not the internal Node.js implementation details.

## Must

- validate envelopes
- enforce versioned names
- preserve query, mutation, and event semantics
- return structured results and errors
- enforce declared idempotency semantics
- treat public event consumption as replay-safe
- expose capabilities

## Reference Artifacts

- RFCs in `spec/`
- fixtures in `spec/fixtures/`
- schemas in `schemas/`
