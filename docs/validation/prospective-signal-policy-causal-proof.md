# Prospective randomized trial: scientific gate for proving incremental Signal decision value

**Prepared 2026-11-14. No trial was started or deployed.** The prior Open Bandit/Hillstrom/JTPA evaluations have not demonstrated incremental Signal superiority over strong conventional decision rules. This protocol defines the **additional data that must actually be collected**, the tests, and the precise conditions necessary for a defensible causal claim.

## Why historical randomized data did not finish the proof

- The ZOZO Open Bandit native gated policy abstained on all **232,447** women’s randomized holdout impressions. The historical Hillstrom risk-aware policy was +$0.202/person vs an equally informed contextual comparator (95% CI −$0.011 to +$0.415, p=.063) but **−$0.190** vs a simple global policy.
- In the new independently sourced academic JTPA randomized earnings test, **Signal, globally optimal and contextual expected-value policies made identical recommendations for all 5,865 held-out participants**, yielding a mathematical **$0 difference**. Offering job training did raise observed gross earnings versus not offering, but that was a **treatment effect common to all three policies**, not incremental Signal advantage.
- None of those participants was randomized to *use Signal software* versus *not use Signal software*. Randomized historical treatment outcomes can evaluate specific assignment policies under experimental assumptions, but cannot identify the additional causal effect of **actual software deployment, governance, execution costs and side effects**.

## Prospective scientific question and commitment

**Primary causal estimand:** assignment-to-Signal-policy **intent-to-treat** effect on **observed NET USD decision utility per eligible randomized unit**, compared to assignment-to-strong-baseline-policy, with identical information, opportunities, timing and eligible cases.

**Preregister BEFORE collecting the first experimental outcome:** chosen low-risk operational workflow (not customer medical/legal/criminal decisions); intervention versions and exact policy-action mapping; opportunity/cost accounting; target population; ethical/operational approval; experimental unit and stable allocation method; observation period; minimum economically meaningful effect, guardrail harm tolerance, expected allocation, sample-size/power assumptions, exclusions, and stopping boundaries. Commit a unique trial JSON configuration in Git before the first assignment. The analyzer's timestamp and hash checks are necessary but **not substitutes for independent verification** of real randomization, complete data or accounting quality.

