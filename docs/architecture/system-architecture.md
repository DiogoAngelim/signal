# System Architecture

Signal is a protocol-first runtime for operational workflows. Its core model is
small:

- Queries observe current state.
- Mutations describe intentional state changes.
- Events preserve what happened.
- Capabilities expose what a runtime supports.
- Idempotency makes retries safe.
- Contracts make the protocol portable across transports and implementations.

## High-Level Flow

```txt
Application
  -> Source
  -> Signal Protocol
  -> Runtime
  -> Action or Handler
  -> Adapter or Store
  -> Result
  -> Event
```

## Layer Model

```mermaid
flowchart TD
  App[Applications and consumers]
  SDK[@signal/sdk-node]
  HTTP[@signal/binding-http]
  Runtime[@signal/runtime]
  Protocol[@signal/protocol]
  Idem[@signal/idempotency-postgres]
  Contracts[/contracts and schemas/]
  Events[Event transport and outbox]
  Stores[Application stores]
  Audit[Audit and decision memory]
  Framework[signal-framework]
  Compat[backend/* compatibility packages]

  App --> SDK
  App --> HTTP
  SDK --> Runtime
  HTTP --> Runtime
  Runtime --> Protocol
  Runtime --> Idem
  Runtime --> Events
  Runtime --> Stores
  Runtime --> Audit
  Contracts --> Protocol
  Framework --> App
  Compat -. legacy or compatibility .-> Runtime
  Compat -. legacy or compatibility .-> Protocol
```

## Public API Surface

| Package | Role |
| --- | --- |
| `@signal/protocol` | Envelopes, names, errors, results, capabilities, JSON schema helpers. |
| `@signal/runtime` | Registry, query and mutation execution, event dispatch, idempotency, replay-safe subscribers, perception layer. |
| `@signal/sdk-node` | `createSignalRuntime`, `defineQuery`, `defineMutation`, `defineEvent`. |
| `@signal/binding-http` | Fastify routes for capabilities, queries, and mutations. |
| `@signal/idempotency-postgres` | Durable idempotency store. |
| `@signal/examples` | Runnable examples. |
| `@signal/reference-server` | Local HTTP reference server. |

## Compatibility And Legacy Surface

| Area | Current Position |
| --- | --- |
| `backend/*` | Published compatibility packages under `@digelim/*`; must not be presented as canonical Signal v1 behavior without equivalence tests. |
| `backend/signal` | Duplicate protocol/runtime implementation that must be wrapped, aligned, or explicitly marked legacy. |
| `packages/core`, `packages/http`, `packages/security`, `packages/transport`, `packages/utils` | Source-only legacy modules covered by root tests; must receive explicit support status. |
| `signal-framework` | Domain-neutral framework and Stocks Optimizer adapter surface; useful but separate from protocol semantics. |
| `packages/signal-protocol` | Existing package that must be mapped against canonical `@signal/protocol` before long-term claims. |

## Persistence Boundaries

| Boundary | Current Store | Infrastructure Requirement |
| --- | --- | --- |
| Idempotency | Memory or PostgreSQL | Durable store for production, tenant-aware keys, expiration, quarantine, migration tests. |
| Events | In-process dispatcher, Kafka example | Transactional outbox, durable transport, retry, dead-letter, replay, lag metrics. |
| Decision memory | PostgreSQL-backed packages | Pagination, tenant/source isolation, archive strategy, restore tests. |
| Audit | Partial legacy behavior | Append-only, searchable, exportable audit records for protected actions. |
| Application state | Application-defined | Transaction hooks for mutation plus outbox atomicity. |

## Core Invariants

- Canonical protocol behavior must be defined by contracts, not by transport.
- Mutations that emit events must not persist one without the other.
- Retried mutations must be safe under concurrency and process restarts.
- Public operations must be versioned.
- Production deployments must not silently use non-durable safety mechanisms.
- Governance, audit, and observability metadata must travel with decisions.
- Legacy behavior must be isolated from infrastructure-grade claims.
