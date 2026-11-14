# Signal evidence register and causal-proof status — 2026-11-14

**Final current claim: incremental causal improvement in real-world decisions from deploying Signal is NOT proven.** Reproducible experiments document positive *treatment* effects, but none found a reliable positive incremental *Signal policy* effect over a strong equally informed conventional decision-maker. No valid evidence supports claiming measured profit improvement attributable to Signal software.

## Completed empirical tests

| Study | Historical randomized unit | Actual Signal component | Strong baseline | Primary estimated incremental outcome | Status |
| --- | --- | --- | --- | --- | --- |
| ZOZO Open Bandit, full women randomized | 232,447 observed item-slot impressions (holdout) | Native \`evaluateDecision\` gate | Uniform randomized / feature-only ranker | Signal 0 allowed actions, identical to randomized; governed-minus-feature IPS −0.01024 percentage points, CI [−0.05791,+0.03321] | No verified reward lift |
| Hillstrom email, 64,000 people | 38,240 randomized holdout people | \`evaluateQuantitativeDecision\` risk-neutral, 1 state | Same training-mean argmax | Exactly identical best action; $0 extra from Signal vs the same conventional math | The selected men's email **treatment** increased gross spend +$0.853/person vs no email, but Signal adds nothing relative to same decision |
| Hillstrom contextual risk policy, previously inspected source | 38,240 holdout | Actual risk-aware quantitative API, 8 fixed cells | Same contextual input means | +$0.202/person, 95% CI [−$0.011,+$0.415], p=.063 (inconclusive); vs strong global baseline −$0.190/person | Did not meet preregistered primary gate; exploratory |
| Academic JTPA trial randomized training offer | 5,865 holdout subjects from 9,872 immutable academic-source records | Actual risk-aware quantitative API, 2 preprogram groups | Conventional global and contextual mean argmax | Exactly $0/person, 0 policy disagreements, both groups offered training | Primary economic gate failed; historical exploratory |

### Reproducible evidence
- ZOZO: [full-data GitHub Actions experiment](https://github.com/DiogoAngelim/signal/actions/runs/43589952415).
- Hillstrom unconditional randomized economic treatment: [successful actual-source experiment](https://github.com/DiogoAngelim/signal/actions/runs/43592392744), [PR #65](https://github.com/DiogoAngelim/signal/pull/65).
- Hillstrom contextual risk-aware incremental policy: [successful actual-source experiment](https://github.com/DiogoAngelim/signal/actions/runs/43593097012), [PR #66](https://github.com/DiogoAngelim/signal/pull/66).
- Independent academic JTPA: [successful final source-integrity and balanced-covariate CI](https://github.com/DiogoAngelim/signal/actions/runs/43594614015), [PR #68](https://github.com/DiogoAngelim/signal/pull/68).
- Original Zenodo JTPA format [PR #67](https://github.com/DiogoAngelim/signal/pull/67): **source blocked**, no outcome estimate. Do not count as independent trial replication.
- Native decision abstention research [issue #64](https://github.com/DiogoAngelim/signal/issues/64) remains open; quantitative API results are not evidence that native \`evaluateDecision\` gate is useful or that it should be weakened.

## What exact evidence would finish the stronger claim

A **new trial** must randomize real eligible cases to:
1. The pre-existing baseline policy, using frozen evidence, forecasting model and operational opportunities; or
2. That **identical baseline plus Signal's decision governance** under otherwise identical conditions.

The independent observation is **real net USD benefit** minus actually measured delivery, review, compute, delay and remediation costs, together with adjudicated harm outcomes. Analyze *all assigned eligible units* (intent-to-treat), including Signal abstentions, rejected decisions and deviations. Predeclare effect size, power, minimum genuine policy-disagreement rate, harm noninferiority, stop rules and data lineage **before** assignments. Report null/negative outcomes without model retuning.

This repository contains **[the no-deployment prospective trial protocol](./prospective-signal-policy-causal-proof.md)** and **[the read-only statistical analyzer](../../scripts/validation/prospective-policy-trial-audit.mjs)**, tested only on synthetic fixtures. A green CI means the analyzer's programmed invariants executed, not that any real-world trial took place.

### Non-negotiable missing dependencies

- Approved eligible operational workflow and ethical/safety review.
- Real randomized **Signal vs conventional baseline** assignment events with immutable versions and audit logs, no correlated unit leakage.
- Demonstrably different policy decisions in a meaningful proportion of cases, without weakening zero-scale/wait safety.
- Full observation period and recorded actual outcome benefits and *all* required costs per unit.
- Enough power for preregistered practical net-utility gain and safe harm-rate upper bounds.
- External verification of experiment fidelity, accounting and statistics before claiming deployment caused an improvement.

**No Signal production code was deployed, no experiments were enrolled, no customer emails sent, and no operational database changes were made.** Using historical RCTs to test a different rule can provide causal *policy effect* estimates under randomization assumptions, but is not direct randomization of Signal software use.

Do not claim software-level incremental causal proof from an identical-action comparison (effect is exactly zero) or from treatment-vs-no-treatment RCTs where both Signal and the baseline would make the same selection.


## Additional root-cause and trial-preparation evidence (2026-11-14)

1. [**PR #70: actual native simulation veto diagnosis**](https://github.com/DiogoAngelim/signal/pull/70), [development-only CI #43595550546](https://github.com/DiogoAngelim/signal/actions/runs/43595550546). The public development-period analysis fitted on 4,261 impressions and diagnosed 2,928 other pre-holdout impressions with zero outcomes consulted. Raw coherence allowed all, and without evidence governance wisdom chose proceed/proceed-small on all, but **simulation chose wait in 2,928/2,928 cases**. With the original single-source evidence, stewardship wait and explicit governance blockers also occurred in 2,928/2,928 cases. This is a domain-adapter blocker identification, **not** an excuse to bypass safety gates or raise scores artificially.
2. [**PR #69: pre-outcome assignment-manifest reconciliation**](https://github.com/DiogoAngelim/signal/pull/69) now requires **two distinct experimental source files**: a pre-outcome randomized assignment manifest and finalized outcome records. All randomized units, arm assignments, frozen action proposals, model versions and timestamps must match. The CLI records manifest SHA-256 but **does not independently verify when the manifest was archived**: an externally authenticated append-only/notarized anchor remains mandatory before any causal-certification claim.
3. [**PR #69: pre-outcome shadow and conditional power preflight**](./shadow-policy-readiness.md), [successful synthetic-only CI #43595769883](https://github.com/DiogoAngelim/signal/actions/runs/43595769883). The offline CLI tests safe Signal allowed/scale semantics, actual proposal disagreement against a frozen conventional baseline, duplicate units, code vocabulary and conditional two-sided 80%-power sample size. It cannot infer economic outcome SD from shadow actions or verify genuine application provenance, so it **cannot** produce a causal or profit claim by itself.

**Current gate:** scientific/economic superiority of Signal remains **NOT PROVEN**. The only non-fabricated way to finish the *software-level* claim is prospective randomization of approved real policy exposure with authentic manifest custody, pre-outcome meaningful action differences, fully measured **net** utility, harm adjudication, sufficiently powered assignment, and independent statistical review. Do not use historical treatment uplift or green CI as a substitute.
