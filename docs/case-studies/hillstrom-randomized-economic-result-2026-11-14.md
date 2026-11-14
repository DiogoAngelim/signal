# Real randomized causal evidence: treatment chosen by Signal's quantitative API

**Date:** 2026-11-14  
**Scope:** historical *email treatment* causal effect; **NOT incremental causal attribution to Signal software**.  
**Scientific result:** **PASS** for preregistered treatment-versus-no-email dollar-spend effect; **NOT ESTABLISHED** for the separate hypothesis that Signal adds value over an equally informed conventional decision maker.

## Precommitment, code, verified data

- Preregistration was committed **before** the first data analysis in commit [`1d08bcf75b30abb72cbc71188f8b2a77414a6028`](https://github.com/DiogoAngelim/signal/commit/1d08bcf75b30abb72cbc71188f8b2a77414a6028).
- Successful CI run: [GitHub Actions #43592392744](https://github.com/DiogoAngelim/signal/actions/runs/43592392744). Head commit: `824355b2bf471b5d432d3ba27153529bb38672b9`. Job passed: source verification, package build, self tests, data analysis and aggregate artifact upload.
- Source: Kevin Hillstrom / MineThatData E-Mail Analytics Challenge (2008), publisher link: `http://www.minethatdata.com/Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv`.
- **Publisher-original source verified**: SHA-256 `0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece`, 3,964,977 bytes. The third-party GitHub mirror was tried and **rejected** because its SHA-256 was `27bab8c5d3669f26ec08ebb50a0a78317542f29501156f2e2af6781fab4cd7e2`. The original publisher's historical HTTP URL then succeeded and **passed** the pinned original checksum. Integrity check prevented silent source substitution.
- 64,000 actual randomized customers, known assignment to `No E-Mail`, `Mens E-Mail`, `Womens E-Mail` for a two-week response window.
- Seeded hash-of-row-index split (no outcomes or treatments used to choose folds): **25,760 train**, **38,240 holdout**. Predeclared primary effect is **training-only Signal selected treatment versus No E-Mail**, gross USD spend per randomized customer.
- The Signal API executed is **`evaluateQuantitativeDecision`**, with risk-neutral payoff = training group mean post-treatment USD spend, an explicit no-email action and no invented cost. **Legacy `evaluateDecision` was not exercised**, and prior native gate abstention remains unaddressed.

## Training-only recommendation

| Action | Train n | Observed gross spend / customer, USD |
| --- | ---: | ---: |
| No E-Mail | 8,508 | $0.6048 |
| Mens E-Mail | 8,589 | $1.2519 |
| Womens E-Mail | 8,663 | $0.9532 |

Actual Signal quantitative recommendation: **Mens E-Mail**. The independently calculated conventional training-only mean argmax is also **Mens E-Mail**, as expected; no special Signal marginal decision value was established.

## Untouched holdout: actual randomly assigned outcomes

| Experimental treatment | Holdout n | Observed spend / customer | Purchase conversion | Visit rate |
| --- | ---: | ---: | ---: | ---: |
| No E-Mail | 12,798 | $0.6847 | 0.6173% | 10.5329% |
| Mens E-Mail | 12,718 | $1.5379 | 1.2659% | 18.4699% |
| Womens E-Mail | 12,724 | $1.1616 | 0.9588% | 15.2704% |

Randomization quality: equal-arm sample ratio test p=0.9037 across all 64,000 rows (test fold p=0.8558). Test pre-treatment maximum absolute standardized mean difference for checked history, recency, mens, womens and newbie fields was **0.0174** (well below conventional 0.1 imbalance warning). No source-data exclusions.

### Primary: randomized intent-to-treat monetary effect

`Mens E-Mail - No E-Mail`, observed two-week **gross USD spend per customer**:

- **Effect: +$0.8532 per customer**, +$853.19 gross spend per 1,000 eligible customers (illustrative scaling, not realized incremental company revenue beyond the tested sample).
- **Welch/large-sample 95% CI: [$0.4612, $1.2452] per customer**, two-sided **p = 0.00001989**.
- Independent **2,000-replicate stratified customer bootstrap 95% CI [$0.4676, $1.2550]**, confirming direction despite heavy-tailed, sparse spend.
- Predefined practical criterion passed: effect at least $0.25/customer **and** lower 95% confidence bound exceeds $0.10/customer.
- **Verdict: `POSITIVE_HISTORICAL_CAUSAL_TREATMENT_EFFECT`**, under the original experiment's randomized assignment, no-interference and outcome-completeness assumptions. This is **not** proof that choosing treatment *with Signal* instead of *without Signal* causes incremental value.

### Additional, exploratory comparisons

- Selected treatment versus **uniform one-third random treatment allocation**: +$0.4098/customer, approximate 95% CI [$0.1622, $0.6574], p=0.00118.
- Selected versus other email creative (`Mens - Womens`): +$0.3763/customer, approximate 95% CI **[-$0.0472, $0.7997]**, p=0.0816 (**inconclusive**).
- Conversion effect versus no email +0.6486 percentage points, approximate 95% CI +0.4116 to +0.8856 pp. Visit effect +7.9370 pp, approximate 95% CI +7.0781 to +8.7959 pp. Secondary/descriptive; not substituted for the predeclared monetary outcome.

### Economic interpretation is explicitly bounded

Observed: real **gross customer spend**, not merchant gross profit or campaign net profit. No actual send cost, product cost, contribution margin or Signal operating cost is available. For scenario analysis **only**, assuming gross margin 35% and incremental email cost $0.02, net contribution difference would be **+$0.2786/customer** with conditional interval [$0.1414, $0.4158]. Those **are assumptions, not observed business finances**. With a 35% margin, the point-estimate break-even incremental email-send cost is ~$0.2986/customer.

## The strictly separate Signal attribution claim

- It was the **email action**, not Signal software, that was randomly assigned by the retailer in 2008.
- The tested Signal API selected the same arm as a straightforward training-only `argmax`; comparison between these two policy descriptions is **zero by construction**. The 2008 randomized data cannot identify a unique incremental causal effect of Signal.
- This does **not** resolve the previous 100% `evaluateDecision` abstention on Open Bandit or establish that the legacy gate allows beneficial actions.
- To prove *incremental value of Signal itself*, freeze an operational policy and randomize eligible decision units contemporaneously between **baseline decisions and baseline decisions governed by Signal**, with realized net outcomes and noninferiority safety constraints, using a sufficiently powered test and measured costs. Historical offline policy-value estimation may be useful beforehand, but is not equivalent to the trial.
- No commercial deployment, email send, database write, or production change was made.

**Audit artifact**: `signal-hillstrom-rct-43592392744-1` (artifact 14113186761) in the successful CI run, with detailed JSON source, splitting, test arms, standard errors, bootstrap, confidence bounds and assumptions. The project does not redistribute the customer-level original CSV.
