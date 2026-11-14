# Proposed real-world causal pilot: Workbench acquisition prioritization

**Prepared:** 2026-11-14. **Status:** candidate protocol only; no owners/cases enrolled, no database access, no deployment. **Not preregistered for an actual experiment yet**: power, economics, ethical review, source authenticity and current baseline volume must first be established.

## Why Workbench and what is verified

Workbench's current private acquisition engine already records owner-scoped commercial opportunities and approved evidence, opportunity scores, sales activities/hours, outcomes and an append-only USD cash receipt/reversal ledger. The read-only attribution endpoint \`GET /api/acquisition/attribution\` produces an **opportunity-level**, not independently audited portfolio-level, view. Its AOS score withholds results before **10 terminal opportunities, 3 paid relationships and 90 observation days**. These are maturity floors, **not statistical power requirements**.

Workbench presently uses a pinned in-process Signal 0.2.0 package to assess evidence/governance during commercial assessment, while **Workbench owns expected-value economics, authorization, and the human's final decision**. Signal's signed publisher/poller and Workbench outcome-export integration are still not configured and end-to-end validated. Workbench [integration assessment](https://github.com/DiogoAngelim/workbench/blob/main/docs/integrations/signal/ASSESSMENT.md), [private acquisition operating contract](https://github.com/DiogoAngelim/workbench/blob/main/docs/private-acquisition-engine.md), and [event v2 contract](https://github.com/DiogoAngelim/workbench/blob/main/docs/integrations/signal/EVENT-CONTRACT-v2.md) are the sources for these facts.

**Critical:** The usual baseline **already includes Signal evidence checks**. An ethical trial must **not disable existing hard governance to simulate a no-Signal control**. The defensible experiment is the **incremental value of an additional Signal-governed economic advisory workflow** versus the existing production assessment, *not* the causal value of Signal relative to a never-Signal business.

## Specific, low-risk proposed treatment

**Use case:** prioritize a consented, owner-reviewed next research or follow-up action for a professionally verified potential agency partnership/direct-client relationship. The proposed actions are \`investigate\`, \`monitor\`, and \`request_human_review\`. No autonomous outreach, email sending, price quotation, job application, contractual commitment, or financial transfer is allowed.

- **Control:** current Workbench acquisition OQS/commercial expected value, existing evidence governance/hard-stops, and human approval. Display current advisory only.
- **Treatment:** the **same** current Workbench assessment, same evidence, budgets and hard-stops, with an additional opt-in Signal \`evaluateQuantitativeDecision\` advice panel (explicit \`wait\` action, expected 90-day **net** USD contribution, uncertainty scenario probabilities and explicit model costs) and the **unchanged** Signal \`evaluateDecision\` decision gate. Proposals failing permission remain wait, reduced scale is not promoted to a full action. The owner may disregard recommendations; all randomized assignments stay in intent-to-treat.
- Freeze the quantitative model/forecasts, risk preference, evidence quality mapping, approval requirements, forecast calibration and exact code SHA **before** randomization. Purely cosmetic changes may not affect decision inputs. The model is still not source-certified by a passing CI job.

The treatment is **visibility of extra software advice** on a single eligible owner decision, with no autonomous actuation; any observed effect estimates this *additional decision-support interface and workflow*, not a universal autonomous Signal decision engine.

## Unit of randomization and interference

Randomize **stable company relationship/account IDs** 50/50 and assign all of a relationship's opportunities, contacts, drafts, calls and subsequent activities to the same arm. Do not randomize several opportunities belonging to one company independently. Use a keyed pseudonymous identifier derived by a trusted server, keep raw identifiers solely inside Workbench. Exclude ineligible opportunities only **before** random assignment according to a frozen definition. Require immutable assignment records, pre-outcome parallel proposals and separate signed/externally timestamped assignment manifest from [the trial audit](https://github.com/DiogoAngelim/signal/blob/validation/prospective-causal-proof-gate-20261114/docs/validation/prospective-signal-policy-causal-proof.md).

**Treatment exposure audit:** record that the owner actually *saw* the additional recommendation or explicitly skipped it, but keep all assigned cases in ITT including no-op, Signal waiting, vetoes, rejected action drafts and incomplete pipelines. Eligibility and action opportunities must be identical across arms.

## Primary economic outcome and source-of-truth reconciliation

**Candidate estimand:** treatment assignment minus control assignment in *realized, reconciled 90-day USD net collected contribution per randomized company relationship*, with a prespecified single observation window measured from the first eligible decision. Across any additional opportunities belonging to the randomized company, aggregate once per relationship to avoid double counting. Use one canonical company key for company-parent hierarchies that could contaminate across arms.

Measured outcome components per relationship:

1. **Collected USD**: verified net cash receipts minus actual cash reversals **as of the 90-day cutoff**, from the immutable receipt ledger; a true zero requires confirming the absence of receipts in the complete ledger, not a blank field.
2. **Delivery and direct costs in USD**: actual cost records attributable to these receipts, not forecast budgets.
3. **Commercial time cost**: documented sales and follow-up hours × a pre-approved USD hourly opportunity-cost rate; owner-recorded hours alone are insufficient to establish the value of time.
4. **Delivery time cost**: documented delivery hours × an owner-approved USD rate only if not double-counted in direct delivery costs.
5. **Extra Signal/AI cost, research/review cost, delay cost, and remediation/harm cost**: measured or documented as verified zero for every unit according to an audited unit-economics policy. Never impute missing values as 0.

The estimand must not equate a \`won\` status, signed proposal or gross contract value with cash or realized profit. Receipt snapshots are mutable over time as refunds occur; keep the **as-of cutoff ledger reconstruction**, immutable event IDs and audit trail. No post-hoc revenue allocation. If there is not sufficient evidence for hours, margin, attribution, FX denomination or cost completeness, the primary outcome is **not available** and the trial must not declare success.

**Currency caveat:** Workbench's acquisition cash and opportunity ledgers are USD-only, but its revenue targets can be BRL. Migration backfills may label older numeric entries USD **without FX conversion**. An independent owner/source reconciliation must confirm every historical amount's source denomination before any baseline variance/power estimate. Do not convert BRL targets into "collected USD" implicitly.

## Scientific integrity and feasibility gates (not yet met)

The preparatory phase is **shadow-only** with no changes in contacts or budget. Capture genuine pre-outcome proposals from the **actual** Workbench and Signal engines; count action disagreement, deny/veto, unimplemented reduced scale, evidence sources, and missing economics. Never increase ordinal scores to overcome native wait. Then:
- Obtain actual, source-reconciled **baseline-only** net-contribution variance and count of **independent** company relationships. The acquisition AOS minimum (10 terminal, 3 paid, 90 days) is not remotely a substitute for the larger 80%-powered trial sample.
- Precommit practical positive USD ITT gain, acceptable incremental harm, sample size, duration, stopping rules, randomization integrity, consent/privacy/security approval, and allowed experiment UI exposure.
- Use an independent assignment service/log with tamper-evident external manifest custody; log both proposals before treatment visibility changes the owner's decisions.
- Compare ITT including all randomized relationships (not only won or contacted cases), and require **both** statistical significance and lower confidence bound above a genuinely economically material positive threshold.
- Preserve the stronger controls in both arms: contact verification, opt-out suppression, owner-approved sends, proposal/scope/contract approval, tenant authorization, evidence governance, audit trails.

## Implemented vs missing

**Implemented as code/tests:** [Signal risk-aware + actual native gate shadow replay](../../scripts/validation/economic-shadow-authorization.mjs); [generic pre-outcome shadow feasibility](https://github.com/DiogoAngelim/signal/blob/validation/prospective-causal-proof-gate-20261114/scripts/validation/shadow-policy-readiness.mjs); [manifest-based prospective auditor](https://github.com/DiogoAngelim/signal/blob/validation/prospective-causal-proof-gate-20261114/scripts/validation/prospective-policy-trial-audit.mjs). These are not yet integrated with Workbench real traffic.

**Missing:** independently source-authenticated Workbench shadow events, approval of a real owner pilot, baseline monetary variance, full attribution/cost accounting, deployment-validated Signal connector, prospective randomized assignment and 90-day complete outcomes. Current branch intentionally does not touch the Workbench repository, call its APIs, read a database, perform outreach, alter Signal safety rules, or deploy anything.

**Verdict today: candidate selected; empirical incremental net-profit effect NOT PROVEN.** A negative pilot is a valid finding, not a reason to retune on experimental outcomes.
