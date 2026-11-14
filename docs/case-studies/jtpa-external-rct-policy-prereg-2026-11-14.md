# Frozen external randomized study: Signal's incremental earnings-policy value on JTPA

**Pre-analysis registration:** 2026-11-14. This first commit is created **before downloading or inspecting any customer-level JTPA outcome** for the new study. It is an **independent dataset from Hillstrom**, but its original 1990s experiment and prior scholarly results have been published. This is not a new randomized *Signal software deployment*, nor a prospectively blinded RCT.

## Claim to test and comparators

**Primary estimand:** the gross difference in observed **30-month USD earnings per randomized participant** between an application-defined, risk-aware policy implemented through the actual exported \`@signal/decision\` \`evaluateQuantitativeDecision\` API and a conventional **globally optimal training-mean assignment policy** using the same training sample.

**Secondary:** compare with equally informed, conventional risk-neutral policy that chooses the maximum **same segment-specific shrunk earnings estimate**. Also report the frozen always-offer and never-offer policy values, but do not choose the most favorable comparator after evaluating labels.

A positive estimate must not be attributed to unique Signal code or software causality: **randomization was to an offer of job training (\`Z2\`), NOT Signal-vs-conventional software**. Off-policy values are causal for specified **offer-assignment policies** only if underlying randomized-assignment and sample-completeness assumptions hold. The policy could be implemented without Signal. The purpose is external causal validation of the decision rule, not live software superiority.

## Existing real monetary-outcome data — independently sourced

- Source: Han, Sukjin (2024), *Optimal Dynamic Treatment Regimes and Partial Welfare Ordering*; Zenodo DOI **10.5281/zenodo.18836198**; deposited March 2, 2026.
- Frozen record: \`https://zenodo.org/records/18836198/files/jtpa.csv?download=1\`. Repository declares **9,224 rows**, 11 columns, license **CC BY-NC 4.0**. Declared published file MD5 **\`1be2247cff05b2e6791ee330462bc181\`**. Runner must fail if raw source MD5 differs, then independently record SHA-256, size and source provenance in aggregate evidence.
- Columns used: \`Z2\` = **randomized job-training assignment**, \`earnings\` = actual 30-month post-program USD earnings, \`Y1\` = pretreatment earnings-at/above-80th-percentile indicator. Other data-quality checks: \`sex\`, \`edu\`, \`prevearn\`, \`D2\` as observed take-up only (NEVER a treatment), and required columns. No post-treatment data are used for eligibility or policy inputs.
- **Intent-to-treat:** select a binary policy for **assignment to training offer \`Z2\`**, not realized training participation \`D2\`; do not confuse program take-up with randomized offer.
- Report treatment arm counts, balance by pretreatment \`sex\`, \`prevearn\`, and \`edu\` using standardized mean differences; a warning should not trigger outcome-based exclusions. Participant eligibility and program costs aren't recorded here. Sample is historical and selected; even a significant positive earnings effect is not proof of net societal profit or 2026 generalization.

## Frozen input partition and policy implementation

- Source order zero-based record index \`i\` determines fold by SHA-256 of \`"signal-jtpa-20261114-v1:"+i\`, first 8 hex digits as uint32. **Training: < 0.4**, test: otherwise. Approximately 40% train, 60% external holdout. Do not access the test outcome when fitting policies or selecting parameters.
- Precommitted two economic-need segments: \`Y1=0\` (pretreatment earnings below study's preprogram 80th-percentile cutoff) and \`Y1=1\` (at/above). No use of protected traits like sex to determine a participant's treatment. No subgroup search.
- No source-row exclusion, no optional filtering by measured outcomes. Fail if either segment's randomized assignment group has **fewer than 30 training or 30 test subjects**, or missing/unrecognized values. Require full 9,224 rows and no missing earnings/assignment fields. Every row belongs to exactly one segment.
- Compute global training-only arm means \`mu_a\`, sample variance \`s2_a\` and counts \`N_a\` for \`a ∈ {0=not_offered,1=offered}\`. For segment \`g\`, compute local mean \`mu_g,a\`, variance \`s2_g,a\`, count \`n_g,a\`. Fixed prior weight **300**. **Shrunk mean:** \`m_g,a=(n_g,a*mu_g,a+300*mu_a)/(n_g,a+300)\`.
- **Heuristic** (NOT calibrated posterior) uncertainty: \`se_g,a = sqrt([n/(n+300)]² * s2_g,a/n + [300/(n+300)]² * s2_a/N_a)\`. Global/local estimates overlap; the formula omits covariance. It is a fixed regularization score, not a confidence interval on potential outcomes.
- Create actual \`evaluateQuantitativeDecision\` model separately for each group using states \`low,central,high\` with probabilities **[0.25,0.50,0.25]**, payoffs \`[m-1.96*se, m, m+1.96*se]\` USD in each arm, \`tailMass=0.25\`, \`downsidePenalty=0.5\`, \`probabilityEvidence="estimated"\`, no invented hard authorization flags. These **are subjective model states**, not true real-world probability distributions. This objective equals \`m-0.98*se\`.
- **Signal risk-aware** policy: the API's recommended action in each segment. **Global conventional** policy: single training global-mean argmax, applied to both segments. **Contextual conventional**: argmax of the same two \`m_g,a\` quantities. **Falsification:** with \`downsidePenalty=0\`, Signal *must exactly match* the contextual conventional argmax for every segment. If zero actions differ between policies, the respective causal policy contrast is algebraically zero; report this directly.
- Treatment budget and program costs: **unknown**. No revenue, profit, gross margin, CBA or policy operating cost can be inferred from earnings alone. No speculative margin adjustment or optimization of costs after looking at results.

## Causal evaluation protocol

- Heldout policy value under randomized assignment is estimated using covariate-stratified *factual randomized-arm means*:
\[
\hat V(\pi) = \sum_{g \in \{0,1\}} (n_g/N)\cdot \overline{Y}_{g,Z2=\pi(g)}.
\]
- Primary \`Signal - global conventional\`. Independently quantify \`Signal - contextual conventional\`, \`Signal - always-offered\`, \`Signal - never-offered\`. Secondary values cannot replace primary after failure.
- Primary point difference is weighted groupwise difference in randomized observed means, with **exact zero** if policies select same action for a group. Heteroskedastic large-sample normal SE and two-sided 95% interval, with a **2,000-replicate fixed-seed** bootstrap resampling **within each (pretreatment segment × randomized assigned arm)**. Fixed seed **20261114**; resample both policies **paired**, not independently, and do not manufacture individual counterfactuals. Assignment propensities were not supplied for all strata; use stratified trial randomization rather than assume unconditional 50/50. Include IPS only if true assignment probabilities are known (otherwise omit it).
- **Economic outcome:** actual 30-month **gross labor earnings** USD/person. No price level adjustment or invented program costs. **Practical success gate:** Signal policy differs from global for at least one observed test unit, primary **point improvement ≥$500/person**, normal 95% lower bound > **$250/person**, two-sided p < 0.05, bootstrap 95% lower >0, no data integrity failure. These thresholds are scientific assumptions, not measured program budget/costs.
- **No multiple-policy-search victory:** do not modify policy grouping, prior=300, risk penalty=0.5, state probabilities, reward, or selected comparator after results. If test cannot run due a pre-treatment support gap, report failure; do not silently adapt thresholds.
- No claim of **incremental benefit of Signal software** based on historic data: positive result could support the precommitted decision-rule value in this population, not deployment, algorithm uniqueness, net societal returns, or actual service behavior. A policy-specific effect would require a new prospective software A/B trial and measured net costs. If CI covers zero, the proof fails; do not conduct retries with tuned policies on this test.

## Reproduction and safeguards

\`\`\`bash
pnpm install --frozen-lockfile
pnpm --filter @signal/decision build
node scripts/validation/jtpa-external-rct-policy.mjs --self-test
node scripts/validation/jtpa-external-rct-policy.mjs
\`\`\`

Evidence artifact \`artifacts/validation/jtpa-external-rct-policy-report.json\` contains aggregates and exact study verdicts only. No raw individual-level earnings, identifiers or demographics may be logged, uploaded or committed. No access to production, Neon, Workbench or email services. Existing GitHub PR-triggered Vercel previews are separate from the validation job and should not be confused with an intentional production deployment.

### Prior dataset decision documented

A potential 12,959-row promotional campaign dataset in \`ShiwenZhang00/Coupon-AB-Test-Funnel\` was rejected because the project's own README explicitly says it uses **simulated data**, notwithstanding its reference to a genuine coupon study. Synthetic records cannot prove observed real-world economic impact. The Zenodo archived JTPA experiment is used instead.
