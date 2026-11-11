# Signal — Engineering a foundation for reliable, continuously improving decisions

**Audience:** SaaS engineering leaders, CTOs, and teams building consequential software decisions  
**Case-study vehicle:** Signal Reference Lab  
**Evidence status:** Reproducible CI verification; no production/customer-outcome claim  
**Updated:** 2026-11-10

## Executive summary

Signal is a domain-agnostic decision-processing platform for software that must do more than return a plausible answer. It gives applications a way to represent the evidence behind a judgment, make uncertainty and authorization explicit, execute consequential mutations safely, and connect later outcomes to review and learning.

The Reference Lab is Signal's reproducible technical demonstration. It exercises the public packages through a complete application lifecycle, backed by PostgreSQL and automated CI evidence. It is deliberately designed to expose both what works and what remains unverified.

The result is a concrete engineering case study—not a claim that Signal has been certified in production or has improved a customer's revenue, conversion, or decision accuracy.

## The problem

In many SaaS systems, the pieces of a consequential decision are spread across request handlers, business rules, database writes, queues, audit logs, and analytics jobs. That fragmentation creates recurring failure modes:

- A retry can repeat a mutation after the caller has lost the original response.
- An event can be published without a durable record of the state change that caused it.
- Authorization, tenant isolation, and business policy can be enforced inconsistently across entry points.
- The evidence and assumptions behind a decision can disappear after the action is taken.
- An outcome may be recorded without being connected to the original judgment.
- Teams may have logs, but still be unable to reconstruct what was known, assumed, authorized, and executed at decision time.

Signal addresses these as related contract and lifecycle problems rather than as isolated handler-level fixes.

## The approach

Signal makes judgment representable as system state and gives execution explicit correctness contracts.

The reusable decision lifecycle is:

~~~text
Request → Evidence → Assessment → Decision → Authorization
        → Action → Outcome → Review → Learning → Memory
~~~

~~~mermaid
flowchart LR
  A[Request] --> B[Evidence]
  B --> C[Assessment]
  C --> D[Decision]
  D --> E{Human authorization}
  E -->|Approved| F[Action]
  E -->|Rejected| X[No action]
  F --> G[Outcome]
  G --> H[Review]
  H --> I[Learning]
  I --> J[Memory]
~~~

The platform separates three architectural responsibilities:

| Layer | Responsibility |
|---|---|
| Protocol | Stable, versioned contracts for Queries, Mutations, Events, schemas, envelopes, and results |
| Runtime | Dispatch, authorization hooks, idempotency, replay metadata, audit, event delivery, and orchestration |
| Domain packages | Evidence assessment, confidence discipline, governance, outcome review, learning, memory, and related decision models |

Ports keep persistence, event delivery, replay, and observability behind explicit interfaces. Applications own their domain records, business rules, and final authority; Signal supplies reusable decision and execution capabilities.

### What the Reference Lab exercises

The Reference Lab is a runnable application using Signal's public workspace packages. Its evaluation path includes:

- Public SDK operation registration, schema validation, dispatch, and context propagation.
- A complete request-to-outcome lifecycle, including human authorization before action.
- Evidence lineage, uncertainty assessment, confidence discipline, governance, and stewardship.
- Tenant-boundary checks and rejection of untrusted authorization context.
- Idempotency, duplicate handling, replay evidence, and audit integrity.
- PostgreSQL transactions, durable idempotency, outbox/inbox, retry budgets, and distributed circuit-breaker state.
- CLI verification, HTTP binding, and observability instrumentation.

The evaluation reports capability states separately: exercised, partial, blocked, and unverified. This prevents an implemented interface or a passing isolated test from being presented as an end-to-end guarantee.

## Reliability work: from lease ownership to recoverable delivery

The latest reliability iteration addressed an outbox ownership defect: a worker whose lease had expired could previously attempt acknowledgement or retry using an old ownership token.

The merged fix adds:
- Expiry-aware fencing for acknowledgement and retry.
- PostgreSQL and in-memory lease renewal with the existing claim token.
- Batch-wide heartbeat renewal, including records waiting behind a slow sequential handler.
- Concurrent heartbeat renewals to avoid serial renewal starvation.
- Rejection of stale renewal after expiry or ownership change.
- Consistent lease-duration validation across runtime and adapters.

