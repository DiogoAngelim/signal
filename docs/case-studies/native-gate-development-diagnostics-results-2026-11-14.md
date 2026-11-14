# Native Signal decision gate: why the experimental integration abstains

**Completed development-only mechanism study:** 2026-11-14  
**CI:** [successful workflow #43595550546](https://github.com/DiogoAngelim/signal/actions/runs/43595550546)  
**Aggregate artifact:** \`signal-native-development-gates-43595550546-1\`, artifact ID \`14113639819\`.  
**Scientific state:** diagnostic **PASS**, economic/predictive/policy causal improvement **NOT PROVEN**.

## Source and method

- Pinned public ZOZO Open Bandit 10,000-row men's random-policy example, exact Git blob \`e99ba925c30ccd537a554ce8ea2104a005c6f49e\` verified.
- **Fitting period:** 4,261 randomized impressions Nov 24–26 UTC, 19 clicks to estimate the candidate ranker.
- **Mechanism-only development evaluation:** 2,928 impressions Nov 27–28 UTC, with **no outcomes consulted for these records**.
- **Former Nov 29–30 experimental holdout:** all 2,811 rows excluded **before the code reads their logged item, affinity, propensity or click values**. No post-hoc tuning of this holdout.
- The exact unmodified experimental \`signalDecisionForCandidate\` adapter from the main-branch \`actual-policy-ope.mjs\` was copied unchanged, invoking actual \`@signal/decision\` \`evaluateDecision\`. No alteration to runtime gate/simulation scoring, evidence inputs or risk/wisdom heuristics.
- Aggregate-only counts, 12 fixed-input replay and 12 synthetic-label nonleakage tests passed.

## Directly observed native gate stages

| State | Without evidence governance | With original single-source evidence |
| --- | ---: | ---: |
| Diagnosed proposals | 2,928 | 2,928 |
| Coherence aligned | 2,928 | 2,928 |
| Raw coherence action permitted | 2,928 | 2,928 |
| Mean raw coherence action scale | 1.0 | 1.0 |
| Wisdom "proceed" | **1,976** | 0 |
| Wisdom "proceed-small" | **952** | **2,928** |
| Simulation "wait" | **2,928** | **2,928** |
| Evidence stewardship "wait" | N/A | **2,928** |
| Explicit governance blocker present | 0 | **2,928** |
| **Final action allowed** | **0** | **0** |
| **Final action scale** | **0** | **0** |

**Mechanistic conclusion:** For this declared recommendation adapter in this developing-period sample, the **simulation's wait recommendation is a binding veto in every record even when coherent policy and wisdom would permit action**. Evidence governance separately introduces explicit blockers and a wait recommendation in all records. This explains the zero-action behavior of the domain adapter without claiming that waiting is generally wrong.

The sampled ordinal input scores are unusually high—minimum 79.09, median 87.02, maximum 88.65—because the adapter maps a relative click-rate ratio into an **ordinal**, not a probability. High input scores did not override the simulation veto. These scores are **not calibrated probabilities** or evidence that an intervention should occur.

## Fixed-context sensitivity sweep, not a new policy

On one fixed development-period context, the script varied only the *hypothetical input ordinal* at 25, 30, ..., 95 and re-ran unmodified Signal:

- At scores 25–60, the simulation chose **block**; no action was permitted.
- At scores 65–90, the simulation chose **wait**; no action was permitted.
- At score 95, without evidence governance, the simulation chose **reduce**, wisdom chose **proceed**, and native action permission became true with scale **0.45**.
- Even at score 95, the *original evidence-governed* adapter still chose **wait** at the stewardship layer and prohibited action.

This means the native pipeline is not literally unable ever to approve; rather, **the particular declared input distribution and single-source evidence model are not compatible with an actionable policy** under the existing risk controls. The fixed-context sweep is a qualitative sensitivity diagnostic, not an identified universal action threshold, safe policy change or reward-optimized intervention. **It is not justification to increase scores artificially or remove permission gates.**

## Work required before a causal business proof

1. Design a domain-grounded application policy with **real monetary utility and constraints**, rather than treating ordinal click propensity as a decision payoff. Declare the genuine wait/no-action alternative and losses due to abstention.
2. Improve evidence reliability/independence/calibration **by obtaining authentic independent sources**, not by inflating hardcoded quality fields.
3. Analyze **pre-outcome policy disagreements and nonzero safe-action rate in shadow mode**, preserving all zero-scale and permission invariants and without any external effects.
4. Freeze the redesigned policy and strong conventional comparator, then preregister a **new prospectively randomized Signal-versus-baseline experiment** including both actions, outcomes and costs. Read no new confirmatory outcomes before the freeze.
5. Use the manifest-reconciled auditor in [PR #69](https://github.com/DiogoAngelim/signal/pull/69), including an externally anchored authentic assignment manifest, full ITT denominator and harm bounds. Obtain appropriate approval before any real traffic routing.

**Never count CI, data-source integrity, or an exploratory input-sensitivity sweep as observed policy lift.** The original held-out results remain inconclusive/negative for added decision quality. No production deployments or external calls made by the diagnostic except downloading the public source.
