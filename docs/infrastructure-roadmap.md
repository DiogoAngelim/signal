# Signal Infrastructure Roadmap

Date: 2026-06-01

Source of truth: `docs/docs/contribute/infrastructure-grade-audit.md`

Status: Phase 0 baseline.

This roadmap converts every infrastructure-grade audit finding into an
implementation requirement. The objective is not feature expansion. The
objective is to make Signal dependable enough for long-lived production systems:
correct, reliable, safe, governable, observable, maintainable, compatible,
auditable, operationally excellent, and ecosystem-ready.

## Operating Principles

- Preserve backward compatibility by default.
- Prefer migration paths over removals.
- Prove replacement equivalence before retiring any implementation.
- Treat protocol behavior as a public contract.
- Make every production behavior testable, observable, and reversible.
- Optimize for decades of evolution rather than short-term speed.

## Program Phases

| Phase | Name | Exit Gate |
| --- | --- | --- |
| 0 | Baseline | This roadmap exists, maps audit findings to requirements, and is referenced by future work. |
| 1 | Architecture consolidation | There is one canonical protocol/runtime path and all legacy paths are explicitly isolated. |
| 2 | Formal domain boundaries | Every module declares purpose, owner, API surface, allowed dependencies, and forbidden dependencies; CI enforces the boundaries. |
| 3 | Transactional outbox | Mutations and emitted events commit atomically or not at all. |
| 4 | Idempotency system | Retries are deterministic, duplicate-safe, concurrent-safe, and expiration-aware. |
| 5 | Governance engine | Policies are versioned, approved, validated, rolled back, and recorded with every decision. |
| 6 | Immutable audit trail | Actions, decisions, policy versions, request/response bodies, actors, and correlation IDs are append-only, searchable, and exportable. |
| 7 | Observability | OpenTelemetry traces, metrics, structured logs, dashboards, SLOs, and alerts cover query, mutation, event, replay, persistence, and dependency paths. |
| 8 | Reliability engineering | Circuit breakers, timeouts, retries, bulkheads, graceful degradation, and chaos tests define predictable failure behavior. |
| 9 | Security hardening | Authentication, authorization, request protection, secret rotation, supply-chain checks, and signed releases are enforced. |
| 10 | Contract system | `/contracts` is canonical and generates OpenAPI, AsyncAPI, and JSON Schema. |
| 11 | Stocks Optimizer contract | Consumer-driven contract tests prove compatibility with the tracked Stocks Optimizer contract. |
| 12 | RFC process | Protocol changes require reviewed, versioned RFCs with lifecycle state. |
| 13 | ADR system | Significant architectural decisions are documented with context, alternatives, tradeoffs, decision, and consequences. |
| 14 | Upgrade safety | Backward, forward, migration, and rolling-upgrade tests run in CI. |
| 15 | Performance budgets | CI enforces measurable latency, throughput, startup, memory, and regression budgets. |
| 16 | Disaster recovery | Runbooks, restore tests, and backup validation exist for database, queue, deployment, credentials, and regional failures. |
| 17 | Documentation as product | Docs cover quickstart, beginner guide, architecture, protocol, examples, troubleshooting, migration, operations, and governance. |
| 18 | Developer experience | `signal create app`, `signal create adapter`, `signal create module`, and `signal doctor` provide actionable setup and validation. |
| 19 | Protocol conformance suite | Implementations can be certified against envelopes, mutations, events, idempotency, replay safety, and contracts. |
| 20 | Reference implementations | TypeScript, Node.js, and Go implementations prove runtime portability. |
| 21 | Release engineering | Builds are reproducible, artifacts are signed, changelogs are automated, migrations are generated, and compatibility is verified. |
| 22 | Institutional readiness gate | CI blocks merges unless tests, contracts, compatibility, security, documentation, and governance checks pass. |

## Phase 0 Acceptance Criteria

- `docs/infrastructure-roadmap.md` exists.
- Every material audit finding below has root cause, risk, mitigation,
  implementation, testing, rollback, and acceptance criteria.
- Future implementation work can link to a requirement ID in this file.
- Closed findings stay in the file with evidence instead of being deleted.

## Requirement Status Labels

- Proposed: requirement is identified but not designed.
- Planned: design is accepted and ready to implement.
- In progress: implementation has started.
- Blocked: implementation cannot continue without an explicit dependency.
- Accepted: implementation, tests, docs, and rollback plan are complete.

## Architecture And Maintainability

### ARCH-001: Duplicate Protocol And Runtime In `backend/signal`

Status: Proposed

- Root cause: the repository contains both the newer `@signal/protocol` and
  `@signal/runtime` packages and a second protocol/runtime implementation under
  `backend/signal`.
- Risk: envelope, error, idempotency, and runtime semantics drift by package,
  so consumers can receive different behavior from different imports.
- Mitigation: designate `@signal/protocol` and `@signal/runtime` as canonical;
  convert `backend/signal` into a compatibility wrapper or mark it as legacy
  with a compatibility matrix.
- Implementation: inventory exported symbols, map each symbol to the canonical
  equivalent, add wrapper exports where possible, and document any non-equivalent
  behavior as legacy-only.
- Testing: add equivalence tests for envelopes, result shapes, error codes,
  idempotency behavior, and event dispatch semantics across both import paths.
- Rollback: keep the existing `backend/signal` implementation behind a legacy
  entry point until equivalence tests prove replacement safety.
- Acceptance criteria: all supported `backend/signal` behavior is either backed
  by canonical packages or explicitly documented as legacy with deprecation
  metadata and tests.

### ARCH-002: Multiple Package Eras Create Ambiguity

Status: Proposed

- Root cause: `@signal/*`, `@digelim/*`, legacy root modules, and
  `signal-framework` coexist without enforced ownership boundaries.
- Risk: contributors choose the wrong extension point, duplicate fixes, or
  introduce incompatible behavior into legacy paths.
- Mitigation: publish a module ownership map and enforce domain boundaries.
- Implementation: create `docs/architecture/module-map.md`,
  `docs/architecture/ownership-map.md`, and package-level boundary manifests;
  wire a CI check that validates forbidden imports.
- Testing: add dependency-boundary tests that fail on forbidden cross-era
  imports and public API snapshots that reveal accidental exports.
