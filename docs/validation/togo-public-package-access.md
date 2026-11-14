# Independent real randomized monetary policy validation — 2026-11-14

**Verdict: positive causal NET PROFIT attributable to Signal software is NOT established.** No Workbench records, assessment or deployment were involved.

## Two independent data-access attempts

**Togo firm-profit study (World Bank).** The 2025 public World Bank reproducibility catalog [PP_TGO_2025_272](https://reproducibility.worldbank.org/catalog/237/related-materials) and its [README](https://reproducibility.worldbank.org/catalog/237/download/686/README.pdf) describe a 1,500-firm genuinely randomized trial with real business-profit outcomes and anonymized Stata microdata. However, the three publicly advertised ZIP paths returned **HTTP 500** from a GitHub Actions Ubuntu runner on **2026-11-14**, even without cookies or authentication. The temporary probes were deleted. **No Togo microdata were obtained, no Togo firm-level profit experiment was run, and no Togo software effect was identified.** The HTTP 500 status may be transient.

**Independent fallback — Karlan & List (2007) matching-grant campaign RCT.** Published [American Economic Review article](https://www.aeaweb.org/articles?id=10.1257/aer.97.5.1774). True randomized dollar donations, but **not business profit**. We obtained the existing public research copy as **unmodified historical individual-level RCT source** directly from the fixed GitHub commit of [rsm-kvootla/ABTest-DonationStrategy-KarlanList](https://github.com/rsm-kvootla/ABTest-DonationStrategy-KarlanList/tree/c0e2e8211a57d18239c7017dd57f7f57ef73becd), read only inside GitHub Actions, with no raw data artifacts uploaded. Cite original Karlan & List 2007 in any downstream publication and independently review original replication provenance before making external claims.

- Source commit: `c0e2e8211a57d18239c7017dd57f7f57ef73becd`.
- Source `statadata.csv` SHA-256: `9cfcee8260889663456b8bdec122b737d16fc746dc05a54a9b46d1821c32d18d`.
- Independently reproduced original arm counts: **50,083 donors**, **16,687 no-matching-offer controls**, **33,396 matching-offer assignments**. Source has real `amount` donated in USD and pre-treatment donor history.
- Code: [`karlan-real-donation-policy.mjs`](../../scripts/validation/karlan-real-donation-policy.mjs). It executes the actual built and published `evaluateQuantitativeDecision` Signal library API. A fail-closed RFC 4180 parser handles the original quoted CSV correctly; raw source checksum verified exactly.
- Fixed 60/40 SHA-256 row-index split (not tuned to outcomes): **30,020 training donors** and **20,063 held-out donors**. Twelve predetermined pre-period context cells use highest previous gift, donor frequency and dormancy. Fixed train-only 100-equivalent pseudo-observation shrinkage. No held-out outcomes are used in policy fitting.
- Primary benchmark: equally informed conventional risk optimizer with **exact same predicted state distributions, objective, CVaR tail mass 0.1 and downside penalty 0.5**, independently recomputed and asserted to match Signal. Secondary: conventional risk-neutral expected-dollar receipt maximizer using the same forecast inputs. A policy comparison to original experimental 2:1 offer allocation is exploratory only.
- Logged assignment propensity `P(match)=2/3, P(control)=1/3`. Action policy values estimated by inverse-probability-weighted real donor receipts, donor-level paired bootstrap (1,000 fixed-seed replicates). Outcome is **USD donation RECEIPTS per mailed randomized donor**, not net charity or firm profit.
- Cohort status: 50,083 true RCT donor units; no historical Signal software assignments, no observed Signal compute/review costs, no independently reconciled per-donor matching grant expenditures, no original mail-cost ledger.

## Measured result (genuine, held-out donor USD)

| Frozen comparison | Difference in observed donor receipts, USD/donor | Paired 95% bootstrap interval |
| --- | ---: | ---: |
| Signal quantitative advice − equally informed conventional risk optimizer | **$0.000000** | **[$0, $0]** |
| Signal quantitative advice − same-information conventional risk-neutral optimizer | **$0.000000** | **[$0, $0]** |
| Signal quantitative advice − original randomized 2:1 logging campaign | **−$0.090497** | **[−$0.195120, +$0.026816]** |

The degenerate `[$0,$0]` intervals arise because **the policies selected identical actions given identical models**, not because future software economic equivalence was precisely established. The third interval includes zero: there is **no statistically confirmed favorable Signal-versus-random logging effect**.

The original two randomization arms both received fundraising solicitations; the treated arm featured a matching-grant offer. A donor's observed `amount` is not net contribution after all program/sponsor, payment, solicitation and software costs. The dataset lacks those full ledgers. **Do not rebrand a dollar-donation result as realized net-profit.**

**GitHub Actions completed real-run evidence:** [#43604219580](https://github.com/DiogoAngelim/signal/actions/runs/43604219580) (the exact original real-run artifact is `karlan-real-donation-policy-aggregate`; no raw donor data were uploaded). The aggregate output includes both directly computed Signal decisions and independent, equal-input conventional comparators.

## Logical and causal attribution boundaries

- The historical RCT randomized the **matching-grant solicitation**, not **adoption of Signal software**. A positive observed treatment effect could validate a historical *policy* under consistency, positivity and logging integrity, but not a causal software adoption effect.
- Mathematical equivalence: if conventional optimization and Signal maximize the same fully specified expected objective on identical feasible actions with identical states/payoffs and constraints, the same action will be optimal. Improved decision performance requires extra verified information, better calibrated decision models, measurable lower decision process costs, evidence-gating value, or different human responses. The quantitative engine itself implements the ordinary objective and cannot create extra net economic value merely by calling an algorithm Signal.
- The native `evaluateDecision` safety/evidence gate is **not** evaluated here because the 2005 solicitation dataset lacks the required provenance, source verification, and real-world authorization metadata. Do **not** manufacture gate input fields to force action permission.
- The original paper and this study's historical outcomes were available when the analysis was designed. This test therefore remains exploratory and does not provide a prospective preregistered evaluation.
- Publication requirement: do not claim `VERIFIED_INCREMENTAL_SIGNAL_CAUSAL_NET_PROFIT=true`; it remains `false`. The ideal next step is a small, fully approved real decision-support randomized deployment with actual audited net receipts and costs, or a genuine independent matched profit RCT with licensed microdata and source-authenticated input variables; a historical policy test alone cannot prove software deployment causality.

**Reproducibility note:** Source is fixed by Git commit and byte SHA; code is fixed by this PR, and the CI workflow checks archive provenance and version-pinned outcome files. A rerun must not change training policies, segmentation, primary comparator, costs or hyperparameters in response to this held-out result.
