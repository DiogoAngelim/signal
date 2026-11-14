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
