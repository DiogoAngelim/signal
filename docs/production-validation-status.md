# Production Validation Status

This document is the release gate for Signal itself. A passing package build or unit-test suite is necessary, but it is not a production certification.

## Source-level controls implemented

- Retry delay is capped exponential backoff; full jitter is available with an injectable random source.
- Retry and circuit-breaker configuration is validated. Retry execution supports bounded attempts, capped exponential backoff, full jitter, absolute deadlines, caller cancellation, and an injectable retry-budget port. The in-memory token bucket supports single-process deployments; the PostgreSQL adapter provides atomic cross-process consumption for replicas sharing one budget key.
- The in-memory circuit-breaker controller issues opaque, generation-scoped permits; stale outcomes cannot close a newer breaker generation, and half-open probe leases can be renewed or reclaimed after expiry.
- The PostgreSQL distributed circuit-breaker adapter coordinates a single half-open probe across independent adapter instances with expiring UUID fencing tokens.
- Audit-chain verification checks contiguous zero-based sequence numbers, linkage, SHA-256 formatting, timestamps, identity fields, and entry hashes.
- Ed25519 signed audit checkpoints can bind a chain sequence/head hash to a key ID; verification supports an externally managed trusted public key. The PostgreSQL audit-ledger adapter persists contiguous entries and checkpoints, serializes append operations, and uses append-only triggers plus default privilege revocation.
- The runtime public entrypoint exports resilience, audit-chain, outbox, and versioned replay-evidence primitives.
- The PostgreSQL transactional adapter atomically commits an idempotency result with emitted event envelopes in one database transaction. A separate PostgreSQL consumer inbox atomically deduplicates at-least-once deliveries with the consumer's own PostgreSQL side effects.
- The outbox uses leased claims with `FOR UPDATE SKIP LOCKED`, bounded batches, at-least-once delivery, retry backoff, acknowledgement ownership, dead-letter state, and bounded-cardinality queue-health statistics.
- The runtime refuses to dispatch emitted events for an idempotent mutation when the storage adapter lacks the transactional outbox capability.
- The in-memory adapter implements the same contract for deterministic tests; it is not durable.
- Versioned replay-evidence records bind operation/version, handler artifact digest, policy version, canonical input, external-read snapshots, and result fingerprints. An immutable PostgreSQL store persists these records; the replay validator rejects identity mismatches and result divergence.

## Guarantees and non-guarantees

| Concern | Current guarantee | Production limitation |
|---|---|---|
| Replay | Idempotency replay returns a stored result; explicit replay evidence can persist versioned inputs, policy/handler identity, captured external reads, and result fingerprints; replayWithEvidence verifies compatibility and result equivalence | Every runtime execution is not automatically captured; applications must explicitly snapshot all decision-relevant reads and supply a pure handler; cross-version historical execution and external side-effect reproduction are not certified |
| Event delivery | PostgreSQL adapter atomically persists result + outbox records; dispatcher provides leased at-least-once delivery; transactional consumer inbox commits deduplication identity with consumer PostgreSQL side effects | Apply migrations 0001/0002/0008 and run workers; third-party side effects still require destination idempotency or reconciliation |
| Idempotency | PostgreSQL and in-memory adapters support expiring reservation leases, renewal, atomic reclaim, and stale-owner fencing | Cross-region consistency and external side-effect idempotency remain adapter-specific |
| Audit chain | Supplied entries can be checked for internal hash-chain consistency | A chain is not immutable if an attacker can rewrite the full history and trusted head |
| In-memory circuit breaker | Permit-scoped outcomes, one half-open probe, stale-generation fencing, and renewable probe lease per controller instance | Process-local only; not shared across replicas |
| Distributed circuit breaker | PostgreSQL-backed shared state, atomic half-open lease, renewable UUID token, and stale-owner fencing | Multi-region database availability and coordination-database outage behavior are not certified |
| HTTP abuse limits | Independent query/mutation quotas, structured HTTP 429 responses, configurable shared Redis/custom store | Default store is process-local; actual Redis/network failover and trusted proxy identity require deployment validation |
| Retry | Capped exponential backoff, full jitter, bounded attempt count, absolute deadline, caller cancellation, per-operation retryable error codes, in-process token bucket, and PostgreSQL atomic shared token bucket | PostgreSQL coordination adds a database round trip per retry; the coordination database must remain available; operations must honor AbortSignal; deadlines cannot undo committed side effects; destination idempotency remains mandatory |
| Calibration | Metrics and uncertainty intervals are computed from supplied traces | No model is certified without representative, independent, leakage-free production outcomes |
| Drift | Chronological window comparison is descriptive | It is not a hypothesis test, causal diagnosis, or automatic rollback signal |
| Observability | Runtime emits start/completion/error lifecycle events; failed query, mutation, and event executions include duration and error code; unknown, ambiguous, and unsupported runtime commands emit timed error observations. Subscriber handlers emit delivered/failed outcomes with duration and sanitized error codes; replay-safe subscriptions emit separate deduplication and in-flight coalescing observations. A built-in low-cardinality metrics adapter maps lifecycle events to execution, event, subscriber, and error counters plus duration samples, separating live/replay/unspecified execution modes and bounded error sources; a bounded in-memory recorder and bounded asynchronous exporter buffer expose dropped-event and export-failure counters. Metric labels exclude operation names, request identifiers, payloads, and error codes. | The buffer is process-local and best-effort; it does not provide durable delivery, aggregation, cardinality enforcement, alerting, or retention guarantees. Subscriber deduplication observations cover replay-safe subscriptions only. A deployment must supply and validate its exporter, backend, labels, sampling, retention, and alert policies. |
| Performance | CI archives reproducible decision/replay, calibration/learning, audit-chain/checkpoint, runtime, HTTP/rate-limit, in-memory breaker, PostgreSQL outbox/idempotency, distributed-breaker, and RabbitMQ queue benchmarks with p50/p95/p99, throughput, queue age/backlog, CPU, and memory observations | CI runner and ephemeral PostgreSQL results are regression evidence, not production capacity or SLO certification |

