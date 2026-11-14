# Frozen replication: JTPA randomized earnings, academically pinned independent source

**Preregistration on 2026-11-14:** committed before evaluating any per-person outcomes from this academic CSV. This is an **exploratory historical out-of-source replication** of the same underlying JTPA randomized trial, **not** a new randomized Signal software experiment. It replaces a source transport failure from PR #67, not an unfavorable result: the original Zenodo HTTP 403 produced **no statistical policy-value estimate**. Even if this policy difference is positive, implementation-level causality and net economic utility are not established.

## Provenance and immutable data guard

- **Data provenance:** Cattaneo, Jansson & Ma (2024), *Local Regression Distribution Estimators*, Journal of Econometrics, 240(2), 105074; research replication repository \`nppackages-replication/CJM_2024_JOE\` referencing the original Abadie, Angrist & Imbens (2002) Job Training Partnership Act randomized experiment.
- Frozen GitHub repository commit \`e98d6cba1853b607e16e63d29aff7635f04b47ad\`; file \`jtpa.csv\` size **658,746 bytes**, exact **Git blob SHA-1 \`c26124a0716b5d7b44c2c357087c7136752a0aa7\`**. Source \`https://raw.githubusercontent.com/nppackages-replication/CJM_2024_JOE/e98d6cba1853b607e16e63d29aff7635f04b47ad/jtpa.csv\`. Hash Git blob from raw bytes, compare, and abort on mismatch; record independently observed SHA-256. No need to trust the hosting branch tip.
- Expected **9,872 participant rows** in this academic replication file (broader/different inclusion from Han's 9,223-person application); schema exactly 21 columns. If source differs, fail the entire study. Historical records were independently collected but subsequent published datasets may include selected complete cases—interpret inference only within the analysed sample.
- **Outcome:** \`income\` (30-month actual gross labor earnings USD). **Randomized assigned treatment:** \`instrument\` (1 = assigned job-training offer, 0 = control). \`treatment\` is post-randomization actual program enrollment; **NEVER** estimate causal effect by grouping on enrollment.
- Fixed pre-offer decision covariate: \`hsorged\` = existing high school diploma/GED indicator. Do not use sex, racial, ethnic or other sensitive markers as policy features. Full dataset covers preprogram other fields for descriptions only; do not use \`logincome\`, which depends on post-treatment earnings.

## Frozen design, independent test, Signal and comparators

- Deterministic split based on zero-based source-row index \`i\`: SHA-256(\`signal-jtpa-academic-20261114-v1:\`+i), first 8 hex digits / 2^32; **train if value <0.40, otherwise test**. No outcome-based exclusions, per-person IDs or policy tuning on test data.
- Predeclared two groups: \`hsorged=0\` and \`hsorged=1\`. Retain every randomized subject; require 30 or more records per (group × randomized assignment) in both train and test. If this fails, **fail closed**, do not merge groups or adjust a threshold after seeing data.
- Frozen shrinkage prior weight **300**. Global training arm mean/variance \`mu_a,s2_a\` and count \`N_a\`. Group training arm mean/variance/count \`mu_g,a,s2_g,a,n_g,a\`. Shrunk mean \`m=(n*mu_g,a+300*mu_a)/(n+300)\`. Fixed **heuristic uncertainty** \`h = sqrt([n/(n+300)]²*s2_g,a/n + [300/(n+300)]²*s2_a/N_a)\`. This ignores group/global covariance and is **not** a statistically calibrated posterior SE.
- Model a low/mid/high state for each treatment choice with **probabilities [0.25, 0.50, 0.25]**; payoffs USD/participant \`m - 1.96*h\`, \`m\`, \`m + 1.96*h\`. Actual \`@signal/decision\` exported \`evaluateQuantitativeDecision\` with \`tailMass=0.25\`, \`downsidePenalty=0.5\`, \`probabilityEvidence="estimated"\`, \`upfrontCost=0\`. Thus the given mathematical objective is \`m - 0.98*h\`, an application-supplied uncertainty preference, not an empirically validated causal model or a safety permission.
- **Primary comparator:** strongest simple conventional strategy, choose either \`assigned\` or \`not_assigned\` using only the larger training-period **unconditional mean earnings** and apply same action to all. This is the fixed reference because an equally simple global rule beat contextual methods in previous Hillstrom analysis.
- **Secondary comparator:** equally-informed conventional **contextual argmax of the exact same shrunk means** by \`hsorged\`. Zero-penalty Signal must select **identical** action to contextual comparator by a unit-tested invariant, otherwise invalidate the study. Also report signal vs always-assign and never-assign as descriptive baselines, not replacements.
- Same low/mid/high state construction and penalty as the **preexisting Hillstrom contextual research**; do not change numeric parameters for the JTPA results.

## Causal estimands, inference, economic gate

Random assignment of \`instrument\` (offer) identifies intention-to-treat *offer policy* values conditional on source selection, randomization, no interference and common treatment meaning. For each preprogram group, the trained policy picks an observed randomized arm. Test value \`V(pi)=sum_g(test_n_g/test_n)*mean(income | randomized assigned arm = pi(g), g)\`. Unchosen individual counterfactual incomes are not imputed.

- **Primary:** \`V(Signal risk-aware) - V(global conventional)\` USD per eligible historical participant across the test sample; **0 contribution and 0 variance where policies coincide**.
- Heteroskedastic large-sample plug-in variance of paired group-mean contrasts with a two-sided 95% CI and p-value. **Exactly 2,000** bootstrap resamples with seed \`20261114\`, within each observed (preprogram group × randomized assignment), reusing paired draws for both policies; sample sizes held fixed.
- **Positive practical/scientific gate** (all required): policies differ on at least one test subject; primary effect at least **+$500 per person**; normal 95% lower bound exceeds **+$250**; two-sided p <0.05; bootstrap 95% lower bound >0; no source/schema/balance-integrity failure. If gate fails, label result **NOT PROVEN**, even if point estimates favor Signal. Do not retune on outcome labels or search subsets after failure.
- Exact same methods report secondary Signal minus contextual, always-assign and never-assign; secondary p-values are exploratory and not adjusted for multiplicity. Report absolute policy values and subgroup decision differences, with separate integrity check on randomization arm counts and baseline standardized mean differences (not controlling on post-treatment variables).

## Claim boundaries / economics

- **Gross labor earnings**, NOT the program's measured net economic or societal benefit: no cost of program delivery, foregone hours, tax/treatment externalities, discount, or operator spend is available.
- Historical offer randomization is **not randomization between adopting Signal versus not adopting Signal**. A policy difference can identify the causal value of a *specified offer assignment rule* in the archived experiment, not the implementation-specific effect of software or proof that Signal can execute it safely. Conventional math could implement the same risk penalty.
- Prior Hallstrom/Hillstrom public experiment (PR #65 and #66) had no demonstrated Signal-specific superiority; previous Zenodo transport test (PR #67) produced **no scientific result**. This academically pinned alternative is a transport and schema substitution made **before this dataset's full policy evaluation**; no retroactive "fully blinded" claim.
- No production rollout, databases, actual offers, Vercel promotion, Workbench interventions or personal user data. CSV may be downloaded for ephemeral analysis only and never uploaded to PR artifacts, only aggregates.
- A conclusive software-level test requires a prospectively randomized policy-assignment pilot on real live outcomes, with both arms equally informed, actual costs, consent/ethics/safety gating and frozen treatment exposure. A historical reanalysis cannot supply missing deployment outcomes.

## Run

\`\`\`sh
pnpm install --frozen-lockfile
pnpm --filter @signal/decision build
node scripts/validation/jtpa-academic-economic.mjs --self-test
node scripts/validation/jtpa-academic-economic.mjs
\`\`\`

Machine-readable aggregate only: \`artifacts/validation/jtpa-academic-economic-report.json\`.


## Amendment A — immutable source population count, no statistical outcomes inspected

Initial authenticated GitHub Actions attempt [#43594337829](https://github.com/DiogoAngelim/signal/actions/runs/43594337829) successfully downloaded and **verified the exact preregistered Git blob**, then halted **at the row-count assertion before parsing any participant outcomes**. The pinned academic source has **9,872 data records** rather than the previously assumed 9,223. The 9,223 count comes from *Han's selected JTPA application subset* and does not describe this Cattaneo/Jansson/Ma academic CSV. These are related archived representations of the **same original JTPA trial**, not identical included populations.

The only resulting implementation correction is the source-integrity expectation from 9,223 to **9,872 records**. All observations in the pinned academic CSV are retained; no observation is selected/dropped based on its earnings or randomized assignment. **No Signal policy, outcome, comparison baseline, training split fraction, predictor, prior, payoff states, risk penalty, minimum economic effect, inferential procedure, or bootstrap seed has changed**. This is an explicit post-first-commit metadata amendment; future interpretations remain **exploratory**. Do not misrepresent this file as Han's 9,223-row sample.