- Rollback: start with report-only CI, then make boundary violations blocking
  after owners approve the map.
- Acceptance criteria: every package is classified as canonical, compatibility,
  legacy, app, docs, or generated, and CI prevents new architectural drift.

### ARCH-003: Source-Only Legacy Modules Are Not In The Workspace Test Path

Status: Proposed

- Root cause: `packages/core`, `packages/http`, `packages/security`,
  `packages/transport`, and `packages/utils` are covered by root tests but are
  not aligned with the current pnpm workspace package test flow.
- Risk: regressions can hide in legacy modules while workspace checks remain
  green.
- Mitigation: either promote these modules into explicit workspace packages with
  test scripts or mark them as legacy source covered by a dedicated root check.
- Implementation: add package manifests or a root compatibility test target;
  document support status in the module map.
- Testing: run root compatibility tests in CI and verify they cover each
  retained legacy module.
- Rollback: keep the existing root tests unchanged until the new workspace or
  compatibility target passes in CI.
- Acceptance criteria: each retained legacy module has an explicit support
  label and a CI-enforced test path.

### ARCH-004: Stale And Generated Artifacts Distract Contributors

Status: Proposed

- Root cause: generated docs output, local caches, and historical scaffold
  folders have existed beside source directories.
- Risk: contributors audit or edit generated output, confuse local cache data
  with product contracts, or preserve abandoned paths accidentally.
- Mitigation: separate source, generated, ignored, and archived content with
  clear repo policy.
- Implementation: ensure generated directories are ignored, document source-only
  directories in the repository map, and remove abandoned tracked artifacts only
  after import and deployment searches prove they are unused.
- Testing: add CI checks for generated build output, local cache folders, and
  disallowed archive artifacts.
- Rollback: restore removed artifacts from git history if a proven active
  reference is found.
- Acceptance criteria: fresh clones contain only source, docs, fixtures,
  migrations, contracts, and intentional examples; generated output is
  reproducible but not part of source review.

### ARCH-005: Architecture Diagrams And Execution Maps Are Incomplete

Status: Proposed

- Root cause: the audit includes a system map, but the repository does not yet
  have a complete architecture directory with dependency graph, module map,
  ownership map, execution flow, and protocol lifecycle diagrams.
- Risk: future changes can erode architecture because reviewers lack a shared
  model.
- Mitigation: make architecture documentation a maintained product artifact.
- Implementation: create `docs/architecture/` with system architecture,
  dependency graph, module map, ownership map, execution flow, protocol
  lifecycle, and diagrams.
- Testing: add docs link checks and an architecture review checklist to PRs that
  touch public packages, runtime, HTTP binding, persistence, or event transport.
- Rollback: keep architecture docs versioned; revert individual diagrams or
  maps if they prove inaccurate.
- Acceptance criteria: a new contributor can identify canonical runtime flow,
  package ownership, and allowed dependencies without reading source first.

## Contracts And Compatibility

### CONTRACT-001: JSON Schemas Are Hand-Maintained Beside Zod Schemas

Status: Proposed

- Root cause: canonical runtime validation uses Zod while published JSON schema
  files live separately under `schemas`.
- Risk: independent implementers validate against stale or incompatible shapes.
- Mitigation: generate published schemas from canonical definitions or test
  every schema against canonical fixtures.
- Implementation: introduce `/contracts` as the canonical contract workspace;
  generate JSON Schema, OpenAPI, and AsyncAPI artifacts from source definitions.
- Testing: add schema round-trip tests, fixture validation, and compatibility
  snapshots for every query, mutation, event, result, and error contract.
- Rollback: keep current schemas published while generated artifacts run in
  parallel; switch consumers only after diff review.
- Acceptance criteria: CI fails when a canonical contract and generated/public
  schema diverge.

### CONTRACT-002: No Public Deprecation Policy

Status: Proposed

- Root cause: compatibility expectations are encoded socially rather than in a
  versioned policy.
- Risk: long-lived consumers cannot know when operations, fields, transports, or
  packages can change or be removed.
- Mitigation: publish support windows, deprecation metadata, removal rules, and
  migration requirements.
- Implementation: create `docs/governance/compatibility-policy.md`; add
  operation lifecycle metadata to capabilities and changelog checks.
- Testing: add compatibility tests that fail if deprecated or removed surfaces
  do not include policy-compliant metadata and migration notes.
- Rollback: release the policy as non-breaking; do not remove any existing
  surface until the policy window expires.
- Acceptance criteria: every public operation and package has lifecycle status,
  first-supported version, optional deprecation version, and removal eligibility.

### CONTRACT-003: Legacy Root APIs Use Unversioned Operation Names

Status: Proposed

- Root cause: older APIs use names such as `posts.create` while the current
  protocol expects `<domain>.<action>.vN`.
- Risk: clients can confuse legacy and Signal v1 contracts or build against an
  unversioned surface.
- Mitigation: isolate legacy APIs and prevent them from being advertised as
  Signal v1 compatible.
- Implementation: mark unversioned APIs as legacy in docs and capabilities;
  add adapters or aliases only when compatibility behavior is proven.
- Testing: add conformance tests that reject unversioned names from canonical
  contract output.
- Rollback: legacy names remain available through legacy entry points until a
  documented migration path exists.
- Acceptance criteria: canonical contract exports only versioned operation
  names; legacy names have explicit migration guidance.

### CONTRACT-004: Stocks Optimizer Application Contract Is Absent

Status: Proposed

- Root cause: the tracked repo contains `signal-framework/adapters/stocks-optimizer.ts`
  and tests, but not a full tracked Stocks Optimizer app contract, schemas,
  migrations, or CI workflow target.
- Risk: Signal cannot prove compatibility with Stocks Optimizer, and releases
  can silently break integration.
- Mitigation: create a formal consumer contract for Stocks Optimizer in the
  repository or remove it from infrastructure-grade compatibility claims.
- Implementation: add `contracts/consumers/stocks-optimizer/` with operations,
  schemas, event expectations, fixtures, migration expectations, and
  consumer-driven tests.
- Testing: run provider verification in CI for the adapter and any tracked app
  fixtures.
- Rollback: keep the existing adapter tests as the compatibility floor while
  the formal contract is introduced.
