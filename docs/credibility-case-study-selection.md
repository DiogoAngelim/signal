# Signal Credibility Case-Study Selection

## Purpose

This is a deliberately narrow evidence plan. Signal should earn credibility through a small number of technically meaningful, reproducible case studies—not through the number of applications that import its packages.

This assessment is based on repository source and workflow definitions inspected on 2026-11-10. It is a source-level assessment, not a claim that all workflows were executed during this review.

## Selection decision

| Candidate | Decision relevance | Current evidence | Credibility role | Decision |
|---|---|---|---|---|
| Signal Reference Lab | High | A runnable application uses public Signal packages and defines 17 deterministic scenarios, including PostgreSQL-backed behavior. A dedicated Actions workflow provisions PostgreSQL, builds libraries, applies migrations, runs tests and coverage, and uploads evaluation/benchmark artifacts. | Primary reproducible technical case study | **Select now** |
| Workbench | Very high | Contains deterministic commercial guardrails, independent expected-net-value reconciliation, AI-assisted red-team review, audit metadata, and tests. However, inspected source uses local Workbench logic; the repository has no Signal platform SDK/runtime dependency in its package manifest. No outcome-labeled commercial dataset was verified. | Highest-value future external business case study | **Do not describe as Signal-platform-integrated yet. Prepare a bounded integration only after the Signal runtime contract and data boundary are agreed.** |
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

The Reference Lab README explicitly identifies remaining unverified areas, including crash-after-claim recovery, stale-worker fencing in the harness, actual multi-process contention, external identity-provider integration, provider/network fault injection, full replay execution and cross-version compatibility, external key custody/checkpoint anchoring, external telemetry export, and production load/soak validation.

The case study must preserve those limitations. In-process tests are not proof of distributed production behavior. Synthetic scenarios are not real customer outcomes. CI benchmarks are not production SLO evidence.

## Workbench: future external business case

Workbench is the strongest candidate for a future real-world business case because it contains consequential commercial assessments and an independently reconciled economic model.

The inspected test file `src/lib/decision-signals.test.ts` includes:
- Missing and invalid input handling.
- Confirmed/unconfirmed evidence warnings.
- Zero-delivery-effort and negative-contribution findings.
- Independent expected-net-value calculation.
- Mismatch and missing-result blockers.
- Filtering of model-invented finding codes.
- Thirty reconciliation scenarios comparing the independent Signal-named calculation with Workbench economics.

However, this is not yet proof of integration with the Signal platform. The implementation is local to Workbench and its package manifest does not import Signal's SDK/runtime. The name "Signal" in a local module or feature description must not be presented as evidence of platform integration.

A future Workbench case study should:
1. Preserve Workbench as the owner of commercial records and economic calculations.
2. Integrate a real, supported Signal package/runtime only where it adds reusable decision lifecycle value.
3. Use the same authorized opportunity scenarios for baseline and integrated comparisons.
4. Validate economics against an independent calculation.
5. Use genuine outcome-labeled opportunities only when sufficient authorized data exists.
6. Measure decision consistency, evidence completeness, invalid-assumption detection, reconciliation, reproducibility, and latency.
7. Avoid claims of revenue/conversion improvement until real observed outcomes support them.
8. Keep human approval and all existing commercial write boundaries intact.

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
5. Keep the Workbench and Stocks Optimizer candidates deferred until their genuine Signal integration paths are demonstrated.
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

The immediate credibility deliverable is one rigorously reported Reference Lab case study. The next external business case should be Workbench, but only after a real Signal platform integration and evidence-backed comparison.

## Verified CI evidence: Reference Lab

The existing Reference Lab workflow was inspected for run **[42853111860](https://github.com/DiogoAngelim/signal/actions/runs/42853111860)** on commit `7611e0e0fa61b1dd8299127f1754d631488fc089` (2026-11-10).

Observed results from the completed GitHub Actions job:
- Job conclusion: **success**.
- PostgreSQL 16 service started and passed its health check.
- Frozen pnpm workspace installation succeeded.
- Signal workspace library build succeeded.
- Reference Lab PostgreSQL migrations succeeded.
- Signal CLI installation and build succeeded.
- Reference Lab build and semantic typecheck succeeded.
- Compiled Reference Lab test suite succeeded.
- Coverage verification succeeded.
- Evaluation and benchmark evidence artifacts were generated and uploaded.
- **17/17 scenarios passed; 0 blocked; 0 failed.**
- **12/12 Signal-targeted scenarios passed.**
- **28/34 capabilities directly exercised; 6 partial.**
- PostgreSQL integration reported **21 assertions passed**.

The evaluation report itself labels the score provisional and explicitly says it is not certification or production-readiness evidence. The four-pillar composite score is withheld until each pillar has sufficient comparable evidence. Performance is neutral until production-like measurements are available.

Artifact: `signal-reference-lab-42853111860-1` (GitHub Actions artifact ID `13782365395`; retained until 2026-12-10).

This is a genuine, reproducible CI verification result for the Reference Lab at the stated commit. It is not a deployment validation, production validation, independent customer outcome, or evidence that the currently updated documentation PR commit has rerun the Reference Lab workflow.


## Documentation PR validation

The documentation-only change set was subsequently validated on its current PR head commit `b3fdaa66a5ae9909e4197c2137b0df1176854af7`:

- [Signal quality run 42917749324](https://github.com/DiogoAngelim/signal/actions/runs/42917749324): completed successfully; Library correctness and architecture job passed.
- [Signal core run 42917749390](https://github.com/DiogoAngelim/signal/actions/runs/42917749390): completed successfully; core job passed.

These checks validate the documentation PR's repository quality/core gates. They are distinct from the Reference Lab run above and do not imply that the Reference Lab workflow was rerun on this documentation-only head commit.
