# Signal engineering measurements

This document defines the executable measurement inventory and the boundary
between measurements that can run in CI and those that require a representative
deployment or external operator-controlled infrastructure.

## Automated in CI

| Area | Measurement | Method | Evidence artifact |
|---|---|---|---|
| Runtime dispatch | p50/p95/p99 latency, throughput, CPU time, heap/RSS deltas | Three repeated runs across 256 B, 4 KiB, and 64 KiB payloads at concurrency 1/16/64 | `signal-engineering-measurements-<sha>` |
| HTTP binding | p50/p95/p99, throughput, CPU, heap/RSS | Fastify inject, request validation, trusted auth resolver, query authorization, serialization; three runs at concurrency 1/16/64 | Same artifact |
| PostgreSQL idempotency/outbox | Commit latency/throughput, claim-batch latency, acknowledgement latency, CPU, heap/RSS, pool limit | PostgreSQL 16 service; three runs across 256 B/4 KiB payloads and concurrency 1/8/32; transactional completion plus outbox insert, batch claim, and ack | Same artifact |
| Correctness | Failed-handler retry, concurrent duplicate coalescing, successful dedupe | Dispatcher regression tests | Vitest results |
| HTTP identity | Spoofed body claims rejected; trusted resolver identity reaches authorization hook | Fastify integration tests | Vitest results |
| Architecture | Dependency-rule violations | `pnpm arch:check` | CI logs |
| Build and type safety | Workspace package builds and TypeScript checks | Existing core workflow | CI logs |
| Database resilience | Transaction, network fault, crash/recovery, fencing tests | Existing PostgreSQL-backed integration suite | CI logs |

## Measurement interpretation

The dispatch benchmark includes envelope creation and one in-process subscriber. The HTTP benchmark uses Fastify injection rather than a TCP socket and exercises server-side auth resolution, query authorization, and per-route rate limiting. A separate controlled burst verifies exact admission and rejection counts plus retry headers. The distributed circuit-breaker benchmark uses two separate PostgreSQL adapter pools against the same database row, deliberately races concurrent half-open acquisitions, and fails if more or fewer than one permit is granted per cycle. The PostgreSQL benchmark applies the adapter SQL migrations and runs against an ephemeral PostgreSQL 16 service, exercising the actual idempotency/outbox adapter. Run `node benchmarks/prepare-postgres.mjs` before `node benchmarks/postgres-outbox.mjs` when measuring locally. These are controlled CI measurements; they do not measure managed-database network latency, real broker delivery, multi-replica contention, or production resource limits. Compare
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
- PostgreSQL lock waits, pool saturation, query plans, and transaction duration at production-like data volume and contention.
- Broker delivery lag, queue age, redelivery amplification, and backlog drain
  across real broker deployments.
- Multi-process and multi-region scaling, failover, and network partition cost beyond the two-adapter, single-database contention scenario measured in CI.
- Sustained memory/CPU behavior and leak trends over hours or days.
- Cost per 1,000 successful operations on the target hosting and database plans.
- Availability, SLO attainment, alert quality, restore time, and recovery point.
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