- Acceptance criteria: no release can merge unless Signal passes the Stocks
  Optimizer consumer contract or the consumer is explicitly marked unsupported.

### CONTRACT-005: Limited Conformance Fixtures

Status: Proposed

- Root cause: RFCs define behavior, but machine-readable fixtures and a public
  conformance runner are incomplete.
- Risk: independent teams can prototype but cannot certify production-compatible
  implementations.
- Mitigation: create a Signal Compliance Suite.
- Implementation: add fixtures for envelopes, queries, mutations, events,
  errors, idempotency, replay safety, HTTP binding, and transport failures.
- Testing: run the suite against the TypeScript implementation and all reference
  implementations.
- Rollback: introduce the suite as advisory first; make it release-blocking
  after the canonical implementation passes.
- Acceptance criteria: a third-party implementation can run one command and
  receive a compatibility report with actionable failures.

### CONTRACT-006: Capability Documents Lack Compatibility Metadata

Status: Proposed

- Root cause: capabilities are derived from the registry but do not carry a full
  compatibility/deprecation contract.
- Risk: large ecosystems cannot safely discover support windows, replacement
  operations, or lifecycle state.
- Mitigation: extend capability output with lifecycle metadata.
- Implementation: add fields for operation status, introduced version,
  deprecated version, removal eligibility, replacement operation, policy
  version, and contract hash.
- Testing: snapshot capabilities and validate metadata against the compatibility
  policy.
- Rollback: add metadata fields as optional first; make them required in the
  next protocol minor version.
- Acceptance criteria: capability consumers can determine whether an operation
  is stable, deprecated, experimental, or legacy without out-of-band knowledge.

## Reliability

### REL-001: Mutation State And Event Publication Are Not Atomic

Status: Proposed

- Root cause: mutation handlers can change state, then event dispatch can fail
  before durable publication or idempotency completion.
- Risk: state changes become invisible to event consumers, replay records, or
  recovery tooling.
- Mitigation: implement a transactional outbox so mutation state and event
  durability commit together.
- Implementation: add an outbox table, transaction boundary, dispatcher,
  retry engine, replay command, crash recovery loop, and idempotent consumer
  guidance.
- Testing: add failure injection tests for handler success plus dispatch
  failure, database crash, process restart, duplicate delivery, replay, and
  poison-message handling.
- Rollback: allow operations to opt into legacy in-process dispatch while the
  outbox runs in shadow mode; disable outbox dispatch with a feature flag if a
  production issue appears.
- Acceptance criteria: for outbox-backed mutations, either mutation state and
  event durability both commit or neither commits.

### REL-002: Default Dispatcher Is In-Process And Synchronous

Status: Proposed

- Root cause: the default runtime dispatcher calls subscribers inside the
  process and can propagate subscriber failures.
- Risk: one slow or failing subscriber increases mutation latency, blocks event
  flow, or fails the request path.
- Mitigation: isolate public event processing through durable queues or logs and
  define in-process dispatch as development-only or private-process behavior.
- Implementation: provide dispatcher interfaces for durable transports, retry
  policy, backpressure, dead-letter sinks, and subscriber isolation.
- Testing: add tests for slow subscribers, failed subscribers, retry exhaustion,
  dead-letter creation, and continued processing for healthy subscribers.
- Rollback: keep the current dispatcher as a compatibility implementation and
  default only for examples until durable dispatch is adopted.
- Acceptance criteria: production guidance and reference server defaults do not
  rely on synchronous in-process public event delivery.

### REL-003: Idempotency Completion Is Non-Atomic With Handler Side Effects

Status: Proposed

- Root cause: a handler and event dispatch can complete before idempotency
  completion is durably recorded.
- Risk: a retry after completion failure can duplicate side effects or lose the
  replayable result.
- Mitigation: move idempotency state, mutation state, and outbox writes into a
  single transaction where a durable store is configured.
- Implementation: add transactional idempotency APIs and operation hooks that
  execute handler state changes inside the same transaction or require an
  external transaction adapter.
- Testing: inject failure during idempotency completion and prove retries return
  deterministic results or safe conflict errors.
- Rollback: operations that cannot support transactions remain marked
  non-atomic and excluded from infrastructure-grade claims.
- Acceptance criteria: durable idempotency-backed mutations cannot report
  handler success without a durable replay record.

### REL-004: Handler Timeouts And Cooperative Deadlines Are Missing

Status: Proposed

- Root cause: current deadline checks classify failures before handler
  execution, but long-running handlers and dependencies are not bounded by
  runtime timeouts.
- Risk: hung handlers consume resources, violate SLOs, and make retries
  unpredictable.
- Mitigation: enforce handler timeouts and propagate cancellation signals to
  dependency adapters.
- Implementation: add per-operation timeout configuration, `AbortSignal`
  propagation, timeout classification, and cleanup hooks.
- Testing: add tests for pre-expired deadlines, mid-handler timeout, dependency
  cancellation, cleanup execution, and idempotent retry after timeout.
- Rollback: introduce timeout enforcement in warn-only mode per operation
  before making it blocking.
- Acceptance criteria: every operation has a configured deadline behavior and
  tests prove long-running handlers are bounded.

### REL-005: Retry, Backoff, Dead-Letter, And Poison-Message Policies Are Missing

Status: Proposed

- Root cause: event processing guidance exists, but production retry and
  failure-isolation policies are not implemented across transports.
- Risk: transient failures drop messages or poison messages cause unbounded
  retries and queue blockage.
- Mitigation: define and implement retry policy, exponential backoff,
  max-attempts, dead-letter queues, and replay tooling.
- Implementation: add shared retry policy types, dispatcher hooks, dead-letter
  records, replay CLI/API, and operator documentation.
- Testing: add duplicate delivery, retry exhaustion, poison payload, and manual
  replay tests.
- Rollback: policy can be configured per transport; fallback to no-retry legacy
  behavior remains available for local examples.
- Acceptance criteria: every durable event transport has bounded retries,
  observable dead letters, and operator replay support.

### REL-006: Dependency Health Checks And Circuit Breakers Are Missing

Status: Proposed

- Root cause: database, queue, HTTP, and adapter dependencies are called without
  standardized health, circuit-breaker, or bulkhead behavior.
- Risk: dependency outages cascade into request failures and resource
  exhaustion.
