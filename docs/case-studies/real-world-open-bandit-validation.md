# First real-data validation: ZOZOTOWN Open Bandit (men's campaign)

**Evidence class:** retrospective public-data experiment, reproducible from pinned sources.
**Status:** statistical/decision **component exercise**, not a certified improvement in real decisions or operational reliability.

## Reproducible provenance

- Research: Saito et al., *Open Bandit Dataset and Pipeline*, arXiv:2008.07146,
  https://arxiv.org/abs/2008.07146
- Publisher: ZOZO / Open Bandit Project, https://research.zozo.com/data.html
- Original example repository:
  https://github.com/st-tech/zr-obp/tree/8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4/obd
- Campaign: \`men\`, behavior policies \`random\` and \`bts\`.
- Exactly 10,000 published example rows per policy (20,000 altogether), dated
  November 24–30, 2019 UTC. This is **not** the full 26-million-row dataset.
- Pinned Git blob hashes:
  - random: \`e99ba925c30ccd537a554ce8ea2104a005c6f49e\`
  - bts: \`fbd217ad69b08f6dc338c7e2180cd8da16fcf658\`.
- Files have 34 possible item actions and three placement positions; click is
  an observed binary outcome, \`propensity_score\` is the logged probability of
  choosing the item at that position.
- The runner checks blob hashes before interpreting any data and fails on an
  unexpected row count, action range, reward, timestamp or probability.

## Execution

\`\`\`bash
pnpm install --frozen-lockfile
pnpm --filter @signal/decision build
node scripts/validation/open-bandit.mjs
\`\`\`

Output: \`artifacts/validation/open-bandit-report.json\`, uploaded as a GitHub
Actions artifact by \`.github/workflows/open-bandit-real-data.yml\`. No API
keys, Neon connection strings, Workbench production access, or deployments
are required. Network access is needed to read the pinned public CSV files.

The existing isolated Neon branch \`real-world-validation-2026-11\` in
\`signal-reference-lab\` has the same 20,000 publicly published records in the
\`signal_validation.bandit_observations\` table, with separate source keys and
pinned metadata for each policy. This lab branch is **not** a production store.

## What is independently exercised

1. **Observed baseline:** randomized-policy and Thompson Sampling observed
   click rates are reported without implying either is Signal's policy.
2. **Off-policy diagnostic:** use the BTS behavior-policy log to estimate
   uniform-random item selection at each position. With 34 actions,
   \`importance_weight = (1/34)/propensity_score\`; report inverse propensity
   weighting (IPS), self-normalized IPS (SNIPS), mean weight, effective sample
   size, maximal weight, and an explicitly biased clipped sensitivity check.
   Compare against random-policy directly observed click rate **only as a
   descriptive external cross-check**, not as paired counterfactual labels.
3. **Forecast API:** use *only* pre-November-29 records to train a simple
   prior-smoothed (source-policy, position, selected item) click forecast.
   Run Signal's public \`evaluateBinaryForecasts\` on the later temporal holdout.
   Freeze the constant baseline from training data before evaluating the test.
   Report Brier, log loss, AUC, ECE, cohort size, and proper provenance status.
   Outcome labels come from the original platform, not an independent auditor,
   so \`independentLabels=false\`.
4. **Decision-theory APIs:** convert five training days' observed policy-level
   CTRs into explicitly estimated day-state utility inputs (clicks per 10,000
   impressions) and run Signal's \`evaluateQuantitativeDecision\` and
   \`stressTestProbabilityCases\`. Report what it recommends, whether it changes
   across predeclared day-weight alternatives, and both policy CTRs over the
   final two days. **This is an application/sanity test of the API, not
   demonstrated per-impression decision lift.** Unchosen actions do not have
   observed per-impression rewards.
5. **Uncertainty:** 1,200 deterministic seeded IID row-bootstrap replicates,
   **descriptive only**. The sample may have repeated impressions by one
   user, time dependence, selection effects and unequal covariate composition,
   so the IID intervals may undercover. The report explicitly forbids
   attributing causal or business improvement to Signal.

## Initial facts in the isolated data store

- Random: 46 clicks / 10,000 = 0.46% click rate.
- BTS: 69 clicks / 10,000 = 0.69% click rate.
- Uniform target from BTS: IPS approximately 0.301%; SNIPS approximately 0.319%.
- Mean importance weight: approximately 0.943; effective sample size ~656
  out of 10,000; maximum weight ~178. The relatively small ESS is a **major
  weakness**, not evidence that an estimated uplift is significant.
- These preliminary calculations must be checked against the CI-generated,
  versioned evidence artifact before being represented as reproducible.

## What this does not test

- Signal's existing heuristic recommendation on individual customer
  impressions (this data does not specify the domain inputs and is not a
  controlled deployment of that policy).
- Independently labeled operational effectiveness; actions have only their
  factual click outcome, so \`compareFullFeedbackPolicies\` cannot be used
  without counterfactual invention.
- Cross-population calibration, fairness, user-cluster inference, or
  long-horizon business utility.
- Protocol authorization, durability, idempotency, external side effects,
  execution recovery or trusted audit checkpoints. Test these in an isolated
  infrastructure lab with controlled failure injection.
- NYC 311 temporal and operational replay. That dataset is registered as a
  *separate*, not-yet-loaded validation track.

A genuine claim of increased Signal decision effectiveness requires
pre-registered comparisons of the **actual** Signal-generated policy against
a credible baseline, with proper overlap/identification, sufficient effective
sample size, supported economic reward and uncertainty accounting.