## Release-blocking production evidence

Do not label Signal production-certified until the following evidence exists:

1. **Transactional event delivery**
   - [x] Define an outbox contract that atomically persists the mutation result and emitted event records.
   - [x] Provide a PostgreSQL dispatcher with lease/claim, retry, dead-letter, and acknowledgement semantics.
   - [x] Add PostgreSQL integration tests for atomic commit/rollback, lease recovery, acknowledgement ownership, and dead-lettering (executed in CI when database service is available).
   - [x] Run a real RabbitMQ child-process SIGKILL simulation after publish and before acknowledgement; reclaim the lease, republish, and verify consumer inbox deduplication in CI. This validates the tested boundary, not every possible instruction-level crash point.
   - [x] Provide a PostgreSQL transactional consumer inbox that commits the deduplication key with consumer database side effects; test rollback, redelivery, and concurrent independent adapters.\n   - [ ] Require destination idempotency or reconciliation for third-party side effects. Do not claim exactly-once external side effects.

2. **Replay completeness**
   - [x] Define a versioned replay evidence envelope binding operation/version, handler artifact digest, policy version, canonical input, external-read snapshots, and result fingerprints.
   - [x] Persist replay evidence in an immutable PostgreSQL store with insert-only semantics and append-only guards.
   - [x] Provide a replay validator that fails closed on digest mismatch, incompatible handler/policy identity, or result divergence.
   - [x] Keep replay computation explicitly separate from external side effects through a pure callback boundary.
   - [ ] Integrate explicit evidence capture into each application execution path that requires deterministic reconstruction; Signal cannot automatically observe arbitrary external reads.
   - [x] Test evidence persistence through a new adapter/pool instance and fail-closed compatibility checks for mismatched handler/policy versions.
   - [ ] Execute retained historical handler artifacts across supported runtime/package upgrades and verify reproducible results.
3. **Trusted audit checkpoints**
   - [x] Provide Ed25519 checkpoint signing and verification primitives binding sequence, chain-head hash, timestamp, and key ID.
   - [x] Provide PostgreSQL append-only audit entry and checkpoint tables, contiguous append enforcement, row mutation/truncate rejection, and a least-privilege operations guide.
   - [ ] Anchor signed checkpoints outside the mutable audit store under independently controlled permissions.
   - [ ] Define managed key custody, rotation, checkpoint retention, restore verification, and access audit.
   - [ ] Test full-history rewrite and checkpoint substitution attacks against the deployed external checkpoint store.

