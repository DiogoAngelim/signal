# Shadow-mode decision disagreement and randomized-trial power preflight

**Status:** offline measurement instrument only. No live trial, customer outreach, action execution, database access, or causal outcome verification.

## Purpose

A prospective A/B study cannot demonstrate incremental Signal policy value if Signal and the strong equally informed baseline make **identical decisions**, or if Signal is denied permission to execute all potentially different decisions. This script performs a development-phase, *pre-outcome* feasibility screen on genuine application-generated **shadow-only** paired policy proposals. It is not a trial, and its inputs are not independently authenticated by the CLI.

## Inputs

`node scripts/validation/shadow-policy-readiness.mjs --config pilot-design.json --data shadow-proposals.csv`

- `pilot-design.json` fields:
  - `candidate_id`, `model_version_baseline`, `model_version_signal`: fixed nonblank identifiers; baseline/Signal versions must differ;
  - `action_codes`: frozen array of 2–20 short, non-sensitive domain action codes including `wait`. Reject arbitrary names, case IDs, or unknown action values;
  - `minimum_shadow_units` (minimum 30), `minimum_policy_disagreement_rate` (>0..1), `minimum_signal_allowed_rate` (>0..1): predeclared feasibility thresholds, not signs of causal effectiveness;
  - `baseline_net_utility_sd_usd` (>0), `minimum_detectable_net_gain_usd` (>0): must come from a real **independent baseline-only pilot**, not fabricated or tuned to post-assignment outcomes;
  - `allocation_signal` (0.1..0.9), `design_effect` (≥1), `expected_independent_units_per_day` (>0), `observation_days` (≥1): hypotheses for **planning only**. Repeated people/cases require cluster-level allocation and design effect justification.
- Exact CSV columns, one row for each eligible **independent pre-outcome decision unit**:

  `unit_hash,proposal_at,evidence_sha256,model_version_baseline,model_version_signal,baseline_action,signal_effective_action,signal_action_allowed,signal_action_scale,simulation_recommendation,wisdom_decision,stewardship_recommendation`

- `unit_hash` and `evidence_sha256` are 64-hex digests. Hashing low-entropy PII may still reveal identities; use a privacy-approved keyed derivation rather than publishing raw email/ID hashes.
- `signal_effective_action` is the eventual proposed decision following the **actual unmodified Signal permissions**: when `signal_action_allowed=0`, it must be exactly `wait` with scale zero; when allowed, scale must be strictly positive. The input adapter is responsible for mapping Signal’s gate into a permitted action and must not bypass domain approval.
- Both `model_version` fields must match frozen candidate config. The actual evidence snapshot digest is recorded but cannot be cryptographically verified against a real application by the CLI.
- No observed outcome labels, assignment arm, earnings, profit, customer contact identifiers, or timing after an outcome is accepted in this file. Reject unknown columns, duplicate units, invalid timestamps, missing decisions, or zero-scale permission.
- This is **shadow only**: the script never invokes domain operations and no application is authorized to execute its reported actions.

## Outputs

- Eligible distinct units observed; allowed proposals and fraction; denied/wait fraction; meaningful baseline-vs-Signal effective action disagreements; overlap of simulation/wisdom/stewardship verdicts; actions are counted only in aggregate.
- Per-configuration **conditional normal-approximation sample size** (80% power, two-sided α=.05) for an independently randomized signal allocation p:
\[
N_{\mathrm{total}} \approx
\Big\lceil\frac{(1.96+0.84)^2 \sigma^2}{\delta^2 p(1-p)}
\times \mathrm{designEffect}\Big\rceil.
\]
With 1:1 assignment this is ~`31.4*(sigma/delta)^2` **total** independent units. It assumes an ITT net-utility difference `delta`, *not* an effect restricted to disagreeing decisions. Missing net-utility SD is **not estimated from these shadow proposals**, and observed abstention cannot be converted into an invented economic benefit.
- Approximate enrollment days given `expected_independent_units_per_day`, **not** a scheduling promise or validated forecast; full outcome observation days are additional. The actual power analysis must incorporate harm noninferiority and cluster correlation, which may require far larger samples.
- A structural preflight screen that can be `PREFLIGHT_POTENTIALLY_INFORMATIVE_ONLY` or `PREFLIGHT_NOT_FEASIBLE`. It does **not** certify an experiment, effectiveness, generalization or profit.

## Mandatory next gates after an informative preflight

Require an approved domain, independent source lineage and cost accounting, no unacceptable safety risks, stable policy versions, preregistration/approval, real app-side authenticated random assignment, externally anchored append-only assignment manifest and final complete outcomes. Use `scripts/validation/prospective-policy-trial-audit.mjs --config ... --manifest ... --data ...` from [the prospective trial protocol](./prospective-signal-policy-causal-proof.md).

CI runs only synthetic self-tests. Neither CI nor a positive preflight result is a causal claim.
