# Preregistered confirmatory study: Signal native gate on full Open Bandit women's randomized impressions

**Registered before examining any women's holdout outcomes:** 2026-11-14, before the first full-source job on this branch. This study is observational **off-policy evaluation of a hypothetical policy**, not an online experiment or a claim of customer lift.

## Source and separation

- Publisher: ZOZO / Open Bandit, CC BY 4.0, https://research.zozo.com/data.html.
- Data mirror: `zozonext/open-bandit` at frozen Hugging Face revision `57a688e`, file `random/women/women.csv`. No live/customer/proprietary data. The runner **must check the downloaded file SHA-256 against the Git LFS metadata of that exact repository revision** or abort. SHA-256 is recorded in the immutable evidence output; do not silently substitute an unpinned file.
- Entire women's randomized logged-feedback file, not the 10,000-example men's experiment. The women’s policy has item choices determined by the file's complete contiguous `user-item_affinity_i` columns; reject action counts outside [40, 50], unexpected action IDs, incompatible propensities, or missing features.
- Time order is UTC. **Train:** 2019-11-24 00:00:00 through 2019-11-27 23:59:59.999. **Calibration:** 2019-11-28 00:00:00 through 23:59:59.999. **Confirmatory test:** 2019-11-29 00:00:00 through 2019-11-30 23:59:59.999. No outcome from test may enter training, calibration, policy selection or parameters.
- The previous men's 10k study, its failure and subsequent source-code fix are already public. The women’s holdout is a new campaign not previously evaluated here, but is historical public data and is **not** a prospective deployment or an independently locked blinded audit.

## Frozen policies and objective

1. Uniform target: `pi(a|x) = 1/K` (logging-propensity probability `1/K`).
2. Feature-only comparator: `pi(a|x) = (1-epsilon)/K + epsilon * I[a = best(x)]` with `epsilon = 0.2`.
3. **Primary intervention** is the genuine released `evaluateDecision` with evidence assessment: `epsilon = 0.2 * actionScale` if `actionAllowed` and scale > 0, and zero otherwise. A zero-scale/wait action **never counts as permission**. This is the actual decision gate and a declared application-specific ranker, not Signal choosing an item itself.
4. Candidate ranker: per-position/per-item mean training click rate with 150 training-cohort-prior pseudoimpressions, plus `0.0005 * min(4, pre-outcome item-affinity)` (same constants as preceding men's experiment). Lowest item ID is tie-breaker. Uses training labels exclusively.
5. Calibrator: on the **one calibration day only**, compute the ratio of observed click count to sum of the training-only raw probabilities of **logged actions**; clamp scale to [0.25, 4] and probabilities to [1e-6, 0.5]. It is an in-the-large correction, not proof of multilevel calibration. Baseline click probability frozen from training only.
6. Native mapping: `ordinal = clamp(65 + 20 * ln(calibratedCandidateProb/trainingGlobalClickRate), 25, 95)`; assign to legacy module/prediction/wisdom inputs and conservative single-source evidence, using the existing public experimental adapter. **Ordinal is not a click probability.** The calibrator supplies probability evidence to the adapter but cannot certify its predictive or decision validity.

## Predefined estimands, uncertainty and gates

- Unit: **one displayed item-slot impression**, with observed binary click (0/1); user consent, session slate interactions, cumulative reward and monetary profit are not measured.
- Primary contrast: `IPS(fully governed Signal) - IPS(feature-only)`, on the **entire confirmatory time-window**. Secondary: each compared to randomized logging (uniform), and governed-minus-feature-only expected net utility under labeled scenarios.
- `IPS = mean(y * pi(a|x) / logging_propensity)`. Also report SNIPS, max weight, mean weight, ESS, click counts, temporal and position coverage, allowed/abstention rates.
- Main 95% **descriptive** interval: 2,000 deterministic seeded bootstrap replicates sampling the **UTC-hour groups** with replacement, with the same sampled groups for both policies. Seed `20261114`. Require at least 24 observed hourly groups and at least 100,000 holdout impressions to consider the descriptive interval usable. Also show an ordinary IID bootstrap sensitivity if computationally feasible. A timestamp-hour group is **not a user ID**; without a true person/session grouping variable, user-clustered uncertainty is impossible and hours may still be dependent. Do not claim the interval has nominal coverage.
- Decision improvement claim requires primary lower bound **strictly > 0** with no post-hoc tuning, sufficient overlap (all target action probabilities > 0), ESS >= 10% of N, and a documented target-domain population. Even if statistically positive, the last population condition is not met for Workbench/customers, so only this dataset’s shadow-policy estimate can be claimed.
- Forecast quality: holdout Brier score, log loss and 10-bin descriptive ECE from a training-only item+position estimate with the calibration-day scaling; compare with frozen constant training click probability. A calibration-superiority claim requires **lower Brier than baseline**, and an hour-group-bootstrap Brier improvement interval wholly > 0; report negative results without optimization.
- Utility sensitivity is scenario-only: `utility per impression = v_click * IPS_click_probability - c_exploit * mean(epsilon)`, with fixed grid `v_click in [1, 5, 20]` and `c_exploit in [0, 0.001, 0.01]`. Monetary meaning is NOT verified: costs and click value are invented and clearly reported as sensitivity. Breakeven costs can be calculated; do not call any numbers actual USD revenue or causal improvement.
- No cherry-picked position, date, confidence threshold or ranker variant may replace the primary estimate. Report any zero action rates / pervasive wait as a first-class failure of usefulness. Fail on download, metadata, row, or timestamp inconsistencies; never silently substitute sample data.

## Reproducibility and safeguards

Run `pnpm --filter @signal/decision build` then `node scripts/validation/full-open-bandit-confirmatory.mjs`. The workflow must use a fresh public download, no Neon or production credentials, no application writes, no Vercel deployment, and an aggregate-only JSON artifact at `artifacts/validation/full-open-bandit-confirmatory-report.json`. Raw user features or hashes must not be logged or exported.

**Interpretation:** Successful execution validates what was computed for this dataset under listed off-policy assumptions. Even a positive IPS estimate would not prove improved revenue, calibrated cross-domain decisions, production durability, unconfounded individual effects, or safe rollout. Any failed source or completeness gate makes the study unevaluable, not negative or positive evidence.

## Data reference

Saito, Aihara, Matsutani & Narita (2020/2021), *Open Bandit Dataset and Pipeline*, https://arxiv.org/abs/2008.07146; ZOZO Research, https://research.zozo.com/data.html; full mirror https://huggingface.co/datasets/zozonext/open-bandit.
