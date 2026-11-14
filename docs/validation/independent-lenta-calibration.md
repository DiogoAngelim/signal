# Independent real outcome calibration — Lenta retail RCT

**Status:** source verified; research-only calibration and policy benchmark. **No Stripe, Workbench, partner contact, native gate override, production deployment, observed economic net-profit or historical randomized Signal SOFTWARE.**

## Real source

The source is Lenta's BigTarget promotion experiment, documented in [scikit-uplift's original dataset loader](https://www.uplift-modeling.com/en/latest/_modules/sklift/datasets/datasets.html). It contains randomized treatment assignment and a binary campaign-response outcome `response_att`. The full public source hosted by the dataset publisher via scikit-uplift was downloaded and checked in ephemeral GitHub Actions space. Full source results:

| Source control | Value |
|---|---|
| URL | `https://sklift.s3.eu-west-2.amazonaws.com/lenta_dataset.csv.gz` |
| Full source MD5 (publisher documented) | `6ab28ff0989ed8b8647f530e2e86452f` |
| Independently verified SHA-256 | `b531544f6c072d22f232d91e20ffcaca265acf224e02687502a40e6d56135682` |
| Original distinct rows | **687,029** |
| Treatment `test` | **515,892** |
| Control `control` | **171,137** |
| Observed `response_att=1` | **74,368** |
| Observed `response_att=0` | **612,661** |
| Source columns | **195** |

Source metadata and aggregate counts alone do not establish a per-unit economic outcome. The separate `response_sms` and `response_viber` columns are excluded because they may record post-treatment behavior. The exact treatment assignment mechanism/cluster independence must be independently verified before treating off-policy value as confirmatory causal evidence.

## Predefined real-data experiment

- Sample **about 20% of all original rows**, deterministically by a one-byte SHA-256 rule on original source row position, not on treatment or outcome. Assign sampled rows to *separate* **60% training / 20% calibration / 20% untouched test** via a second independent seeded hash. No test labels are permitted in model fitting or calibration.
- Twenty-three pre-campaign numeric retail-history and basic profile features are explicitly allowlisted in the checked-in preprocessing script; exclude protected `gender`, identification fields, treatment and every `response_*` field.
- Conventional supervised models: per-arm **regularized logistic regression** and **HistGradientBoostingClassifier**, both fit exclusively on training observations, with deterministic frozen regularization, depth, tree count and no test/validation-based optimization.
- Strong calibration benchmarks: per-arm `sklearn.isotonic.IsotonicRegression` and conventional sigmoid/Platt `sklearn.linear_model.LogisticRegression` fitted on **calibration-only** raw boosted probabilities. No outcome-selected model wins by test-set tuning.
- Signal optional calibrator: `fitBinaryIsotonicCalibrator` on **exactly those same validation observations**, 20 predeclared quantile bins, bounded monotone pooled-adjacent-violators and 20 equivalent-reference observations shrunk toward raw probability. It does not claim novel information or change any native `evaluateDecision` permission.
- Primary diagnostic outcome: held-out **Brier score** and log loss, with paired nonparametric bootstrap difference in Brier (Signal minus strong sklearn isotonic), separately by randomized historical arm. Lower bound above zero only for predefined direction of improvement (conventional Brier − Signal Brier); a negative estimate must be reported as such.
- Secondary, exploratory policy: the **actual** `evaluateQuantitativeDecision` Signal API receives each pair of calibrated conditional campaign-response probabilities as two feasible actions, under a **zero-cost binary-response objective (NOT dollars)**. Compare action choices and inverse propensity-weighted factual `response_att` values to independently recomputed equally informed argmax, sklearn isotonic, conventional Platt, raw gradient boosting, and logistic models. This is **not** an intervention net-profit estimate.
- Benchmark software runtime is CI wall time, not labor/compute business expenses. Financial operating costs and actual program profit were never measured by the source.
- Author-supplied observed campaign response labels were not used to configure the initial fixed methodology; the previously published dataset's overall treatment and outcome rates were known, so this is **exploratory public-data validation**, not previously prospectively preregistered confirmatory causal experimentation.

## Truthful science gate

**Do not** declare Signal empirically better merely because it uses a familiar calibration method. A conventional estimator can use the same labels, model, feature set, and trained calibrator. A successful new optional Signal calibrator should first prove valid probability calibration and independent, leakage-free evaluation. It may improve or worsen Brier and log loss on a new source. A positive hypothetical response lift is still not verified dollars or net business profit.

This dataset does **not** contain settled receipts, payment/retention costs, margins, labor, Signal deployment expenses, company profit, nor randomized historical adoption of Signal. Hence `REAL_WORLD_CAUSAL_NET_PROFIT_SUPERIORITY_PROVEN=false` regardless of statistical output.

## Commands

Development synthetic tests:
```sh
pnpm --filter @signal/decision typecheck
pnpm --filter @signal/decision test
pnpm --filter @signal/decision build
node scripts/validation/lenta-calibration-real-outcomes.mjs --self-test
```

Actual public dataset analysis in the **isolated CI runner**:
```sh
python3 -m pip install 'numpy==2.2.6' 'scikit-learn==1.7.2'
python3 scripts/validation/lenta_real_prep.py /private/lenta_dataset.csv.gz /private/derived
node scripts/validation/lenta-calibration-real-outcomes.mjs \
  /private/derived/lenta-calibration.jsonl \
  /private/derived/lenta-test.jsonl \
  /private/derived/lenta-prep-aggregate.json
```

The workflow removes raw and derived row-level source files and uploads **only aggregate research diagnostics**. Independent source checksums and model version/dataset source labels accompany the report. Actual revealed metric values must be taken from the passed run, not guessed.

## Actual held-out experiment — executed, not simulated

**Validated on GitHub Actions [run #43609203618](https://github.com/DiogoAngelim/signal/actions/runs/43609203618).** The true public Lenta source checksum was reverified and all 74 existing/new decision-package tests passed. The fully frozen 23-feature models were fit using only **83,737** training observations; separate **26,694** calibration observations trained the conventional and Signal calibration methods; only then were **26,641** individually hashed test records assessed.

Original real data contain **687,029** observations (515,892 treated, 171,137 control), **74,368** source positive campaign responses, and **612,661** nonresponses.

### Proper scoring on real out-of-sample outcomes

These are **binary campaign response** Brier scores (lower is better), not dollar values. No test-data tuning was done:

| Frozen method | Control, n=6,693 | Treated, n=19,948 |
| --- | ---: | ---: |
| Regularized logistic regression | 0.08114182 | 0.08528986 |
| Uncalibrated histogram gradient boosting | **0.07981356** | 0.08372739 |
| Conventional Platt logistic calibration | 0.07988694 | 0.08372711 |
| Conventional sklearn isotonic calibration | 0.08026527 | **0.08369926** |
| Optional Signal shrunken isotonic calibration | 0.08034539 | 0.08391675 |

Primary **paired difference in Brier error**, defined *conventional sklearn isotonic Brier MINUS Signal Brier* (positive favors Signal):

| Historical assignment | Estimated Brier improvement | Paired 95% bootstrap |
| --- | ---: | --- |
| Control | **−0.00008012** | [−0.00084238, +0.00073670] |
| Treated | **−0.00021749** | [−0.00041765, +0.00004144] |

Both primary intervals include zero, and their point estimates are negative; **Signal did NOT establish a predictive-calibration improvement over a serious, equally informed conventional isotonic calibration method**.

Additional comparison with **raw gradient boosting** for controls: conventional raw Brier MINUS Signal Brier was **−0.00053183**, bootstrap interval [−0.00102617, −0.00000905], showing worse Brier error in the Signal candidate in this unadjusted exploratory comparison. These intervals are pointwise, not multiplicity adjusted. Source records may share households or customers and the sampling unit cannot be independently verified from this sanitized dataset.

### Actual Signal quantitative adviser on held-out real response

The benchmark called the actual compiled Signal `evaluateQuantitativeDecision` API **26,641 times** using separately predicted probability of binary campaign response, and independently checked that its risk-neutral `argmax` matched the same-information conventional optimum with **zero mathematical contradictions**. Its actual native safety/governance gate was not invoked because original evidence/authorization metadata were absent. No assumed profit margin or campaign-cost conversion was applied.

Frozen, exploratory inverse-propensity-weighted historical response estimate per evaluated randomized record:

| Frozen policy | Estimated response per unit |
| --- | ---: |
| Signal shrunken calibrated policy | 0.10614558 |
| Conventional sklearn isotonic policy | 0.10550661 |
| Conventional Platt policy | 0.10467131 |
| Uncalibrated boosted policy | 0.10443730 |
| Conventional logistic policy | 0.10520085 |
| Always send treatment | **0.10852395** |
| Never send treatment | 0.10126279 |

The **Signal vs conventional isotonic** paired IPS difference is **+0.00063897** response events per RCT record, percentile bootstrap **[−0.00297248, +0.00485391]**. The interval includes zero; it does **not** establish an incremental response advantage, let alone financial profit. Both methods used the same raw features, calibration labels and feasible actions. Effective action disagreement between Signal and conventional isotonic was **15.6225%** and versus Platt **27.1874%**. Policy disagreement alone was not sufficient evidence of benefit.

Propensities were derived from global 515,892/687,029 treated and 171,137/687,029 control ratios. Original randomization strata and possible household clusters were not externally verified; policy IPS results are therefore **exploratory conditional estimates**, not a certified randomized-policy economic causal effect.

### Operational recommendation after the negative test

**Keep the optional Signal calibrator experimental and disabled by default.** Its presence does not amend the native governance/veto system. Do not modify its hyperparameters based on this revealed held-out result and rerun the same test as though newly confirmatory. To show positive empirical value, an independently frozen *new* model/feature/evidence-improvement hypothesis requires a genuinely fresh external real outcome source, predeclared training/calibration/test separation and a strong comparator. Account for development cost and measurement/custody of any actual software expenses.

No costs were allocated from synthetic pricing assumptions, no actual money was observed, no real Signal software was randomized or deployed, and **`CAUSAL_INCREMENTAL_NET_PROFIT_PROVEN=false`**.

