# Quantitative decision validity: explicit models and independent evidence

**Status:** opt-in methodology and implementation; **not** a claim that Signal has
produced better customer decisions. The existing `simulateDecisionPaths` API
remains a documented heuristic and is not silently replaced.

## Purpose and separation of concerns

Signal's protocol, authorization, human approval, durable side effects, audit,
replay and evidence-quality safeguards continue to govern action execution.
The pure `@signal/decision/core` APIs below supply quantitative **advice**, not
permissions or empirical truth. Their calculations depend on inputs supplied by
the consuming application and make no attempt to forecast those inputs.

- `evaluateQuantitativeDecision(model)`: model-based expected utility, actual
  statewise regret, worst-case and lower-tail utility, feasibility, and
  risk-neutral value of perfect information (EVPI).
- `evaluateInformationValue(model, observations, cost)`: expected value of
  sample information (EVSI) under explicit conditional observation likelihoods.
- `stressTestProbabilityCases(model, cases)`: bounded robustness **diagnostic**
  against caller-specified alternative probability distributions.
- `evaluateBinaryForecasts(dataset)`: proper scoring rules (Brier and clipped
  log loss), tie-aware ROC AUC, descriptive expected calibration error,
  comparison against a **precommitted** constant-probability baseline.
- `compareFullFeedbackPolicies(dataset)`: paired utility differences and an
  explicitly limited bootstrap interval for **full-feedback** alternative
  actions; rejects missing counterfactuals instead of inventing them.

All monetary inputs and outputs use the caller-defined common `unit`. This is
not a universal mapping of subjective 0-100 assessments into dollars or
probability. `probabilityEvidence` identifies declared source quality; even
`externally_validated` is a caller assertion, **not** a Signal certification.

## Decision model and mathematical definitions

Assume an explicitly enumerated set of mutually exclusive, exhaustive states
`s` with probabilities `p_s` summing to one, and a finite set of feasible
possible actions `a`.

For each action/state, a caller supplies a gross terminal payoff, common
payoff horizon and discount rate, time-zero upfront and opportunity costs:

```
U(a, s) = grossPayoff(a, s) / (1 + annualDiscountRate) ^ payoffHorizonYears
          - upfrontCost(a) - opportunityCost(a)
EU(a)   = sum_s p_s U(a, s)
Regret(a, s) = max_{b feasible} U(b, s) - U(a, s)
ExpectedRegret(a) = sum_s p_s Regret(a, s)
EVPI = sum_s p_s max_{a feasible} U(a, s) - max_{a feasible} EU(a)
```

Negative payoffs are permitted. Costs are certain time-zero values and must
be nonnegative; the application can encode state-dependent costs in gross
payoffs. The explicit `hold`/`wait` option must be modeled as its own action,
**not** fabricated by string matching. Regret considers other feasible actions
at the same state, not the selected action's own best-case minus its mean.

`lowerTailMean` integrates the lowest-utility outcomes until exactly the
caller-defined `tailMass` of probability is reached (including fractional
probability at its threshold). Default tail mass is 0.1. Hard policy
constraints can veto actions or require a minimum worst-case or lower-tail
payoff. Remaining actions are ranked by:

```
objective(a) = EU(a) - downsidePenalty * max(0, EU(a) - lowerTailMean(a))
```

`downsidePenalty` defaults to zero (risk neutrality). It is a declared risk
preference, not a universally optimal coefficient. This objective is **not** a
probability of success and is not claimed to implement every expected-utility
axiom. Risk-neutral EVPI is reported **separately** even when a risk policy
changes the selected action. When no action remains feasible the result has
`status = no_feasible_action` and no recommendation or EVPI.

For information observations `o` and likelihoods `L(o | s)` provided by the
caller, each state's observation probabilities must sum to one. Then:

```
EVSI = sum_o max_{a feasible} sum_s p_s L(o|s) U(a,s)
       - max_{a feasible} EU(a)
netValueOfInformation = EVSI - acquisitionCost
```

The algorithm evaluates only the original feasible set, holding action
constraints fixed across observations. EVSI and EVPI are risk-neutral;
without validated likelihoods these are conditional model calculations.
`EVSI <= EVPI` holds analytically for internally coherent discrete inputs.
No uncertain-information price should be accepted without representing its
cost and ensuring credible observation likelihoods. The decision to purchase
information still belongs to the calling domain.

## Example: reversible decision and information purchase

