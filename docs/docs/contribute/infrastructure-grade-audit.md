---
title: Infrastructure Grade Audit
---

# Infrastructure Grade Audit

Date: 2026-06-01

This audit evaluates Signal as infrastructure: a protocol and runtime surface
that other developers, companies, systems, and products could depend on. It does
not evaluate Signal as an app, startup, or trading platform.

## Scope

Audited tracked repository areas:

- `packages/protocol`, `packages/runtime`, `packages/sdk-node`,
  `packages/binding-http`, `packages/idempotency-postgres`, `packages/examples`
- `apps/reference-server`
- `backend/*` compatibility packages
- `packages/core`, `packages/http`, `packages/security`,
  `packages/transport`, and `packages/utils` legacy source modules
- `signal-framework` generic engines and the tracked Stocks Optimizer adapter
- `docs`, `spec`, `schemas`, and GitHub workflows

Stocks Optimizer itself is not present as a tracked application in this
repository. The tracked surface is `signal-framework/adapters/stocks-optimizer.ts`
and related tests. A local ignored `examples/stocks-optimizer/.local-cache`
exists, but ignored local cache data is outside the auditable source contract.

## Executive Result

PARTIAL.

Signal can become infrastructure that other systems trust as a dependency, but
it is not infrastructure-grade yet. The strongest evidence is the protocol-first
shape: RFCs, versioned operation names, Zod validation, structured errors,
capability documents, idempotency semantics, replay-safe subscriber helpers, and
PostgreSQL-backed idempotency. The largest blockers are implementation
fragmentation, weak production failure isolation, incomplete security
enforcement, non-atomic state plus event publication, limited operational
observability, no deprecation governance, and the absence of a tracked
Stocks Optimizer application contract.

## System Map

### Public APIs

- `@signal/protocol`: envelopes, names, errors, results, capabilities, JSON
  schema helpers.
- `@signal/runtime`: registry, runtime, query and mutation execution, event
  dispatch, idempotency, replay-safe subscriber helpers, perception layer.
- `@signal/sdk-node`: `createSignalRuntime`, `defineQuery`,
  `defineMutation`, `defineEvent`.
- `@signal/binding-http`: Fastify routes for capabilities, queries, and
  mutations.
- `@signal/idempotency-postgres`: durable idempotency store.
- `@signal/examples`: runnable examples including post publication, payment
  capture, storage-backed idempotency, and Kafka plus PostgreSQL.
- `@signal/reference-server`: local HTTP reference server.
- `@signal/decision`, `@signal/decision-memory`, `@signal/agency`,
  `@signal/commitment`, `@signal/semantic-state`: higher-level decision,
  memory, agency, and commitment packages.
- `@digelim/*`: compatibility packages under `backend/*`.

### Internal And Legacy APIs

- `packages/core`, `packages/http`, `packages/security`,
  `packages/transport`, and `packages/utils` are source-only legacy modules
  with root tests present but not wired into the current pnpm workspace test
  command.
- `backend/signal` contains a second protocol and runtime implementation that
  has diverged from `packages/protocol` and `packages/runtime`.
- `signal-framework` exports many pure engines and the Stocks Optimizer adapter.

### Runtime Boundaries

- In-process runtime calls: `runtime.query`, `runtime.mutation`, `runtime.publish`.
- HTTP boundary: Fastify routes under `/signal`.
- Event boundary: in-process dispatcher by default, Kafka dispatcher in examples.
- Persistence boundary: memory idempotency, PostgreSQL idempotency, decision
  memory PostgreSQL, legacy in-memory stores.
- App boundary: Stocks Optimizer is represented only by adapter code in the
  tracked repo.

### Persistence Layers

- `signal_idempotency_records` in PostgreSQL for mutation replay.
- Decision memory tables such as `signal_reality_snapshots`,
  `signal_decision_records`, `signal_outcomes`, `signal_replay_snapshots`,
  calibration, trust, evidence, theses, regime snapshots, and retention jobs.
