# Production Validation Status

This document is the release gate for Signal itself. A passing package build or unit-test suite is necessary, but it is not a production certification.

## Source-level controls implemented

- Retry delay is capped exponential backoff; full jitter is available with an injectable random source.
- Retry and circuit-breaker configuration is validated.
- The stateful circuit-breaker controller reserves one half-open probe per process.
- Audit-chain verification checks contiguous zero-based sequence numbers, linkage, SHA-256 formatting, timestamps, identity fields, and entry hashes.
- The runtime public entrypoint exports resilience, audit-chain, and outbox APIs.
- The PostgreSQL transactional adapter atomically commits an idempotency result with emitted event envelopes in one database transaction.
- The outbox uses leased claims with `FOR UPDATE SKIP LOCKED`, bounded batches, at-least-once delivery, retry backoff, acknowledgement ownership, and dead-letter state.
- The runtime refuses to dispatch emitted events for an idempotent mutation when the storage adapter lacks the transactional outbox capability.
- The in-memory adapter implements the same contract for deterministic tests; it is not durable.

## Guarantees and non-guarantees

| Concern | Current guarantee | Production limitation |
|---|---|---|
| Replay | Same idempotency key and fingerprint can return the stored result | External state and side effects are not recreated |
| Event delivery | PostgreSQL adapter atomically persists result + outbox records; dispatcher provides leased at-least-once delivery | Migration must be applied; worker must run continuously; consumer deduplication and external side-effect idempotency remain mandatory |
| Idempotency | StoragePort can reserve, complete, and fail an operation | Pending-record lease expiry/recovery and cross-region consistency are adapter-specific |
| Audit chain | Supplied entries can be checked for internal hash-chain consistency | A chain is not immutable if an attacker can rewrite the full history and trusted head |
| Circuit breaker | One half-open probe per controller instance | Not a distributed lock across processes or regions |
| Retry | Capped exponential backoff and optional full jitter | Retry ownership, retry budgets, deadline propagation, and idempotent side effects remain caller/adapter responsibilities |
| Calibration | Metrics and uncertainty intervals are computed from supplied traces | No model is certified without representative, independent, leakage-free production outcomes |
| Drift | Chronological window comparison is descriptive | It is not a hypothesis test, causal diagnosis, or automatic rollback signal |
| Observability | Bounded in-memory metric recorder is available | It is not durable and does not provide alerting, aggregation, or retention guarantees |
| Performance | CI verifies build and correctness | No production latency/throughput claim is valid without reproducible workload benchmarks |

## Release-blocking production evidence

Do not label Signal production-certified until the following evidence exists:

1. **Transactional event delivery**
   - [x] Define an outbox contract that atomically persists the mutation result and emitted event records.
   - [x] Provide a PostgreSQL dispatcher with lease/claim, retry, dead-letter, and acknowledgement semantics.
   - [x] Add PostgreSQL integration tests for atomic commit/rollback, lease recovery, acknowledgement ownership, and dead-lettering (executed in CI when database service is available).
   - [ ] Run process-kill tests after commit/before publish and after publish/before acknowledgement against a real broker/consumer.
   - [ ] Require consumer idempotency for at-least-once delivery. Do not claim exactly-once external side effects.

2. **Replay completeness**
   - Persist operation/version identifiers, canonical input, policy/configuration versions, and immutable snapshots of external reads used by a decision.
   - Separate replay-safe computation from side-effect execution.
   - Test replay across process restarts and supported package-version upgrades.
   - Reject or explicitly mark replay as incomplete when required evidence is missing.

3. **Trusted audit checkpoints**
   - Persist audit entries append-only under restrictive database permissions.
   - Anchor chain heads outside the mutable audit store (for example, signed checkpoints in a separately controlled system).
   - Define key rotation, checkpoint retention, restore verification, and access audit.
   - Test full-history rewrite and checkpoint substitution attacks.

4. **Distributed resilience**
   - Use a shared coordination mechanism if one circuit-breaker state must span replicas.
   - Define retry budgets, total deadlines, cancellation behavior, and per-operation retryability.
   - Verify that retries cannot repeat non-idempotent side effects.

5. **Statistical and learning governance**
   - [x] Exclude missing and duplicate trace IDs from calibration/drift/learning cohorts and expose exclusion counts.
   - [x] Add deterministic moving-block bootstrap uncertainty for earliest-vs-latest Brier-loss change; keep ECE descriptive.
   - [ ] Define outcome attribution, observation windows, censoring, cohort selection, and outlier policy for each deployment domain.
   - [ ] Demonstrate no training/evaluation leakage using representative independent holdout data; account for repeated monitoring and selection bias.
   - [ ] Keep calibration adjustments advisory until the domain owner approves a validated policy.

6. **Operational observability and SLOs**
   - Connect a durable exporter and define bounded label cardinality, sampling, retention, and backpressure.
   - Establish service-level indicators and objectives for availability, latency percentiles, error rate, queue age, replay rate, and delivery lag.
   - Configure alerts, dashboards, ownership, escalation, and incident runbooks.
   - Prove telemetry exporter failure cannot take down decision execution.

7. **Load, chaos, and recovery validation**
   - Publish reproducible benchmark scripts, workload distributions, environment details, and raw results.
   - Test sustained load, bursts, concurrency races, memory pressure, database outage, network partitions, process termination, and recovery.
   - Set budgets from measured production requirements rather than inherited estimates.
   - Verify backup restore and disaster-recovery objectives.

## Current completion boundary

The transactional outbox and source-level statistical safeguards are implemented in this branch. The PostgreSQL adapter is exercised by a disposable PostgreSQL service in CI. The transactional outbox is not active in any deployment merely because it exists in the repository. It is not active in any deployment merely because it exists in the repository. Operators must apply migration `0001_transactional_outbox.sql`, instantiate `createPostgresTransactionalStore`, and run a persistent worker calling `dispatchOutboxBatch`. The legacy `createPostgresIdempotencyStore` is not sufficient for idempotent mutations that emit events.

The remaining checklist items are intentionally marked incomplete where real infrastructure, representative production data, independently protected secrets/storage, or measured workloads are required. Source-only changes cannot truthfully certify those controls.

## Certification rule

CI passing means the tested source revision passed the configured automated checks. It does not imply that production infrastructure, operational controls, real-world data quality, or service-level objectives have been validated. Each release must attach dated evidence for the relevant gates above and explicitly record any accepted residual risk.