- Mitigation: add runtime boundary health checks, circuit breakers, bulkheads,
  and graceful degradation rules.
- Implementation: define dependency interfaces with health probes, breaker
  state, timeout policy, retry budget, and degradation behavior.
- Testing: simulate Postgres outage, Kafka outage, HTTP dependency outage,
  slow dependency, breaker half-open recovery, and bulkhead saturation.
- Rollback: configure breakers per dependency and support disabled mode for
  local development.
- Acceptance criteria: dependency failures are bounded, classified, observable,
  and recover without process restart.

### REL-007: Reference Server Falls Back To Memory Idempotency

Status: Proposed

- Root cause: when `DATABASE_URL` is absent, the reference server silently uses
  memory idempotency.
- Risk: users can believe replay safety is durable when process restarts erase
  records.
- Mitigation: make storage mode explicit and warn or fail based on environment.
- Implementation: add environment validation, startup banner, and production
  mode requirement for durable idempotency.
- Testing: test startup with no `DATABASE_URL`, invalid `DATABASE_URL`, and
  production mode without durable store.
- Rollback: keep memory fallback for local development with clear labeling.
- Acceptance criteria: production mode cannot silently run with non-durable
  idempotency.

### REL-008: PostgreSQL Idempotency Is A Hard Dependency When Configured

Status: Proposed

- Root cause: configured PostgreSQL idempotency does not have a health-driven
  degradation or breaker policy.
- Risk: database outages turn every protected mutation into immediate internal
  failure without operator context or controlled degradation.
- Mitigation: add health checks, breaker state, clear error classification, and
  runbook guidance.
- Implementation: expose idempotency store health and metrics; classify reserve,
  complete, and replay failures separately.
- Testing: inject database outage during reserve, replay, complete, and cleanup.
- Rollback: allow operators to switch specific low-risk operations to
  non-idempotent or memory mode only with explicit degraded-mode logging.
- Acceptance criteria: idempotency database failures are visible, classified,
  metered, and covered by runbooks.

### REL-009: Stored Idempotency Results Lack Validation And Quarantine

Status: Proposed

- Root cause: replayed database values are not explicitly schema-validated or
  quarantined when corrupted.
- Risk: corrupted stored results can return invalid protocol responses or crash
  replay.
- Mitigation: validate stored records before replay and quarantine invalid rows.
- Implementation: add schema version, result validation, quarantine table or
  status, operator export, and repair guidance.
- Testing: seed corrupted rows and verify quarantine, alerting, and safe client
  failure response.
- Rollback: keep raw rows untouched; quarantine marks records and can be
  reversed after manual repair.
- Acceptance criteria: corrupted idempotency records never produce invalid
  successful replay responses.

### REL-010: Recovery Drills Are Missing

Status: Proposed

- Root cause: recovery expectations are described as requirements but not
  exercised as automated drills.
- Risk: restore, replay, and failover procedures fail during real incidents.
- Mitigation: add runbooks and recurring validation tests.
- Implementation: create `runbooks/` for database outage, queue outage,
  deployment rollback, credential compromise, and regional failure; add restore
  test jobs.
- Testing: run backup restore, outbox replay, idempotency replay, queue
  dead-letter replay, and rollback drills in CI or scheduled environments.
- Rollback: runbooks are additive; restore jobs can be disabled if unstable
  while preserving manual procedures.
- Acceptance criteria: each critical incident class has an executable runbook
  and at least one automated validation.

## Scalability

### SCALE-001: Scale Targets Are Undefined

Status: Proposed

- Root cause: no documented budgets exist for QPS, event throughput, table size,
  replay latency, recovery time, or concurrency.
- Risk: teams cannot distinguish acceptable growth from regressions.
- Mitigation: define measurable scale targets and test profiles.
- Implementation: add `docs/operations/performance-budgets.md` with baseline,
  target, and release-blocking budgets.
- Testing: run load tests for query, mutation, event, idempotency replay, and
  outbox dispatch paths.
- Rollback: start budgets as advisory until stable baselines exist.
- Acceptance criteria: CI reports performance deltas and blocks regressions
  once budgets are accepted.

### SCALE-002: Event Dispatch Inside Mutation Completion Increases Tail Latency

Status: Proposed

- Root cause: mutation completion includes event dispatch work in the request
  path.
- Risk: subscriber or transport latency inflates p95/p99 mutation latency.
- Mitigation: persist events to an outbox during mutation and dispatch
  asynchronously.
- Implementation: use the transactional outbox from REL-001 and return mutation
  responses after durable commit.
- Testing: benchmark mutation latency with slow subscribers and durable outbox
  dispatch.
- Rollback: allow operation-level synchronous dispatch only for local or test
  workflows.
- Acceptance criteria: public event delivery latency does not directly determine
  mutation response latency.

### SCALE-003: Idempotency Table Lacks Retention, TTL, Tenant Dimension, And Partitioning

Status: Proposed

- Root cause: PostgreSQL idempotency has unique-key behavior but no documented
  long-term lifecycle model.
- Risk: unbounded table growth degrades replay and reserve performance and
  prevents multi-company isolation.
- Mitigation: add expiration policy, pruning, tenant keys, indexes, and
  partitioning strategy.
- Implementation: extend schema and APIs with tenant/context dimensions,
  expiration timestamps, cleanup jobs, and migration guides.
- Testing: load large tables, verify pruning safety, validate tenant isolation,
  and test migration from tenantless records.
- Rollback: add nullable tenant and expiration columns first; keep old unique
  constraints until migration completes.
- Acceptance criteria: idempotency records have bounded retention and
  tenant-aware uniqueness for production deployments.

### SCALE-004: Decision Memory Lacks Pagination, Tenant Isolation, Sharding, And Archive Strategy

Status: Proposed

- Root cause: decision memory tables have indexes and retention jobs, but not a
  full high-volume data lifecycle.
- Risk: long-running deployments accumulate expensive queries and mixed-tenant
  data exposure risk.
- Mitigation: add pagination, tenant/source isolation, archival, and shard
  strategy.
- Implementation: update decision memory contracts and persistence adapters
  with cursor pagination, tenant keys, archive jobs, and migration paths.
- Testing: run high-volume fixtures, tenant isolation tests, archive/restore
  tests, and query plan checks.
