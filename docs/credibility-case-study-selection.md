# Signal Credibility Case-Study Selection

## Purpose

This is a deliberately narrow evidence plan. Signal should earn credibility through a small number of technically meaningful, reproducible case studies—not through the number of applications that import its packages.

This assessment combines repository inspection with completed CI evidence from 2026-11-10. Source-inspected, implemented, tested, and production-validated claims are kept distinct.

## Selection decision

| Candidate | Decision relevance | Current evidence | Credibility role | Decision |
|---|---|---|---|---|
| Signal Reference Lab | High | A runnable application uses public Signal packages and defines 17 deterministic scenarios; 28/34 capabilities are directly exercised. PostgreSQL integration, lease renewal/fencing, broker crash recovery, and separate engineering benchmarks have passing CI evidence. | Primary reproducible technical case study | **Select now** |
| Workbench | Very high | Separate application consumes the released `@signal/decision@0.1.0` package in its authenticated commercial assessment flow; persists Signal assessments; displays an evidence-review summary; includes 30 shared scenarios; and passed full CI (68 files, 663 tests, typecheck, migrations, audit, and build). No production deployment or outcome-labeled commercial dataset was verified. | Application integration case study; future external business-outcome case | **Select package-level integration case study now. Defer production and business-outcome claims.** |
| Stocks Optimizer | High | Exists as a substantial application under `examples/stocks-optimizer`, with its own pnpm workspace and API CI workflow. Its workspace manifest does not declare Signal packages, and its workflow tests the app's own API server. The actual integration path into Signal was not established by this source review. | Conditional quantitative case study | **Defer pending proof of a real Signal runtime/domain-package path and independent financial test fixtures.** |
| Liquidity Manager | Medium | A React/Vite application with Nubank-related dependencies; its manifest does not declare Signal packages. No distinct independently verifiable Signal decision use case was established in this review. | Low incremental value at present | **Exclude from this project.** |
| AlgAI / Client | Not assessed for this project | Outside the narrowed case-study scope. | None | **Exclude.** |

Scores are intentionally not fabricated where evidence is insufficient. A numerical ranking would imply a level of assessment not supported by this source-only review.

## Selected case study: Signal Reference Lab

The Reference Lab is currently the strongest defensible case study because it is designed to exercise Signal through public package exports, with an explicit distinction between exercised, partial, blocked, and unverified capabilities.

Its documented workflow covers:
- Request intake, sourced evidence, uncertainty/risk assessment, constrained decision, accountable authorization, approved action, outcome capture, and review.
- SDK query/mutation dispatch and in-process event subscription.
- Mutation idempotency and concurrent duplicate handling.
- Tenant-boundary checks at the application repository boundary.
- Decision evidence, governance, stewardship, and outcome review.
- Commitment constraints and semantic-state interpretation.
- Agency policy and decision/outcome cycles.
- HTTP binding and authorization rejection.
- PostgreSQL transactional idempotency, outbox/inbox, retry budgets, distributed circuit-breaker state, decision-memory persistence, replay evidence, and append-only audit records.
- CLI and observability checks.

The repository's `.github/workflows/reference-lab.yml` workflow is the intended execution path. It:
1. Provisions PostgreSQL 16 as an ephemeral Actions service.
2. Installs the locked pnpm workspace.
3. Builds Signal libraries.
4. Applies Reference Lab migrations.
5. Builds the Signal CLI and Reference Lab.
6. Runs semantic typechecking and compiled tests.
7. Runs coverage verification.
8. Captures machine-readable evaluation and benchmark artifacts.
9. Uploads evidence artifacts.

The workflow is already present; do not create a duplicate workflow. A passing run must be inspected before reporting validation.

### Evidence boundaries

The latest verified iteration adds PostgreSQL lease renewal and expiry fencing, stale-owner acknowledgement/retry rejection, and batch-wide runtime heartbeats. The separate production-simulation workflow also passes the broker publish/crash/redelivery boundary. These are stronger recovery tests than the earlier Reference Lab run, but they do not establish multi-region failover, cross-host contention under representative production load, or exactly-once third-party side effects.

Remaining unverified areas include external identity-provider integration, provider/network fault injection across all relevant modes, full historical replay execution and cross-version compatibility, external key custody and independent checkpoint anchoring, external telemetry export and alerting, and production load/soak validation. In-process tests are not proof of distributed production behavior. Synthetic scenarios are not real customer outcomes. CI benchmarks are not production SLO evidence.

## Workbench: package integration and future external business case

Workbench is now a real package-level application integration: its separate repository consumes Signal's released decision-assessment package inside a consequential commercial workflow. It is also the strongest candidate for a future real-world business case because it contains independently reconciled commercial economics. Production deployment and outcome-labeled business evidence remain unverified.

The inspected test file `src/lib/decision-signals.test.ts` includes:
- Missing and invalid input handling.
- Confirmed/unconfirmed evidence warnings.
- Zero-delivery-effort and negative-contribution findings.
- Independent expected-net-value calculation.
- Mismatch and missing-result blockers.
- Filtering of model-invented finding codes.
- Thirty reconciliation scenarios comparing the independent Signal-named calculation with Workbench economics.

This original local feature is still not proof of Signal platform integration. Separately, Workbench PR #178 now adds a genuine package-level integration through the released `@signal/decision@0.1.0` artifact. That integration is source-implemented and CI-validated, but it is not the Signal SDK/runtime, a hosted service, a production deployment, or evidence of improved business outcomes. See [Workbench Application Integration Case Study](case-studies/workbench-integration.md).

