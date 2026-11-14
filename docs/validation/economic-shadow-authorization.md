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

Config fields:

- \`candidate_id\`, \`frozen_signal_model_version\`, \`baseline_model_version\`, \`frozen_native_gate_policy_version\`, \`locked_commit_sha\`: distinct fixed identifiers, a real 40-hex commit reference, audited and frozen *before outcomes*;
- \`wait_action_id\` **must be "wait"**; \`currency_unit\` must exactly be \`USD net utility per independent opportunity\`; \`minimum_shadow_units\` (≥30), \`minimum_advisor_disagreement_fraction\` (>0), \`minimum_native_allowed_fraction\` (>0), \`minimum_fully_authorized_disagreement_fraction\` (>0);
- \`minimum_actual_evidence_sources\` ≥ 1 and \`requires_independent_attestation\` true: declarations to be independently audited, **not self-certified** by this tool.
- \`native_scale_for_full_action\` fixed at 1.0. An allowed but reduced 0.45-scale recommendation **cannot be silently promoted** to a full action; it becomes an execution-scale-unmapped abstention. A truly partial action requires a separate, domain-approved, explicitly defined action and new protocol.

Each JSONL record:

\`\`\`json
{
  "unit_hash": "<64-hex pseudonymous identifier>",
  "decision_at": "2026-11-14T12:00:00Z",
  "evidence_cutoff_at": "2026-11-14T11:50:00Z",
  "evidence_sha256": "<64-hex frozen evidence digest>",
  "native_policy_version": "native-gate-v1",
  "evidence_source_count": 2,
  "economic_model": {
    "modelVersion": "shadow-utility-v1",
    "unit": "USD net utility per independent opportunity",
    "probabilityEvidence": "estimated",
    "states": [ {"id":"success","probability":0.4}, {"id":"failure","probability":0.6} ],
    "actions": [
      {"id":"invest","upfrontCost":2,"opportunityCost":0,
       "payoffs":[{"stateId":"success","amount":100},{"stateId":"failure","amount":-70}]},
      {"id":"wait","upfrontCost":0,"opportunityCost":0,
       "payoffs":[{"stateId":"success","amount":0},{"stateId":"failure","amount":0}]}
    ],
    "riskPolicy":{"tailMass":0.25,"downsidePenalty":0.5}
  },
  "native_gate_input": {
    "decisionId":"<opaque non-PII id>",
    "source":"shadow",
    "createdAt":"2026-11-14T12:00:00Z",
    "modules":{"discovery":80},
    "prediction":{"expectedReward":80},
    "wisdom":{"expectedReward":80}
  }
}
\`\`\`

All fields are required, except optional \`prediction\`, \`wisdom\` and \`assessment\` within the native gate input; the actual DecisionPipelineInput schema still governs. Every native input must pass the actual unmodified Signal entrypoint. The implementation fails if the full 13-module set or native explicit evidence is omitted; it does not inflate quality values or bypass simulation.

**No financial real-world outcomes** belong in this file. The application supplies forecast state probabilities and monetary payoffs; **these are assumptions**, not measured effects, calibrated risks or independent attestations. Upfront/opportunity costs are required for *every* action (including wait) rather than implicitly zero. Wait is a genuine action with zero modeled payoff and cost in every state; if waiting has actual opportunity cost, do **not** use this zero-wait template without a separately preregistered and audited revision.

## Policy contrast, authorization and invariants

1. Compute the **same feasible action set** using the actual quantitative API. Independently recalculate each action's expected net payoff from its states, probabilities, time discount and explicit costs. Verify values and constraints agree with the Signal API, fail on discrepancies. Baseline is an ordinary expected-net-utility argmax among the same feasible actions, with deterministic candidate-order ties.
2. Signal advisor chooses the \`evaluateQuantitativeDecision\` recommendation under the separately frozen downside penalty. **The advisor does not authorize execution**. With downside penalty set to zero, the actual API must reproduce the independent baseline action for every record, otherwise fail.
3. Invoke genuine \`evaluateDecision(native_gate_input)\` unmodified, independently of quantitative advice. **If action permission is false, actionScale=0, advisor chooses wait or gate scale is lower than 1.0, the fully authorized *shadow* action is "wait"**. Unmapped reduced scale is counted separately from a hard denial; neither becomes a full action.
4. Only if the native gate returns allowed=true AND actionScale=1 AND quantitative advisor recommends an action other than wait does the adapter report a potentially fully authorized shadow recommendation. It **never executes** the action, persists a decision, or writes to production.
5. For reporting, distinguish *advisor vs baseline* action disagreements, *native permitted* proposals, *fully-authorized vs baseline* disagreements, gate wait/block, and advisor wait. No naive conversion of policy disagreements into economic benefits.
6. The module requires full fixed model version, honest finite state probabilities, consistent payoff units, evidence count, prior evidence cutoff, **no user-level output**, no duplicate units, and bounded JSONL record size. It rejects unexpected fields and evidence staleness beyond the fixed cutoff date. Actual source/permission certification, financial model calibration and intervention effects cannot be verified by a supplied JSONL.

## Preflight outcomes

The report is **aggregate only** and either \`SHADOW_POTENTIALLY_DIFFERENT_NOT_VERIFIED\` or \`SHADOW_NOT_YET_ACTIONABLE\`. Neither is permission to deploy or a proof of economic lift; a green CI only means synthetic invariants passed.

If all native actions abstain (as in the prior public diagnostic), the system must report **zero fully-authorized differences**, not pretend the quantitative advisor can act. The only way to establish an actual Signal effect is the separately approved prospective randomized software-policy trial in [PR #69](https://github.com/DiogoAngelim/signal/pull/69), using externally anchored assignments, actual realized **net** financial benefits/costs, adequate sample size, and independent safety monitoring. A later natural-language workflow cannot replace those missing observations.

## No deployments or database work

No Workbench tenant, Neon connection, API key, or customer dataset is accessed. No mutation to the actual Signal decision package or existing production gate is made. CI uses **synthetic examples only** and never counts as empirical proof.
