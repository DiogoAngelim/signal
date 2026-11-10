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

The evaluation harness runs seventeen deterministic scenarios:
- end-to-end request, evidence, assessment, decision, approved action and outcome;
- evidence hard-stop and action authorization;
- tenant isolation;
- repeated and concurrent idempotent submission;
- HTTP binding dispatch and forged-auth rejection;
- audit-chain integrity and signed checkpoint verification;
- replay-evidence integrity;
- retry-budget and circuit-breaker recovery;
- PostgreSQL transactional idempotency, durable outbox delivery, consumer inbox deduplication, shared retry budgets, distributed breaker state, replay evidence and append-only audit ledger;
- agency confidence calibration, repeated-outcome learning and self-diagnosis;
- kernel plugin registration, four-stage orchestration, lifecycle and replay;
- Signal CLI verify, replay, test/build wrappers and audit proof generation (CI-gated);
- bounded Prometheus counters and latency histograms.
- runtime authentication enforcement and operation-level actor-role authorization;
- malformed-input rejection.

It emits machine-readable scenario results, separate Signal/integration/reference-app quality gates, capability status, a weighted Signal engineering scorecard and evidence references. With `DATABASE_URL` configured, the PostgreSQL scenario also exercises durable idempotency/outbox, inbox deduplication, shared retry budgets, distributed circuit breakers, decision-memory persistence, replay-evidence storage and append-only audit checkpoints. Without a database, that scenario is explicitly marked blocked and those capabilities are not credited.

## Run

From the repository root:

```sh
pnpm install
npm ci --prefix signal-cli
npm run build --prefix signal-cli
export SIGNAL_CLI_READY=1
pnpm --filter @signal/reference-lab build
pnpm --filter @signal/reference-lab evaluate
pnpm --filter @signal/reference-lab start
pnpm --filter @signal/reference-lab benchmark
```

For the full PostgreSQL integration profile, start the isolated local database and apply Signal's actual migrations:

```sh
docker compose -f examples/signal-reference-lab/infrastructure/docker-compose.yml up -d
export DATABASE_URL=postgresql://signal:signal@localhost:54329/signal_reference_lab
pnpm --filter @signal/reference-lab db:migrate
pnpm --filter @signal/reference-lab evaluate
pnpm --filter @signal/reference-lab coverage:verify
```

Without `DATABASE_URL`, the PostgreSQL scenario is explicitly reported as **blocked**, not passed. `evaluate` still emits the partial report; the strict `coverage:verify` command exits non-zero while any gate is blocked. CI provisions PostgreSQL 16, applies the same migrations, and requires the scenario to pass.

Or from this directory: `pnpm lab`, `pnpm evaluate`, `pnpm coverage:verify`, `pnpm start`, `pnpm benchmark`. The local web UI listens on `127.0.0.1:4179` by default. Set `PORT` to change it.

Persist an evaluation with `pnpm evaluate -- --out evaluation.json`; persist a benchmark baseline with `pnpm benchmark -- --out baseline.json`, then compare it later with `pnpm compare -- baseline.json`. To include a performance score in the four-pillar scorecard, run `pnpm evaluate -- --baseline baseline.json --out evaluation.json`. This executes the same workload, checks environment/workload comparability and scores the observed p95 latency, throughput and RSS deltas. Without a matched baseline, performance is explicitly unscored and the composite score is withheld. Reports include Signal/app commit identifiers, harness version, runtime and host metadata, raw per-operation samples, percentile aggregates and sample-integrity checks. Comparison rejects invalid sample sets and mismatched workload, Node/OS release, CPU model/count or architecture. The benchmark measures only local in-process query dispatch; it is not a production, PostgreSQL, HTTP or distributed benchmark.

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
| Signal CLI verify, replay, test/build wrappers and audit | Exercised in CI against its checked-in phase chain; test/build wrappers use explicit no-op commands inside a temporary workspace, so checked-in Signal CLI state is not mutated |

A capability is not credited merely because a package exists. Each status must be backed by a scenario and observable evidence. In-process delivery is not proof of durable delivery or exactly-once external effects. The inventory deliberately distinguishes exercised, partial and unverified capabilities rather than presenting simulated adapters as production integrations.

## Score model

The scorecard uses the engineering dimensions and weights established for Signal: functional correctness 18%, reliability/resilience 16%, performance/resources 12%, architecture 14%, security/integrity 12%, maintainability 10%, testing 8%, developer experience 6%, and operability 4%. Each dimension includes evidence and confidence. Capability status contributes 1.0 for exercised, 0.5 for partial and 0 for unverified; blocked scenarios do not count as passes. Performance remains neutral until production-like measurement; operability is bounded by observed telemetry coverage. Missing measurements are not treated as proof of either zero cost or excellent performance.

The score measures Signal engineering capabilities demonstrated through the reference lab; it is not a product certification or production-readiness claim. Signal-targeted scenarios drive the score. Reference-app and integration quality gates are reported separately, and failures are not automatically attributed to Signal.

## Boundaries and next integration gates

The application uses public Signal package exports only. The harness does not modify Signal, hide failures or automatically change source code. It reports evidence and limitations for subsequent engineering.