- **Primary arm:** baseline decision policy **plus** Signal governance (same upstream evidence/model). **Control arm:** baseline decision policy without Signal governance. No competing rankers, re-trained forecasting model, novel collateral interventions, altered marketing budget or unequal action opportunities.
- **Unit:** a stable independently randomized opportunity/customer/account (whichever avoids repeated-unit cross-arm contamination). Consolidate multiple events into **one prespecified outcome row per randomized unit**, with complete observation windows and all direct/fairly attributable costs. Do **not** treat repeated impressions from the same customer as independent.
- Stable trial assignment computed and persisted before outcomes, **never re-randomize** when receiving repeated requests. Preserve the assignment even if Signal abstains or operational overrides intervene. Analyze all assigned eligible units (intention-to-treat), not only those on which Signal acted.
- Precompute or log both proposed actions **before treatment execution**, with evidence versions and timestamps. Need **meaningful disagreement** between the two frozen policies; otherwise estimated incremental policy value is structurally zero. Audit action-permission/zero-scale invariants and actual executed action. A safety veto is an outcome of the assigned policy, not a reason to drop the unit.
- **Monetary net outcome per unit** = prespecified measurable gross benefit − measured action delivery cost − measured compute/review cost − measured delay/opportunity cost − measured harm/remediation cost. Any component missing is an **incomplete record**, never silently replaced by zero. Whether “benefit” is revenue, gross margin, profit contribution or cost saving must be specified BEFORE trial; invented dollar values do not qualify.
- **Primary estimator:** mean net USD utility in assigned Signal arm minus mean net USD utility in assigned baseline arm (randomized ITT). Welch two-sided 95% CI, stratified arm bootstrap with fixed seed and ≥2,000 draws; if clusters can have multiple units, randomize and aggregate at cluster level before analysis.
- **Safety gate:** predeclare maximum tolerated increase in independently adjudicated harm-event rate. Use a conservative upper confidence bound on harm-rate difference. Fail closed on missing harm data. Guardrail assessments remain meaningful even if primary utility is favorable.
- **Sample allocation integrity:** compare realized counts to preregistered 50/50 or specified ratio; fail if two-sided allocation mismatch p<0.001. Verify no duplicate units, no assignment after outcomes, no post-randomization eligibility filtering, pre-assignment policy decisions logged for all units, unexpired observation windows, no untracked cross-arm contamination.
- **Economic power:** with equally sized independent arms and prespecified population utility SD \`sigma\`, two-sided α=.05 and 80% power, a rough minimum is \`n_per_arm≈2*(1.96+0.84)^2*(sigma/minimum_detectable_net_gain)^2\`. This is a normal-approximation **planning** rule only; heavy tails, variable group sizes and harm safety requirements may demand much larger N. Estimate sigma from a genuinely external pilot or baseline-only data **before** unblinding trial outcomes.
- **Trial passes statistical/practical screening only if all hold:** no data/integrity failures; at least the fixed power-based N per arm; meaningful predeclared minimum policy disagreement and audited policy adherence; primary two-sided p<.05, 95% lower CI greater than precommitted positive minimum; bootstrap lower CI above 0; and conservative harm-difference upper CI within precommitted non-inferiority margin. *Passing this automated check is not a scientific certification by itself*; require independent causal, economic and security review before any public claim.

## Required event row schema for the offline, no-deploy audit

The data file contains **one finalized row per uniquely assigned experimental unit**, not individual interactions. Columns are:

\`unit_hash,assigned_arm,registered_trial_id,assigned_at,decision_at,outcome_at,baseline_action,signal_action,effective_action,eligible,complete,policy_adherent,harm_event,gross_benefit_usd,action_cost_usd,review_cost_usd,delay_cost_usd,harm_cost_usd\`

- \`unit_hash\` is a **nonreversible pseudonymous stable ID**, not a customer name/email. Raw personal data should not be exported.
- \`assigned_arm\` values \`baseline\` and \`signal\`; \`eligible\`, \`complete\`, \`policy_adherent\`, \`harm_event\` binary 0/1. All randomized eligible cases appear exactly once; \`complete=0\` blocks success rather than excluding or imputing them.
- \`decision_at\` must be at/before \`assigned_at\` and \`outcome_at\` strictly after \`assigned_at\` (timestamps ISO UTC).
- \`gross_benefit_usd\` may be negative; **all four cost components must be measured** and nonnegative. Monetary units/cost definitions must be invariant across policies. Report no individual rows.
- \`effective_action\` records real-world outcome of execution, and \`policy_adherent\` is audited against the frozen arm-specific plan; overrides stay in the ITT analysis.
- Data must not contain outcome-derived features in the decision input; auditing feature-lineage and external finance must be done separately.

## Operating model, no deployment, limitations

This repository can provide an **offline analysis tool and self-tests** for eligible prospective data, but cannot create experimental subjects, randomize user traffic, measure future outcomes, or certify production effects from historical logs alone. The trial cannot be declared complete without a mutually exclusive randomization of actual live policy exposure and actual downstream monetary and safety data.

No Vercel/Neon/Workbench production promotion, user enrollment, emailing, database migrations, or human-impacting decisions are authorized by this document. Running CI against synthetic fixtures is a **software test**, never real-world evidence. Existing PR auto-preview checks do not constitute study deployment.

## Precommitment file and review

A future prospective trial plan must include a JSON config with:
\`trial_id\`, \`registered_at\`, \`locked_git_commit\`, \`allocation_signal\`, \`minimum_units_per_arm\`, \`minimum_policy_disagreement_rate\`, \`minimum_policy_adherence\`, \`minimum_point_net_gain_usd\`, \`minimum_lower_ci_net_gain_usd\`, \`max_harm_rate_increase\`, \`bootstrap_repetitions\`, \`bootstrap_seed\`, \`expected_observation_days\`, \`model_version_signal\`, \`model_version_baseline\`, \`utility_definition\`, \`allocation_unit_definition\`, \`external_approval_ref\`. This must be locked **before** assignments and independently reviewed. No production performance claims can be based on a configuration created after experimentation.