- Rollback: introduce pagination APIs alongside existing list APIs and mark old
  list APIs deprecated.
- Acceptance criteria: decision memory can retain years of records with bounded
  query cost and tenant isolation.

### SCALE-005: Memory Stores And Linear Maps Are Not Production Stores

Status: Proposed

- Root cause: in-memory stores are useful for examples but do not persist,
  distribute, or scale across processes.
- Risk: deployments lose data on restart and cannot scale horizontally.
- Mitigation: classify memory stores as development/test-only and provide
  durable adapters for production paths.
- Implementation: add environment guards, docs, and durable adapter examples
  for idempotency, outbox, decision memory, and audit records.
- Testing: restart tests prove durable adapters survive process loss while
  memory adapters are labeled non-durable.
- Rollback: memory stores remain available for local examples and unit tests.
- Acceptance criteria: production docs and reference deployments never present
  memory stores as infrastructure-grade persistence.

### SCALE-006: Kafka Example Lacks Production Backpressure And Lag Operations

Status: Proposed

- Root cause: the Kafka plus PostgreSQL example proves replaceable event
  boundaries but not production operations.
- Risk: teams copy an example that lacks lag monitoring, backpressure,
  dead-letter handling, and replay procedures.
- Mitigation: expand examples or clearly label them as skeletons.
- Implementation: add lag metrics, consumer group health, backpressure limits,
  retry policy, dead-letter topic, and replay instructions.
- Testing: simulate lag, consumer crash, duplicate delivery, and poison
  messages.
- Rollback: keep the current example as `minimal-kafka-postgresql` and add a
  production-hardened variant separately.
- Acceptance criteria: production event transport examples include operational
  controls and failure tests.

## Security

### SEC-001: HTTP Runtime Treats Auth As Metadata

Status: Proposed

- Root cause: auth context is forwarded but not enforced by the new runtime as
  authentication or authorization.
- Risk: public deployments can expose operations without verified identity or
  access control.
- Mitigation: add binding-level authentication hooks and runtime authorization
  contracts.
- Implementation: support JWT validation, issuer validation, audience
  validation, JWKS/key rotation, and per-operation auth requirements.
- Testing: add tests for missing token, invalid token, wrong issuer, wrong
  audience, expired token, rotated key, and anonymous operation allowlists.
- Rollback: ship auth enforcement behind explicit binding configuration and
  keep examples local-only until configured.
- Acceptance criteria: production HTTP bindings cannot expose protected
  operations without verified authentication.

### SEC-002: Authorization Contracts Are Missing

Status: Proposed

- Root cause: operations do not declare required roles, scopes, or policy
  checks.
- Risk: authenticated users can still perform unauthorized actions.
- Mitigation: introduce per-operation authorization metadata and policy hooks.
- Implementation: define RBAC and least-privilege contracts in operation
  definitions and capabilities.
- Testing: add allow/deny tests per operation, policy version recording, and
  audit trail entries for authorization decisions.
- Rollback: start with advisory policy checks and make them blocking per
  operation after fixtures exist.
- Acceptance criteria: every protected operation declares and enforces required
  authorization policy.

### SEC-003: Supply-Chain Policy Is Weak

Status: In progress

- Root cause: the audit found `latest` catalog usage and mixed package manager
  artifacts, while high-severity advisories were remediated during audit work.
- Risk: dependency resolution changes unpredictably and vulnerabilities enter
  the release path.
- Mitigation: pin dependency versions, use one package manager policy, run
  audits in CI, generate SBOMs, and sign releases.
- Implementation: remove `latest` ranges, document pnpm as canonical, add
  `pnpm audit`, SBOM generation, license review, and provenance checks to CI.
- Testing: CI must fail on high severity advisories, disallowed version ranges,
  missing lockfile updates, and unsigned release artifacts.
- Rollback: security exceptions require time-bound approval, documented risk,
  and a follow-up issue.
- Acceptance criteria: dependency policy is deterministic, audited, and
  release-blocking.

### SEC-004: Request Hardening Is Incomplete

Status: Proposed

- Root cause: the HTTP server lacks explicit request size, rate limit, abuse
  control, and timeout policy.
- Risk: public endpoints are vulnerable to resource exhaustion and abuse.
- Mitigation: add Fastify body limits, rate limits, request deadlines,
  validation limits, and structured rejection errors.
- Implementation: configure default limits and allow per-operation overrides in
  binding options.
- Testing: add tests for large bodies, excessive request rate, slow requests,
  malformed JSON, and schema-abuse payloads.
- Rollback: expose limits as configuration with conservative defaults and local
  development overrides.
- Acceptance criteria: public HTTP binding documents and enforces request
  protection defaults.

### SEC-005: Legacy Header-Derived Auth Is Not Production-Grade

Status: Proposed

- Root cause: legacy router maps headers into auth context without signed token
  verification.
- Risk: clients can spoof identity or role metadata if legacy paths are exposed.
- Mitigation: mark header-derived auth as development/legacy or replace it with
  verified token parsing.
- Implementation: add warnings, docs, and optional strict mode that rejects
  unsigned legacy auth headers.
- Testing: verify spoofed headers are rejected in strict mode and clearly marked
  as unsafe outside it.
- Rollback: preserve legacy behavior in non-strict mode until migration is
  available.
- Acceptance criteria: no production documentation recommends header-derived
  auth as a security boundary.

### SEC-006: Secrets Policy Is Informal

Status: Proposed

- Root cause: ignored `.env` files and local Vercel env files exist, but secret
  scanning and rotation policies are not formalized.
- Risk: secrets can leak into commits, logs, artifacts, or long-lived local
  environments.
- Mitigation: add secret scanning, environment validation, rotation docs, and
  incident runbooks.
- Implementation: configure pre-commit or CI secret scanning, document required
  environment variables, and create credential compromise runbook.
- Testing: CI fixture verifies scanner catches synthetic secrets and env
  validation catches missing or malformed secrets.
- Rollback: scanners can run in report-only mode before becoming blocking.
- Acceptance criteria: secret leakage prevention and rotation are documented,
  tested, and enforced before release.

### SEC-007: Local Ignored Vercel Env Files Must Stay Out Of Source

Status: Proposed

