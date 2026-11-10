# Signal Reference Lab

A deliberately small case-management application and a reproducible engineering evaluation harness for exercising Signal through its public packages. The application is the test subject; Signal is the system under evaluation. The lab is not a substitute implementation of Signal and does not import private package source.

## What it does

The reference workflow is intentionally generic: submit a request, attach sourced evidence, assess uncertainty and risk, make a capacity-constrained decision, record an accountable authorization, execute only an explicitly approved action, capture the eventual outcome, and review what happened.

The workflow exercises:
- `@signal/sdk-node`: registered queries and mutations, runtime dispatch, context, idempotency keys, event publication and subscribers;
- `@signal/decision`: evidence assessment, governance, stewardship, decision records and structured outcome learning reviews;
- `@signal/decision-memory`: in-memory and PostgreSQL decision record/review storage;
- `@signal/commitment`: resource allocation, feasibility and hard constraints;
- `@signal/semantic-state`: generic-state lexicon interpretation;
- `@signal/agency`: approval policy, decision/outcome cycles, trace retention and self-diagnosis;
- `@signal/binding-http` and `@signal/idempotency-postgres`: HTTP dispatch plus durable idempotency, outbox/inbox, retry-budget, circuit-breaker, replay-evidence and audit adapters.

The evaluation harness runs sixteen deterministic scenarios:
- end-to-end request, evidence, assessment, decision, approved action and outcome;
- evidence hard-stop and action authorization;
- tenant isolation;
- repeated and concurrent idempotent submission;
- HTTP binding dispatch and forged-auth rejection;
- audit-chain integrity and signed checkpoint verification;
- replay-evidence integrity;
- retry-budget and circuit-breaker recovery;
- PostgreSQL transactional idempotency, durable outbox delivery, consumer inbox deduplication, shared retry budgets, distributed breaker state, replay evidence and append-only audit ledger;
- kernel plugin registration, four-stage orchestration, lifecycle and replay;
- Signal CLI phase-chain and artifact verification (CI-gated);
- bounded Prometheus counters and latency histograms.
- runtime authentication enforcement and operation-level actor-role authorization;
- malformed-input rejection.

It emits machine-readable scenario results, capability status, a weighted engineering scorecard and evidence references. With `DATABASE_URL` configured, the PostgreSQL scenario also exercises durable idempotency/outbox, inbox deduplication, shared retry budgets, distributed circuit breakers, decision-memory persistence, replay-evidence storage and append-only audit checkpoints. Without a database, that scenario is explicitly marked blocked and those capabilities are not credited.

## Run

From the repository root:

```sh
pnpm install
npm ci --prefix signal-cli
npm run build --prefix signal-cli
export SIGNAL_CLI_READY=1
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

Persist an evaluation/scorecard with `pnpm evaluate -- --out evaluation.json`; persist a benchmark baseline with `pnpm benchmark -- --out baseline.json`, then compare it later with `pnpm compare -- baseline.json`. Reports include Signal/app commit identifiers, harness version, runtime and host metadata, raw per-operation samples, percentile aggregates and sample-integrity checks. Comparison rejects invalid sample sets and mismatched workload, Node/OS release, CPU model/count or architecture. The benchmark measures only local in-process query dispatch; it is not a production, PostgreSQL, HTTP or distributed benchmark.

## Capability truth

| Capability area | Current status |
|---|---|
| Protocol schemas, SDK operation definitions, runtime query/mutation dispatch | Exercised |
| Event publication and in-process subscription | Exercised |
| Mutation idempotency and concurrent duplicates | In-memory concurrency and PostgreSQL-backed replay are exercised; cross-process contention remains unverified |
| Tenant boundary | Exercised at application repository boundary; not an external identity/authentication certification |
| Decision evidence assessment, governance, stewardship and rationale | Exercised through `@signal/decision` |
| Decision record and outcome review storage | Partial: in-memory and PostgreSQL adapters are exercised; compaction and retention scheduling remain unverified |
| Approved action execution | Exercised; action execution requires an approved decision and records the accountable operator |
| Commitment constraints and resource allocation | Exercised through `@signal/commitment` |
| Semantic-state interpretation | Exercised through `@signal/semantic-state` |
| Agency policy and decision/outcome cycles | Exercised through `@signal/agency`; calibration and statistical learning remain partial because the sample is intentionally small |
| PostgreSQL transactions and idempotency | Exercised against PostgreSQL 16 in CI; multi-process contention under production load remains a separate validation gate |
| Durable outbox | Partial: PostgreSQL-backed transactional enqueue and delivery are exercised; crash-after-claim recovery and stale-worker fencing are not injected in this harness |
| Transactional consumer inbox | Exercised against PostgreSQL 16 with duplicate message suppression |
| Shared retry budget and distributed circuit breaker | PostgreSQL state coordination is exercised across independent adapter instances; actual multi-process contention, multi-region behavior and real provider failure remain unverified |
| Durable replay evidence and append-only audit ledger | PostgreSQL persistence, hash-chain verification and signed checkpoint anchoring are exercised; external key custody and independent anchoring remain deployment responsibilities |
| HTTP binding package | Exercised through Fastify inject; external verified identity middleware remains unconfigured |
| Runtime-level authorization | Exercised with `requireMutationAuthorization` and operation-level scope policy |
| Local retry budgets and circuit breakers | Deterministic local transitions are exercised; PostgreSQL shared coordination is covered separately |
| Replay evidence integrity | Partial; content-addressed record creation and verification tested, full replay executor not integrated |
| Audit chains/checkpoints and tamper detection | In-memory verification and PostgreSQL append-only ledger/checkpoints are exercised |
| Runtime lifecycle telemetry collection | Exercised through Signal `ObservabilityPort` in memory |
| Prometheus metrics exposition and cardinality bounds | Partial: counters/histograms render with bounded series; external scrape and trace export remain unverified |
| Local throughput/latency/RSS benchmark | Exercised; production load, distributed metrics/tracing export and soak remain unverified |
| Kernel plugin pipeline, orchestration and replay | Exercised with the public `@signal/kernel` package |
| Signal CLI verify command | Exercised in CI against its checked-in phase-chain and proof artifacts; replay/test/build/audit commands remain separate CLI surfaces |

A capability is not credited merely because a package exists. Each status must be backed by a scenario and observable evidence. In-process delivery is not proof of durable delivery or exactly-once external effects. The inventory deliberately distinguishes exercised, partial and unverified capabilities rather than presenting simulated adapters as production integrations.

## Score model

The scorecard uses the engineering dimensions and weights established for Signal: functional correctness 18%, reliability/resilience 16%, performance/resources 12%, architecture 14%, security/integrity 12%, maintainability 10%, testing 8%, developer experience 6%, and operability 4%. Each dimension includes evidence and confidence. Capability status contributes 1.0 for exercised, 0.5 for partial and 0 for unverified; blocked scenarios do not count as passes. Performance remains neutral until production-like measurement; operability is bounded by observed telemetry coverage. Missing measurements are not treated as proof of either zero cost or excellent performance.

The score is for the reference integration and its harness, not a certification score for the Signal product. Application defects, harness defects, infrastructure constraints and Signal package defects must be attributed separately.

## Boundaries and next integration gates

The application uses public Signal package exports only. The harness does not modify Signal, hide failures or automatically change source code. It reports evidence and limitations for subsequent engineering.

The remaining gates are PostgreSQL crash-after-claim recovery, stale-worker fencing and actual multi-process contention; external identity-provider integration; provider/network fault injection and recovery; complete historical replay execution and cross-version compatibility; external audit key custody and independent checkpoint anchoring; telemetry scrape/trace export and production resource profiling; repeated load/soak profiles; and persisted multi-run baseline history. These are explicit unverified work, not silently simulated successes.
