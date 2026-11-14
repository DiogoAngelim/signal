# Independent historical monetary RCT: Signal evidence uncertainty, November 14, 2026

**Scope:** No Stripe, Workbench, independent partner contact, production deployment, prospecting, customer enrollment or live Signal recommendation exposure.

## Fresh authentic monetary experiment

National Supported Work (NSW) Demonstration, Dehejia–Wahba randomized experimental subset, as published by the [NBER original dataset description](https://users.nber.org/~rdehejia/nswdata.html), distributed by the public [MIT-licensed causaldata package](https://cran.r-project.org/package=causaldata) and [Rdatasets](https://github.com/vincentarelbundock/Rdatasets). Frozen source commit: `1dcc2bf5f955cc1224a3e1307256e1fe86b68dae`, file `csv/causaldata/nsw_mixtape.csv`. **445 genuinely randomized participants**, **185 job-training** and **260 controls**, with actual 1978 earnings (`re78`) and two pre-intervention income-history features (`re74`, `re75`).

The **earnings** are observed in historical dollars. They are **not employer operating profit**, and the released source does not provide actual intervention costs, net social benefits, net business profit, actual Signal operational expenses, or randomized historical use of Signal. This dataset is different from JTPA, Hillstrom, Karlan–List and Lenta.

An additional tempting coupon dataset (12,959 records in the `Coupon-AB-Test-Funnel` educational repository) was **explicitly labeled simulated** in its own README, even though the source study described a real RCT. It was therefore excluded; no copied or synthesized customer records were passed off as a real profit experiment.

## Predeclared hypothesis: new information and decision uncertainty

An honest value pathway might come from additional **pre-outcome evidence** and reliable *uncertainty-aware refusal to train* for cases that are not supported by the available data. The test must not assign a proprietary advantage to ordinary optimization that an equally informed competitor can implement.

- Frozen 70/30 participant-level split via SHA-256 of fixed study version + original published row index. **Only pre-treatment** predictors are passed to policy models; future earnings `re78` may be read only as a training label for disjoint train individuals and as final observed outcome for held-out participants.
- **Restricted evidence:** age, education, marriage, degree status.
- **Additional genuine evidence:** the same four variables plus historical earnings `log(1+re74)` and `log(1+re75)`.
- Two independent conventional statistical predictors of 1978 earnings by actual historical treatment arm, fitted only on train: standardized `Ridge(alpha=25)` and `RandomForestRegressor(n_estimators=160,max_depth=5,min_samples_leaf=8)`. Fixed hyperparameters are not selected from held-out outcomes.
- **New experimental evidence-uncertainty mechanism:** 160 fixed-seed train-only bootstrap ridge models produce a 10th-percentile estimate of incremental *job-training* earnings for an individual, `lowerConfidenceDifference`. Only when this lower value is positive is the training action represented as feasible in the **actual built** Signal `evaluateQuantitativeDecision` quantitative API. This is a *caller-supplied experimental policy exclusion*, **NOT** a run of the native `evaluateDecision` governance/evidence gate, and it does not change production permissions or automatically execute an action.
- **Primary attribution comparator:** conventional robust optimizer using **exactly the same six rich raw predictors, ridge forecasts, bootstrap evidence and uncertainty rule**. Mathematical action parity is required; an effect cannot be attributed to Signal merely for hosting a conventional rule.
- **Secondary policies (all exploratory):** an equally informed conventional rich-ridge mean maximizer, conventional rich random-forest mean maximizer, reduced-history ridge, universal training, and universal no-training. Reduced-history input differs from the full-information system and therefore is *not* an appropriate software attribution comparator.
- Real held-out outcomes only: a conditional-policy comparison via randomized-propensity inverse weighting and an outcome-regression **doubly robust** estimator, using nuisance models learned only from training individuals. Fixed 3,000-replicate person-level paired bootstrap for the difference in recorded 1978 earnings. Both estimates use observed earnings solely for the **actually historically assigned** treatment; unobserved potential outcomes are never fabricated.
- Research sample is small, the published RCT has already been studied for decades and any results are **exploratory**, with potentially very wide confidence intervals. The assignment fraction 185/445 assumes the original fixed randomization design and should receive independent verification.

## Study success and stop rules

**Success for predictive/evidence hypothesis** would require a predeclared positive, statistically credible held-out annual-earnings policy-value advantage versus a strong **equally informed** conventional optimizer. If the conventional optimizer has identical forecasts, uncertainty and feasible actions, its recommendation necessarily equals Signal's, yielding **zero** expected incremental advantage by construction. Additional source information may improve policies compared with a deliberately limited-evidence comparator, but this cannot be counted as proprietary software profit. A selective risk-aware policy may prefer safety over gross mean earnings.

**Success for causal NET PROFIT attributable to Signal** is impossible to establish from this historical NSW dataset alone, regardless of favorable estimates: software adoption was **never randomized**, software costs were not collected and the monetary outcome was **earnings, not net business profit**. Never impute unavailable training/program, customer or software expenses as zero; never translate historical dollars into arbitrary present-day ROI.

**Allowed deliverable:** a reproducible positive/negative/uncertain conclusion about historical policy earnings and experimental evidence quality, with independent conventional benchmarks, without changing production decision logic.

## Reproduction

In a private CI runner (no original person-level records uploaded):
```sh
# Download original pinned public Git file outside the repo.
curl -fLSs -o /tmp/nsw_mixtape.csv \
  "https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/1dcc2bf5f955cc1224a3e1307256e1fe86b68dae/csv/causaldata/nsw_mixtape.csv"

python -m pip install 'numpy==2.2.6' 'scikit-learn==1.7.2'
python scripts/validation/nsw_earnings_evidence_prep.py \
  /tmp/nsw_mixtape.csv /tmp/heldout.jsonl /tmp/source-summary.json

pnpm --filter @signal/decision build
node scripts/validation/nsw-earnings-evidence-policy.mjs \
  /tmp/heldout.jsonl /tmp/source-summary.json
```

Actual aggregate-only output path: `artifacts/validation/nsw-real-earnings-evidence-value.json`. CI removes the original and derived individual-level data, and no GitHub dataset mirrors are created in the Signal repo. The relevant machine-generated run and final measured scores must be verified before making empirical claims.

**Current causal Signal net-profit claim flag: FALSE.**