- Legacy `InMemorySignalStore` and legacy memory adapters.
- Example payment tables in the Kafka plus PostgreSQL example.

### Event Contracts

- Protocol events are versioned, for example `post.published.v1`,
  `payment.captured.v1`, `decision.recorded.v1`,
  `decision.outcome_recorded.v1`, `decision.compacted.v1`,
  `decision.replayed.v1`, and `reality.snapshot_recorded.v1`.
- Event processing guidance is specified in `spec/RFC-0005`.
- Runtime subscribers can be wrapped with replay-safe dedupe.

### Dependency Graph

```txt
@signal/protocol
  -> zod

@signal/runtime
  -> @signal/protocol

@signal/sdk-node
  -> @signal/protocol
  -> @signal/runtime

@signal/binding-http
  -> @signal/protocol
  -> @signal/runtime
  -> fastify

@signal/idempotency-postgres
  -> @signal/protocol
  -> @signal/runtime
  -> drizzle-orm
  -> pg

@signal/examples
  -> @signal/binding-http
  -> @signal/protocol
  -> @signal/runtime
  -> @signal/sdk-node
  -> @signal/idempotency-postgres
  -> kafkajs
  -> pg

@signal/reference-server
  -> @signal/binding-http
  -> @signal/examples
  -> @signal/idempotency-postgres
  -> @signal/protocol
  -> @signal/runtime
  -> @signal/sdk-node

@digelim/12.signal
  -> duplicated protocol/runtime/security/observability surface

@digelim/01..15
  -> layered compatibility modules, mostly depending on @digelim/12.signal
     plus store, idempotency, and sync packages

signal-framework
  -> pure domain-neutral engines
  -> Stocks Optimizer adapter
  -> @signal/commitment through runtime require fallback
```

### Critical Paths

Query path:

```txt
HTTP body or in-process input
  -> operation name lookup
  -> input schema validation
  -> Signal envelope creation
  -> handler
  -> result schema validation
  -> structured Signal result
```

Mutation path:

```txt
HTTP body or in-process input
  -> operation name lookup
  -> input schema validation
  -> idempotency fingerprint
  -> idempotency reservation
  -> handler
  -> event envelope creation
  -> result schema validation
  -> event dispatch
  -> idempotency completion
  -> structured Signal result
```

Event path:

```txt
event payload
  -> registered event schema validation
  -> Signal envelope creation
  -> dispatcher
  -> subscriber or replay-safe subscriber
```

Decision memory path:

```txt
reality snapshot
  -> decision record
  -> outcome
  -> replay snapshot
  -> calibration/trust history
  -> compaction and retention
```

Stocks Optimizer adapter path:

```txt
app-shaped stock data
  -> generic metric, pruning, meaning, purpose, and commitment inputs
  -> framework evaluation
  -> app-facing view models
```

### Single Points Of Failure

- Default dispatcher is in-process and single-process.
- Reference server silently falls back to memory idempotency when
  `DATABASE_URL` is absent, so replay safety is not durable by default.
- PostgreSQL idempotency is a hard dependency when configured.
- Mutation state changes and event publication are not atomic.
- There is no durable outbox in the new runtime.
- Protocol/runtime code is duplicated between `packages/*` and `backend/signal`.
- The tracked repo does not contain a full Stocks Optimizer app contract.

## Contract Audit

Strengths:

- `spec/RFC-0001` through `spec/RFC-0006` define core protocol, HTTP binding,
  runtime behavior, idempotency, event processing, and execution metadata.
- Operation names are versioned with the `<domain>.<action>.vN` pattern.
- Runtime validates input and result schemas around handlers.
- HTTP binding preserves structured Signal result bodies.
- Capabilities are derived from the registry.
- Idempotency semantics are explicit and tested.

Weak contracts:

| Contract | Risk | Impact | Recommended Fix |
| --- | --- | --- | --- |
| Duplicate protocol/runtime in `backend/signal` | Implementations drift | Consumers see different envelope and error semantics depending on package | Make `backend/signal` depend on `@signal/protocol` and `@signal/runtime`, or mark it legacy with an explicit compatibility matrix |
| JSON schemas are hand-maintained beside Zod schemas | Schema drift | Independent implementers validate against the wrong shape | Generate JSON schemas from canonical Zod or test every published schema against canonical fixtures |
| No public deprecation policy | Breaking changes are social, not contractual | Consumers cannot safely depend for years | Add support windows, removal rules, changelog requirements, and operation deprecation metadata |
| Legacy root APIs use unversioned names like `posts.create` | Different naming contract from Signal v1 | Confusion and accidental incompatible clients | Label root packages as legacy and isolate them from v1 conformance claims |
| Stocks Optimizer app contract is absent from tracked source | Cannot audit external app API, persistence, or runtime semantics | Platform claims cannot include the full optimizer yet | Track the application contract, API schemas, migrations, and CI workflow or keep it out of infrastructure claims |

Answer: consumers can safely depend on the newer `@signal/*` protocol surface
for experiments and controlled internal systems, but not yet for years without a
published compatibility and deprecation program.

## Reliability Audit

Strengths:

- Required, optional, and none idempotency modes exist.
- Payload fingerprint conflict detection is implemented.
- Completed idempotent results replay with structured metadata.
- Deadline and cancellation failures are classified before handler execution.
- Replay-safe subscriber helpers dedupe by consumer and message id.
- PostgreSQL idempotency handles insert races.

Failure simulations:

| Failure | Current Behavior | Gap |
| --- | --- | --- |
| Database outage during idempotency reserve | Mutation returns an internal failure before handler work | Good blast-radius for reserve failure, but no health-driven circuit breaker |
| Database outage during idempotency complete | Handler and event dispatch may already have happened | Non-atomic completion can leave state changed without durable replay record |
| Event dispatcher outage | Mutation can fail after handler state changes | Needs durable outbox or transactional event publication |
| Network latency | No runtime timeout around handlers or dependencies | Deadlines are pre-flight checks only |
| Corrupted or invalid input | Zod validation returns structured validation failures | Good for protocol inputs |
| Corrupted stored idempotency result | No explicit recovery or schema validation on replayed database values | Add stored-record validation and quarantine paths |
| Subscriber failure | New in-process dispatcher propagates subscriber errors | Add failure isolation, retry policy, and dead-letter handling for public event consumers |

Required improvements:

- Add transactional outbox semantics for mutations that emit events.
- Add handler timeouts, cooperative deadline propagation, and cancellation tests
  for long-running handlers.
- Add retry, backoff, dead-letter, and poison-message policies for transports.
- Add dependency health checks and circuit breakers at runtime boundaries.
- Add recovery runbooks and failure drills for Postgres, Kafka, and HTTP.

## Scalability Audit

Current scalability profile:

- The reference runtime is a single-process Node runtime.
- The default dispatcher is in-memory and synchronous.
- Memory stores use process memory and linear maps.
- PostgreSQL idempotency has the right unique key shape but no partitioning,
  pruning, TTL, or tenant dimension.
- Decision memory has indexes and retention jobs, but no shard, tenant, or
  archive strategy documented.
- Kafka example proves a replaceable event boundary, but not production-grade
  backpressure, lag monitoring, or dead-letter operation.

Likely capacity limits:

- Single-process dispatcher and subscribers become the first event bottleneck.
- Event dispatch inside mutation completion increases tail latency.
- Idempotency table grows without retention.
- Capability and registry lookups are fine at current size but lack
  compatibility metadata for large ecosystems.
- Decision memory queries need pagination and tenant/source isolation before
  high-volume use.

Required improvements:

- Define scale targets for QPS, event throughput, table size, replay latency,
  and recovery time.