- Root cause: local `.vercel/.env.*.local` files are present in the working
  tree but ignored.
- Risk: a future ignore change or manual add could expose deployment secrets.
- Mitigation: protect ignored env paths with secret scanning and disallowed-file
  checks.
- Implementation: add CI checks that reject tracked `.env`, `.local`, and
  `.vercel/.env.*` files except approved examples.
- Testing: add a fixture or script test proving disallowed paths are rejected.
- Rollback: allow explicit exceptions only for `.env.example`-style files.
- Acceptance criteria: local Vercel env files cannot be committed accidentally.

## Observability And Auditability

### OBS-001: End-To-End Trace Propagation Is Missing

Status: Proposed

- Root cause: Signal results include IDs and metadata, but trace context is not
  propagated consistently through HTTP, runtime, events, and persistence.
- Risk: operators cannot connect a request to handler work, database writes,
  event publication, subscriber behavior, and replay.
- Mitigation: implement OpenTelemetry trace propagation across boundaries.
- Implementation: add trace context extraction/injection, spans for query,
  mutation, event, idempotency, outbox, dispatcher, subscriber, and persistence
  operations.
- Testing: integration tests assert trace IDs flow through HTTP to runtime and
  event dispatch.
- Rollback: tracing can be disabled by configuration while preserving
  correlation IDs.
- Acceptance criteria: one trace can explain a request from ingress through
  emitted events and durable writes.

### OBS-002: OpenTelemetry Metrics Are Missing

Status: Proposed

- Root cause: metadata exists in results, but no standard OTel metrics cover
  throughput, latency, retries, failures, or queue depth.
- Risk: production teams cannot alert on saturation, regression, or failure
  patterns.
- Mitigation: add metrics for throughput, latency, retries, failures, queue
  depth, idempotency decisions, outbox state, and dependency health.
- Implementation: instrument runtime, HTTP binding, idempotency store, outbox,
  and transports with OTel meters.
- Testing: metrics snapshot tests verify names, labels, units, and cardinality
  constraints.
- Rollback: metrics exporters are optional; no-op meter remains default for
  tests.
- Acceptance criteria: operators can build dashboards and alerts from stable
  metric names.

### OBS-003: Structured Logging Is Inconsistent

Status: Proposed

- Root cause: newer runtime lacks consistent structured logging while legacy
  compatibility code has separate Pino logging.
- Risk: logs cannot be joined reliably across services, operations, or
  incidents.
- Mitigation: define a logging contract with required fields.
- Implementation: emit structured logs with `requestId`, `correlationId`,
  `operation`, `service`, `outcome`, `duration`, `errorCode`, and trace IDs.
- Testing: log contract tests verify required fields and prevent ad-hoc log
  shapes in core packages.
- Rollback: add log adapters so existing users can keep their logger while
  conforming to the field contract.
- Acceptance criteria: every public request, mutation, event dispatch, retry,
  and failure emits contract-compliant logs.

### OBS-004: Operator Dashboards, SLOs, And Error Budgets Are Missing

Status: Proposed

- Root cause: no operational dashboard or SLO policy is published for Signal
  deployments.
- Risk: teams cannot know whether the platform is healthy or whether a release
  is acceptable.
- Mitigation: define SLOs, alert thresholds, dashboards, and error-budget
  policy.
- Implementation: add docs and example dashboards for latency, throughput,
  failure rate, retries, queue depth, outbox lag, idempotency conflicts, and
  dependency health.
- Testing: smoke-test dashboard queries against emitted metric fixtures.
- Rollback: dashboards are additive and can be versioned by metrics contract.
- Acceptance criteria: a production operator has documented health indicators
  and alerting thresholds.

### OBS-005: Append-Only Audit Trail Is Missing From The New Runtime

Status: Proposed

- Root cause: the base runtime does not guarantee durable capture of every
  action, actor, request, response, decision, policy version, and correlation ID.
- Risk: historical decisions cannot always be reconstructed or challenged.
- Mitigation: create immutable audit storage with searchable and exportable
  records.
- Implementation: add audit record schema, append-only store interface,
  Postgres adapter, redaction policy, export API, and retention policy.
- Testing: add tests for append-only enforcement, tamper detection, search,
  export, redaction, and transaction coupling with mutations.
- Rollback: support shadow audit mode before making audit writes required for
  protected operations.
- Acceptance criteria: every protected action records actor, action, request,
  response, decision, policy, correlation ID, and timestamp in append-only
  storage.

### OBS-006: Decision Reconstruction Is Partial

Status: Proposed

- Root cause: decision memory can preserve snapshots and outcomes, but the base
  runtime does not require inputs, outputs, policy version, and configuration
  version for every decision.
- Risk: a decision six months later can be unexplained unless the application
  voluntarily captured enough context.
- Mitigation: require decision provenance for governed operations.
- Implementation: define decision record requirements and integrate them with
  the governance engine and audit trail.
- Testing: add reconstruction tests that replay a decision from persisted
  inputs, policy version, configuration version, and outcome.
- Rollback: introduce as required only for operations marked governed.
- Acceptance criteria: governed decisions can be reconstructed with exact policy
  version, inputs, outputs, actor, time, and result.

## Governance

### GOV-001: RFC Lifecycle States Are Missing

Status: Proposed

- Root cause: RFCs exist but do not have formal states such as draft, accepted,
  deprecated, superseded, or rejected.
- Risk: contributors cannot know whether a protocol rule is proposed,
  normative, obsolete, or replaced.
- Mitigation: add an RFC process and lifecycle metadata.
- Implementation: create `rfcs/` or formalize `spec/` with templates,
  lifecycle states, review requirements, versioning, and supersession links.
- Testing: CI validates RFC frontmatter and blocks protocol changes without an
  accepted or draft RFC reference.
- Rollback: keep existing RFC files and add metadata incrementally.
- Acceptance criteria: every protocol change is linked to a reviewed,
  versioned RFC state.

### GOV-002: Policy, Rule, Model, And Adapter Versions Are Not Required On Decisions

Status: Proposed

- Root cause: decisions do not universally record the policy or adapter version
  that produced them.
- Risk: historical behavior cannot be audited when policies, models, or
  adapters change.
- Mitigation: introduce a governance engine that versions policies and records
  decision context.
