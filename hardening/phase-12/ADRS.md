# Architecture Decision Records — Phase 12

## Overview

Six Architecture Decision Records documenting key design decisions in the Signal system.

---

## ADR-001: Idempotency-First Execution Model

**Status**: Adopted

**Context**: Mutations in financial systems must be safely retryable. Network failures, timeouts, and client retries can cause duplicate executions if not handled correctly.

**Decision**: All mutations require idempotency keys. The runtime reserves the key before executing the handler, stores the result, and returns the stored result on replay. Conflicting payloads with the same key produce `IDEMPOTENCY_CONFLICT`.

**Consequences**:
- (+) Safe retries without double-execution risk
- (+) Deterministic replay for audit and recovery
- (-) Requires idempotency store (Postgres) for persistence
- (-) Key management burden on clients

---

## ADR-002: SHA-256 Fingerprint for Deterministic Payload Hashing

**Status**: Adopted

**Context**: Idempotency requires comparing whether two requests have the "same" payload. Object equality in JavaScript is reference-based; deep equality is fragile.

**Decision**: Use `SHA-256(stableStringify({ kind, name, payload, auth }))` as the payload fingerprint. `stableStringify` sorts keys alphabetically and filters undefined values.

**Consequences**:
- (+) Deterministic: same input always produces same hash
- (+) Cryptographic collision resistance
- (+) Stable across JavaScript engine versions
- (-) SHA-256 is slower than simple comparison (acceptable for mutation frequency)

---

## ADR-003: Zero-Trust Authorization Gate

**Status**: Adopted

**Context**: Mutations must be authorized before execution. Trusting the network layer or transport is insufficient for financial operations.

**Decision**: Every mutation with an `authorize()` function must pass authorization before idempotency reservation. Auth context is provided per-request; no ambient authority.

**Consequences**:
- (+) No unauthorized mutations possible
- (+) Auth runs before idempotency reservation (prevents key exhaustion by unauthorized callers)
- (-) Slight performance cost (auth check on every request)
- (-) Requires auth infrastructure (JWT, OAuth, etc.)

---

## ADR-004: Immutable Hash-Chained Audit Trail

**Status**: Adopted

**Context**: Audit evidence must be tamper-evident and verifiable. Financial regulations require immutable audit trails.

**Decision**: Audit entries are hash-chained using SHA-256. Each entry includes the hash of the previous entry. `verifyChain()` detects any tampering.

**Consequences**:
- (+) Tamper-evident: any modification breaks the chain
- (+) Verifiable: `verifyChain()` provides cryptographic proof
- (-) Append-only: no deletion or modification possible
- (-) Chain breaks if genesis entry is lost

---

## ADR-005: Event Dispatch Only From Mutation Context

**Status**: Adopted

**Context**: Events represent things that happened in the system. If events could be published directly, they could represent things that never happened.

**Decision**: The `emit()` function is only available on `SignalExecutionContext`, which is only created during mutation handler execution. There is no standalone event publish API.

**Consequences**:
- (+) Events always correspond to actual mutations
- (+) No phantom events from direct publishing
- (-) Cannot emit events outside mutation context (by design)
- (-) Subscribers must handle replay deduplication

---

## ADR-006: Protocol-First Package Architecture

**Status**: Adopted

**Context**: The system needs clear separation between contract definition and implementation. Multiple consumers (HTTP binding, SDK, reference server) must share the same protocol.

**Decision**: `@signal/protocol` defines all schemas and types. `@signal/runtime` implements execution. `@signal/binding-http` provides HTTP transport. Protocol never imports Runtime.

**Consequences**:
- (+) Clear contract/implementation separation
- (+) Protocol can be versioned independently
- (+) Multiple bindings can share the same protocol
- (-) More packages to maintain
- (-) Protocol changes require coordination across consumers