```ts
const model = {
  modelVersion: 'commercial-v1',
  unit: 'USD net present value',
  probabilityEvidence: 'subjective',
  states: [
    { id: 'success', probability: 0.5 },
    { id: 'failure', probability: 0.5 },
  ],
  actions: [
    { id: 'invest', payoffs: [
      { stateId: 'success', amount: 100 },
      { stateId: 'failure', amount: -100 },
    ] },
    { id: 'wait', payoffs: [
      { stateId: 'success', amount: 0 },
      { stateId: 'failure', amount: 0 },
    ] },
  ],
} as const;
```

Both actions have EU=0. Their expected regrets are each 50, because a
hindsight oracle could select invest only in success. EVPI=50. A perfect
observation costs 10, so EVSI=50 and net information value is 40. A useless
observation has EVSI=0 and net value -10. These are illustrative analytic
results with **invented probabilities**, not customer outcomes.

## Empirical validation protocol and gates

This protocol must be followed per domain, event definition, decision class,
model version, observation window, and policy before any effect claim.

1. **Pre-register the objective.** Fix the decision unit, candidate actions,
   loss/utility function, action constraints, costs, time horizon, target event,
   user segments, baseline policy, and prospective evaluation protocol.
2. **Resolve data lineage.** Obtain permissioned, source-dated inputs; retain
   evidence identifiers, assessment version, timestamps, grouping/cluster IDs,
   and outcomes. Record censoring, missingness, attrition, and unobserved
   counterfactuals. No invented labels or synthetic-as-live outcomes.
3. **Avoid leakage and use out-of-time testing.** Freeze model versions, keep
   related opportunities and customer groups together across splits, define
   temporal holdouts, record leakage checks, and document the selection frame.
4. **Validate probability claims.** On independently labeled holdouts, report
   Brier, log loss, calibration reliability, ROC AUC (only when both event
   classes are represented), subgroup drift, class imbalance, sample size,
   base rate, uncertainty, and precommitted baseline performance. Minimum API
   eligibility is 100 labeled examples and at least 10 per populated bucket.
   This floor is not a guarantee of adequate statistical power.
5. **Assess model sensitivity.** Vary costs, payoffs, discount rates, scenario
   probabilities, tail mass and action constraints. Use interaction and
   multi-parameter stress cases beyond the supplied single-factor API.
   Publish where recommendations reverse or feasibility changes.
6. **Compare decisions with a valid baseline.** Full-feedback payoff matrices
   can be evaluated descriptively with `compareFullFeedbackPolicies` (minimum
   30 cases for a bootstrap interval). For ordinary real-world actions, the
   unseen alternative outcome is a counterfactual. Use randomized policy
   trials or a prospectively reviewed identification design instead of
   pretending all alternative payoffs are observed. Do not claim causal lift
   from paired hypothetical results. Consider clustered units, temporal
   dependence, multiple testing and power.
7. **Review operational readiness separately.** Never bypass Signal's
   authorization, tenant boundaries, idempotency, side-effect reconciliation,
   outbox/audit durability, and human-review gates. CI checks do not validate
   production latency, SLOs or external-key custody.

### Claim ladder

| Stage | Evidence | Permitted claim |
| --- | --- | --- |
| Mathematical specification | Published definitions and inputs | "The model is explicitly defined" |
| Implemented and unit-tested | Reproducible golden and adversarial fixtures | "The formulas behave as specified on tested cases" |
| Independent statistical review | Holdout labels, outcome provenance, externally checked metrics | "Prediction quality has been evaluated on the named sample" |
| Decision-policy experiment | Controlled or defensible causal identification, measured net utilities | "The policy improved the specified outcome in the studied setting" |
| Production evidence | Real workload, monitored SLOs, operational security and recovery | "The specified deployment satisfies the recorded production requirements" |

**Current boundary:** implementation and local mathematical fixtures; actual
holdout/customer outcome data, independently verified likelihoods, a
prospective policy experiment and production validation are still missing.
No new revenue, accuracy, calibration or incident-reduction claim is made.

## Backwards compatibility and integration

These APIs are deliberately **additive** to `@signal/decision` and
`@signal/decision/core`. They neither change existing scoring weights, nor
convert older scenario `probability` labels into validated forecasts. Consumer
applications retain ownership of economics, authorization, execution, audits,
retention and outcome labels. A consuming application can first run the new
model in read-only shadow mode, compare recommendations against a frozen
baseline, and require human approval before any change to production behavior.