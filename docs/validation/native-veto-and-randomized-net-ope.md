# Signal: native veto diagnostics and independent randomized net-value benchmark

**Status:** implemented offline research harness; **no causal net-profit improvement by Signal has been demonstrated**. This is intentionally not an intervention or an authorization interface.

## Purpose

1. Expose why the **unmodified** `evaluateDecision` native gate denies an action, with the new public, pure `diagnoseNativeDecisionPermission` helper. It preserves zero-scale and wait/block vetoes, explicit governance blockers and the distinction between full versus partial native scale. It never grants domain permissions, consent, tenancy rights or execution authority.
2. Estimate **realized net-USD policy value** on externally randomized action logs, without replacing unobserved counterfactuals with fabricated labels. Every logged action has a known positive behavior propensity. Run the actual exported `evaluateQuantitativeDecision` and `evaluateDecision` for each pre-outcome case, then compare against **two independently calculated conventional optimizers using the same information**:
   - **Primary:** risk-aware objective with the same frozen payoff states, observed inputs, probabilities, constraints, risk penalty and tail mass. Its mathematical recommendation must agree exactly with the Signal quantitative advisor. The *only* intended advantage/disadvantage is the additional native gate and its treatment of partial-scale actions.
   - **Secondary:** ordinary risk-neutral expected-net-utility maximizer using the same information. This is not an inferior or intentionally crippled baseline; it optimizes a different declared objective. The risk comparator is primary to prevent changing risk preference from being misrepresented as proprietary optimization.

Nothing in this work relaxes `evaluateDecision`, modifies a production decision threshold, supplies model scores from outcome labels, or executes a side effect.

## Run

```bash
pnpm install --frozen-lockfile
pnpm --filter @signal/decision typecheck
pnpm --filter @signal/decision test
pnpm --filter @signal/decision build
node scripts/validation/randomized-net-policy-ope.mjs --self-test
node scripts/validation/randomized-net-policy-ope.mjs \
  --config /path/to/frozen-design.json \
  --proposals /path/to/pre-outcome-proposals.jsonl \
  --outcomes /path/to/finalized-randomized-outcomes.jsonl
```

The last command is **not** executable without independently collected, approved input files. The CI self-test uses synthetic negative-investment and abstention examples only. The second command writes aggregate-only `artifacts/validation/randomized-net-policy-ope-report.json`. Neither command connects to production, asks for secrets, enrolls participants, or sends emails.

## Frozen configuration

Exact JSON keys: `study_id`, `source_class` (`synthetic_fixture` or `historical_randomized_actions`), `baseline_version`, `signal_version`, `native_gate_version`, `commit_sha` (40-hex), `unit` (exactly `USD net per randomized opportunity`), `action_codes` (2–12 distinct short identifiers, first `wait`), `tail_mass`, `downside_penalty`, `exposure_fraction` (between .01 and .99), `bootstrap_replicates` (300–5000), `bootstrap_seed`, `minimum_effective_sample_size` (at least 30), `minimum_material_gain_usd` (positive), `external_source_attestation_required` (always `true`). A Git SHA in an untrusted config is a *claim*, not source authentication.

The **pre-outcome proposal JSONL** has exactly seven keys per record:
```text
unit_hash,cluster_hash,proposal_at,evidence_cutoff_at,
evidence_sha256,economic_model,native_gate_model
```
Both hashes must be pseudonymous 64-hex digests (use a privacy-reviewed keyed derivation; raw SHA hashes of common PII are reversible). The full `economic_model` is the actual `QuantitativeDecisionModel`: 2–12 explicitly enumerated states, all frozen actions, state-specific payoff estimates, up-front and opportunity costs and the fixed risk policy. The first action must be a genuinely **feasible zero-cost, zero-payoff `wait`**; if waiting genuinely has an opportunity cost, use a separately reviewed revised economic contract. State probabilities, likelihoods and payoffs are **forecasts**, not realized outcomes. No hidden fields or post-outcome labels are allowed in the monetary model. The `native_gate_model` requires all 13 real ordinal modules, actual prediction/wisdom input, and a pre-cutoff evidence assessment with named sources and timestamps; the publisher cannot independently verify their truth.

