# Signal native decision gate: outcome-blind mechanism diagnosis (development period only)

**Date:** 2026-11-14. **Classification:** mechanism exploration / diagnostic, not proof of predictive, policy or business lift.

## Scientific question and motivation

The genuine Signal \`evaluateDecision\` integration in two earlier random-logged ZOZO Open Bandit examples reported **zero allowed decisions** under the declared recommendation adapter. That result cannot establish effective real decisions. Diagnose **which stage** blocks action using **only the previously available development period**, while retaining exactly the same adapter and all production gates and without testing on prior holdout outcomes.

## Pinned source and precommitted split

- Genuine public Open Bandit *men, random-policy, 10k* research CSV from \`st-tech/zr-obp\` at commit \`8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4\`, exact Git blob \`e99ba925c30ccd537a554ce8ea2104a005c6f49e\`; abort if checksum fails.
- Dataset has 10,000 logged impressions. **Only parse pre-outcome features and labels from the 7,189 impressions before 2019-11-29 UTC. Do not inspect the remaining 2,811 former evaluation observations or reward labels.**
- Fit a development-only item ranker using impressions dated **2019-11-24 through 2019-11-26 UTC**; evaluate gate mechanics on **2019-11-27 and 2019-11-28 UTC** (strict fit cutoff \`2019-11-27T00:00:00Z\`). No fitting labels from diagnostic rows except for source-integrity parsing.
- Ranker settings are exactly as the existing \`scripts/validation/actual-policy-ope.mjs\`: per-position/item CTR smoothed with 150 pseudo-impressions at fitting-period cohort average, pre-outcome affinity increment 0.0005 capped at four clicks, lowest item ID tie break.
- **Use the same copied, unchanged \`signalDecisionForCandidate\` adapter** from the prior existing main-branch experiment; ordinal score = clamp(65+20*ln(forecast/fitting-period global CTR),25,95), with 13 ordinal module scores, declared prediction/wisdom settings, and the same optional single-source evidence assessment.

## Diagnostic outputs, all aggregate only

For both \`withEvidence=false\` and \`withEvidence=true\`, summarize:
- Number of development-only diagnostics, count/fraction \`actionAllowed\`, effective action scale, raw coherence permission/scale, wisdom \`decision\`, simulation \`recommendedAction\`, evidence stewardship recommendation, presence of explicit governance blockers, confidence cap, and proposal ordinal-score range;
- **Overlapping reason counts**: zero coherence permission or scale, simulation wait/block, wisdom wait/avoid, assessment stewardship wait/avoid, or governance blockers. These are simultaneous blockers, **not a causal decomposition** or a claim one can safely remove any gate.
- Cross-tabulation of wisdom and simulation, score bin distribution with allowed counts, and a **hypothetical** unmodified-API fixed-context ordinal-score sweep from 25 to 95. The sweep is a sensitivity test, **not a fitted policy, not evidence of calibrated score probabilities or actual performance**.
- Invariants: \`actionAllowed=true\` requires strictly positive \`actionScale\`; all waits/blocks remain denied; exact fixed-input replay on representative development records; no dependence on diagnostic impression click labels.

Data privacy: no user hashes, logged actions, original raw features, individual scores, per-record IDs or outcome labels may be written to CI outputs or artifacts; only counts, means, bins, version/source SHA, status and explicit limitations.

## Interpretation and next step

A signal gate that abstains for every historical proposal can be functioning safely but has **no evidence of improving this specific recommendation policy**. The purpose of this study is to diagnose declared mapping and evidence assumptions, not to "force permission" or tune on outcomes. No policy should be changed solely because of a low allowed-action fraction.

If the result motivates a new adapter or scoring rule, it must be developed and separately preregistered on a **new untouched** dataset or a prospective randomized pilot, with actual net utility, independent random assignment, harm guardrails and an equally informed strong baseline. Modifying the current historical holdout and claiming independent confirmation is prohibited.

No deployment, Neon access, Workbench production operations, marketing messages or other side effects.