The completed package-level integration should be extended only through separately validated Signal releases and capabilities. A future Workbench business-outcome case study should:
1. Preserve Workbench as the owner of commercial records and economic calculations.
2. Use the same authorized opportunity scenarios for baseline and integrated comparisons.
3. Validate economics against an independent calculation.
4. Use genuine outcome-labeled opportunities only when sufficient authorized data exists.
5. Measure decision consistency, evidence completeness, invalid-assumption detection, reconciliation, reproducibility, and latency.
6. Avoid claims of revenue/conversion improvement until real observed outcomes support them.
7. Keep human approval and all existing commercial write boundaries intact.

No Workbench code changes are authorized by this assessment alone.

## Stocks Optimizer: deferred quantitative case

The application has its own pnpm workspace and dedicated API workflow. The workspace manifest inspected during this review contains no Signal package dependencies. Therefore, it should not be presented as a Signal integration until the actual execution path is demonstrated.

Reconsider it only if source inspection establishes that Signal genuinely participates in investment decision processing and independent historical/synthetic scenarios can verify:
- Objective and constraint handling.
- Evidence provenance and freshness.
- Uncertainty representation.
- Reproducibility.
- Correct separation of historical backtests, synthetic scenarios, live data, and actual investment outcomes.

Backtesting is not evidence of future investment performance.

## Liquidity Manager: excluded

The inspected manifest identifies a frontend application with banking-related dependencies but no Signal package dependency. No distinct, independently verifiable contribution was established. Adding Signal solely to increase example count would reduce rather than improve credibility.

## Execution protocol

1. Use the existing Reference Lab Actions workflow; do not add duplicate CI.
2. Inspect the latest relevant workflow run, job logs, and uploaded JSON artifacts.
3. Report each scenario as passed, failed, blocked, partial, or unverified.
4. Fix only defects that materially affect the selected case study.
5. Treat Workbench as package-integrated but keep its production/business-outcome case deferred; keep Stocks Optimizer deferred until its genuine Signal integration path is demonstrated.
6. Keep changes in reviewable PRs. Do not merge, deploy, publish packages, or change production resources as part of this case-study effort.

## Claim policy

Use these terms precisely:
- **Source-inspected:** implementation or workflow was read; not executed during this assessment.
- **Implemented:** source code exists.
- **Tested:** the relevant test actually ran and passed.
- **Independently verified:** output was checked against an independent calculation or oracle.
- **Validated with historical/operational data:** real, appropriately authorized data was used.
- **Validated in deployment:** the named deployed environment was exercised.
- **Production validated:** production controls, SLOs, recovery, security, and real workload evidence were established.

The immediate credibility deliverables are two rigorously reported technical/application case studies: Reference Lab and Workbench package integration. The next Workbench milestone is production validation and an evidence-backed business-outcome comparison.

## Verified CI evidence: Reference Lab and reliability iteration

The latest Reference Lab evaluation artifact was generated on 2026-11-10 and records:
- Reference Lab app commit: `2ff4ba1c7f29b16947fa6f02ed1a6100dcbe9523`.
- Signal source commit recorded by the harness: `20ab95a6de8b36fd28c07ae7da4249e4d8ed16f7`.
- 17/17 scenarios passed; 0 blocked; 0 failed.
- 12/12 Signal-targeted scenarios passed.
- 28/34 capabilities directly exercised; 6 partial.
- 21 PostgreSQL integration assertions passed.
- Provisional engineering score: 8.49/10.

The run is [Signal Reference Lab 42927061931](https://github.com/DiogoAngelim/signal/actions/runs/42927061931). Its uploaded evaluation artifact is `signal-reference-lab-updated-score` (artifact ID `13814781009`). The evaluation distinguishes Signal-targeted, integration, and reference-application gates instead of attributing every application failure or success to Signal.

The PR #48 reliability/security iteration was validated on its final PR head `2ff4ba1c7f29b16947fa6f02ed1a6100dcbe9523` and merged as `e6e44a9b25ce984d0e823af366b2c507a8e63455`. All nine GitHub Actions workflows passed:
- [Reference Lab](https://github.com/DiogoAngelim/signal/actions/runs/42927061931)
- [Production simulation: PostgreSQL correctness, contention, and recovery](https://github.com/DiogoAngelim/signal/actions/runs/42927061765)
- [Engineering measurements](https://github.com/DiogoAngelim/signal/actions/runs/42927061826)
- [CodeQL and dependency audit](https://github.com/DiogoAngelim/signal/actions/runs/42927061780)
- [Core](https://github.com/DiogoAngelim/signal/actions/runs/42927061752)
- [Quality and architecture](https://github.com/DiogoAngelim/signal/actions/runs/42927061613)
- [Library build, test, pack, and clean install](https://github.com/DiogoAngelim/signal/actions/runs/42927061653)
- [Lockfile refresh](https://github.com/DiogoAngelim/signal/actions/runs/42927061639)
- [AI decision-system course validation](https://github.com/DiogoAngelim/signal/actions/runs/42927061932)

The engineering-measurements artifact (run 42927061826) records a 30-second in-process dispatch workload with 14,590,304 messages submitted and handled, 486,343 operations/second, and sampled p50/p95/p99 latency of 0.033/0.058/0.074 ms. It also measures a 5,000-evidence decision pipeline, hash-chain append and verification, signed checkpoints, and synthetic calibration/learning workloads. These measurements exclude production HTTP, broker, network, and multi-process behavior where stated by each benchmark.

The Reference Lab run's own score is provisional and is not certification or production-readiness evidence. A separate quality scorecard reports correctness 8.2, security 7.2, and reliability 8.0; its composite remains withheld because the performance pillar lacks a matched baseline. Do not conflate this scorecard with the Reference Lab's 8.49 engineering score.

The lease-fencing fix is merged, but the case-study documentation update remains in a separate reviewable PR. No deployment, package release, or production validation is implied by these CI results.
