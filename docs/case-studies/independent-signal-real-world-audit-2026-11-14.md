# Independent Signal real-world audit — 2026-11-14

## Scope and provenance

This is an **independent read-only check of the isolated Neon validation branch**, not an online experiment, production certification, or claim of policy lift. Source records are the published 10,000-example **men** samples from ZOZO's Open Bandit Project, published in Git repository `st-tech/zr-obp` at commit `8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4`. The application runs an exact pinned-byte verification separately; the SQL check validates the **imported data, metadata and expected counts**, not raw bytes.

- Neon project: `signal-reference-lab` (`crimson-tooth-17261724`).
- Isolated branch: `real-world-validation-2026-11` (`br-flat-base-b6q28exv`).
- No reads from Workbench production, no migration, no secrets, no writes, no deployment.
- SQL: [`scripts/validation/isolated-neon-open-bandit-audit.sql`](../../scripts/validation/isolated-neon-open-bandit-audit.sql).

## Independent observation

Executed the SQL using the connected Neon read-only query operation on **2026-11-14**. Both dataset rows returned **PASS**.

| Imported dataset | Rows | Clicks | Train before 2019-11-29 UTC | Holdout | Integrity gate |
| --- | ---: | ---: | ---: | ---: | --- |
| Random men's policy | 10,000 | 46 | 7,189 | 2,811 | PASS |
| BTS men's policy | 10,000 | 69 | 7,296 | 2,704 | PASS |

Additional results: each sample has 10,000 distinct row IDs (0–9999); no NULL timestamp/item/position/click, invalid item/action/position/click/propensity, or missing required feature markers. All 10,000 random rows contain propensity exactly 1/34 to tolerance 1e-10. The registered source version contains the previously pinned Git blob IDs. NYC 311 is **registered but not imported** into this branch (0 service-request rows), despite a separate stateless CI replay being recorded.

### Native Signal policy against real randomized outcomes

Prior GitHub Actions execution [43570472163](https://github.com/DiogoAngelim/signal/actions/runs/43570472163) evaluated a predeclared ranker adapter and the actual `evaluateDecision` decision gates on 2,811 holdout impressions. It estimated **per-item-slot click rate** using inverse propensity scoring (IPS); these are *not* outcomes of deployed Signal recommendations.

| Predeclared policy | IPS click rate | Effective sample size | 95% descriptive IID bootstrap interval |
| --- | ---: | ---: | --- |
| Uniform random | 0.6403% | 2,811 | 0.3913%–0.9605% |
| Feature-only ranker (20% exploit) | 0.7542% | about 1,192 | 0.3131%–1.4372% |
| Native Signal without governance | 0.6403% | 2,811 | same as uniform |
| Native Signal with evidence governance | 0.6403% | 2,811 | same as uniform |

The feature-only policy estimated uplift relative to random is 0.1138 percentage points, with **paired 95% descriptive IID bootstrap interval** of **−0.1636 to +0.6119 percentage points** (stored under `signal_validation.experiments`, experiment `signal_actual_native_gate_ope_v1`). It crosses zero, so the outcome is **inconclusive**. No favorable selection should be made based on the test labels.

The first native test found an actionable safety defect: all 2,811 impressions reported `actionAllowed=true` despite an effective `actionScale=0` / wait recommendation. This could be misinterpreted by consumers. PR [#60](https://github.com/DiogoAngelim/signal/pull/60) introduced a fail-closed invariant; successful verification [43570797069](https://github.com/DiogoAngelim/signal/actions/runs/43570797069) shows **zero allowed decisions on the same holdout** with unchanged IPS estimates. This **passes the stated safety regression**, but also reveals that the current mapped domain policy abstains on all tested candidate proposals. It does not establish commercial usefulness.

### Other experimental evidence

- The quantitative API's earlier temporal holdout produced Brier score **0.00578207**, worse than its training-frozen baseline **0.00576870**. Recorded AUC **0.51194**. These are weak prediction findings, not evidence of forecasting superiority.
- The five-day training policy recommendation chose BTS, but the final two-day observed cohorts showed **BTS 14/2,704 (0.5178%)**, **random 18/2,811 (0.6403%)**. Cross-policy comparisons are not paired, and the result cannot be treated as a causal comparison.
- Independent 311 CI replay recorded 1,500 historical requests and 2,998 derived create/close events, but this is not a production event store and does not show durable operational execution.
- Controlled infrastructure simulation [43570472141](https://github.com/DiogoAngelim/signal/actions/runs/43570472141) passed, which does **not** certify live Neon workloads, SLOs, third-party side effects, backup recovery, or production trust anchors.

## Scientific gate decision

**PASS (limited):** registered public source metadata, row-level imported integrity, reproducible randomized feedback harness, and fail-closed zero-scale permission regression.

**INCONCLUSIVE:** causal click improvement, probability calibration superiority, economics, cross-population generalization, confidence in action-level recommendations, and production operational readiness.

**NEXT:** a preregistered confirmatory experiment should use a larger representative randomized logging sample or a controlled live A/B trial, with positive effective policy support, user- or cluster-aware uncertainty, precommitted reward and cost definition, and independent runtime telemetry. Revisit the ordinal-to-decision mapping on *training/validation data only*; freeze it before a fresh, untouched confirmatory sample. Fix unrelated Vercel preview portability blocker [#61](https://github.com/DiogoAngelim/signal/issues/61) before treating preview deployment statuses as operational evidence. Do not touch production services or certify Signal based on green CI alone.
