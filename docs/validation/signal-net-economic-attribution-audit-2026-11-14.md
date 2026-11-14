# Signal: independent causal net-profit attribution audit (2026-11-14)

**Scientific verdict: NOT PROVEN.** Successful historical randomized tests show that an action selected by Signal can increase real customer gross spending, but **do not** establish that **using Signal software** generates additional realized **net profit** over an equally informed conventional optimizer.

## Completed empirical evidence register

| Test | Actual Signal component | Real randomized primary outcome and comparator | Result | Status |
| --- | --- | --- | --- | --- |
| [Hillstrom RCT](https://github.com/DiogoAngelim/signal/actions/runs/43592392744) (64,000; 38,240 holdout) | Published `evaluateQuantitativeDecision`, risk-neutral, training-only | Selected Mens E-Mail vs randomized No E-Mail, **two-week gross USD customer spend** | +$0.85319/customer, Welch 95% CI [$0.4612,$1.2452], p=0.00001989; predeclared treatment effect gate passed | **Historical causal treatment effect only**; same action as conventional training-mean argmax. Software-specific incremental gross gain $0; actual costs unknown |
| [Hillstrom contextual policy](https://github.com/DiogoAngelim/signal/actions/runs/43593097012) (38,240 same holdout, previously examined) | Actual `evaluateQuantitativeDecision` downside penalty .5 | Signal risk-aware vs same-data contextual mean argmax, gross USD spend | +$0.20203/customer, 95% CI [−$0.01102,+$0.41509], p=0.06309; 8,413 action disagreements; also **−$0.18953/customer vs strong global policy** | **Superiority failed**, exploratory; no observed net profit |
| [Academic JTPA randomized earnings](https://github.com/DiogoAngelim/signal/actions/runs/43594614015) (5,865 holdout) | Native quantitative risk-aware API | Signal vs equally informed global and contextual argmax | 0 action disagreements, $0 incremental earnings policy value | **No incremental value** |
| [ZOZO full women randomized feedback](https://github.com/DiogoAngelim/signal/actions/runs/43589952415) (232,447 holdout impressions) | Actual `evaluateDecision` native gate | Native Signal gate vs random and feature-only | 0 native allowed actions; governed policy equals random; no verified click lift | **No incremental profit or reward proof** |

Source-integrity checks and successful GitHub Actions runs verify execution of analyses, **not** software-specific causal net-profit superiority. The original Hillstrom data source SHA-256 is `0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece`.

## Independent profit-observed data search

- [World Bank Togo RCT](https://microdata.worldbank.org/catalog/2860): 1,500 genuinely randomized firms, 500 each in personal-initiative training, conventional training, and no-training control. Published result: about 30–31% higher **firm profit** after personal-initiative training vs control, versus about 11% for conventional training, and reported cost recovery within one year. **This is causal intervention evidence, not Signal-vs-conventional optimization evidence.** Only public aggregate findings were inspected; raw research microdata, covered by the World Bank's data-use terms, were not downloaded. No unseen Signal policy test was run on these firm outcomes.
- The high-volume Starbucks/Udacity promotion benchmark has $10 sales value and $0.15 message cost but explicitly represents a **simulated experiment**. It cannot supply real-world profit proof.
- Available real marketing RCTs with only gross spend or click records and *assumed* gross margin/contact cost cannot certify observed net profit.

## Conditional economic calculation, never presented as actual profit

For Hillstrom **email vs no-email**, holding contribution fraction `m` and incremental all-in treatment cost `c` fixed:
```
net_treatment_delta_per_customer = m * 0.85319 - c
conditional_ci95 = [m * 0.4612 - c, m * 1.2452 - c]
```
At hypothetical `m=0.35`, `c=$0.02`, conditional value is **+$0.278616/customer**, 95% interval **[$0.14142, $0.41582]**. No real margin or all-in cost was measured; this is a sensitivity bound, **not a net-profit result**, and the conventional same-action optimizer obtains the same underlying customer spend.

Mathematical check: if a conventional optimizer maximizes **true** expected net profit over the same feasible policies, with the same true information, then `V(Signal) <= V(conventional)` by definition. To obtain economically meaningful improvement in practice, Signal must offer **empirically demonstrated better information, better probability estimates, lower process/side-effect costs, fewer expensive errors or more effective human decisions**. Calling an intentionally poor baseline a conventional optimizer does not answer the hard research question.

## Current live-data feasibility (read-only Neon counts)

Direct aggregate-only `SELECT` on 2026-11-14:
- `workbench-v3` default branch (`ancient-sea-71356131`): 0 opportunities, relationships, decisions, assessments, outcomes, cash receipts, or commercial activity rows.
- `workbench-production` default branch (`jolly-hill-45566103`): 0 Signal decision records, Signal outcomes, commercial outcomes, or cash receipts.

Only the named schemas/branches were queried; other systems may exist. No production writes, deployment, data mutation, or customer contacts were performed.

## Non-negotiable proof protocol

Use [the already implemented prospective audit with pre-outcome assignment manifest](https://github.com/DiogoAngelim/signal/blob/validation/prospective-causal-proof-gate-20261114/docs/validation/prospective-signal-policy-causal-proof.md) and [the real quantitative+native-gate shadow adapter](https://github.com/DiogoAngelim/signal/blob/research/economic-shadow-authorization-20261114/docs/validation/economic-shadow-authorization.md):

1. Freeze verified **current** Workbench policy as the control and the **identical governance with additional Signal advice** as treatment. Preserve existing Signal hard-stops in both arms and require human approval. Baseline must be equally informed, not a crippled comparator.
2. Pre-outcome shadow actual decisions, costs, disagreements and native vetoes; externally timestamp source/manifest lineage. Record zero disagreements as a scientific failure, not a condition to tune scores upward.
3. Randomize approved real independent company relationships 50/50 **before** exposure. Keep repeated cases in their assigned arm; analyze all randomized units (ITT), abstentions included.
4. Observe complete 90-day **cash receipts less reversals, delivery and time costs, incremental Signal/AI compute/review, opportunity/delay and remediation/harm**, with authentic currency and external reconciliation. Unknown is missing, never zero.
5. Predeclare practical positive net dollar difference, sample size from a real baseline variance, cluster-aware uncertainty, two-sided alpha=.05 and harm noninferiority. Require the **lower 95% confidence bound to exceed the positive economic threshold** and independent verification.

Illustrative power **not an estimate for Workbench**: if relationship-level outcome SD is $3,000 and target delta $500, a two-sided 5% 80%-power normal approximation requires about **566 independent relationships per arm** before attrition/clustering adjustments.

**Final field status:** `HISTORICAL_REAL_ACTION_GROSS_CAUSAL_LIFT=YES`, `ACTUAL_NET_PROFIT_OBSERVED=NO`, `INCREMENTAL_SIGNAL_POLICY_SUPERIORITY=NO_CONFIRMED_POSITIVE_EFFECT`, `LIVE_SIGNAL_SOFTWARE_CAUSAL_PROOF=NOT_PERFORMED`. Do not approve a scientific or marketing claim of net-profit proof today.
