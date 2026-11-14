# Signal native decision-gate validation using real randomized feedback

**Study type:** predeclared retrospective, non-deployed, exploratory policy audit.
**Question:** if an application uses the existing `evaluateDecision` gates before exploiting a candidate item ranking, how does the *resulting domain-specific policy* compare with uniform random and the same ranking without Signal?

## Why this is an adapter, not "Signal's product recommender"

The released `@signal/decision` pipeline evaluates coherence, evidence, scenarios, simulation and wisdom, then returns `actionAllowed` and `actionScale`. It does **not** select a ZOZOTOWN item. Therefore:

- The adapter builds an item score for each of 34 items using **only pre-cutoff** randomized click observations and the logged impression's pre-outcome per-item affinity vector.
- It selects the highest-scoring candidate item. This **ranking is not supplied by Signal**.
- It passes that proposal to the **actual unmodified** `evaluateDecision` implementation, using explicitly declared ordinal 0–100 input mappings. It calls this native path with and without a single-source evidence assessment.
- Signal either permits, reduces or declines the proposal. The result controls exploitation strength in a predeclared stochastic item-selection policy. This is an **integrated domain policy**, not an existing shipped commercial policy.

**No item was actually shown by Signal in production.** The released dataset has never observed outcomes of recommendations chosen by this new adapter.

## Ex ante experiment contract

1. Source: official `st-tech/zr-obp` *men* **random-policy** 10,000-example CSV, Git commit `8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4`, Git blob `e99ba925c30ccd537a554ce8ea2104a005c6f49e`; verify hash before reading.
2. Temporal split: records before **2019-11-29T00:00:00Z** for training, later records for testing. Do not tune configuration on the test labels.
3. Data: `position`, all 34 pre-outcome `user-item_affinity` scores, selected `item_id`, true `propensity_score`, and observed binary `click`. No outcome in `evaluateDecision` or ranker input. Do not export user hashes.
4. Ranker: per-position per-item CTR with 150 pseudo-impressions at the training cohort average; add 0.0005 per (capped to four) user–item historical affinity clicks. Fixed lower-item-ID tie break.
5. Signal ordinal mapping: `clamp(65 + 20*ln(candidateScore/globalTrainCTR), 25, 95)`, passed to all coherence module scores and explicit prediction/wisdom settings. This is **not a calibrated probability**. It is a candidate application's decision-assessment policy and may be inappropriate for other domains.
6. Signal variants:
   - `signalUngoverned`: actual `evaluateDecision` without evidence assessment.
   - `signalGoverned`: same, with a single-source training evidence record, unknowns and conservative quality/independence/calibration inputs.
   - Both emit `actionAllowed`, `actionScale`, simulation and wisdom decisions; no defaults are patched or overridden to force a favorable result.
7. Policy probability for 34 items: `pi(a|x)=(1-epsilon)/34 + epsilon*1[a=topItem]`. Uniform baseline has `epsilon=0`; feature-only comparator `epsilon=0.2`. The two Signal variants use `epsilon=0.2*actionScale` (zero if `actionAllowed=false`).
8. All policies have support on all 34 actions; logged random propensities equal `1/34` at each displayed slot. Estimate `IPS=mean(reward*pi_e(action|x)/pscore)`, `SNIPS=sum(weighted reward)/sum(weight)` with effective sample sizes and maximum weights. The **primary comparison** is IPS against uniform; SNIPS is secondary.
9. Report **paired**, seeded 1,400-replicate IID bootstrap intervals for differences, action rates, per-day diagnostic CTR, overlap and deterministic fixed-input replay / flipped-label non-leakage checks.
10. Fail rather than silently reinterpret data if a Git blob hash, row count, timestamp, feature, action, propensity or action-probability normalization is inconsistent.

## Correct interpretation

- This is a randomized *logging-policy* dataset. For one item per position, ordinary importance weighting is justifiable under the usual no-unmeasured-confounding, positivity, consistency and stationary-policy assumptions, but **joint-slate interaction, interference and unverified sampling** remain.
- The 10k public example includes only a handful of clicks in the final two-day holdout. The estimator may have a wide interval or even a degenerate null difference. Do not optimize its parameters on those outcomes.
- User clustering, repeated impressions, slot interactions and temporal dependence are **not** resolved by IID bootstrap. A credible improvement claim needs larger appropriately clustered data with a preregistered policy and confirmatory analysis; online randomized trials are preferable.
- A finding that Signal blocks nearly every proposal is an **important usability/conservatism finding**, not a reason to alter the input mapping after seeing results.
- The domain-agnostic quantitative decision API introduced in #57 and tested in #58 is **not** substituted for `evaluateDecision` in this run. This script evaluates the actual legacy full decision pipeline plus governance.
- The estimated metric is **clicks per displayed slot**. Conversion, profit, trust, welfare and future action outcomes are not available, and therefore are **not claimed**.

## Execution and evidence

```bash
pnpm install --frozen-lockfile
pnpm --filter @signal/decision build
node scripts/validation/actual-policy-ope.mjs
```

Artifact: `artifacts/validation/actual-policy-ope-report.json` from
`.github/workflows/actual-policy-randomized-ope.yml`. No Neon, Vercel,
customer or production credentials. Provenance includes exact public data
blob, Signal code commit via GitHub run, training-only adapter, source
assumptions, per-policy point estimates and uncertainty diagnostics.

## Operational verification is independent

In the same PR, the existing `production-simulation.yml` suite is explicitly
triggered. Its Docker PostgreSQL 16, Toxiproxy and RabbitMQ jobs cover
transactional idempotency/outbox, network faults, crash boundaries, leases,
recovery, trust boundaries, backup/restore and load.

These are **controlled integration tests**, not certification of a managed
Neon branch, real third-party side effects, customer traffic, backup RPO/RTO,
cross-region availability or hardened production SLOs. The separate Neon
`signal-reference-lab` / `real-world-validation-2026-11` branch remains
the only database for the previously imported public Open Bandit evidence.
No test must touch Workbench production databases or publish a release.

## Acceptance gate

A green workflow proves that the **measurement** ran, not that the policy
produced better outcomes. Report fail, abstention, inconclusive or negative
lift as first-class outcomes. Do not raise the scientific score based merely
on this new harness or completion of its CI.