- Move public event processing to durable queues or logs.
- Add pagination, retention, and compaction policies for every durable table.
- Add load tests for query, mutation, event, and replay paths.
- Add tenant-aware idempotency and data partitioning before multi-company use.

## Security Audit

Findings:

| Severity | Finding | Evidence | Recommended Fix |
| --- | --- | --- | --- |
| High | New HTTP/runtime treats auth as metadata, not enforced authentication or authorization | `auth` is forwarded, but `@signal/runtime` has no policy gate | Add binding-level auth hooks and per-operation authorization contracts |
| High | Mutation state and event publication are not atomic | Events dispatch after handler success and before idempotency complete | Add transactional outbox and idempotent event consumers |
| Medium | Supply-chain policy is weak | `pnpm-workspace.yaml` catalog uses `latest` for many packages; mixed `pnpm-lock.yaml` and `package-lock.json` exist | Pin catalog versions, use one package manager, add core `pnpm audit` CI |
| Medium | Request hardening is incomplete | No explicit request size, rate limit, or timeout policy in HTTP server | Configure Fastify body limits, rate limits, and timeout policy |
| Medium | Header-derived legacy auth is not production-grade | Legacy router maps headers into auth context | Mark as dev/legacy or replace with signed token verification |
| Medium | Secrets policy is informal | `.env` and `.vercel` are ignored, but no documented rotation or scanning policy | Add secret scanning and rotation docs |
| Low | Local ignored Vercel env files exist | `.vercel/.env.*.local` present locally and ignored | Keep ignored, but use secret scanning before commits |

## Observability Audit

Strengths:

- Signal results include outcome, duration, message id, correlation id,
  causation id, idempotency, replay, deadline, and delivery metadata.
- Backend compatibility package has Pino logging and an in-memory metrics
  registry.
- Decision memory can preserve reality snapshots, decisions, outcomes, replay
  checkpoints, calibration, trust, and summaries.

Gaps:

- No end-to-end trace propagation through HTTP logs, runtime logs, event
  dispatch, and persistence writes.
- No OpenTelemetry spans or metrics for query, mutation, event, replay, and
  idempotency decisions.
- No operator dashboard, SLOs, alert definitions, or error-budget policy.
- New runtime has no append-only audit trail equivalent to the legacy root
  audit behavior.

Can a decision be reconstructed six months later? Partial. It can be
reconstructed if the application explicitly writes decision memory and preserves
the relevant reality snapshots. The base runtime does not guarantee that every
decision, handler input, handler output, emitted event, policy version, and
configuration version is durably captured.

## Governance Audit

Strengths:

- RFCs provide a good foundation for protocol governance.
- Decision memory models provenance and replay better than most early systems.
- Operation names are versioned.

Gaps:

- No formal RFC lifecycle states such as draft, accepted, deprecated, superseded.
- No operation deprecation metadata in capabilities.
- No policy, rule, model, or adapter version fields are required on decisions.
- No migration compatibility tests for all persistent stores.
- No release checklist for backwards compatibility.

Historical decisions can be audited only when the decision-memory path is used
and the application records enough input, policy, and configuration context.

## Developer Experience Audit

Strengths:

- Quick start exists.
- Repository map exists.
- Public packages have focused tests.
- Core `@signal/*` packages are easy to discover.
- Examples cover HTTP, idempotency, Kafka, and PostgreSQL.

Blockers for one-day productivity:

- Multiple package eras create uncertainty: `@signal/*`, `@digelim/*`, legacy
  root `packages/core`, and `signal-framework`.
- `run-tests.sh` references npm and Jest-era scripts that do not match the
  current pnpm/Vitest workspace.
- GitHub workflow for Stocks Optimizer points to `examples/stocks-optimizer`,
  but that application is not tracked in the repo.
- Generated and ignored local directories exist, which can distract contributors.
- Documentation explains the beginner path but not production operations,
  compatibility, release governance, or failure handling.

