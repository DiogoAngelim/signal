# Signal production simulation

## Purpose and trust boundary

The GitHub Actions workflow `.github/workflows/production-simulation.yml` exercises Signal's infrastructure-facing PostgreSQL adapter against a disposable PostgreSQL 16 service. It is a repeatable failure-oriented CI environment, not a production environment.

The workflow runs on relevant pull requests, pushes to `main` and `codex/**`, a weekly schedule, and manual dispatch. The manual `extended` profile and scheduled runs repeat the PostgreSQL integration suite three times to expose order dependence and intermittent failures.

## What is exercised

| Area | Executed evidence | Boundary |
|---|---|---|
| Atomic mutation + event persistence | Real PostgreSQL migration and transaction integration tests | One disposable database; not a multi-region database |
| Idempotent replay | Adapter integration test reserves, completes, and re-reserves the same operation | Does not reproduce arbitrary external reads or side effects |
| Outbox claiming and acknowledgement | Real PostgreSQL lease/claim and worker-ownership checks | No external broker or real consumer |
| Lease expiry and recovery | Expired claim is reclaimed by a different worker identity | Deterministic state transition; not an OS process-kill test |
| Retry and dead-letter | Adapter retry limit and dead-letter persistence | No operator redrive workflow is certified |
| Transaction rollback | Forced outbox constraint violation verifies atomic rollback | Does not simulate every storage-engine failure mode |
| Runtime resilience and audit | Runtime package tests execute against the same source revision | No distributed breaker coordinator or independently anchored audit store |
| Architecture | Dependency boundary check | Static architecture check only |

The workflow records the source SHA, run identity, selected profile, runtime version, PostgreSQL image, and logs in a 30-day GitHub Actions artifact. Evidence is tied to the exact commit and run; it should not be detached from that provenance.

## Run it

- Open **Actions → Signal production simulation → Run workflow**.
- Choose `standard` for the normal integration and resilience suite.
- Choose `extended` to repeat the PostgreSQL integration tests three times.
- Scheduled weekly runs also use the repeatability pass.

The same core integration suite can be run locally after starting PostgreSQL:

```sh
SIGNAL_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/signal_simulation \
  pnpm --filter @signal/idempotency-postgres exec vitest run test/transactional-store.integration.test.ts
```

## What a green run does not establish

A green run means only that the configured scenarios passed on the recorded source revision and ephemeral GitHub-hosted runner. It does **not** establish:

- Production availability, throughput, latency, capacity, or an SLO.
- Correct behavior under a real message broker, real consumer side effects, or process termination at every commit/publish/acknowledgement boundary.
- Distributed circuit-breaker coordination, cross-region consistency, or retry budgets.
- Independent audit immutability, cloud object-lock retention, IAM separation, signing-key custody, or key rotation.
- Backup restoration, disaster recovery, or measured RTO/RPO.
- Statistical validity on representative, independent production outcomes.
- Correctness of Redis, S3-compatible storage, or any other infrastructure not explicitly provisioned and exercised by this workflow.

GitHub-hosted runner performance is noisy and must not be used as a capacity benchmark. A MinIO-compatible API test would not prove independent cloud trust or object-lock enforcement; a real cloud integration gate must use isolated temporary resources, least-privilege identity, and separately protected credentials before it can support those claims.

## Next evidence gates

1. Add a real broker and idempotent consumer harness, then kill/restart workers around publish and acknowledgement boundaries.
2. Exercise reservation expiry/fencing with competing processes and prove stale workers cannot complete newer reservations.
3. Validate independent checkpoint storage, tamper/substitution attacks, key rotation, and restore procedures using a separately controlled trust boundary.
4. Add deterministic network fault injection and database restart/connection interruption tests.
5. Run sustained and burst workloads on a controlled runner with published workload shape, raw results, and measured resource usage.
6. Validate backup restore and operational recovery objectives in an isolated environment.
7. Use representative, leakage-free outcome datasets for statistical governance tests.

These are explicit follow-on gates, not silently implied by this simulation workflow. No deployment is changed and no production certification is granted by this CI suite.
