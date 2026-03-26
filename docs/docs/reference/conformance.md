---
title: Conformance
---

# Conformance

## What a Signal-Compatible System MUST Implement

- versioned operation names
- standard envelope validation
- standard result and error envelopes
- query, mutation, and event semantics
- idempotency for mutations that require retry safety
- capability declaration
- in-process binding
- HTTP binding
- replay-safe event consumption behavior

## Optional

- PostgreSQL-backed idempotency store
- alternate storage adapters
- alternate event transports
- OpenAPI for the HTTP binding
- domain-specific projections

## Out Of Scope

- workflow orchestration
- global event ordering
- distributed transactions
- transport-specific contract semantics

## How to Claim Conformance

A runtime can describe itself as Signal-compatible when it:

1. validates envelopes according to the specification
2. registers and executes versioned operations
3. publishes capabilities that match the real runtime surface
4. implements retry-safe mutation handling when required
5. treats events as immutable facts and makes consumers replay-safe

## Checklist

- [ ] envelope validation
- [ ] versioned names
- [ ] structured result and error model
- [ ] durable idempotency when required
- [ ] replay-safe event consumption
- [ ] capability document available
- [ ] in-process binding available
- [ ] HTTP binding available
- [ ] public docs aligned with the runtime