The PostgreSQL integration tests exercise live renewal, expiry rejection, reclaim with a new token, and rejection of stale-owner acknowledgement/retry. A separate production-simulation workflow exercises the broker publish/crash/redelivery boundary. Delivery remains **at-least-once**: consumers still need stable message-ID deduplication or destination idempotency/reconciliation when an external side effect may complete before lease loss is observed.

This distinction matters: lease fencing prevents stale workers from finalizing records they no longer own; it does not make arbitrary third-party side effects exactly-once.

## Verified results

### Reference Lab evaluation

The completed Reference Lab workflow reported:

| Measure | Result |
|---|---:|
| Scenarios passed | **17 / 17** |
| Failed or blocked scenarios | **0** |
| Signal-targeted scenarios passed | **12 / 12** |
| Capabilities directly exercised | **28 / 34** |
| Capabilities marked partial | **6** |
| PostgreSQL integration assertions | **21 passed** |
| Provisional engineering score | **8.49 / 10** |

The 8.49 score is the Reference Lab's provisional engineering score, not a certification. Its weighted dimensions were: functional correctness 9.6, reliability/resilience 9.8, performance/resource efficiency 5.0 (neutral, low confidence), architecture/design 9.4, security/integrity 7.3, maintainability 9.6, testing/verification 9.7, developer experience 7.7, and operability/delivery 5.0 (neutral, low confidence).

A separate quality scorecard reports correctness 8.2, security 7.2, and reliability 8.0. Its overall composite is intentionally withheld because the performance pillar does not yet have a matched, production-like baseline. These two scoring systems are not interchangeable.

### Engineering measurements

A separate GitHub Actions engineering-measurements run produced machine-readable benchmark artifacts on a Linux runner with Node.js 20.20.2, an AMD EPYC 7763 CPU, and four logical CPUs.

| Measurement | Observed result | Scope |
|---|---:|---|
| Sustained in-process dispatch | **486,343 operations/s** for 30 seconds; 14,590,304 submitted and handled; sampled p50 0.033 ms, p95 0.058 ms, p99 0.074 ms | Envelope construction and one in-process subscriber |
| Full decision pipeline | p50 **14.09 ms**, p95 **28.04 ms** with 5,000 evidence items | Three synthetic runs |
| Audit-chain append | p50 **0.0077 ms**; approximately **109,837 entries/s** at 50,000 entries | In-memory hash-chain benchmark |
| Full audit-chain verification | p50 **411 ms** at 50,000 entries | In-memory verification |
| Signed checkpoint creation | p50 **429 ms** at 50,000 entries | Ed25519 signing; no external key custody |
| Calibration / learning | At 50,000 synthetic traces: calibration p50 **17.89 ms**, learning derivation p50 **13.23 ms** | Three runs; 1,000 moving-block-bootstrap iterations for drift analysis |

These are reproducible engineering measurements, not production capacity claims. In particular, the sustained dispatch benchmark excludes HTTP, PostgreSQL, brokers, network latency, multi-process contention, and production traffic. Synthetic traces validate computational behavior and invariants, not real-world decision effectiveness.

### Independent CI verification

The final PR revision passed all nine GitHub Actions workflows:

- [Signal Reference Lab](https://github.com/DiogoAngelim/signal/actions/runs/42927061931) — 17/17 scenarios.
- [Signal production simulation](https://github.com/DiogoAngelim/signal/actions/runs/42927061765) — PostgreSQL correctness, contention, and recovery.
- [Signal engineering measurements](https://github.com/DiogoAngelim/signal/actions/runs/42927061826) — benchmark artifact generation.
- [Signal security assurance](https://github.com/DiogoAngelim/signal/actions/runs/42927061780) — CodeQL and dependency audit.
- [Signal core](https://github.com/DiogoAngelim/signal/actions/runs/42927061752).
- [Signal quality and architecture](https://github.com/DiogoAngelim/signal/actions/runs/42927061613).
- [Signal library build and clean-install validation](https://github.com/DiogoAngelim/signal/actions/runs/42927061653).
- [pnpm lockfile refresh](https://github.com/DiogoAngelim/signal/actions/runs/42927061639).
- [AI decision-system course validation](https://github.com/DiogoAngelim/signal/actions/runs/42927061932).

The lease-fencing work and dependency remediation were merged in [PR #48](https://github.com/DiogoAngelim/signal/pull/48), merge commit `e6e44a9b25ce984d0e823af366b2c507a8e63455`. The security workflow passed after the workspace `node-forge` override and lockfile were upgraded to 1.4.3.

## Application integration

The Reference Lab demonstrates Signal's own technical capabilities. [Workbench](workbench-integration.md) provides a separate application-integration case study: a distinct application consumes the released `@signal/decision@0.1.0` package in a commercial assessment workflow while retaining ownership of its commercial records, economic calculations, recommendations, approvals, and outcomes.

That integration is package-level and CI-validated. It is not the Signal SDK/runtime, a hosted service, a production deployment, or evidence of improved commercial outcomes. The two case studies demonstrate complementary forms of technical evidence without conflating them.

## What this establishes—and what it does not

**Established by the current evidence**
- Public Signal packages can be composed by a runnable reference application.
- The tested lifecycle spans evidence, assessment, decision, authorization, action, outcome, and review.
- PostgreSQL-backed correctness and recovery behavior is exercised in CI.
- Idempotency, audit integrity, replay evidence, tenant-boundary checks, and resilience controls have automated verification.
- The project produces reproducible evaluation and benchmark artifacts tied to repository commits and workflow runs.

**Not established**
- Production throughput, latency SLOs, long-duration soak behavior, or capacity under representative traffic.
- Multi-region failover or cross-host contention under production load.
- External identity-provider integration or a complete production authorization deployment.
- External key custody, independent audit-checkpoint retention, or managed security certification.
- Full historical replay execution and cross-version replay compatibility.
- External telemetry scraping, trace export, on-call readiness, or operational alerting.
- Improved customer, revenue, conversion, or decision-quality outcomes from real labeled data.

The Reference Lab itself does not claim broker-level delivery certification; the separate production-simulation workflow covers the broker crash/redelivery boundary. The six partial capabilities remain visible in the evaluation output. A passing CI run is evidence of the tested revision and scenarios—not a substitute for deployment validation or real-world use.

## Reproduction

From the Signal repository root:

~~~bash
pnpm install --frozen-lockfile
pnpm build:library
pnpm --filter @signal/reference-lab db:migrate
npm ci --prefix signal-cli
npm run build --prefix signal-cli
export SIGNAL_CLI_READY=1
pnpm --filter @signal/reference-lab build
pnpm --filter @signal/reference-lab typecheck
node --test examples/signal-reference-lab/dist/test/*.test.js
node examples/signal-reference-lab/dist/src/cli.js coverage
node examples/signal-reference-lab/dist/src/cli.js evaluate --out evaluation.json
node examples/signal-reference-lab/dist/src/cli.js benchmark --out benchmark.json
~~~

The database commands require the isolated PostgreSQL service and `DATABASE_URL` configured as described in the [Reference Lab README](../../examples/signal-reference-lab/README.md).

## Evidence index

- [Reference Lab source and reproduction instructions](../../examples/signal-reference-lab/README.md)
- [Reference Lab workflow definition](../../.github/workflows/reference-lab.yml)
- [Reference Lab CI result](https://github.com/DiogoAngelim/signal/actions/runs/42927061931)
- [Production simulation result](https://github.com/DiogoAngelim/signal/actions/runs/42927061765)
- [Engineering measurements and artifacts](https://github.com/DiogoAngelim/signal/actions/runs/42927061826)
- [Security assurance result](https://github.com/DiogoAngelim/signal/actions/runs/42927061780)
- [Replay and auditability model](../replay-auditability.md)
- [Application integration contract](../application-integration-contract.md)
- [Workbench application integration case study](workbench-integration.md)
- [Credibility case-study selection](../credibility-case-study-selection.md)

**Claim boundary:** Signal has a reproducible, CI-verified technical reference case and a separately CI-validated package-level application integration. This evidence does not establish production certification, production deployment, or improved customer/business outcomes.
