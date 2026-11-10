# Signal engineering measurements

This document defines the executable measurement inventory and the boundary
between measurements that can run in CI and those that require a representative
deployment or external operator-controlled infrastructure.

## Automated in CI

| Area | Measurement | Method | Evidence artifact |
|---|---|---|---|
| Decision pipeline and replay | Evidence assessment, coherence, full decision pipeline, replay comparison, outcome review, learning-pattern derivation p50/p95/p99; CPU and sampled peak heap/RSS | Three repeated runs with 100/1k/5k evidence items and 1k/10k/50k learning records; verifies finite assessments, same-decision replay, and balanced pattern frequencies | Same artifact |
| Audit chain and checkpoints | Append p50/p95/p99 and throughput; full-chain verification; Ed25519 checkpoint signing, signature verification, chain binding, and tamper rejection; CPU and sampled peak heap/RSS | Three repeated runs at chain lengths 1k/10k/50k; SHA-256 entries and Ed25519 signatures; verifies valid chains/checkpoints and rejects a modified entry | Same artifact |
| Calibration and learning | Calibration metrics, Brier/Wilson intervals, chronological drift, moving-block bootstrap, confidence adjustment, and trace-learning p50/p95/p99; CPU and sampled peak heap/RSS | Three repeated runs on synthetic 1k/10k/50k trace histories; 1,000 bootstrap iterations; asserts finite metrics and inferential interval contracts | Same artifact |
| Runtime dispatch | p50/p95/p99 latency, throughput, CPU time, heap/RSS deltas | Three repeated runs across 256 B, 4 KiB, and 64 KiB payloads at concurrency 1/16/64 | `signal-engineering-measurements-<sha>` |
| In-memory circuit breaker | Closed-state permit p50/p95/p99, throughput, CPU, sampled peak heap/RSS, half-open probe admission and denial latency | Three repeated runs at concurrency 1/16/64; controlled half-open burst verifies exactly one probe, lease renewal, and closed-state recovery | Same artifact |
| HTTP binding and abuse limits | p50/p95/p99, throughput, CPU, heap/RSS, admitted/rejected counts, rejection latency, retry-after header | Fastify inject, request validation, trusted auth resolver, query authorization, per-route limits, and controlled 25-accepted/25-rejected burst | Same artifact |
| PostgreSQL idempotency/outbox | Commit latency/throughput, claim-batch latency, acknowledgement latency, queue age, backlog drain, dead-letter transition latency, CPU, heap/RSS, active connections, lock waits, active query duration, commit/rollback/buffer/deadlock deltas, outbox-claim query plan | PostgreSQL 16 service; three runs across 256 B/4 KiB payloads and concurrency 1/8/32; samples `pg_stat_activity`, `pg_stat_database`, and `EXPLAIN (ANALYZE, BUFFERS)` | Same artifact |
| Distributed circuit breaker | Probe acquisition p50/p95/p99, probe-cycle throughput, contender rejection rate, CPU, heap/RSS, exact-one-probe invariant | Two independent PostgreSQL adapter instances race 1/8/32 contenders for one half-open probe; three runs; verifies fenced permit and successful closure | Same artifact |
| RabbitMQ broker queue and recovery | Persistent publish p50/p95/p99, enqueue-to-pull age, immediate ready-depth snapshot/statistics lag, drain throughput, duplicates, redelivery amplification, worker recovery duration, stale/recovery ack results, and post-drain ready/unacknowledged counts | Production-simulation workflow; 500 persistent messages, 32 concurrent management-API publishers, durable ephemeral queue, plus actual worker SIGKILL after publish/before ack and durable inbox deduplication | `signal-production-simulation-<run>` |
| Correctness | Failed-handler retry, concurrent duplicate coalescing, successful dedupe | Dispatcher regression tests | Vitest results |
| HTTP identity | Spoofed body claims rejected; trusted resolver identity reaches authorization hook | Fastify integration tests | Vitest results |
| Execution outcomes | Completion duration and failed-execution counts for query, mutation, and event paths; rejected unknown/ambiguous/unsupported commands are counted with duration; error codes are recorded without payloads or sensitive error details | Runtime lifecycle observations; regression tests assert one completion and one error event per failed operation | Vitest results |
| Subscriber delivery | Successful/failed handler counts, handler duration, sanitized error codes, completed replay deduplication counts, and in-flight coalescing counts by event name | Runtime subscription wrapper plus replay-safe deduper callbacks; tests cover handler failure, retry success, completed duplicate suppression, and concurrent in-flight delivery with exactly one handler execution | Vitest results |
| Metrics adapter | Low-cardinality execution, event, subscriber, and error counters plus execution/subscriber duration samples | `createSignalMetricsObservabilityPort` maps lifecycle observations to `SignalMetricsRecorder`; tests verify mappings, cardinality bounds, and failure isolation | Vitest results |
| Architecture | Dependency-rule violations | `pnpm arch:check` | CI logs |
| Build and type safety | Signal package builds and TypeScript checks | Core workspace build and typecheck workflows | CI logs |
| Database resilience | Transaction, network fault, crash/recovery, fencing tests | PostgreSQL-backed integration suite | Production-simulation artifact |
## Measurement interpretation