## Protocol Audit

Protocol quality is the strongest part of the system. Naming, envelope shape,
result shape, error codes, idempotency semantics, and event replay expectations
are explicit.

Independent teams could implement a prototype from the RFCs. They could not yet
implement a production-compatible Signal implementation without talking to the
authors, because conformance fixtures are limited, JSON schema generation is not
canonical, and behavior across duplicated implementations is not fully aligned.

## Ecosystem Audit

Signal can become a platform, but the ecosystem surface is not ready for
external companies to build businesses on it yet.

Missing platform pieces:

- Long-term semver and compatibility guarantees.
- Deprecation and migration policy.
- Official conformance test runner.
- Tenant and organization model.
- Production auth and authorization extension points.
- Durable event transport contract and outbox.
- SDKs beyond Node helpers.
- Plugin registry and integration governance.
- Public operational runbooks and SLOs.

## Infrastructure Scorecard

| Category | Current | Target | Gap | Required Improvements | Expected Impact |
| --- | ---: | ---: | ---: | --- | --- |
| Reliability | 5 | 9 | 4 | Outbox, retries, timeouts, dead letters, recovery drills | Safe retries and bounded blast radius |
| Scalability | 3 | 9 | 6 | Durable event transport, pagination, retention, load tests | Predictable capacity growth |
| Security | 4 | 9 | 5 | Auth hooks, authorization contracts, pinned deps, request hardening | Safer public edge and supply chain |
| Observability | 4 | 9 | 5 | Tracing, metrics, audit trails, SLOs, dashboards | Operators can explain behavior under stress |
| Governance | 5 | 9 | 4 | RFC lifecycle, deprecation policy, policy/model versions | Consumers can depend for years |
| Maintainability | 5 | 9 | 4 | Collapse duplicate protocol/runtime implementations, clarify legacy | Lower regression risk |
| Extensibility | 6 | 9 | 3 | Stable extension points and plugin contracts | Safer third-party integrations |
| Developer Experience | 6 | 9 | 3 | One-path setup, current scripts, architecture maps, runbooks | Faster onboarding |
| Protocol Quality | 7 | 9 | 2 | Canonical schemas and conformance suite | Independent implementations become realistic |
| Auditability | 5 | 9 | 4 | Mandatory decision provenance and config/policy capture | Decisions can be challenged later |
| Backward Compatibility | 4 | 9 | 5 | Compatibility matrix, changelog gates, deprecation metadata | Safe long-term consumers |
| Ecosystem Readiness | 3 | 9 | 6 | SDKs, tenancy, governance, marketplace/integration model | External companies can build on top |

## Safe Remediation Applied

The PostgreSQL idempotency migration now creates the `result_meta` column used by
the Drizzle schema and store implementation. A regression test reads the SQL
migration and verifies that all columns used by the schema are present.

Two high-severity dependency advisories found during the audit were also
remediated:

- `drizzle-orm` was updated to `0.45.2`.
- `serialize-javascript` was pinned through `pnpm.overrides` to `7.0.5`.

`pnpm audit --audit-level=high` now exits cleanly. Moderate advisories remain
and should be triaged separately.

Files:

- `package.json`
- `pnpm-lock.yaml`
- `packages/idempotency-postgres/src/drizzle/migrations/0000_initial.sql`
- `packages/idempotency-postgres/package.json`
- `packages/idempotency-postgres/test/migration.test.ts`

## Final Answer

PARTIAL.

Signal has the right bones for infrastructure: small protocol, versioned
contracts, structured results, explicit idempotency, replay-aware events,
capability discovery, and decision-memory concepts. What separates it from
infrastructure-grade status is not the idea. It is operational discipline:
single canonical implementation, durable event semantics, production security,
observability, compatibility governance, scalable persistence, and a tracked
ecosystem contract for Stocks Optimizer and other consumers.
