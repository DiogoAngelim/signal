# Signal Reference Lab

A deliberately small case-management application and a reproducible engineering evaluation harness for exercising Signal through its public packages. The application is the test subject; Signal is the system under evaluation. The lab is not a substitute implementation of Signal and does not import private package source.

## What it does

The reference workflow is intentionally generic: submit a request, attach sourced evidence, assess uncertainty and risk, make a capacity-constrained decision, record an accountable authorization, execute only an explicitly approved action, capture the eventual outcome, and review what happened.

The workflow exercises:
- `@signal/sdk-node`: registered queries and mutations, runtime dispatch, context, idempotency keys, event publication and subscribers;
- `@signal/decision`: evidence assessment, governance, stewardship, decision records and structured outcome learning reviews;
- `@signal/decision-memory` through the public SDK: in-memory decision record and review storage;
- `@signal/commitment`: resource allocation, feasibility and hard constraints;
- `@signal/semantic-state`: generic-state lexicon interpretation;
- `@signal/agency`: approval policy, decision/outcome cycles, trace retention and self-diagnosis.

The evaluation harness runs thirteen deterministic scenarios:
- end-to-end request, evidence, assessment, decision, approved action and outcome;
- evidence hard-stop and action authorization;
- tenant isolation;
- repeated and concurrent idempotent submission;
- HTTP binding dispatch and forged-auth rejection;
- audit-chain integrity and signed checkpoint verification;
- replay-evidence integrity;
- retry-budget and circuit-breaker recovery;
- PostgreSQL transactional idempotency, durable outbox delivery, consumer inbox deduplication, shared retry budgets, distributed breaker state, replay evidence and append-only audit ledger.
- runtime authentication enforcement and operation-level actor-role authorization;
- malformed-input rejection.

It emits machine-readable scenario results, capability status, a weighted engineering scorecard and evidence references.

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

For the full PostgreSQL integration profile, start the isolated local database and apply Signal's actual migrations:

```sh
docker compose -f examples/signal-reference-lab/infrastructure/docker-compose.yml up -d
export DATABASE_URL=postgresql://signal:signal@localhost:54329/signal_reference_lab
pnpm --filter @signal/reference-lab db:migrate
pnpm --filter @signal/reference-lab evaluate
```

Without `DATABASE_URL`, the PostgreSQL scenario is explicitly reported as **blocked**, not passed. CI provisions PostgreSQL 16, applies the same migrations, and requires that scenario to pass.

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
| Approved action execution | Exercised; action execution requires an approved decision and records the accountable operator |
| Commitment constraints and resource allocation | Exercised through `@signal/commitment` |
| Semantic-state interpretation | Exercised through `@signal/semantic-state` |
| Agency policy and decision/outcome cycles | Exercised through `@signal/agency`; calibration and statistical learning remain partial because the sample is intentionally small |
| PostgreSQL transactions, idempotency and durable outbox | Exercised against PostgreSQL 16 in CI; at-least-once delivery is not exactly-once external effects |
| Transactional consumer inbox | Exercised against PostgreSQL 16 with duplicate message suppression |
| Shared retry budget and distributed circuit breaker | Exercised against PostgreSQL 16; multi-region behavior and real provider failure remain unverified |
| Durable replay evidence and append-only audit ledger | Exercised against PostgreSQL 16; external key custody/anchor operations remain deployment responsibilities |
| HTTP binding package | Exercised through Fastify inject; external verified identity middleware remains unconfigured |
| Runtime-level authorization | Exercised with `requireMutationAuthorization` and operation-level scope policy |
| Retry budgets and local circuit breakers | Exercised deterministically; distributed coordination and real provider failure remain unverified |
| Replay evidence integrity | Partial; content-addressed record creation and verification tested, full replay executor not integrated |
| Audit chains/checkpoints and tamper detection | Exercised for hash-chain verification and signed checkpoint anchoring; durable external ledger not configured |
| Runtime lifecycle telemetry collection | Exercised through Signal `ObservabilityPort` in memory |
| Local throughput/latency/RSS benchmark | Exercised; production load, distributed metrics/tracing export and soak remain unverified |
| Kernel legacy compatibility and Signal CLI certification surfaces | Not verified / not applicable to the current workflow |

A capability is not credited merely because a package exists. Each status must be backed by a scenario and observable evidence. In-process delivery is not proof of durable delivery or exactly-once external effects. The inventory deliberately distinguishes exercised, partial and unverified capabilities rather than presenting simulated adapters as production integrations.

## Score model

The scorecard uses the engineering dimensions and weights established for Signal: functional correctness 18%, reliability/resilience 16%, performance/resources 12%, architecture 14%, security/integrity 12%, maintainability 10%, testing 8%, developer experience 6%, and operability 4%. Each dimension includes evidence and confidence. Unmeasured performance and operability receive neutral provisional scores with low confidence; missing measurements are not treated as proof of either zero cost or excellent performance.

The score is for the reference integration and its harness, not a certification score for the Signal product. Application defects, harness defects, infrastructure constraints and Signal package defects must be attributed separately.

## Boundaries and next integration gates

The application uses public Signal package exports only. The harness does not modify Signal, hide failures or automatically change source code. It reports evidence and limitations for subsequent engineering.

The remaining gates are real PostgreSQL integration (transactions, outbox/inbox, concurrent workers, leases and restart recovery), external authentication and runtime authorization policies, distributed fault injection/provider failures, complete historical replay execution and compatibility checks, immutable audit storage and external key custody, telemetry export/resource profiling, repeated load/soak profiles, and persisted multi-run baselines. These are explicit unverified work, not silently simulated successes.
