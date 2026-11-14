# External academic JTPA causal policy test — final scientific result

**Date:** 2026-11-14. **Status:** No independent proof of incremental Signal policy superiority.  
**Final verified GitHub Actions:** [43594614015](https://github.com/DiogoAngelim/signal/actions/runs/43594614015).  
**Aggregate JSON artifact:** \`signal-academic-jtpa-rct-43594614015-1\` (artifact ID \`14112954617\`).  
**Source:** Academic JTPA experimental replication, commit \`e98d6cba1853b607e16e63d29aff7635f04b47ad\`, raw Git blob \`c26124a0716b5d7b44c2c357087c7136752a0aa7\`, independently observed SHA-256 \`242427793ccad53412b7d0ab1513b4fb6e3d1e15fdba4b078fd26ce6d5856bd6\`, 658,746 bytes.

## Reproducible real-data execution

The actual \`@signal/decision\` \`evaluateQuantitativeDecision\` entrypoint was executed with the frozen three-state downside model (risk penalty 0.5, prior 300, predicted-state deviations ±1.96 heuristic SE). The primary comparator was the conventional **global** training-period mean argmax. The preprogram contextual baseline was also given the **exact same shrunk outcome estimates**. The zero-risk Signal API and contextual argmax agreed, as required by the invariant.

The original study contains *actual randomized assignment* to being offered training (\`instrument\`), with observed earnings over 30 months. Actual program participation (\`treatment\`) was not treated as randomized. Source rows = 9,872; training = 4,007; held-out evaluation = 5,865. All eligible source rows retained; only fixed preprogram \`hsorged\` (academic imputation encoded with 0.5 threshold, documented amendment) was used to choose policy. A total of **600/9,872 \`hsorged\` values were fractional**, an important source limitation.

The source/metadata compatibility amendments were committed transparently before the first full statistical evaluation. This is exploratory historical evidence, not a pristine prospective preregistration.

## Actual holdout decisions and economic outcomes

| Policy | Low diploma group (n=1,558) | High diploma group (n=4,307) | Estimated 30-month gross earnings per participant |
| --- | --- | --- | ---: |
| Actual Signal risk-aware | Offer training | Offer training | **$18,524.42** |
| Conventional global argmax | Offer training | Offer training | **$18,524.42** |
| Conventional contextual argmax | Offer training | Offer training | **$18,524.42** |

**Primary specified policy difference Signal minus conventional global:** exactly **$0/customer** because both policies chose **identical treatment assignments for all 5,865 holdout subjects**. Zero policy disagreements. Hence its uncertainty interval is also exactly [0,0] by identical outcomes, not by insufficient statistical power. Preregistered **+$500 mean** and **+$250 lower-95%** practical thresholds **FAILED**. \`NO_INDEPENDENT_PROOF_OF_SIGNAL_POLICY_SUPERIORITY\`.

The secondary Signal minus contextual expected-value policy is also exactly $0/person.

**Different causal question:** the actual randomized **training-offer vs never-offer** contrast in this holdout is **+$1,256.82/person**, asymptotic 95% CI **[$351.72,$2,161.92]**, two-sided p≈0.00650. This supports the treatment-offer effect under original trial assumptions, but cannot be credited to Signal's incremental decision ability because the strong conventional policies chose the identical offer.

All three policies' estimated absolute value ~$18,524.42 per participant, not program net economic profit. Program cost, foregone wages, delivery budget, long-run effects, and current transportability are not in the source data. No production actions occurred.

## Source integrity and randomized assignment quality

- Exact immutable academic Git blob and source size verified; 9,872 subjects, train 4,007, holdout 5,865.
- Total randomized assignment counts: no-offer 3,252; offer 6,620. The assignment proportion is not assumed 50/50; groupwise factual randomized arm means are used.
- Original source had imputation-like nonbinary preprogram \`hsorged\` and \`married\`. No subjects were dropped and the 0.5 model grouping is disclosed as a source/measurement limitation, not true verified diploma for every individual.
- Source schema audit fixed after first successful execution because non-policy descriptive balance fields did not align with alternative file column names, producing NaNs serialized as null. The *final* [43594614015](https://github.com/DiogoAngelim/signal/actions/runs/43594614015) rerun fixed this, with no policy changes and unchanged primary point estimates.
- Final preprogram standardized mean differences across assigned cohorts: \`male=-0.0171\`, \`married=+0.0461\`, \`age2225=-0.0111\`. These are small descriptive differences; they do not externally audit every randomization or attrition condition.

## What this can and cannot prove

**Verified:** source integrity, genuine exported quantitative Signal operation, the safety of an algebraic zero-risk consistency check, and the causal offer-assignment comparison under historical randomized sample assumptions.

**Not proven:** superior Signal policy value versus both conventional alternatives in this setting; actual profit or cost-effectiveness; uniqueness of Signal mathematical optimization; generalization across other current domains; the legacy \`evaluateDecision\` gate's usefulness (prior 100% abstention unresolved); or the live causal effect of using Signal software on real operational decisions.

This result adds to two previous findings: (i) Open Bandit evidence-governed policy abstained on all holdout recommendations in the earlier adapter, and (ii) historical Hillstrom risk-aware incremental policy value was statistically inconclusive and underperformed a simpler global rule.

**Research integrity:** no post-hoc risk tuning, extra subgroup searches, new stop rules or selective favorable comparison is justified on this dataset after these outcomes have been inspected. A future proof needs an independent **policy-assigned prospective trial** with a predeclared primary monetary *net utility* measure, strong equivalent-information baseline, meaningful action disagreement, safety thresholds, and enough randomized units.