The remaining gates are PostgreSQL crash-after-claim recovery, stale-worker fencing and actual multi-process contention; external identity-provider integration; provider/network fault injection and recovery; complete historical replay execution and cross-version compatibility; external audit key custody and independent checkpoint anchoring; telemetry scrape/trace export and production resource profiling; repeated load/soak profiles; and persisted multi-run baseline history. Signal CLI `push` and `install-hooks` are intentionally not invoked because they can publish externally or mutate repository configuration. These are explicit unverified work, not silently simulated successes.
\n\n## Four-pillar quality score\n\nThe evaluation emits two complementary scorecards. The broader engineering scorecard retains its nine-dimension architecture/maintainability/testing/operability view. The focused quality scorecard isolates the four operational quality outcomes:\n\n| Pillar | Weight | What it evaluates |\n|---|---:|---|\n| Correctness | 30% | Contracts, lifecycle invariants, tenant boundaries, idempotency, replay and persistence semantics |\n| Security | 25% | Authentication, operation authorization, tenant isolation, tamper-evident audit, replay integrity and durable controls |\n| Performance | 20% | Matched-baseline p95/p99 latency, throughput and resource deltas |\n| Reliability | 25% | Idempotency under retries, retry budgets, circuit-breaker recovery, durable delivery, persistence and observability |\n\nCriterion weights within each pillar are normalized to 100: correctness = contracts 10, lifecycle 18, tenant isolation 12, idempotency 14, replay 14, persistence 14, semantic type-check 6, compatibility 6, property/fuzz testing 6; security = authentication 12, authorization 14, tenant isolation 14, audit integrity 14, replay integrity 8, durable controls 10, external identity 8, key custody 6, supply-chain assurance 6, static analysis/secrets 6, confidentiality 2; performance = baseline comparability 10, p95/p99 latency 30, throughput 25, resource efficiency 15, HTTP/database/distributed profile 10, sustained-load/soak profile 10; reliability = idempotency 15, retry budgets 10, circuit breakers 10, durable delivery 15, durable state 15, observability 10, crash recovery 10, distributed contention 10, soak/fault injection 5. Each pillar is decomposed into weighted criteria with explicit evidence, status, limitations and confidence. Passing scenarios validate only the exercised paths. Partial criteria receive half credit; failed and unverified criteria receive no credit. Critical correctness, security or reliability control failures cap the affected pillar at 2/10. The pillar score is the evidence-weighted score out of 10; coverage and confidence are reported separately so a high score cannot hide missing evidence.\n\nPerformance is deliberately different: an absolute timing number is not enough. A performance score requires an integrity-checked benchmark with at least 30 samples and a matched baseline with the same workload, Node version, OS release, architecture, CPU model and CPU count. The score compares p95 latency, throughput and RSS delta. Without that baseline, performance is **unscored**, and the composite four-pillar score is withheld. Use `pnpm benchmark -- --out baseline.json` followed by `pnpm evaluate -- --baseline baseline.json`.\n\nThe four-pillar composite uses weights 30/25/20/25 and is emitted only when every pillar has a score and at least 55% evidence coverage. Blocked scenarios remain unverified. This is an engineering assessment instrument, not a security certification, SLO or production-readiness guarantee. Signal-targeted scenarios drive the score; reference-app and integration quality gates remain separate and failures are not automatically attributed to Signal.\n
## Hosted Reference Lab

The Vercel deployment uses the repository-root `vercel.json` and the catch-all Node function in `api/[...path].ts`. The static interface is served from `public/index.html`. Configure these encrypted Vercel environment variables for Production (and Preview only if preview deployments are intentionally enabled):

- `DATABASE_URL`: Neon connection string for the dedicated `signal_lab_runtime` role, scoped to the `signal_reference_lab` database.
- `SESSION_SECRET`: at least 32 cryptographically random characters; used to sign HttpOnly session cookies.
- `LAB_ACCESS_PASSWORD`: a high-entropy access password of at least 24 characters.

The hosted example is deliberately a single-tenant private lab. The tenant and operator are assigned by the server; browser-supplied identity fields are ignored. Authentication uses an eight-hour HMAC-signed, Secure, HttpOnly, SameSite=Strict cookie, same-origin POST checks, and a persistent per-IP login-attempt limit. Application case state and lifecycle events are rehydrated from and atomically written to Neon under a PostgreSQL advisory transaction lock. The example is not a multi-organization identity product: do not expose it as a public multi-tenant service without adding a real identity provider, per-user authorization, tenant-scoped storage and audit-key custody.

The local `web.ts` server remains a development-only harness. The hosted deployment does not run that long-lived process; it uses the Vercel API function and the static web interface. The hosted application persists case requests and events as a JSONB snapshot. Signal's own PostgreSQL integration scenario separately tests its transactional idempotency, outbox/inbox, decision-memory and audit adapters; the example's UI state store is not a replacement for those domain-specific stores.


### Static typecheck scope

CI runs a bounded semantic typecheck over the example's domain and application source using local adapter-contract declarations. This avoids loading the full Signal workspace declaration graph into the TypeScript compiler (which exceeded the hosted runner's memory limit). The actual Signal adapters are still built and exercised by the integration and Reference Lab test suites against ephemeral PostgreSQL; the declarations are not runtime code and are never bundled into the application.
