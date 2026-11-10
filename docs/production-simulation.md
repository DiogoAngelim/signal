# Signal production simulation and code-level assurance

## Purpose and certification boundary

This workflow is Signal's repeatable, failure-oriented **code-level infrastructure assurance suite**. It provisions disposable PostgreSQL, RabbitMQ, and Toxiproxy services on GitHub Actions and exercises Signal's PostgreSQL adapter, outbox contract, and recovery patterns against them.

It is deliberately not a production deployment. The user-requested scope excludes real-world validation, live customer workloads, real cloud accounts, external key custody, and production operations. Therefore:

- A **green code-level certification run** means the exact source revision passed the listed automated infrastructure simulations and software checks.
- It does not mean Signal has been deployed, operated, independently audited, or certified against a real production environment.
- No SLO, capacity, RTO, RPO, exactly-once delivery, cloud immutability, or regulatory-compliance claim may be inferred from this workflow.
- Simulation-only credentials and ephemeral signing keys are never production secrets.

The workflow runs on relevant pull requests, pushes to `main` and `codex/**`, a weekly schedule, and manual dispatch. The `extended` profile and scheduled runs repeat the PostgreSQL, broker, network-fault, and trust-boundary integration scenarios three times. All evidence is tied to the exact source SHA and GitHub Actions run identity.

## Implemented and exercised assurance gates

| Risk / previous gap | Executable simulation | What the result establishes | What it does not establish |
|---|---|---|---|
| Atomic mutation and outbox persistence | PostgreSQL migration and transactional integration tests | Result and outbox writes commit or roll back together | Multi-region transactions or storage-provider behavior outside PostgreSQL |
| Concurrent outbox claims | Competing PostgreSQL workers using `FOR UPDATE SKIP LOCKED` | One row is not concurrently claimed by two active leases | Global coordination across independent databases |
| Stale outbox worker acknowledgement | Per-claim UUID fencing token, persisted in PostgreSQL and required by acknowledge/retry | A worker cannot acknowledge or reschedule a newer lease, even if its worker ID is reused | Fencing external side effects already performed before lease loss |
| Expired idempotency reservation and stale owner | Expiring reservation token, atomic reclaim, heartbeat renewal, and token-guarded completion/failure | A crashed or expired owner can be replaced; the stale owner cannot complete, fail, or renew the newer reservation | Preventing duplicate external side effects performed by a handler before its lease is lost; handlers still need idempotent side effects |
| RabbitMQ publish latency and backlog drain | Durable queue, 500 persistent messages, 32 concurrent management-API publishers, queue-depth snapshots, acknowledgement-on-pull, and per-message enqueue age | Captures publish p50/p95/p99, enqueue-to-pull age without waiting for management-statistics refresh, immediate queue-depth snapshot and statistics visibility lag, drain throughput, duplicates, and ready/unacknowledged backlog after drain | Uses the RabbitMQ management HTTP API, not an application AMQP client; does not certify broker quorum, replication, or production network latency |
| Broker publish / worker SIGKILL boundary | Real RabbitMQ management API plus a child Node worker that claims and publishes, then receives SIGKILL before database acknowledgement; recovery worker reclaims and republishes | The actual worker process can die after a successful publish; the event is recovered and the durable consumer inbox limits the simulated side effect to one. Recovery duration, duplicate delivery count/redelivery amplification, stale-ack rejection, and recovery-ack success are emitted as structured CI log metrics | Every possible instruction boundary, broker node failure, or exactly-once broker delivery |
| Consumer side-effect deduplication | Durable inbox primary key and side effect in one PostgreSQL transaction | Duplicate broker deliveries produce one simulated durable side effect | Correctness of every real consumer's own transaction or third-party API |
| Broker unavailable | Failed network attempt, no acknowledgement, lease expiry, recovery publish | An unacknowledged event remains recoverable after a broker outage | Broker quorum loss, replication failure, or cloud network behavior |
| PostgreSQL network interruption | Toxiproxy cuts a live connection during a transaction | Interrupted transaction is rolled back and a fresh connection succeeds after restoration | Every packet-loss, DNS, TLS, routing, and regional partition mode |
| PostgreSQL process crash | SIGKILL the disposable PostgreSQL container with a committed row and an open transaction | WAL recovery preserves committed data and rolls back the in-flight transaction | Physical disk, host, filesystem, or cloud-volume failure |
| Backup and restore | `pg_dump` / `pg_restore` into a second disposable database; compare outbox row counts and record crash-recovery, backup, and restore durations | The tested logical backup can be restored into a clean database; runner-local recovery/restore timings are retained as evidence | Point-in-time recovery, backup retention policy, offsite copies, or production RTO/RPO |
| HTTP query and mutation abuse limits | Fastify route-level rate limits, structured 429 responses, independent query/mutation budgets, and a shared-store constructor tested across two independent HTTP server instances | Requests are rejected at the configured threshold; custom shared stores can coordinate multiple Signal server instances | Actual Redis/network store availability, multi-region behavior, ingress identity configuration, and production rate-limit budgets |
| In-memory circuit breaker | Permit-scoped controller tests and a repeated throughput/half-open contention benchmark | Stale closed-state outcomes cannot close a newer generation; one half-open permit is admitted; expired probe leases are fenced and can be replaced | Cross-process coordination, which is covered separately by the PostgreSQL adapter |
| Distributed circuit breaker | PostgreSQL-backed runtime port, shared state, atomic half-open lease acquisition, expiring UUID probe tokens, and stale-owner fencing across independent adapter instances | Separate runtime processes coordinate through one durable row; only one valid half-open probe is admitted; expired probe leases can be reclaimed; stale probe results are rejected | Multi-region database availability, external dependency behavior, or a guarantee during loss of the coordination database |
| Audit checkpoint trust primitives | Ephemeral Ed25519 signing keys, signature verification, tamper rejection, and overlapping-key rotation | The cryptographic primitive detects modified checkpoint bytes and validates rotation mechanics | Independent checkpoint storage, cloud object lock, trusted timestamping, IAM separation, or production key custody |
| Database load smoke | Fixed `pgbench` workload with raw output retained | The disposable database completed a reproducible smoke workload | Signal throughput, production capacity, latency SLOs, or controlled-runner benchmarks |
| Runtime resilience and audit | Runtime package tests | The runtime's checked unit and integration behavior remains green | External operational telemetry or incident response |
| Architecture | Dependency boundary check | The declared package dependency boundaries remain valid | Runtime security or deployment isolation |

