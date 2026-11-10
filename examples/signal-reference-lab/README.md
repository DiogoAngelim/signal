# Signal Reference Lab

A deliberately small case-management application and a reproducible engineering evaluation harness for exercising Signal through its public SDK. The application is the test subject; Signal is the system under evaluation. The lab is not a substitute implementation of Signal and does not import private package source.

## What it does

The reference workflow is intentionally generic: submit a request, attach sourced evidence, assess uncertainty and risk, record an accountable decision, and capture the eventual outcome. Every stage uses Signal's public Node SDK runtime, registered operations, mutation/query dispatch, event publication and subscriptions.

The evaluation harness runs deterministic scenarios for:
- the full request-to-outcome lifecycle;
- evidence thresholds and approval hard stops;
- tenant isolation;
- repeat submission/idempotent request identity;
- schema validation and invalid input.

It produces machine-readable JSON with scenario results, duration, assertions, a capability inventory and a weighted engineering scorecard. The score is provisional and applies to this reference integration, not to the Signal product as a whole.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter @signal/reference-lab build
pnpm --filter @signal/reference-lab evaluate
pnpm --filter @signal/reference-lab coverage:verify
pnpm --filter @signal/reference-lab start
pnpm --filter @signal/reference-lab benchmark
```

Or from this directory: `pnpm lab`, `pnpm evaluate`, `pnpm coverage:verify`, `pnpm start`, `pnpm benchmark`. The web UI listens on `127.0.0.1:4179` by default. Set `PORT` to change it.

## Current capability truth

| Area | Current evidence |
|---|---|
| Protocol schemas, SDK operation definitions | Exercised |
| Runtime query/mutation dispatch and context | Exercised |
| Event publication and in-process subscription | Exercised |
| Mutation idempotency | Partial: keys are propagated; no durable multi-process guarantee is claimed |
| Tenant boundary | Exercised at application repository boundary; not a full auth-provider security certification |
| Evidence-based assessment and hard-stop | Exercised through `@signal/decision` (`assessDecisionEvidence`) |
| Outcome capture | Exercised; no calibrated learning policy is claimed |
| PostgreSQL transactions, outbox/inbox, locking, crash recovery | Not verified by this lab yet |
| Retry budgets, circuit breakers, timeout recovery | Not verified by this lab yet |
| Deterministic replay, audit chains/checkpoints | Not verified; process-local event journal is not an audit log |
| Metrics/tracing export, resource benchmarks, soak tests | Not verified |

The inventory is intentionally conservative. A capability is not credited merely because a package exists. Each status must be backed by a scenario and observable evidence. In particular, in-process delivery is not proof of durable delivery or exactly-once external effects.

## Score model

The scorecard uses the engineering dimensions and weights already established for Signal: functional correctness 18%, reliability/resilience 16%, performance/resources 12%, architecture 14%, security/integrity 12%, maintainability 10%, testing 8%, developer experience 6%, and operability 4%. Confidence is reported separately. Missing measurements remain missing evidence; they are not silently converted into zero failures or excellent scores.

## Boundaries and next integration gates

The app uses only `@signal/sdk-node` public exports. The harness does not mutate Signal, hide failures, or automatically change its source. It reports the exact capability evidence and limitations so subsequent Signal engineering can address real gaps.

The current capability inventory spans protocol, SDK, runtime, idempotency, events, HTTP binding, PostgreSQL, outbox, inbox, resilience, replay, audit, decision, agency, memory, commitment, semantic state, kernel compatibility, observability and CLI surfaces. The executable suite covers six in-process scenarios; the rest remain explicitly unverified.

A local benchmark records throughput, p50/p90/p95/p99/max latency, process RSS/heap, Node/OS/CPU metadata and workload parameters. Save a comparable baseline with `pnpm benchmark -- --out baseline.json` (or `node dist/src/cli.js benchmark --out baseline.json`) and compare it later with `pnpm compare -- baseline.json`. Comparison rejects mismatched workload or runtime/host metadata. It is a local in-process query benchmark, not a production benchmark.

The next gates are durable PostgreSQL integration (including outbox/inbox and worker restart), fault injection, replay/audit verification, retry/circuit-breaker scenarios, telemetry/resource collectors, repeatable load/soak profiles, and baseline comparison pinned to Signal and harness commits. These remain unimplemented rather than simulated in this initial reference implementation.
