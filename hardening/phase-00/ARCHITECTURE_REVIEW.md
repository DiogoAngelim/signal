# Architecture Review — Phase 0

## Overview

Signal is a production correctness standard for versioned Queries, Mutations, and Events. This review evaluates three candidate architectures against the system's core requirements: explicit dangerous operations, replay-safe execution, and auditable evidence.

## Architecture A — Monolithic Correctness Layer

A single in-process runtime that owns protocol definition, execution, idempotency, event dispatch, and audit recording. All operations flow through one `SignalRuntime` class.

### Structure
- `@signal/protocol`: Contract surface (names, kinds, envelopes, errors, schemas)
- `@signal/runtime`: Single execution engine (registry, query/mutation/event, idempotency, dispatch, perception)
- `@signal/sdk-node`: Ergonomic API on top of runtime
- `@signal/binding-http`: HTTP adapter into runtime
- `@signal/idempotency-postgres`: Durable idempotency store

### Scoring Matrix

| Criterion | Weight | Score (1-10) | Weighted |
|-----------|--------|-------------|----------|
| Simplicity | 25% | 9 | 2.25 |
| Replay safety | 20% | 8 | 1.60 |
| Audit completeness | 20% | 7 | 1.40 |
| Testability | 15% | 8 | 1.20 |
| Extensibility | 10% | 5 | 0.50 |
| Operational safety | 10% | 8 | 0.80 |
| **Total** | **100%** | | **6.75** |

### Strengths
- Minimal moving parts; easy to reason about
- Single execution path eliminates routing ambiguity
- Fast local proof cycle

### Weaknesses
- Harder to extend without modifying core
- Audit and dispatch are coupled to execution
- Limited deployment flexibility

## Architecture B — Layered Protocol-Execution-Audit

Three distinct layers: Protocol (immutable contracts), Execution (runtime engine), Audit (immutable evidence chain). Each layer has a clear boundary and contract.

### Structure
- **Protocol Layer**: `@signal/protocol` — immutable operation contracts, schemas, envelope definitions
- **Execution Layer**: `@signal/runtime` + `@signal/sdk-node` — registry, dispatch, idempotency, perception
- **Audit Layer**: `@signal/audit-chain` — immutable hash-chained evidence records
- **Transport Layer**: `@signal/binding-http` — HTTP adapter
- **Persistence Layer**: `@signal/idempotency-postgres`, `@signal/db`

### Scoring Matrix

| Criterion | Weight | Score (1-10) | Weighted |
|-----------|--------|-------------|----------|
| Simplicity | 25% | 7 | 1.75 |
| Replay safety | 20% | 9 | 1.80 |
| Audit completeness | 20% | 9 | 1.80 |
| Testability | 15% | 8 | 1.20 |
| Extensibility | 10% | 8 | 0.80 |
| Operational safety | 10% | 9 | 0.90 |
| **Total** | **100%** | | **7.45** |

### Strengths
- Clear separation of concerns
- Audit layer is immutable by design
- Protocol layer cannot be corrupted by execution bugs
- Each layer independently testable

### Weaknesses
- More modules to maintain
- Cross-layer tracing requires discipline
- Slightly more complex initial setup

## Architecture C — Microservice Mesh

Each operation kind (Query, Mutation, Event) is a separate service. An API gateway routes requests. Each service owns its own persistence and audit trail.

### Structure
- **Gateway Service**: HTTP routing, auth, rate limiting
- **Query Service**: Read-only state access
- **Mutation Service**: State changes with idempotency
- **Event Service**: Event dispatch and subscriber management
- **Audit Service**: Centralized evidence collection
- **Idempotency Service**: Shared idempotency store

### Scoring Matrix

| Criterion | Weight | Score (1-10) | Weighted |
|-----------|--------|-------------|----------|
| Simplicity | 25% | 3 | 0.75 |
| Replay safety | 20% | 6 | 1.20 |
| Audit completeness | 20% | 7 | 1.40 |
| Testability | 15% | 5 | 0.75 |
| Extensibility | 10% | 9 | 0.90 |
| Operational safety | 10% | 5 | 0.50 |
| **Total** | **100%** | | **5.50** |

### Strengths
- Independent scaling and deployment
- Strong service boundaries
- Technology flexibility per service

### Weaknesses
- Significant operational complexity
- Distributed replay is hard
- Cross-service audit correlation is fragile
- Network partitions risk correctness
- Violates "simplicity beats flexibility" constitution principle

## Selection

**Selected: Architecture B (Layered Protocol-Execution-Audit) with score 7.45**

Architecture B provides the best balance of:
1. **Replay safety** (9/10): Clear execution boundaries make replay deterministic
2. **Audit completeness** (9/10): Immutable audit chain is a first-class layer
3. **Operational safety** (9/10): Layer boundaries prevent cross-contamination

Architecture A is simpler but couples audit to execution, risking evidence integrity.
Architecture C introduces distributed complexity that contradicts the constitution's simplicity principle.

The current codebase already approximates Architecture B. The hardening phases will formalize the layer boundaries, add the immutable audit chain, and enforce the separation contractually.