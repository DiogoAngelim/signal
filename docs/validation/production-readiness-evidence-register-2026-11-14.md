# Signal production readiness — consolidated verification and evidence register

**Review date:** 2026-11-14  
**Baseline main commit:** `7352ff381f4809b3bb21e103f127b399782a1526` (merged PR #83)  
**Scope:** Signal library/runtime, research validation, linked Vercel deployment surfaces and read-only Neon metadata.  
**Change policy:** documentation, isolated build/preinstall-scan regression hardening and pull-request CI only. No production deployment, migration, trial enrollment, partner contact, financial transaction, Signal decision-gate relaxation or application-action activation was authorized.

## Decision, vocabulary and interpretation

- **SOURCE CONTROLS IMPLEMENTED / CI VERIFIED IN PART:** Library runtime, transactional adapters and research tooling have demonstrable tests. This is **not** proof of operation on a target production workload.
- **DEPLOYMENT READY: NO.** Identified broken Vercel builds, application-specific adapter/operations gaps, and no complete deployment-exact SLO/recovery/audit proof.
- **PRODUCTION CERTIFIED: NO.** The explicit release gates in [production-validation-status](../production-validation-status.md) remain incomplete.
- **CAUSAL INCREMENTAL SIGNAL NET PROFIT: NOT PROVEN.** Authentic historical RCT evaluations do not randomize adoption of Signal software; tested same-information optimizers generally agree with Signal and do not establish a positive advantage.
- **INDEPENDENT SOFTWARE TRIAL: NOT STARTED.** The Stripe-free prospective exposure/finance pipeline is offline/synthetic-tested infrastructure, not enrolled research.
- **APPROVAL TO DEPLOY / ENROLL / INTERVENE: NONE.** All unproven gates are fail-closed.

Use the definitions in [quality-assurance](../quality-assurance.md): *specified*, *implemented*, *tested*, *validated*, and *operationally observed* are not interchangeable. Dates and result magnitudes below describe the source-linked runs, not a newly run replication.

## 1. Evidence from earlier chats and merged GitHub work

| Source and evidence type | Reconciled finding | Scientific/operational boundary |
| --- | --- | --- |
| [PR #65, randomized Hillstrom email treatment](https://github.com/DiogoAngelim/signal/pull/65), [CI #43592392744](https://github.com/DiogoAngelim/signal/actions/runs/43592392744) | Actual Signal quantitative advisor selected a treatment yielding +$0.85319/customer **gross spending** over no email, 95% CI [$0.4612, $1.2452]; conventional training-only optimizer chose the **same** action | Treatment effect is not incremental Signal effect; not net profit |
| [PR #66 Hillstrom contextual](https://github.com/DiogoAngelim/signal/pull/66), [CI #43593097012](https://github.com/DiogoAngelim/signal/actions/runs/43593097012) | Signal vs same-information contextual comparator: +$0.20203/customer gross, 95% CI [−$0.01102, +$0.41509], p=.06309; vs strong global baseline −$0.18953/customer | Interval includes zero; do not claim superiority |
| [PR #68 JTPA](https://github.com/DiogoAngelim/signal/pull/68), [CI #43594614015](https://github.com/DiogoAngelim/signal/actions/runs/43594614015) | 5,865 held-out subjects; Signal and conventional global/contextual expected-value choices identical | $0 incremental policy difference; earnings, not software trial |
| [ZOZO source study](./signal-causal-proof-status-2026-11-14.md), [CI #43589952415](https://github.com/DiogoAngelim/signal/actions/runs/43589952415) | 232,447 held-out randomized impressions; original native gate allowed zero interventions | No demonstrated reward uplift; domain-specific gating mismatch cannot be bypassed |
| [PR #70 development native-veto diagnosis](https://github.com/DiogoAngelim/signal/pull/70), [CI #43595550546](https://github.com/DiogoAngelim/signal/actions/runs/43595550546) | Simulation chose wait for all 2,928 development cases; original evidence also triggered stewardship/governance blockers | Development-only root-cause evidence, not evidence of inappropriate veto or economic benefit; #70 remains unmerged |
| [PR #69 prospective audit](https://github.com/DiogoAngelim/signal/pull/69), [CI #43595769883](https://github.com/DiogoAngelim/signal/actions/runs/43595769883) | Pre-outcome frozen assignment, matching ITT denominator, shadow action disagreement and conditional power preflight validated on synthetic fixtures | No actual enrollment, independently timestamped assignment or measured outcome |
| [PR #71 shadow authorization](https://github.com/DiogoAngelim/signal/pull/71) and [PR #73 native-gated randomized OPE](https://github.com/DiogoAngelim/signal/pull/73) | Quantitative decision advice is independently checked against equally informed conventional net-utility and risk optimizers; native denied and partial-scale actions remain wait | No auto-authorization, no live action, no causal effect |
| [PR #74 cohort manifest](https://github.com/DiogoAngelim/signal/pull/74), [PR #75 production-branch audit](https://github.com/DiogoAngelim/signal/pull/75) | Read-only **named production branch** check at 2026-11-14 13:54 UTC: 11 opportunities, 10 distinct company owner/relationship units, 1 repeated-company group, and **zero** saved economic models, evidence, verified evidence, OQS, assessments, outcomes or cash receipts | Earlier development-branch zero-company check was *not* the production check; these 10 are prospects, not consented/mature randomized participants |
| [PR #76 Togo candidate](https://github.com/DiogoAngelim/signal/pull/76), [PR #77 access attempt](https://github.com/DiogoAngelim/signal/pull/77) | Authentic randomized 1,500-firm design with public intervention-cost figures identified; official ZIP endpoints returned HTTP 500 | No Togo profit data analyzed; no invented real-profit estimate |
| [PR #77 Karlan–List donor experiment](https://github.com/DiogoAngelim/signal/pull/77) | 50,083 randomized donors (16,687 control; 33,396 mail arm); Signal vs equally informed risk and risk-neutral policy: $0/donor, CI [$0,$0] in this identical-policy comparison; historical campaign comparison negative point estimate | Real gross donation receipts, not complete net business profit and not software assignment |
| [PR #78 signed exposure ledger](https://github.com/DiogoAngelim/signal/pull/78), [PR #79 bank-finance bridge](https://github.com/DiogoAngelim/signal/pull/79) | Offline 25-key finance contract, Ed25519-backed source reconciliation, all-unit ITT ledger, and Stripe-free bank/bookkeeping bridge with strict missing-cost rejection | Synthetic end-to-end tests only. Signature authenticity depends on **independent key custody and genuine source records**. No partner contacted |
| [PR #81 Egypt source and mathematical bound](https://github.com/DiogoAngelim/signal/pull/81) | Independent genuine firm-profit RCT identified, but direct download required guestbook response; synthetic 4,000-case optimizer test had zero cases exceeding a correctly informed risk-neutral expected-net optimum | No Egypt data analyzed; equal-feasible-action expected-net argmax cannot be outperformed on its own correct objective |
| [PR #82 Lenta calibration](https://github.com/DiogoAngelim/signal/pull/82), [CI #43609203618](https://github.com/DiogoAngelim/signal/actions/runs/43609203618) | Authentic 687,029-row promotional RCT; 83,737 train / 26,694 calibration / 26,641 held-out test. Signal optional shrunken isotonic calibration **did not beat** same-information sklearn calibration: control Brier difference −0.00008012 CI [−0.00084238,+0.00073670]; treated −0.00021749 CI [−0.00041765,+0.00004144] | Calibration is optional, research-only and default **off**; binary response, not monetary net profit; all outcome-gain intervals include zero |
| [PR #83 NSW earnings](https://github.com/DiogoAngelim/signal/pull/83), [CI #43610839356](https://github.com/DiogoAngelim/signal/actions/runs/43610839356) | Authentic 445-person training RCT; 142 held-out participants. Signal uncertainty policy and same-information conventional robust optimizer both treated 78/142; incremental $0, CI [$0,$0]. Nonzero comparisons with other baselines all have intervals including zero | Historical **earnings**, not realized net business profit; does not exercise native governance permissions or software-level randomization |
| [Open source-level main CI #43610997964](https://github.com/DiogoAngelim/signal/actions/runs/43610997964) and [quality #43610997937](https://github.com/DiogoAngelim/signal/actions/runs/43610997937) | Both **success** on the exact starting main SHA | Specific jobs passing are not global security assurance, operational certification, or deployment evidence |

More detailed pre-existing records: [causal status](./signal-causal-proof-status-2026-11-14.md), [independent software trial](./independent-software-profit-trial.md), [bank/bookkeeping bridge](./processor-free-finance-bridge.md), [NSW](./nsw-real-earnings-information-value.md), [Lenta](./independent-lenta-calibration.md), [Workbench production cohort](./workbench-production-cohort-preflight.md). In particular, [PR #72](https://github.com/DiogoAngelim/signal/pull/72) remained open/unmerged when reviewed, and a PR's written findings do not prove its branch is in main.

## 2. New live read-only verification in this readiness review

### 2.1 Vercel projects and build evidence

Read-only Vercel project listing identified three linked names in team `team_r0Xt02fVBKD2cuEmDgm0Y2za`: `signal-signal-reference-lab`, `signal-reference-lab`, `signal-workbench-runtime`. These are **separate deployment surfaces**, not proof that one represents the live Signal library API.

- **WorkBench runtime / production-targeted build is ERROR.** Deployment `dpl_2p1eY4LnnHM2dKj92HX8mLVtXbHd` on commit `fc58a640737160f05cc4bd757d87d127f8a1f2f0`, target `production`, reports: `The specified Root Directory "server/workbench-host" does not exist. Please update your Project Settings.` Its directory is absent from the checked Signal repository root. Another preview deployment of the project, `dpl_6Rxzh6Ha73xnrqBaQ1SH8xWunWNe`, produced the same root-directory error. This cannot be fixed by declaring the wrong root safe: determine the **intended project entrypoint** and inspect both Git integration and project settings before updating it.
- **Reference Lab builds are ERROR for a separate reason.** Deployment `dpl_94sZH9kFQPRaraqmu4poYAAYfVU9` and `signal-signal-reference-lab` deployment `dpl_3TJi9LnE3wye2XNSvBNbExWAfkNi` fail during `pnpm install --frozen-lockfile`. Preinstall `scripts/check-obfuscated-payloads.mjs` invokes `git ls-files -z` despite the `.git` directory being excluded by `.vercelignore`, yielding `fatal: not a git repository`. Vercel also warns that one or more Git submodules could not be fetched; that warning needs a dependency-specific assessment if any required build input comes from a submodule.
- **Non-deployment source fix proposed on this branch:** continue scanning tracked files when Git metadata exists; for the specific detached/no-`.git` archive case, scan available source-tree regular files, omit symlinks and generated dependency directories, reject empty/unreadable scans, and still fail on signature hits. Add regression fixtures for detached safe, marker, empty, symlink and tracked marker cases. The fallback deliberately **cannot certify excluded source files or the complete Git history**. Do not suppress/disable security checks to make the build green.
- A successful future build is **not** claimed by these diagnostics; the fix must first pass exact-head CI and then an intentionally authorized target deployment build.

Evidence: [Vercel reference build](https://vercel.com/diogos-projects-c462ac73/signal-reference-lab/94sZH9kFQPRaraqmu4poYAAYfVU9), [Vercel second reference build](https://vercel.com/diogos-projects-c462ac73/signal-signal-reference-lab/3TJi9LnE3wye2XNSvBNbExWAfkNi), [Vercel workbench production build](https://vercel.com/diogos-projects-c462ac73/signal-workbench-runtime/2p1eY4LnnHM2dKj92HX8mLVtXbHd). Build states reflect those identified deployments, **not a claim that every earlier or future deployment failed**.

### 2.2 Neon project/branch inspection and schema footprint

Read-only Neon metadata identified:

| Project | Exact branch examined | Inspection finding |
| --- | --- | --- |
| `crimson-tooth-17261724` / `signal-reference-lab` | `br-flat-base-b6q28exv` (real-world-validation-2026-11) | PostgreSQL 16.16; two public base tables; no table names matching `signal_%`, `%outbox%`, `%audit%`, `%inbox%` or `%migrations%` |
| Same reference lab | `br-shy-band-b6zin02d` (main) | PostgreSQL 16.16; same inspected public-table counts/filters |
| `sparkling-star-36251849` / `signal-workbench-connector` | `br-lively-fire-bbb5vlbo` (main) | PostgreSQL 17.12; two public base tables, named `signal_workbench_outcome_cursors` and `signal_workbench_outcome_events` |

These statements are **limited to a metadata query in the selected database and public schema**, not an assertion about every schema, database, environment, worker or customer data. They do **not** demonstrate that the transactional outbox/replay/audit migrations or workers are active in a production Signal runtime. An older project named `Signal`, `winter-unit-43856097`, has an archived production branch; it is not evidence of a currently operating ready Signal service.

The separate read-only Workbench production cohort check in PR #75 refers to the **Workbench V3 production branch**, not the similarly named connector/reference lab projects above. Do not combine their counts.

### 2.3 Main-branch CI and review limitations

GitHub API showed on baseline SHA `7352ff3...`: Signal core **success** (run `43610997964`) and Signal quality **success** (run `43610997937`). A third workflow run `43610997002` was **in progress at inspection**, not recorded as success. GitHub branch-protection API returned 403 to the connected app, so enforcement of required reviews/status checks is **not verified**. No release certification should assume protected-branch policy is active from this review.

## 3. Outstanding release gates: concrete test and evidence contract

| Priority | Gate | Current state | Required acceptance evidence |
| --- | --- | --- | --- |
| P0 | Correct failed Vercel project configurations | **BLOCKED** | Explicit mapping of repo, immutable commit, entrypoint and environment for each intended surface; reviewed root directory; successful authorized build with logs; targeted smoke tests |
| P0 | Detached source security preinstall | **PATCH PROPOSED, NOT VALIDATED** | Source scan regression CI passes with Git metadata and without it; same-hash reference-lab build and source-input completeness reviewed |
| P0 | Destination third-party side-effect idempotency | **NOT PROVEN** | Inventory every retryable external operation, idempotency key, duplicate-concurrency behavior, ambiguous-commit recovery, reconciliation owner and integration result |
| P0 | Historical replay completeness | **NOT PROVEN** | Real application captures all external reads and policy/handler hashes; archived handlers reproduce historic outcomes across a version upgrade, side effects disabled |
| P0 | Independent audit trust and key custody | **NOT PROVEN** | KMS/HSM or separately controlled custody, checkpoint off-store anchor, access/rotation audit, tamper/history-rewrite test, restored-chain verification |
| P0 | Backup, restore, rollback and resilience | **SIMULATED, NOT DEPLOYMENT-VALIDATED** | Restore drill with target RTO/RPO, queue re-drive, coordinated-store outage/failover and rollback of same deployed artifact |
| P0 | Operational metrics, alerts and ownership | **SPECIFIED, NOT DEPLOYMENT-VALIDATED** | Durable metrics pipeline and dashboard, low-cardinality labels, owner/on-call runbook, alert injection, measured detection/ack latency and deployment-specific SLOs |
| P1 | Sustained capacity and threat boundary | **CI BENCHMARKS ONLY** | Representative long-running load, p50/p95/p99 and resource budgets, rate-limit proxy topology, tenant/auth threat tests and signed evidence |
| P1 | Decision evaluation, calibration and outcome leakage | **PARTIAL RESEARCH TESTS** | Prespecified domain cohort, independently verified inputs and outcome maturity, no temporal leakage, controls remain advisory until accepted |
| P1 | Independent Stripe-free causal net-profit trial | **NOT STARTED; EXPLICITLY DEFERRED** | External authorized cohort, before-outcome randomization, effective policy disagreement, partner/independent accountant custody, complete net finance and sufficiently powered ITT estimate |

No source-only patch can complete environment-specific P0 evidence. Reject **GO** when a required P0 has no dated deployment-exact artifact.

## 4. Software trial feasibility without enrollment or outreach

The earlier conversation established **retention workflow**, **hundreds** of eligible decisions/month, **historical bank/bookkeeping records** believed available, **partner status exploring**, **Stripe-free**, and **no partner contact, deployment or enrollment**. These are planning assumptions, not a verified participant count, verified source access, eligible denominator, effective cluster sample size, baseline variance or permission to act.

Use [independent-software-profit-trial](./independent-software-profit-trial.md), [processor-free-finance-bridge](./processor-free-finance-bridge.md), [prospective-cohort-assignment](./prospective-cohort-assignment.md), and [prospective-signal-policy-causal-proof](./prospective-signal-policy-causal-proof.md).

- Freeze retention eligibility, unit/cluster relationship, no-leakage windows, fixed conventional baseline, unmodified native Signal gate, positive minimum meaningful net-USD gain, harms, censoring and outcome-close timetable **before assignment**.
- Verify that source inputs are available *before decisions* and that **effective** baseline-vs-native-gated Signal actions disagree sufficiently. A different advisor score that becomes the same wait action is **not** an experimental treatment contrast.
- Conditional only on externally measured net-utility SD `sigma` and desired per-unit gain `delta`, 50/50 independent-arm two-sided 5% / 80%-power approximation is `n_per_arm ≈ 2(1.96+0.84)^2(sigma/delta)^2 ≈ 15.68(sigma/delta)^2`. For example, if `sigma/delta=3`, ~142 independently randomized units **per arm** before attrition/cluster corrections; if `sigma/delta=5`, ~392 per arm. These are illustrations, not a sample-size certification, and **hundreds of monthly decisions need not equal independent units**.
- Keep all records with independent custodians; sign pre-outcome assignments and source statements, log advice exposure and human approvals, reconcile settled bank funds, refunds and **all** loaded delivery, staff, review, compute, overhead, delay and remediation costs for *all assigned units*, and obtain independent analysis of the prespecified ITT effect. No data exports or outreach conducted here.
- A correctly specified, equally informed expected-net-profit argmax cannot be beaten on its own expected-net-profit objective under identical feasible choices. A potential incremental Signal effect requires a genuine change in available evidence, measurement/calibration, governance constraints, harm protection or human execution behavior **that survives a fair comparison**, without hiding its costs.

**Stop rule at current stage:** Without authorized enrollment and independent real-world exposure/outcomes, `SOFTWARE_TRIAL_NOT_STARTED` and `INCREMENTAL_CAUSAL_NET_PROFIT_NOT_PROVEN` remain final regardless of the number of synthetic passes.

## 5. Safe sequence for the remaining production work

1. **PR and CI:** inspect only the isolated scanner patch and regression; run exact-head security, library-quality and targeted build contract. Record commit SHA, run URL, outcome and any skipped checks. A green scanner test alone does not certify Vercel.
2. **Repository-to-project mapping:** establish whether each Vercel project should serve the static Reference Lab, a server entrypoint or the Workbench integration. Correct erroneous root entrypoints *only after approval of the intended target*. Avoid automatically converting research-branch previews into user-facing releases.
3. **Build/deployment evidence:** on an explicitly authorized non-production deployment, exercise the corrected project build, dependency/submodule availability, route smoke, authentication, fail-closed readiness and representative error paths. Do not infer a successful Vercel build from GitHub CI.
4. **Application integration:** enable only reviewed migrations/adapters, durable outbox/worker, replay snapshots, safe third-party idempotency, separately protected checkpoint trust, audited key custody, metrics, alerts, backup and rollback. Each step requires environment-specific change authorization.
5. **Operations validation:** measure SLO, load, failure injection and restore/rollback evidence against exactly the intended release artifact. Require an accountable operator and documented risk acceptance.
6. **Independent economic study:** remain deferred under current no-contact/no-enrollment restriction; do not make positive causal ROI claims, weaken native gates or substitute historical RCTs or synthetic datasets.

## 6. Change and claim hygiene

This document is a **time-stamped evidence register**, not an operating license. Links to historical runs document those historical results only. A failed build is not a security bypass justification. A signed file alone is not independent proof of its source. Observed positive historical treatment uplift is not observed positive Signal-software uplift. All pending tests must attach run identifiers and exact SHAs before moving to VERIFIED.

**Current disposition: NO-GO for production certification; NO-GO for claimed incremental causal net-profit superiority; research and source-level hardening may continue in review-only mode.**
