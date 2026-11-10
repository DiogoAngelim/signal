# Signal Reference Lab

A deliberately small case-management application and a reproducible engineering evaluation harness for exercising Signal through its public packages. The application is the test subject; Signal is the system under evaluation. The lab is not a substitute implementation of Signal and does not import private package source.

## What it does

The reference workflow is intentionally generic: submit a request, attach sourced evidence, assess uncertainty and risk, make a capacity-constrained decision, record an accountable authorization, capture the eventual outcome, and review what happened.

The workflow exercises:
- `@signal/sdk-node`: registered queries and mutations, runtime dispatch, context, idempotency keys, event publication and subscribers;
- `@signal/decision`: evidence assessment, governance, stewardship, decision records and structured outcome learning reviews;
- `@signal/decision-memory` through the public SDK: in-memory decision record and review storage;
- `@signal/commitment`: resource allocation, feasibility and hard constraints;
- `@signal/semantic-state`: generic-state lexicon interpretation;
- `@signal/agency`: approval policy, decision/outcome cycles, trace retention and self-diagnosis.

The evaluation harness runs six deterministic scenarios: full lifecycle, evidence hard-stop, tenant isolation, repeat submission, concurrent duplicate submission, and invalid input. It emits machine-readable scenario results, capability status, a weighted engineering scorecard and evidence references.

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

Or from this directory: `pnpm lab`, `pnpm evaluate`, `pnpm coverage:verify`, `pnpm start`, `pnpm benchmark`. The local web UI listens on `127.0.0.1:4179` by default. Set `PORT` to change it.

Save a benchmark baseline with `pnpm benchmark -- --out baseline.json`, then compare it later with `pnpm compare -- baseline.json`. Comparison rejects mismatched workload or Node/OS/CPU-count metadata. The benchmark measures only local in-process query dispatch; it is not a production, PostgreSQL, HTTP or distributed benchmark.

## Capability truth

| Capability area | Current status |
|---|---|
| Protocol schemas, SDK operation definitions, runtime query/mutation dispatch | Exercised |
| Event publication and in-process subscription | Exercised |
| Mutation idempotency and concurrent duplicates | Partial: memory-backed runtime only; no distributed proof |
| Tenant boundary | Exercised at application repository boundary; not an external identity/authentication certification |
| Decision evidence assessment, governance, stewardship and rationale | Exercised through `@signal/decision` |
| Decision record and outcome review storage | Partial: public SDK in-memory store; durable persistence and retention are not exercised |
| Commitment constraints and resource allocation | Exercised through `@signal/commitment` |
| Semantic-state interpretation | Exercised through `@signal/semantic-state` |
| Agency policy and decision/outcome cycles | Exercised through `@signal/agency`; calibration and statistical learning remain partial because the sample is intentionally small |
| PostgreSQL transactions, outbox/inbox, locking and crash recovery | Not verified |
| HTTP binding package, runtime-level authorization and external auth | Not verified |
| Retry budgets, circuit breakers, timeouts and provider recovery | Not verified |
| Deterministic replay, audit chains/checkpoints and tamper detection | Not verified; the process-local event journal is not an audit log |
| Metrics/tracing export, resource benchmarks, production load and soak | Not verified; the included benchmark is local-only |
| Kernel legacy compatibility and Signal CLI certification surfaces | Not verified / not applicable to the current workflow |

A capability is not credited merely because a package exists. Each status must be backed by a scenario and observable evidence. In-process delivery is not proof of durable delivery or exactly-once external effects. The inventory deliberately distinguishes exercised, partial and unverified capabilities rather than presenting simulated adapters as production integrations.

## Score model

The scorecard uses the engineering dimensions and weights established for Signal: functional correctness 18%, reliability/resilience 16%, performance/resources 12%, architecture 14%, security/integrity 12%, maintainability 10%, testing 8%, developer experience 6%, and operability 4%. Each dimension includes evidence and confidence. Unmeasured performance and operability receive neutral provisional scores with low confidence; missing measurements are not treated as proof of either zero cost or excellent performance.

The score is for the reference integration and its harness, not a certification score for the Signal product. Application defects, harness defects, infrastructure constraints and Signal package defects must be attributed separately.

## Boundaries and next integration gates

The application uses public Signal package exports only. The harness does not modify Signal, hide failures or automatically change source code. It reports evidence and limitations for subsequent engineering.

The remaining gates are real PostgreSQL integration (transactions, outbox/inbox, concurrent workers, leases and restart recovery), HTTP binding integration, runtime authorization, fault injection for retries/circuit breakers/provider failures, deterministic replay and audit verification, telemetry/resource collection, repeated load/soak profiles, and comparable persisted baselines. These are explicit unverified work, not silently simulated successes.