## Lease fencing contract

Outbox ownership is now represented by two independent values:

- `workerId` identifies the worker process for diagnostics.
- `leaseToken` identifies one specific claim generation.

Every successful claim creates a new UUID token. Acknowledge and retry operations must present both values. The database update is conditional on the current worker identity and token; stale operations affect zero rows and are reported as lease loss. Reusing a worker ID after restart does not restore authority from an earlier lease.

The migration `0002_outbox_lease_fencing.sql` adds the outbox token and a database constraint requiring it exactly while a row is processing. The migration `0003_idempotency_reservation_leases.sql` adds a finite reservation expiry and a generation token. Runtime handlers renew their reservation every 60 seconds against a five-minute lease; completion and failure require the current token and an unexpired lease. Expired reservations are atomically reclaimed with a new token. Consumers still must deduplicate on `envelope.messageId`: the outbox is at-least-once by design.

## Distributed circuit-breaker contract

The runtime now exposes `createDistributedCircuitBreakerController`, which delegates to the `DistributedCircuitBreakerPort`. The PostgreSQL adapter implements that port using the `signal_circuit_breakers` table introduced by `0004_distributed_circuit_breakers.sql`.

- Breaker identity is a stable, bounded key chosen by the integrating service (for example, a provider or downstream dependency).
- Threshold and reset timeout are persisted with the row. Processes using the same key but different configuration fail closed with a configuration-drift error rather than silently fighting over policy.
- Closed-state failures increment a shared counter atomically. Reaching the threshold opens the breaker and records the cooldown start.
- Once the cooldown expires, a conditional database update grants a single half-open probe and assigns a fresh UUID token with a finite lease.
- The probe owner can renew its finite lease while a health check is still running. If the owner disappears, another process may reclaim the probe after lease expiry. Success/failure from the previous owner is rejected because its token is no longer current.
- A valid probe success closes and resets the breaker. A valid probe failure reopens it and starts a new cooldown.
- The adapter does not silently fall back to process-local state if PostgreSQL is unavailable. Integrators must treat coordination-store errors as a failed acquisition and avoid issuing the protected request.