4. **Distributed resilience**
   - [x] Implement permit-scoped in-memory circuit-breaker outcomes with stale-generation fencing and renewable half-open probe leases.
   - [x] Implement PostgreSQL-backed distributed breaker coordination with expiring probe tokens and fencing across independent adapters.
   - [x] Test single-probe admission, lease renewal/expiry, stale-owner rejection, and configuration consistency.
   - [ ] Validate multi-region database availability, coordination-store outages, and failover under deployment-specific conditions.
   - [x] Implement bounded retry attempts, absolute deadlines, caller cancellation, per-operation retryability, full jitter, and an injectable shared token-bucket retry budget.
   - [ ] Deploy a cross-replica retry budget where aggregate fleet-wide retry amplification must be bounded.
   - [ ] Verify destination idempotency for every retryable external side effect; generic runtime retry cannot undo a committed remote write.

5. **Statistical and learning governance**
   - [x] Exclude missing and duplicate trace IDs from calibration/drift/learning cohorts and expose exclusion counts.
   - [x] Add deterministic moving-block bootstrap uncertainty for earliest-vs-latest Brier-loss change; keep ECE descriptive.
   - [ ] Define outcome attribution, observation windows, censoring, cohort selection, and outlier policy for each deployment domain.
   - [ ] Demonstrate no training/evaluation leakage using representative independent holdout data; account for repeated monitoring and selection bias.
   - [ ] Keep calibration adjustments advisory until the domain owner approves a validated policy.

6. **Operational observability and SLOs**
   - [x] Specify required service-level indicators, low-cardinality labels, alert classes, and incident-runbook contents in docs/operations/slo-and-alerting.md.
   - [ ] Connect a durable exporter and validate bounded label cardinality, sampling, retention, and backpressure.
   - [ ] Establish deployment-specific service-level objectives from measured baselines for availability, latency percentiles, error rate, queue age, replay rate, and delivery lag.
   - [ ] Configure live alerts, dashboards, ownership, escalation, and incident runbooks.

7. **Load, chaos, and recovery validation**
   - [x] Publish reproducible benchmark scripts and commit-addressed raw CI artifacts for runtime dispatch, HTTP/rate limits, in-memory and distributed circuit breakers, PostgreSQL idempotency/outbox, RabbitMQ queue/recovery behavior, and sustained in-process runtime/memory trend measurement.
   - [x] Exercise bounded concurrency, half-open races, PostgreSQL failure/recovery, Toxiproxy network faults, RabbitMQ publish/backlog/redelivery metrics, worker process termination, and timed database backup/restore in CI simulations.
   - [ ] Run repeated sustained-runtime benchmarks on controlled runners and measure managed-database contention, long-duration memory trends, and deployment-specific recovery objectives.
   - [ ] Set production budgets from measured service requirements rather than CI runner estimates.

## Current completion boundary

Signal now provides process-local and PostgreSQL-coordinated retry budgets, a
transactional PostgreSQL consumer inbox, versioned replay-evidence records,
immutable PostgreSQL replay persistence, deterministic replay validation,
append-only PostgreSQL audit storage, signed checkpoint primitives, a bounded
observability exporter, and queue-health metrics. The core packages and
PostgreSQL adapters are exercised by CI integration tests and simulations.
The transactional outbox and replay evidence stores are not active in any
deployment merely because they exist in the repository. Operators must apply
the complete ordered migration sequence, instantiate the relevant adapters,
run persistent workers where required, and configure the corresponding
application capture and side-effect boundaries.

The PostgreSQL audit ledger is not independently tamper-proof against database
owners or superusers. External checkpoint anchoring, managed signing-key
custody, and independently administered trust registries remain deployment
requirements. Replay capture is explicit: each consuming application must
capture all decision-relevant external reads and retain compatible historical
handler artifacts. The runtime does not automatically capture arbitrary
external I/O. PostgreSQL retry budgets can coordinate replicas sharing one database and
budget key; the adapter fails closed when the coordination store is
unavailable. Cross-region coordination latency and availability remain
deployment-specific. The consumer inbox protects transactional PostgreSQL
side effects, not arbitrary third-party calls.

The RabbitMQ benchmark uses the ephemeral broker management API; it is not an
application AMQP client benchmark or production broker certification. The new
sustained-runtime benchmark is wired into engineering-measurement CI, but
controlled long-duration and production hardware evidence remain separate.
The remaining checklist items are intentionally incomplete where real
infrastructure, representative production data, independently protected
secrets/storage, human adoption studies, or deployment measurements are
required. Source-only changes cannot truthfully certify those controls.

## Certification rule

CI passing means the tested source revision passed the configured automated checks. It does not imply that production infrastructure, operational controls, real-world data quality, or service-level objectives have been validated. Each release must attach dated evidence for the relevant gates above and explicitly record any accepted residual risk.
