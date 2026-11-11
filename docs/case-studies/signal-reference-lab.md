# Signal — Engineering a foundation for reliable, continuously improving decisions

**Built by:** Naubly  
**For:** SaaS CTOs, engineering leaders, and product teams responsible for consequential software decisions  
**What this demonstrates:** A reusable decision-processing foundation, verified through a reproducible reference application and automated engineering evidence  
**Evidence boundary:** CI-verified technical results; no customer deployment, production certification, or measured customer-business outcome is claimed  
**Updated:** 2026-11-10

## When a software decision becomes a reliability problem

A consequential software decision rarely lives in one function.

A subscription may be approved, a transaction flagged, a customer routed, a credit limit changed, or an operational action triggered. To make that decision dependable, a system must preserve more than its final answer. It must know what evidence was available, how that evidence was assessed, which rules and constraints applied, who or what authorized the action, whether the action actually happened, and what its outcome revealed.

In many SaaS architectures, those responsibilities evolve independently across request handlers, business rules, database transactions, queues, audit logs, and analytics jobs. The result is familiar to engineering leaders:

- Retries can repeat an external side effect when a caller loses the original response.
- A state change and its event can become inconsistent.
- Authorization and tenant boundaries can be enforced differently across entry points.
- Teams can see that an action happened without being able to reconstruct why it was taken.
- Outcomes can be collected without being connected to the original decision.
- Logs can be extensive while the decision itself remains difficult to explain, reproduce, or improve.

These are not simply observability gaps. They are architectural gaps across the full decision lifecycle.

**Naubly built Signal to address that class of problem:** a modular foundation for applications that need decisions to be explainable, governed, safely executed, and capable of improving from observed outcomes.

## The engineering objective

The objective was not to build another rules engine or centralize every application's business logic. It was to make the decision lifecycle reusable while preserving the authority of the application that uses it.

Signal separates three responsibilities:

| Layer | What it owns |
|---|---|
| Protocol | Stable, versioned contracts for queries, mutations, events, schemas, envelopes, and results |
| Runtime | Dispatch, authorization hooks, idempotency, replay metadata, audit, event delivery, and orchestration |
| Domain packages | Evidence assessment, confidence discipline, governance, outcome review, learning, memory, and related decision models |

Persistence, event delivery, replay, and observability sit behind explicit ports. The integrating application retains ownership of its domain records, business policies, commercial logic, and final authority.

This boundary is important. A reusable decision platform should strengthen an application's architecture—not silently take control of its business.

## How the system works

Signal represents a decision as a lifecycle rather than a single response:

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

1. **Request:** An application submits a typed operation through a defined contract.
2. **Evidence:** The system records the information and provenance relevant to the decision.
3. **Assessment:** Evidence is evaluated with explicit treatment of uncertainty and confidence.
4. **Decision:** The system produces a structured result that can be inspected and governed.
5. **Authorization:** Approval is an explicit boundary before a consequential action; it is not inferred from a recommendation.
6. **Action:** The application executes the authorized mutation through controlled runtime and persistence contracts.
7. **Outcome:** The result is recorded against the decision that led to it.
8. **Review and learning:** Outcomes can be examined to derive calibration and learning signals.
9. **Memory:** Relevant learning can inform later decisions without erasing the provenance of earlier ones.

The result is a traceable path from request to action and from action to learning. The application remains the authority over whether an action is permitted.

## Engineering the failure paths—not just the happy path

The most important reliability work concerns what happens when components disagree about whether work has completed.

For example, an outbox worker may claim a message, begin handling it, and then lose its lease. A second worker may reclaim the record. If the original worker later acknowledges or retries with stale ownership, it can interfere with the new owner.

The latest reliability iteration hardened this boundary with:

- Expiry-aware fencing for acknowledgement and retry.
- PostgreSQL and in-memory lease renewal using the existing claim token.
- Batch-wide heartbeat renewal, including records waiting behind a slow sequential handler.
- Concurrent heartbeat renewals to avoid serial renewal starvation.
- Rejection of stale renewal after expiry or ownership change.
- Consistent lease-duration validation across runtime and adapters.

PostgreSQL integration tests exercise live renewal, expiry rejection, reclaim with a new token, and rejection of stale-owner acknowledgement and retry. A separate production-simulation workflow exercises the broker publish/crash/redelivery boundary.

There is an important limit: delivery is **at-least-once**, not exactly-once. If an external side effect completes before a worker loses its lease, a consumer still needs stable message-ID deduplication or destination idempotency and reconciliation. Lease fencing prevents a stale worker from finalizing a record it no longer owns; it cannot make an arbitrary third-party side effect exactly-once.

This is the distinction between demonstrating a reliability mechanism and claiming a guarantee the architecture does not provide.

## What was verified

Rather than rely on architectural descriptions alone, Signal includes a runnable Reference Lab that composes the public workspace packages into an application lifecycle. The lab is reproducible through repository instructions and automated CI workflows.

### Reference Lab evaluation

The completed evaluation reported:

| Measure | Verified result |
|---|---:|
| Scenarios passed | **17 / 17** |
| Failed or blocked scenarios | **0** |
| Signal-targeted scenarios passed | **12 / 12** |
| Capabilities directly exercised | **28 / 34** |
| Capabilities marked partial | **6** |
| PostgreSQL integration assertions | **21 passed** |
| Provisional engineering score | **8.49 / 10** |

The 8.49/10 result is a provisional engineering score for the Reference Lab—not a customer satisfaction score, production certification, or guarantee of business impact. Its dimensions were functional correctness 9.6, reliability/resilience 9.8, performance/resource efficiency 5.0 (neutral, low confidence), architecture/design 9.4, security/integrity 7.3, maintainability 9.6, testing/verification 9.7, developer experience 7.7, and operability/delivery 5.0 (neutral, low confidence).

A separate quality scorecard reports correctness 8.2, security 7.2, and reliability 8.0. Its overall composite is intentionally withheld because performance does not yet have a matched, production-like baseline. These scorecards measure different things and should not be combined.

### Performance and engineering measurements

The engineering-measurements workflow produced machine-readable artifacts on a Linux runner with Node.js 20.20.2, an AMD EPYC 7763 CPU, and four logical CPUs.

| Measurement | Observed result | What was measured |
|---|---:|---|
| In-process dispatch | **486,343 operations/s** over 30 seconds; 14,590,304 messages submitted and handled; sampled p50 0.033 ms, p95 0.058 ms, p99 0.074 ms | Envelope construction and one in-process subscriber |
| Full decision pipeline | p50 **14.09 ms**, p95 **28.04 ms** | 5,000 evidence items; three synthetic runs |
| Audit-chain append | p50 **0.0077 ms**; approximately **109,837 entries/s** | In-memory hash-chain benchmark at 50,000 entries |
| Full audit-chain verification | p50 **411 ms** | In-memory verification at 50,000 entries |
| Signed checkpoint creation | p50 **429 ms** | Ed25519 signing; no external key custody |
| Calibration and learning derivation | p50 **17.89 ms** and **13.23 ms**, respectively | 50,000 synthetic traces; 1,000 moving-block-bootstrap iterations for drift analysis |

These measurements show the computational behavior of specific tested paths. They are not production capacity claims. The dispatch benchmark excludes HTTP, PostgreSQL, brokers, network latency, multi-process contention, and production traffic. Synthetic traces test computational behavior and invariants; they do not prove real-world decision effectiveness.

### Reproducible verification

The reliability/security revision passed all nine GitHub Actions workflows:

- [Reference Lab evaluation](https://github.com/DiogoAngelim/signal/actions/runs/42927061931) — 17/17 scenarios.
- [Production simulation](https://github.com/DiogoAngelim/signal/actions/runs/42927061765) — PostgreSQL correctness, contention, recovery, and broker crash/redelivery boundary.
- [Engineering measurements](https://github.com/DiogoAngelim/signal/actions/runs/42927061826) — benchmark artifact generation.
- [Security assurance](https://github.com/DiogoAngelim/signal/actions/runs/42927061780) — CodeQL and dependency audit.
- [Core workflow](https://github.com/DiogoAngelim/signal/actions/runs/42927061752).
- [Quality and architecture](https://github.com/DiogoAngelim/signal/actions/runs/42927061613).
- [Library build and clean-install validation](https://github.com/DiogoAngelim/signal/actions/runs/42927061653).
- [Lockfile refresh](https://github.com/DiogoAngelim/signal/actions/runs/42927061639).
- [AI decision-system course validation](https://github.com/DiogoAngelim/signal/actions/runs/42927061932).

The lease-fencing work and dependency remediation were merged in [PR #48](https://github.com/DiogoAngelim/signal/pull/48), merge commit `e6e44a9b25ce984d0e823af366b2c507a8e63455`. The security workflow passed after the workspace `node-forge` override and lockfile were upgraded to 1.4.3.

The Reference Lab evaluation artifact records app commit `2ff4ba1c7f29b16947fa6f02ed1a6100dcbe9523` and Signal source commit `20ab95a6de8b36fd28c07ae7da4249e4d8ed16f7`. The production-simulation and engineering-measurement workflows ran against GitHub's PR merge-test commit `0107a24f7c0fb813fd72cf782d81356c3e578bee`, which combined the tested PR head with the pre-merge base. PR #48 was subsequently squash-merged.

## What this means for a SaaS engineering team

The practical value of this architecture is not that every application needs every Signal package. It is that teams can stop rebuilding the same decision infrastructure in disconnected ways.

For a team evaluating this approach, the potential benefits are:

- **More explainable decisions:** preserve the evidence, assessment, authorization, and action trail needed to understand why a system acted.
- **Safer retries and recovery:** make idempotency, ownership, and delivery semantics explicit instead of relying on best-effort handler conventions.
- **Clearer application boundaries:** reuse decision capabilities without surrendering domain ownership or business authority.
- **A path from outcomes to improvement:** connect later results to earlier decisions so calibration and learning can be designed as part of the system.
- **More testable architecture:** verify contracts and failure behavior through repeatable scenarios and integration tests.

These are architectural capabilities and plausible engineering benefits—not measured reductions in incidents, operating costs, decision errors, or customer churn. Those outcomes must be established in the context of a real deployment.

## Integration without surrendering business ownership

Signal's Reference Lab demonstrates Signal's own technical capabilities. A separate [Workbench integration case study](workbench-integration.md) demonstrates a consuming application using the released `@signal/decision@0.1.0` package in a commercial assessment workflow.

Workbench retains authority over its commercial records, economic calculations, recommendations, approvals, audit history, and outcomes. The integration is package-level and CI-validated; it is not a Signal SDK/runtime integration, hosted service, production deployment, or evidence of improved commercial outcomes.

Together, the two examples show both sides of the engineering proposition: a reusable decision foundation and an application that can adopt a domain package while retaining ownership of its business.

## Evidence boundaries and remaining work

A credible engineering case study should make the limits as visible as the results.

**Verified or directly exercised**
- Public Signal packages compose into a runnable reference application.
- The tested lifecycle spans evidence, assessment, decision, authorization, action, outcome, and review.
- PostgreSQL-backed correctness and recovery behavior is exercised in CI.
- Idempotency, audit integrity, replay evidence, tenant-boundary checks, and resilience controls have automated verification.
- Evaluation and benchmark artifacts are tied to repository commits and workflow runs.

**Not established by this case study**
- Production throughput, latency SLOs, long-duration soak behavior, or capacity under representative traffic.
- A customer deployment, customer reference, or measured revenue, conversion, retention, incident, or decision-quality improvement.
- Multi-region failover or cross-host contention under production load.
- External identity-provider integration or a complete production authorization deployment.
- External key custody, independent audit-checkpoint retention, or managed security certification.
- Full historical replay execution and cross-version replay compatibility.
- External telemetry scraping, trace export, on-call readiness, or operational alerting.
- A deployed Reference Lab UI screenshot or demo recording; current visual evidence is the lifecycle diagram and linked CI artifacts.

The Reference Lab itself does not claim broker-level delivery certification; the separate production-simulation workflow covers the broker crash/redelivery boundary. Six capabilities remain marked partial in the evaluation. A passing CI run is evidence for the tested revision and scenarios, not a substitute for deployment validation or real-world use.

## Reproducing the evaluation

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

## Next step

If your product makes decisions that trigger consequential actions, Naubly can help assess one representative workflow: where evidence enters, how decisions are authorized, what happens on retries and failures, and whether outcomes can be traced back to the original decision. The first step is a focused engineering assessment—not a commitment to replace your existing architecture.

---

## Naubly Client Acquisition Score (NCAS)

**Target buyer:** SaaS CTO or engineering leader responsible for a product with consequential, automated decisions.  
**Relevant engagement:** Backend & Platform engineering, with potential follow-on work in reliability, integrations, and ongoing engineering partnership.  
**Score:** **82 / 100 — Very high persuasive strength.**  
**Interpretation:** This is an evidence-based assessment of how strongly this case study may influence a qualified buyer. It is not an 82% purchase probability. Actual purchase probability must be calibrated against prospect and sales outcomes for comparable buyer profiles. A score of 100 is reserved for confirmed hiring commitment.

| Dimension | Score | Buyer-perspective assessment |
|---|---:|---|
| Problem relevance | **14 / 15** | Describes recognizable, expensive engineering failure modes in decision-heavy SaaS systems. |
| Solution relevance | **13 / 15** | Explains a coherent architecture and lifecycle, while leaving room to make the fit to a specific buyer's stack and use case more concrete. |
| Proof of capability | **12 / 15** | Strong reproducible tests, integration assertions, benchmark artifacts, commit provenance, and workflow links; no customer deployment or production outcomes. |
| Trust and credibility | **14 / 15** | Explicit claim boundaries, limitations, at-least-once semantics, partial capabilities, and reproducibility materially reduce overclaiming. |
| Expected business value | **11 / 15** | Connects architecture to explainability, safer recovery, ownership, and learning, but does not quantify customer-specific financial impact. |
| Risk reduction | **9 / 10** | Makes failure modes, authorization boundaries, idempotency, and remaining risks concrete; production operational risks remain unverified. |
| Competitive differentiation | **7 / 10** | The end-to-end decision lifecycle and separation of protocol/runtime/domain are distinctive, but no comparative benchmark against alternatives is provided. |
| Purchase readiness | **2 / 5** | Includes a relevant next step, but lacks a named buyer outcome, engagement scope, timeline, commercial terms, and customer testimonial. |
| **Total** | **82 / 100** | **Very high persuasive strength; not a calibrated probability of purchase.** |

### What would increase the score

The highest-value additions are not more technical claims. They are buyer-specific evidence:

1. A short, recorded walkthrough of the Reference Lab showing a decision, authorization, retry/recovery, audit trail, and outcome review.
2. A concrete example mapped to one target vertical or workflow, with the buyer's current failure mode and integration constraints.
3. A scoped assessment offer with deliverables, expected timeline, decision criteria, and a clear commercial next step.
4. A real customer engagement with permission to publish baseline conditions, delivered changes, and measured outcomes.
5. A production-like load and soak report with stated workload, infrastructure, methodology, and reproducible results.

Until those exist, the case study should sell the engineering capability and the quality of the evidence—not imply customer results that have not been measured.