The decision benchmark exercises the core `@signal/decision` package across evidence assessment, coherence, full pipeline evaluation, replay comparison, outcome review, and learning-pattern derivation. It uses synthetic inputs and measures computational cost, not domain decision effectiveness. The audit benchmark exercises actual hash-chain append/verification and Ed25519 checkpoint operations on 1k/10k/50k entries. It measures computational cost and tamper rejection, not append-only storage or key custody. The agency statistics benchmark exercises the actual calibration and learning package on synthetic, timestamped trace histories at 1k/10k/50k observations. It measures computation cost and interval generation; it does not establish that the synthetic traces represent real decision outcomes. The dispatch benchmark includes envelope creation and one in-process subscriber. The in-memory circuit-breaker benchmark measures permit-scoped acquire/outcome cost, sampled peak process memory, and half-open contention. The distributed circuit-breaker benchmark measures two PostgreSQL adapter instances contending for the same persisted breaker. The HTTP benchmark uses Fastify injection rather than a TCP socket and exercises server-side auth resolution, query authorization, and per-route rate limiting. A separate controlled burst verifies exact admission and rejection counts plus retry headers. HTTP integration tests also verify that a custom shared-store constructor coordinates limits across independent Fastify server instances; the CI benchmark does not claim Redis network or failover performance. The distributed circuit-breaker benchmark uses two separate PostgreSQL adapter pools against the same database row, deliberately races concurrent half-open acquisitions, and fails if more or fewer than one permit is granted per cycle. The PostgreSQL benchmark applies the adapter SQL migrations and runs against an ephemeral PostgreSQL 16 service, exercising the actual idempotency/outbox adapter. It records outbox queue age and total backlog drain rate, forces and times one dead-letter transition, samples `pg_stat_activity` for adapter connections, active sessions, lock waiters, and active query duration, captures database transaction/buffer/deadlock counter deltas, and archives an `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plan for the outbox claim query inside a rolled-back transaction. The RabbitMQ simulation benchmark uses the broker management API to publish persistent messages, observe queue depth, measure enqueue-to-pull age, drain/ack the backlog, and verify zero ready/unacknowledged messages; it is explicitly not an AMQP client or production-broker SLO measurement. Run `node benchmarks/prepare-postgres.mjs` before `node benchmarks/postgres-outbox.mjs` when measuring locally. These are controlled CI measurements; they do not measure managed-database network latency, an application AMQP client, multi-region broker/database behavior, or production resource limits. Compare
results only across equivalent runner hardware, Node versions, build modes,
and workload configurations. The CI runner is a repeatable regression
environment, not a production capacity oracle.

The benchmark reports every run independently. Use medians and tail percentiles
from the raw report; do not infer stable performance from a single run. Heap
and RSS deltas are end-to-end deltas for the run, not peak-memory measurements.

## Required but not yet operationally measurable in repository CI

These require a concrete deployment, representative traffic, or operator-owned
infrastructure and must remain explicitly unvalidated until evidence exists:

- TCP/TLS HTTP latency and throughput through the deployed reverse proxy and production authentication provider.
- Managed-database network latency, production-scale data-volume query plans, sustained pool saturation, and long-duration lock contention. CI captures ephemeral PostgreSQL connection/lock/query observations and the outbox claim plan, but those are not production-capacity evidence.
- Broker delivery lag, queue age, redelivery amplification, and backlog drain
  across real broker deployments.
- Multi-process and multi-region scaling, failover, and network partition cost beyond the two-adapter, single-database contention scenario measured in CI.
- Sustained memory/CPU behavior and leak trends over hours or days.
- Cost per 1,000 successful operations on the target hosting and database plans.
- Availability, SLO attainment, alert quality, and production restore time/recovery point. CI records only runner-local disposable PostgreSQL crash-recovery and logical backup/restore timings.
- Independent developer time-to-first-proof and support burden.

Do not substitute synthetic numbers for these measurements. The release owner
must attach dated reports, workload descriptions, environment details, and
raw outputs when the relevant infrastructure becomes available.

## Baseline policy

A missing artifact is **Not measured**, not zero and not a pass. CI benchmark
results must be archived by commit SHA. Performance regressions should be
reviewed against a rolling baseline on the same runner class; initial reports
establish the baseline rather than imposing invented universal thresholds.


## Dependency security scope

The scheduled security workflow retains the full workspace production audit as
an artifact, while the release gate fails on high/critical advisories reachable
from `api/`, `packages/`, or `server/`. Example applications are reported
separately because they may have independent dependency trees and release
cadences; they are not silently treated as clean. Do not deploy an example
application with unresolved high/critical findings. The full audit artifact
must be reviewed and its findings remediated or explicitly risk-accepted by
the owner of that example.
