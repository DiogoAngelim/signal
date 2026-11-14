# Research-only economic policy and native-permission shadow adapter

**Status:** design and software validation only. Historical results have not shown that Signal software improves net outcomes over an equally informed conventional baseline. This adapter produces **no domain actions** and its outputs are **not causal or monetary evidence**.

## Why this branch exists

On the original random-logged public recommendation data, the experimental ordinal-score adapter caused a native \`evaluateDecision\` simulation **wait** in all 2,928 development decisions; evidence governance added wait/blockers for all 2,928. The separate \`evaluateQuantitativeDecision\` API accepts actual state-contingent utility models but **does not grant permission**. This adapter evaluates both APIs on the *same pre-outcome record*, without turning a numerical recommendation into authorization.

## Data contract — private, pre-outcome and read-only

Supply a frozen config and a UTF-8 JSONL with one independent unit per line. Run with:

\`\`\`sh
pnpm --filter @signal/decision build
node scripts/validation/economic-shadow-authorization.mjs --self-test
node scripts/validation/economic-shadow-authorization.mjs --config fixed-candidate.json --data pre-outcome-proposals.jsonl
\`\`\`

Config fields (all required, exact keys; code is authoritative):

- `candidate_id`, `frozen_signal_model_version`, `baseline_model_version`, `frozen_native_gate_policy_version`, `locked_commit_sha`: frozen distinct version identifiers and an externally verifiable 40-hex Git commit claim;
- `wait_action_id: "wait"`, `currency_unit: "USD net utility per independent opportunity"`;
- `minimum_shadow_units` (30–5,000) and `minimum_effective_disagreement_fraction` (>0–1): purely structural pre-outcome feasibility screens; **vetoes themselves may constitute useful differences from a harmful baseline** even if no Signal action is approved;
- `minimum_actual_evidence_sources` (1–12 distinct named source references) and `max_evidence_age_hours` (positive), checked from source metadata but not independently attested;
- `risk_tail_mass` (0–1) and `risk_downside_penalty` (positive, ≤2): frozen model risk preferences shared across every proposal;
- `requires_independent_attestation: true` is an explicit external-proof requirement that the adapter never claims to satisfy;
- `native_scale_for_full_action: 1`: an allowed but reduced 0.45-scale recommendation cannot be promoted to a full action. A partial action would need its own separately approved and frozen domain mapping.

Each JSONL record has these exact seven top-level keys: `unit_hash`, `decision_at`, `evidence_cutoff_at`, `evidence_sha256`, `native_policy_version`, `economic_model`, `native_gate_model`. The latter must contain exactly `modules`, `prediction`, `wisdom` and `assessment`. Supply all 13 native module scores explicitly as genuine ordinal values. An evidence assessment must include at least the declared number of distinct named sources, each with `eventAt`, `observedAt` and `recordedAt` no later than the evidence cutoff. See the tested synthetic fixtures in the script for the complete shape.

The `economic_model` uses the actual `QuantitativeDecisionModel` format: `states` with probabilities, `actions` with explicit `upfrontCost`, `opportunityCost` and per-state `payoffs`, plus the frozen `riskPolicy`. The `wait` action must be feasible with zero explicit cost and zero modeled payoff in every state; otherwise use a separately reviewed revised protocol. The source can declare `probabilityEvidence` as `estimated` or `externally_validated`, but that declaration is **not independently verified** by the runner.

All fields are required, except optional \`prediction\`, \`wisdom\` and \`assessment\` within the native gate input; the actual DecisionPipelineInput schema still governs. Every native input must pass the actual unmodified Signal entrypoint. The implementation fails if the full 13-module set or native explicit evidence is omitted; it does not inflate quality values or bypass simulation.

**No financial real-world outcomes** belong in this file. The application supplies forecast state probabilities and monetary payoffs; **these are assumptions**, not measured effects, calibrated risks or independent attestations. Upfront/opportunity costs are required for *every* action (including wait) rather than implicitly zero. Wait is a genuine action with zero modeled payoff and cost in every state; if waiting has actual opportunity cost, do **not** use this zero-wait template without a separately preregistered and audited revision.

## Policy contrast, authorization and invariants

1. Compute the **same feasible action set** using the actual quantitative API. Independently recalculate each action's expected net payoff from its states, probabilities, time discount and explicit costs. Verify values and constraints agree with the Signal API, fail on discrepancies. Baseline is an ordinary expected-net-utility argmax among the same feasible actions, with deterministic candidate-order ties.
2. Signal advisor chooses the \`evaluateQuantitativeDecision\` recommendation under the separately frozen downside penalty. **The advisor does not authorize execution**. With downside penalty set to zero, the actual API must reproduce the independent baseline action for every record, otherwise fail.
3. Invoke genuine \`evaluateDecision(native_gate_model)\` unmodified, independently of quantitative advice. **If action permission is false, actionScale=0, advisor chooses wait or gate scale is lower than 1.0, the native-permitted *shadow* action is "wait"**. Unmapped reduced scale is counted separately from a hard denial; neither becomes a full action.
4. Only if the native gate returns allowed=true AND actionScale=1 AND quantitative advisor recommends an action other than wait does the adapter report a potentially native-permitted shadow recommendation. It **never executes** the action, persists a decision, or writes to production.
5. For reporting, distinguish *advisor vs baseline* action disagreements, *native permitted* proposals, *native-permitted vs baseline* disagreements, gate wait/block, and advisor wait. No naive conversion of policy disagreements into economic benefits.
6. The module requires frozen model versions, finite state probabilities, consistent payoff units, predecision evidence references/timestamps, and strictly aggregate output. It rejects unexpected fields, duplicate units and overly stale inputs according to the configured maximum age. Actual source/permission certification, financial model calibration and intervention effects cannot be verified by a supplied JSONL.

## Preflight outcomes

The report is **aggregate only** and either \`SHADOW_POTENTIALLY_DIFFERENT_NOT_VERIFIED\` or \`SHADOW_NOT_YET_ACTIONABLE\`. Neither is permission to deploy or a proof of economic lift; a green CI only means synthetic invariants passed.

If all native actions abstain (as in the prior public diagnostic), the system must report **zero native-permitted differences**, not pretend the quantitative advisor can act. The only way to establish an actual Signal effect is the separately approved prospective randomized software-policy trial in [PR #69](https://github.com/DiogoAngelim/signal/pull/69), using externally anchored assignments, actual realized **net** financial benefits/costs, adequate sample size, and independent safety monitoring. A later natural-language workflow cannot replace those missing observations.

## No deployments or database work

No Workbench tenant, Neon connection, API key, or customer dataset is accessed. No mutation to the actual Signal decision package or existing production gate is made. CI uses **synthetic examples only** and never counts as empirical proof.