The **post-outcome logged JSONL** must use exactly:
```text
unit_hash,cluster_hash,assignment_at,outcome_at,logged_action,
behavior_probabilities,collected_usd,refunds_usd,delivery_cost_usd,
sales_time_cost_usd,delivery_time_cost_usd,compute_cost_usd,
review_cost_usd,delay_cost_usd,remediation_cost_usd
```
Costs must be finite, nonnegative, *measured or documented zero*, and in USD. These are eight distinct categories subtracted from collected USD to form actual observed net contribution for the **logged action**. Do not infer a zero from a missing record. The action-propensity vector must cover every frozen action, be strictly positive (including real `wait`), and sum to one. The tool rejects source mismatch, duplicate units, missing cost fields, altered clusters, outcomes dated before decisions, action-support gaps or invalid probabilities.

## What is estimated

The candidate policies never take unsanctioned exploratory action. For any selected action `a*`, the target policy chooses `wait` with probability `1−e` and `a*` with probability `e` (if `a*=wait`, wait gets probability 1). **A denied or partial native decision selects wait with probability 1.** No native positive action is silently promoted from 0.45- or 0.75-scale to full scale. This abstention is counted as an *actual policy disagreement*, not as superior performance.

For logged unit `i` with observed action `A_i`, its verified logging propensity `b_i(A_i)`, true observed net utility `Y_i`, and target probability `π_i(A_i)`, estimate:

```
IPS(target) = (1/n) * sum_i [ Y_i * π_i(A_i) / b_i(A_i) ]
IPS(advantage) = IPS(Signal-gated) - IPS(equally-informed risk optimizer)
SNIPS(target) = sum_i [weight_i * Y_i] / sum_i weight_i
ESS(target) = (sum_i weight_i)^2 / sum_i weight_i^2
```

The **pre-outcome action policy is computed and hashed before the outcomes are parsed**, though the script cannot prove that source files were independently archived before real outcomes. Paired 95% percentile intervals resample the entire declared `cluster_hash` groups, not individual action rows. Report source digests, group count, IPS/SNIPS, ESS and maximum weight, native gate veto reasons, full/partial native permissions, real effective disagreements, a frozen positive economic threshold, and both primary and secondary policy comparisons. A healthy ESS and a positive lower 95% limit are **necessary screens, not certification**.

## Safe next step when native policy abstains

The new opt-in, pure `adviseEvidenceRecovery` combines the actual native permission
diagnosis with `evaluateInformationValue`, the caller's proposed evidence
likelihoods, and acquisition/review cost. When the native gate denies or only
permits a reduced scale, and the evidence assessment supplies a next-best
evidence question, **positive risk-neutral net expected information value**
may yield `consider_human_evidence_review` rather than indefinite opaque
abstention. Nonpositive estimated information value, absent source question
or unvalidated negative cost remains paused. It never purchases evidence,
sends messages, changes the native gate, or permits action; the information
value is entirely conditional on supplied likelihoods, not measured impact.
Genuine new evidence must be assessed through the full native pipeline
again before any domain-approved execution.

## Strong limitations and mandatory safety boundary

- Randomized historical **action** logs identify an action-policy value only under consistency, logging positivity, correct propensity, sufficient overlap, exchangeability and appropriate clustering. They **did not** assign real firms to **using Signal versus not using Signal**.
- The script cannot audit real cash, cost completeness, actual trained models, user clusters, undocumented interference, ex ante policy-source custody, drift, or privacy permission. Unknown incremental costs of deploying Signal cannot be treated as zero.
- The reported policy-value difference is **not a measured causal effect of Signal software**. A positive simulated test is never evidence of measured profit.
- The algebraic equivalence test ensures the native quantitative risk advisor does **not** claim extra insight over an equally informed conventional mathematical optimizer; the only incremental lever in this study is what the full native gate protects or sacrifices.
- The original ZOZO native gate abstained. Those negative findings remain valid. Decrease abstention by **improving genuine pre-outcome information and validated modeling**, not by inflating scores, removing evidence requirements, weakening thresholds or overriding a partial/zero scale.
- To prove software-level **causal net profit**, execute the separate [prospective randomized policy-assignment protocol](https://github.com/DiogoAngelim/signal/blob/validation/prospective-causal-proof-gate-20261114/docs/validation/prospective-signal-policy-causal-proof.md) with independent assignment/manifest custody, fully reconciled measured costs, human consent, all ITT units and harm noninferiority.

**Validation result (as of authorship):** synthetic-only selftests; live Signal-versus-conventional randomization and measured incremental net profit are **not established**. A green workflow is a software integrity signal, not a causal scientific result.
