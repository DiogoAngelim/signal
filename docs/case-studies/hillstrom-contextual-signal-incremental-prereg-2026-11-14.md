# EXPLORATORY preregistration: Signal's incremental value over an equally informed contextual baseline

**Date:** 2026-11-14. **Scientific classification:** exploratory, retrospective policy evaluation on **previously inspected 2008 Hillstrom data**. This preregistration freezes this particular new analysis **before it is executed** but it does **not restore an untouched holdout**, and prior aggregate Hillstrom results are already public and known. It is NOT valid as independent confirmatory proof. Publish negative and null results with equal visibility.

## Why the earlier historical RCT cannot establish Signal advantage

The preceding preregistered study selected one globally best treatment using `@signal/decision` `evaluateQuantitativeDecision` with a single probability-one state and downside penalty zero. This is mathematically identical to a conventional maximization of the three training means, and it selected the same action (men's email). The observed +$0.8532/customer held-out gross-spend causal effect therefore belongs to **that email treatment versus no email**, not to adopting Signal. This study tests a *different, genuinely differentiated* application policy—not the legacy `evaluateDecision` gate, and not a claim of unique mathematical invention.

## Data, privacy and split

- The same publisher-original 64,000-customer 2008 Kevin Hillstrom / MineThatData **randomized 3-arm email experiment** with recorded two-week `spend` USD.
- Source: `http://www.minethatdata.com/Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv`; exact byte SHA256 `0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece`, abort if it differs. The raw GitHub mirror has previously been found to differ and is **not** accepted.
- Use exactly the previous deterministic row-index hash split `SHA256("signal-hillstrom-20261114-v1:" + rowIndex)`: <0.4 to train, rest test, so ~25,760 train, 38,240 test. **The test's treatment-level means have already been read in the previous study**, therefore no confirmatory success declaration is authorized.
- One experimental unit = one customer. Previous history covariates: `mens`, `womens`, `newbie` (each 0/1). Fixed segmentation of eight cells `mens|womens|newbie`; no other covariates or subgroup searches.
- All training labels are used to calculate model payoffs; **no test spending, conversion, visit, or original randomized action** enters the trained policy. No raw rows exported.

## Three frozen training-only policies

1. **Signal risk-governed contextual** `pi_signal(g)`: for each of eight segments and each of three actions `No E-Mail`, `Mens E-Mail`, `Womens E-Mail`, estimate `n_g,a`, mean spend `mu_g,a`, sample variance `s2_g,a`; estimate global training mean `mu_a` and variance `s2_a`. With prior weight **300**, set shrunk estimate `m_g,a = (n_g,a*mu_g,a + 300*mu_a)/(n_g,a+300)`. Compute heuristic uncertainty `se_g,a = sqrt((n/(n+300))^2*s2_g,a/n + (300/(n+300))^2*s2_a/N_a)`. This is an approximation ignoring covariance between global and segment means: **not calibrated posterior uncertainty**. Build a three-state `evaluateQuantitativeDecision` model, probabilities `[0.25,0.50,0.25]`; action payoffs for low, central and high states `[m-1.96*se,m,m+1.96*se]` (all USD/customer), `tailMass=0.25`, `downsidePenalty=0.5`, `probabilityEvidence="estimated"`. Signal's objective is equivalent to `m-0.98*se` for this declared model. All three actions are feasible; email upfront cost = 0 due no observed sending cost, and no-email is an explicit action. No constraints are loosened after results. A missing/under-30 segment/action training cell is a **fail-closed study failure**, not an invitation to change segmentation.
2. **Equally-informed contextual expected-value baseline** `pi_argmax(g)`: use **the same shrunk means** and segments as Signal, select maximum `m_g,a`, first action by fixed order on ties. This baseline receives the same information and data, minus only the Signal uncertainty penalty.
3. **Global conventional decision baseline** `pi_global(g)`: the largest unconditional 40%-train arm mean, independently calculated with no Signal, across all groups.

Pretest invariant: setting Signal's risk penalty to zero must produce the **same selected action as `pi_argmax(g)` for every segment**, otherwise fail. Require a nonzero fraction of test customers with `pi_signal(g) != pi_argmax(g)` before claiming this evaluates distinct policies. Otherwise the policy contrast is mathematically zero.

## Predeclared identification, effect size and statistical procedure

Original experiment's randomized treatment assignment is an instrumental **logging policy** giving all three actions positive support, nominal probability 1/3. Its treatment outcomes enable off-policy evaluation of fixed, training-only selected **contextual policies** without inventing unobserved per-person counterfactuals. Assumes randomized treatment independent of potential outcomes conditional on the fixed pre-treatment segment; single exposure per published row; stable treatment and no interference. No actual customers were re-randomized to Signal, and no Signal decision was applied in 2008.

**Primary estimand:** two-week gross USD spend/customer policy value difference `V(pi_signal) - V(pi_argmax)`. The primary estimator is covariate-stratified difference-in-means using the randomized test arm outcomes: `sum_g (n_g/n_test) * (mean(Y|g,A=pi_signal(g)) - mean(Y|g,A=pi_argmax(g)))`. This is unbiased under the randomized assignment assumptions in the studied population (conditional on the frozen training policies and the empirical segment distribution). Test stratum/arm cells with <30 observations are an integrity failure.

**Primary 95% interval:** heteroskedasticity-aware plug-in standard error `sqrt(sum_g (n_g/n_test)^2 * [s^2_{g,signal}/n_{g,signal} + s^2_{g,baseline}/n_{g,baseline}] * I(actions differ))`; ordinary normal two-sided CI. If actions match in a group, the contribution is **exactly zero with zero uncertainty**. Two-sided normal p-value. **2,000-replicate customer-resampling bootstrap within observed test (segment × randomized treatment) strata**, seed 20261114, using paired policy differences and fixed stratum sizes (because policies don't depend on test outcomes), as robustness. Do not bootstrap each policy independently.

**Practical success threshold for exploratory policy advantage:** (a) >0 actual disagreement, (b) difference > $0.25 gross spend/customer, (c) normal 95% lower bound > $0.10/customer and two-sided p<0.05, (d) bootstrap 95% lower bound > 0. No reinterpretation to "Signal proven" if gate fails. Historical data reuse forces the result to remain **EXPLORATORY**, even if all thresholds pass.

**Secondary—not a replacement for failed primary:** Signal vs global, contextual argmax vs global, three policies' estimated absolute gross spending via stratified means, covariate-free IPS sensitivity using weight `3*I(A=pi(X))`, policy disagreement rates, spending per 1,000 customers. Report all 8 contexts and their two policies. Multiplicity not controlled for secondary comparisons. All monetary outputs are **gross customer spending**, not verified net profit. If adding hypothetical economics, clearly label assumed margins and treatment cost; no economic assumptions can convert this dataset to observed net profit.

## Scope restrictions

- **No Signal-specific causal attribution of implementation** from this historical dataset alone: Signal's statewise risk penalty is an application-supplied preference, and the same mathematics can be implemented without Signal. A positive difference would validate this **specified risk-aware policy** against the specified risk-neutral baseline in this historical randomized trial, not Signal's unique proprietary capability or benefits in production.
- The prior legacy `evaluateDecision` gate abstained on all 232,447 women's impressions. This study uses a **different**, opt-in quantitative advisory API. Do not use any result here to claim the legacy gate now helps.
- No customer data/rows uploaded, no email sent, no production systems/Neon connected, no deployments initiated by the validation runner. Existing automatic Vercel PR preview hooks may run independently.
- No result from this source is transportable to current marketing or Workbench decision outcomes without a new external validation.

## Protocol amendment A (structural coverage only, before any real test outcome read)

The first runtime job attempting the public data (`43593020639`) stopped at the first **pre-treatment-only** coverage check: `0|0|0` has no observations in the test. The code aborted before any held-out spend was used to calculate estimates. The original plan of exactly eight *populated* groups cannot hold for structurally impossible covariate combinations.

**Updated support rule (fixed now, still outcome-blind):** Enumerate the same eight precommitted `mens|womens|newbie` cells. Exclude a cell from the estimator and fitted policy **only if both train and test have 0 observations in that cell**; record it as structurally absent. If either fold has positive observations but the other has zero, or any observed arm within a populated cell has fewer than the precommitted 30 training/test customers, **fail the entire study** rather than silently merge or reweight it. All original model parameters, risk penalty, data split, core hypotheses, uncertainty thresholds, and selected outcomes remain unchanged. Report 8 enumerated cells and actual populated subset. This is a post-preregistration amendment visible in commit history and further supports *exploratory-only* interpretation. No post-hoc attempt to obtain positive results is permitted.

## Falsification and next gate

If the policy is identical to contextual argmax, the primary contrast is identically 0. If it differs but loses or has a CI crossing 0, explicitly report failed superiority. To obtain **independent confirmatory causal evidence of incremental policy value**, precommit the same policies and rerun on an entirely separate still-untouched randomized dataset with comparable spend outcomes, or prospectively randomize a live decision workflow to baseline vs Signal governance with actual measured costs and outcomes.
