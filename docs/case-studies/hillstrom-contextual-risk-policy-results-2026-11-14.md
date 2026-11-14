# Independent challenge of Signal's incremental value on a randomized monetary dataset

**Study:** 2026-11-14, historical MineThatData / Hillstrom randomized email experiment.  
**Status:** **Completed, exploratory, NO verified incremental Signal superiority.**  
**Evidence:** [successful run #43593097012](https://github.com/DiogoAngelim/signal/actions/runs/43593097012), archived aggregate JSON artifact `signal-contextual-risk-hillstrom-43593097012-1` (ID `14113690145`), SHA256-verified original publisher data.

## What was actually tested

The previous study selected `Mens E-Mail` using Signal's **risk-neutral** quantitative API, which is *exactly equivalent* to ordinary training-only maximization of mean gross spend. That historical email treatment has demonstrated a beneficial randomized-effect vs `No E-Mail`, but the policy identity means it contributes **zero incremental value attributable to Signal**.

To test a *distinct* specified policy, this study froze eight pre-treatment categories (previous men's shopping, previous women's shopping and newcomer), three randomized email arms and an identical 40%-training/60%-test partition. The genuine `evaluateQuantitativeDecision` implementation used three uncertainty states per action and a preregistered downside penalty of 0.5 to prefer robust gross spend estimates over high-variance ones. Its comparator was a conventional **contextual mean argmax supplied the exact same pre-treatment variables, samples and shrunk payoff means**. Additional secondary comparator: the single best training-period email for everybody.

Original publisher CSV: 64,000 randomized customers, verified SHA-256 `0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece`, train 25,760, test 38,240. The study did **not** make/send any live decisions or connect to production.

**No independent untouched holdout:** this same original dataset and its aggregate test-arm values had previously been examined in PR #65; this follow-up is appropriately exploratory, even though the individual test-segment results were not consulted before the model was frozen.

### Outcome-blind amendment and source support

The initial real-file execution aborted because pre-treatment `0|0|0` does not occur. Protocol amendment A, committed **before outcome evaluation**, excludes only cells with **zero training and zero test rows**, retaining the original 30-observations-per-randomized-arm minimum for every populated cell. Both `0|0|0` and `0|0|1` were absent. Six populated cells remain, covering **all 38,240 holdout customers**. This amendment is disclosed, not hidden.

## Primary: Signal risk-governed vs equally informed contextual argmax

The two policies genuinely differed for **8,413 / 38,240 holdout customers (22.00%)**. A no-risk control made the exact same actions as the conventional contextual argmax in every group, confirming the native Signal API's execution and isolating the declared downside preference as the policy difference.

| Estimate | Result |
| --- | ---: |
| Signal gross-spend policy value | **$1.34152/customer** |
| Equally-informed contextual argmax value | **$1.13948/customer** |
| Difference (Signal minus contextual) | **+$0.20203/customer** |
| Approximate 95% normal CI | **[−$0.01102, +$0.41509]** |
| Two-sided p-value | **0.06309** |
| 2,000-replicate paired randomized-cell bootstrap 95% CI | **[−$0.00778, +$0.42496]** |
| Preregistered economic threshold | Point gain > $0.25; CI lower > $0.10 |
| Preregistered outcome | **NO_CONFIRMED_INCREMENTAL_POLICY_SUPERIORITY** |

The primary contrast is a **covariate-stratified estimate on randomized treatment data**. For each populated fixed segment, we compared factual spending means of the actual randomized treatment groups corresponding to the two policies' actions, then weighted by empirical segment share. No individual customer's unobserved alternative outcome was fabricated. Bootstrap samples were paired within original segment/treatment cells, rather than treating policy outcomes as two independent samples.

**Important:** the point estimate is positive, but the interval overlaps zero and economic significance gate fails. This is exploratory and **cannot be advertised as proof**.

## Stronger conventional strategy challenges the conclusion

A simpler, prespecified training-only **global argmax** consistently selected men's email.

| Policy | Estimated gross spend/customer on test |
| --- | ---: |
| Global conventional argmax | **$1.53105** |
| Signal contextual risk-governed | **$1.34152** |
| Conventional contextual argmax | **$1.13948** |

The exploratory **Signal minus global** contrast is **−$0.18953/customer**, approximate 95% CI **[−$0.32717, −$0.05189]**, unadjusted two-sided p **0.00696**. That is evidence **against** this Signal risk-governed mapping beating the simpler global policy on this historical dataset, albeit as a secondary, non-multiplicity-adjusted analysis of reused data.

The conventional contextual policy is itself worse than the global baseline: **−$0.39156/customer**, 95% CI **[−$0.64521, −$0.13791]**, unadjusted p **0.00248**. This highlights a substantive *model-estimation* risk: overly local mean estimates can lead to worse decisions even with an otherwise correct optimizer.

A secondary independent IPS computation from logged random assignments is directionally consistent with the stratified policy values (Signal **$1.34840**, contextual **$1.14209**, global **$1.53445**). IPS effective sample sizes are ~12.7k per policy out of 38,240 observations. This is not a separate dataset or independent replication.

## Mechanism behind the observed policy differences

- In pre-treatment cell `mens=1, womens=0, newbie=1` (8,413 test customers), risk-aware Signal chose **Mens E-Mail** while the contextual mean argmax chose **Womens E-Mail**. The regularizer favored the lower-uncertainty choice.
- In cell `mens=1, womens=1, newbie=1` (2,360 customers), **both contextual rules** selected women's email while the global baseline chose men's email. The empirical test outcome for that segment lowers their overall value relative to the global rule.
- All other populated cells selected the same men's email across policies.

The underlying uncertainty states are application-supplied heuristics, not separately calibrated probabilistic evidence. No claim is made that the uncertainty penalty is generically optimal or unique to Signal.

## Final causal and economic claim boundaries

1. The randomized assignment was to **emails, not Signal software**. Its genuine original trial supports causal treatment comparisons and offline causal policy-value estimation under randomization/overlap/no-interference assumptions, but not software-specific causal efficacy.
2. The result is **exploratory reused-data** and cannot support a new independent confirmatory claim.
3. **No measured net profit or economic cost** is available; `spend` is observed two-week *gross* customer spending.
4. No evaluation of the legacy `evaluateDecision` gate or its prior 100%-abstention defect; this study uses opt-in quantitative advice and explicit application payoffs.
5. Risk neutrality with the same payoffs and constraints is **mathematically identical** to conventional expected-utility maximization. Positive effect from the email selected under that configuration is the treatment effect, not Signal's unique contribution.
6. A genuine claim that **deploying Signal improves decisions** needs a separately frozen Signal policy and strong baseline, a new never-consulted evaluation population with real utility and costs, ideally randomized policy assignment, independently reviewed power and results, and reproducible operational evidence.

**Scientific conclusion: the requested stronger claim was actively tested but is not proven.** The recorded negative and inconclusive results are first-class evidence. Do not reparameterize the risk gate on this same test until it looks positive and then claim independent confirmation.