- Implementation: add policy versioning, approval, rollback, validation,
  history, and decision-record integration.
- Testing: verify every governed decision records policy version, timestamp,
  inputs, outputs, validation status, and rollback path.
- Rollback: version recording starts as optional metadata and becomes required
  for governed operations.
- Acceptance criteria: no governed decision can be persisted without the policy
  version and governance metadata that produced it.

### GOV-003: Migration Compatibility Tests Are Missing

Status: Proposed

- Root cause: persistent stores do not have systematic backward, forward, and
  rolling-upgrade migration tests.
- Risk: deployments can corrupt or strand production data during upgrades.
- Mitigation: add upgrade-safety test suites for every durable store.
- Implementation: create migration fixtures for idempotency, outbox, audit,
  decision memory, and consumer contracts.
- Testing: run old-to-new, new-to-old-read, rolling deploy, and failed-migration
  rollback scenarios.
- Rollback: every migration includes reversible steps or documented manual
  recovery.
- Acceptance criteria: CI verifies upgrade safety for all persistent schema
  changes.

### GOV-004: Release Compatibility Checklist Is Missing

Status: Proposed

- Root cause: releases do not require a standardized compatibility,
  governance, documentation, and migration gate.
- Risk: breaking changes can ship silently.
- Mitigation: create an institutional readiness gate.
- Implementation: add CI jobs for tests, contracts, compatibility, security,
  docs, governance, and release notes.
- Testing: seed deliberate violations and verify the gate blocks them.
- Rollback: begin as report-only and switch to blocking once the baseline is
  green.
- Acceptance criteria: merges that alter public behavior cannot land without
  passing compatibility and governance checks.

### GOV-005: Long-Term Semver And Support Guarantees Are Missing

Status: Proposed

- Root cause: package versioning exists, but public long-term support rules do
  not.
- Risk: companies cannot build on Signal for years with predictable upgrade
  obligations.
- Mitigation: publish semver, support windows, and release train policy.
- Implementation: define stable, experimental, deprecated, and legacy channels;
  align package versions, operation versions, RFCs, and changelog entries.
- Testing: release checks verify semver changes match public API diffs and
  deprecation rules.
- Rollback: policy applies prospectively and does not imply immediate removals.
- Acceptance criteria: consumers can determine support duration and upgrade
  expectations from docs and package metadata.

## Developer Experience And Documentation

### DX-001: Beginner Path Exists But Production Path Is Incomplete

Status: Proposed

- Root cause: docs cover quickstart and first-app workflows more than
  production operations, compatibility, release governance, and failure modes.
- Risk: users can succeed locally and then deploy without understanding
  durability, auth, observability, or migration responsibilities.
- Mitigation: rewrite documentation as a product for both first success and
  production safety.
- Implementation: add architecture guide, protocol guide, production guide,
  operations guide, troubleshooting, migration guides, and examples.
- Testing: docs build, link checks, quickstart smoke tests, and example
  execution tests.
- Rollback: keep current beginner docs while new production docs are added.
- Acceptance criteria: docs explain both how to start in five minutes and how to
  run safely in production.

### DX-002: `run-tests.sh` References Older npm/Jest Era

Status: Proposed

- Root cause: the repository moved toward pnpm and Vitest while older test
  scripts remained.
- Risk: contributors run obsolete commands and misread the health of the repo.
- Mitigation: replace or update stale scripts with current workspace commands.
- Implementation: update `run-tests.sh` or remove it after documenting the
  canonical `pnpm` commands.
- Testing: execute the script in CI or add a shellcheck-style validation that it
  references valid commands.
- Rollback: keep old script behavior behind a clearly named legacy script if
  anyone still needs it.
- Acceptance criteria: every documented test command works from a clean clone.

### DX-003: Developer Creation And Doctor Commands Are Missing

Status: Proposed

- Root cause: app, adapter, module, and environment setup are manual.
- Risk: new integrations diverge from project conventions and fail with
  unclear errors.
- Mitigation: create `signal create app`, `signal create adapter`,
  `signal create module`, and `signal doctor`.
- Implementation: add CLI templates, config validation, environment validation,
  dependency validation, and contract validation.
- Testing: snapshot generated projects, run generated tests, and simulate common
  invalid configurations.
- Rollback: ship CLI commands as experimental until generated outputs are stable.
- Acceptance criteria: a new developer can generate a conformant app, adapter,
  or module and diagnose setup issues with actionable guidance.

### DX-004: Public Operational Runbooks Are Missing

Status: Proposed

- Root cause: operational knowledge is not yet captured as executable
  documentation.
- Risk: incidents rely on individual memory and become slower or unsafe.
- Mitigation: create `runbooks/` with incident response procedures.
- Implementation: document database outage, queue outage, deployment rollback,
  credential compromise, regional failure, backup validation, and restore tests.
- Testing: validate runbooks through scheduled drills or local simulation.
- Rollback: runbooks are versioned and can be corrected without code changes.
- Acceptance criteria: every critical dependency has a runbook with detection,
  impact, mitigation, validation, and rollback steps.

## Ecosystem Readiness

### ECO-001: Tenant And Organization Model Is Missing

Status: Proposed

- Root cause: current contracts and storage do not consistently model tenant or
  organization isolation.
- Risk: multi-company deployments can mix data, idempotency keys, audit records,
  or authorization decisions.
- Mitigation: define tenant context as a first-class protocol and persistence
  concept.
- Implementation: add tenant metadata to envelopes, auth context, idempotency
  keys, audit records, outbox records, and decision memory where required.
- Testing: add tenant isolation, cross-tenant access denial, and migration tests.
- Rollback: introduce tenant fields as optional and require them only for
  multi-tenant deployment mode.
- Acceptance criteria: multi-tenant deployments can prove isolation at protocol,
  persistence, audit, and authorization layers.

### ECO-002: SDKs Beyond Node Helpers Are Missing

Status: Proposed

- Root cause: `@signal/sdk-node` exists, but portable SDK coverage is limited.
- Risk: protocol adoption depends on one runtime and cannot prove independent
  implementation viability.
- Mitigation: maintain TypeScript, Node.js, and Go reference implementations.
- Implementation: define contract-first SDK generation and build a Go
  implementation against the conformance suite.