The adapter is intentionally a separate infrastructure package: applications construct the PostgreSQL port and pass it to the runtime controller. This preserves the runtime's dependency inversion and avoids coupling the runtime package to PostgreSQL. The controller is now implemented and integration-tested; individual application call sites must explicitly wrap the downstream operation with acquire/result reporting. This does not automatically instrument arbitrary network calls.

## HTTP abuse controls

The HTTP binding applies independent defaults of 120 query requests and 60 mutation requests per client IP per 60-second window. Both limits are configurable per route. Rejections return HTTP 429 with a stable `RATE_LIMIT_EXCEEDED` code and `Retry-After` metadata. The binding accepts either an ioredis-compatible client or a custom `@fastify/rate-limit` store constructor so deployments can share counters across instances. The default store remains process-local; multi-instance deployments must configure a shared store or enforce equivalent controls at a trusted ingress. Forwarded client IP headers must not be trusted unless Fastify is configured behind a known proxy boundary. The HTTP server exposes an explicit `trustProxy` option and defaults it to `false`; configure only the known proxy hops or CIDRs, never blanket-trust arbitrary forwarded headers.

## How to run it

- Open **Actions → Signal production simulation → Run workflow**.
- Choose `standard` for the complete default suite.
- Choose `extended` for three additional infrastructure repeatability passes.
- Scheduled weekly runs also execute the repeatability passes.

Local PostgreSQL integration:

```sh
SIGNAL_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/signal_simulation \
  pnpm --filter @signal/idempotency-postgres exec vitest run test/transactional-store.integration.test.ts
```

The broker, Toxiproxy, distributed circuit-breaker integration, database crash-restart, backup/restore, and load gates are orchestrated by the workflow because they require disposable sibling containers and their service network. The broker suite includes both an ambiguous-publish lease-loss simulation and an actual child-process SIGKILL after RabbitMQ accepts the publish but before the worker acknowledges the outbox row. The test then expires/reclaims the lease, republishes, and verifies the consumer inbox prevents a duplicate simulated side effect. It does not kill a worker at every possible instruction boundary.

## Evidence and provenance

Each run uploads a 30-day artifact containing:

- Source SHA, repository/ref, run ID, attempt, profile, Node version, and PostgreSQL image.
- PostgreSQL transaction, broker crash-boundary, network fault, and trust-boundary test logs.
- PostgreSQL crash-recovery and backup/restore results.
- Raw database load-smoke output.
- Runtime and full PostgreSQL adapter test output.
- Extended repeatability output when enabled.

The manifest classifies the result as simulation-only. Preserve the artifact together with its run URL and commit SHA; a log detached from provenance is not certification evidence.

## Explicit exclusions and remaining non-code evidence

The following are intentionally not claimed as solved by code-level simulation:

1. **Independent audit durability:** a locally generated signing key cannot prove cloud IAM separation, object-lock enforcement, external timestamp authority, or that an administrator cannot replace both data and trust anchors.
2. **Production key custody:** the simulation validates Ed25519 verification and rotation mechanics only; it does not use a KMS/HSM or validate access policy.
3. **Distributed circuit-breaker operations:** the shared-state controller and PostgreSQL adapter are implemented and simulated, but application-specific downstream call sites must adopt the controller. The coordination database is a dependency; its outage, failover, and regional partition behavior are not certified.
4. **Statistical validity:** synthetic and unit fixtures can validate calculations, invariants, and calibration-report behavior. They cannot establish representative sampling, absence of leakage in a real dataset, or generalization to a target population.
5. **Performance and capacity:** GitHub-hosted runner results are smoke evidence only. They are noisy and cannot establish an SLO or production capacity.
6. **Disaster recovery objectives:** logical restore is exercised, but no production backup system, offsite retention, point-in-time recovery, RTO, or RPO is certified.
7. **External side effects:** consumer deduplication is simulated using a transactional inbox. A third-party API must provide idempotency or a reconciliation protocol; Signal cannot make arbitrary external side effects exactly once.

These exclusions must remain visible in release notes and certification reports. Do not promote a code-level pass into a real-world production certification claim.

## Certification decision

The suite may report **PASS — CODE-LEVEL INFRASTRUCTURE SIMULATION** only when every required job and scenario passes on the exact commit. A skipped test, missing service, absent artifact, or incomplete run is not a pass. The result must retain the exclusions above and must never be shortened to “production certified.”
