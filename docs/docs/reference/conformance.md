---
title: Conformance
---

# Conformance

## Must Implement

- versioned operation names
- standard envelope validation
- standard result and error envelopes
- query, mutation, and event semantics
- idempotency for mutations that require retry safety
- capability declaration
- in-process binding
- HTTP binding

## Optional

- PostgreSQL-backed idempotency store
- alternate storage adapters
- alternate event transports
- OpenAPI for the HTTP binding

## Out Of Scope

- workflow orchestration
- global event ordering
- distributed transactions