- Testing: run conformance tests against each implementation.
- Rollback: keep non-TypeScript SDKs experimental until the suite is stable.
- Acceptance criteria: protocol behavior does not depend on one runtime.

### ECO-003: Plugin Registry And Integration Governance Are Missing

Status: Proposed

- Root cause: extension points and third-party integration rules are not
  formalized.
- Risk: integrations can conflict with protocol guarantees, security policy, or
  compatibility rules.
- Mitigation: define plugin and adapter contracts with certification criteria.
- Implementation: add integration manifest schema, review requirements,
  capability declarations, security requirements, and compatibility tests.
- Testing: validate sample plugins and reject manifests that violate declared
  boundaries.
- Rollback: treat registry participation as optional until governance is mature.
- Acceptance criteria: third-party adapters can be reviewed, certified, and
  deprecated without weakening core contracts.

### ECO-004: Reference Server Is Not A Production Deployment Blueprint

Status: Proposed

- Root cause: the reference server optimizes for local onboarding and can use
  memory fallback behavior.
- Risk: users copy local defaults into production.
- Mitigation: split local reference behavior from production reference
  architecture.
- Implementation: add a production reference deployment profile with durable
  idempotency, outbox, auth, request hardening, observability, audit, and
  runbooks.
- Testing: run end-to-end production profile tests with restart, dependency
  failure, and replay scenarios.
- Rollback: keep local reference server unchanged and introduce production
  profile separately.
- Acceptance criteria: docs clearly distinguish local learning defaults from
  production-safe defaults.

## Release Engineering

### RELENG-001: Reproducible Builds And Signed Artifacts Are Missing

Status: Proposed

- Root cause: release flow builds and publishes packages without a documented
  provenance and signing model.
- Risk: consumers cannot verify artifact integrity or reproduce release output.
- Mitigation: implement reproducible builds, provenance, and signed artifacts.
- Implementation: pin toolchain, add provenance metadata, sign packages, and
  publish checksums.
- Testing: rebuild release artifacts in CI and compare checksums; verify
  signatures before publish.
- Rollback: keep unsigned internal builds separate from public releases until
  signing is stable.
- Acceptance criteria: every public release artifact is reproducible or
  provenance-attested and verifiably signed.

### RELENG-002: Automated Changelogs And Migration Generation Are Missing

Status: Proposed

- Root cause: release notes and migrations are not systematically generated
  from public contract and schema changes.
- Risk: consumers miss breaking changes or required migrations.
- Mitigation: generate changelogs and migration notes from contract diffs,
  schema diffs, and RFC references.
- Implementation: add release tooling that collects API diffs, operation
  lifecycle changes, migrations, and compatibility test results.
- Testing: release dry-runs verify changelog completeness and migration
  presence for schema changes.
- Rollback: allow manual changelog entries with CI validation while automation
  matures.
- Acceptance criteria: every release explains public changes, compatibility
  impact, and required migrations.

### RELENG-003: Institutional Readiness Gate Is Missing

Status: Proposed

- Root cause: CI does not yet combine tests, contracts, compatibility, security,
  documentation, governance, and release readiness into one merge gate.
- Risk: infrastructure-grade requirements remain aspirational instead of
  enforced.
- Mitigation: create an `institutional-readiness` CI gate.
- Implementation: compose existing and new checks into one required workflow:
  unit tests, integration tests, conformance, consumer contracts, migration
  safety, security audit, docs build, RFC/ADR checks, compatibility policy, and
  release notes.
- Testing: add negative fixtures or dry-run jobs that prove each subgate can
  fail the parent gate.
- Rollback: launch as non-blocking, then require it after baseline stabilization.
- Acceptance criteria: no merge can bypass the infrastructure readiness bar.

## Already Applied Or In-Progress Remediations To Preserve

The audit records these safe remediations as already applied or in progress in
the working tree. They must be preserved unless a replacement is proven
equivalent:

- PostgreSQL idempotency migration includes the `result_meta` column required by
  the Drizzle schema and store implementation.
- A regression test checks migration columns used by the schema.
- `drizzle-orm` was updated to `0.45.2`.
- `serialize-javascript` is pinned through `pnpm.overrides` to `7.0.5`.
- `pnpm audit --audit-level=high` exits cleanly at the time of the audit.

## Cross-Cutting Test Matrix

| Area | Required Tests |
| --- | --- |
| Protocol | RFC fixtures, schema generation, compatibility snapshots, conformance suite. |
| Runtime | query/mutation/event execution, deadlines, cancellation, idempotency, replay, error classification. |
| Outbox | atomic commit, crash recovery, retry, duplicate delivery, replay, poison messages. |
| Security | JWT validation, issuer, audience, key rotation, RBAC, rate limits, request size, abuse payloads. |
| Observability | trace propagation, metric names and labels, log contract, audit record capture. |
| Persistence | migrations, rollback, restore, retention, tenant isolation, pagination, corrupted record quarantine. |
| Governance | RFC state validation, ADR presence, policy versioning, deprecation metadata, release checklist. |
| Ecosystem | Stocks Optimizer consumer contract, SDK conformance, plugin manifest validation. |
| Operations | chaos tests, dependency outages, queue lag, database restore, deployment rollback, credential compromise. |

## Rollback Policy

- Every migration must document whether it is reversible, forward-only, or
  recoverable by restore.
- Every behavior change must provide a feature flag, compatibility wrapper, or
  deprecation window unless it fixes an active security issue.
- Every removal requires evidence of unused status, migration guidance, and
  release-note visibility.
- Every new gate starts in report-only mode unless it protects a security or
  data-integrity invariant.

## Institutional Readiness Definition

Signal is infrastructure-grade only when all of the following are true:

- There is one canonical protocol/runtime implementation or documented
  equivalence across implementations.
- Mutations, idempotency records, events, and audit records have atomic and
  replayable durability semantics.
- Auth, authorization, rate limiting, schema validation, and secret hygiene are
  enforced on public edges.
- Operators can trace, measure, alert, replay, restore, and explain production
  behavior.
- Protocol, contract, migration, and release changes are governed by RFCs,
  ADRs, compatibility policy, and CI gates.
- External consumers can run conformance and consumer-driven contract tests
  before depending on a release.
- Documentation describes both the fastest path to first success and the safest
  path to long-term operation.
