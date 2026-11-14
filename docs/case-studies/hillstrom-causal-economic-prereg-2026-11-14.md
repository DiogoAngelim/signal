# Preregistered historical randomized experiment: economic outcomes of a Signal-selected action

**Registered: 2026-11-14.** This design is fixed before this branch retrieves or examines the experiment's customer-level outcomes. The original experiment and its headline results have been public since 2008; this is a **retrospective**, not prospectively blinded, analysis.

## Scientific question and strict claim boundaries

Can the **actual** `@signal/decision` exported `evaluateQuantitativeDecision` choose an action from training-only evidence whose causal effect on **observed gross USD spending** is positive and economically material versus the explicitly named **no-email** action, as assessed on an independent randomized customer holdout?

The experiment **does not** randomize people to "Signal" vs "not Signal." It randomizes real-world **email treatments**. It can establish the causal effect of the selected treatment on observed spend, but **cannot** establish that Signal itself is responsible for incremental gains over an equally informed conventional decision maker. We will explicitly compare Signal's selection to training-data argmax, which is expected to be algebraically identical. The experimental integration is the **opt-in quantitative API**, **not** the legacy `evaluateDecision` heuristic; previously discovered 100% abstention remains unresolved.

## Existing published real-world data

- Origin: Kevin Hillstrom, MineThatData E-Mail Analytics and Data Mining Challenge, 20 March 2008, https://blog.minethatdata.com/2008/03/minethatdata-e-mail-analytics-and-data.html.
- Full existing dataset, **64,000 customers**, three independently randomized arms: `No E-Mail`, `Mens E-Mail`, and `Womens E-Mail`. Two-week post-treatment outcomes: `visit`, `conversion`, and **observed `spend` USD** (including zero for non-purchasers). Historical covariates are pre-treatment.
- Source bytes must have SHA-256 **`0e5893329d8b93cefecc571777672028290ab69865718020c78c7284f291aece`**, consistent with public mirrored source provenance. Attempt a historical immutable GitHub mirror at `W-Tran/uplift-modelling` commit `0b9b1787a33a0f67bd66dda6910b08fa67c1564d`, then publisher URL if necessary; **reject** unexpected bytes and do not auto-switch to another dataset.
- Source is publicly released for analysis; no known explicit general redistribution license. Download into ephemeral CI memory, do not commit or publish raw customer rows, even if de-identified.
- Exact fields expected: `recency, history_segment, history, mens, womens, zip_code, newbie, channel, segment, visit, conversion, spend`; case-normalize headers only, never use outcomes as policy features.
- Reject wrong hash, row count, unexpected treatment values, missing or invalid data, negative spend, or malformed CSV. Source raw checksum independent of this repository.

## Frozen partition and decision rule (before individual labels)

- Preserve original published row order as input; derive an independent **record-index hash** `SHA256("signal-hillstrom-20261114-v1:" + zero-based rowIndex)`; take first 8 hexadecimal digits as an unsigned integer over (2^{32}).
- **Train** if value is <0.4, otherwise **test**. Target ~25,600 training and ~38,400 test customers, each with ~1/3 randomized to every arm. No exclusion or cohort selection using outcomes.
- Training inputs to Signal are the **three unconditional average observed gross spending values per customer** for three fixed actions. Construct a single state `training_cohort` with probability 1, one payoff per action equal to the training-only arm mean USD spend, explicit `No E-Mail` action, **upfront costs 0** (because the source does not contain mail cost nor product margins), `probabilityEvidence=estimated`, `riskPolicy: { tailMass:1, downsidePenalty:0 }`. Use `evaluateQuantitativeDecision` exactly as released; do not monkeypatch gate, ranker, utilities or tests.
- If Signal recommends `No E-Mail`, report null benefit and **fail the positive-action proof**. If its output differs from independently calculated training argmax, fail integrity.
- Explicit comparators: (a) `No E-Mail` no-action reference; (b) unconditional equal-probability random arm mixture; (c) **best conventional arm chosen by identical training argmax** (expected to match Signal exactly). The third comparator rules out any unjustified unique-Signal advantage claims.

## Primary causal estimator and success gate

The randomized intent-to-treat contrast **on test customers only** is
[
\Delta_{\$} = E[Y_{spend}\mid A=\pi_{train}] - E[Y_{spend}\mid A=No\ Email].
]

Because customers were experimentally assigned to real email/no-email treatments and the selected arm is frozen independently on train, test-arm differences in mean are unbiased under standard SUTVA, randomization and outcome-completeness assumptions. No missing per-person counterfactual is invented. The experimental unit is **one customer**, not repeated impressions.

- Primary uncertainty: Welch unequal-variance mean difference with 95% two-sided normal large-sample interval and two-sided p-value (report per-arm sample sizes, SD, spend totals, test revenue per customer).
- Robustness: fixed-seed (`20261114`) **2,000 stratified by original randomized arm** percentile bootstrap replications for spend difference. Require bootstrap lower bound >0 as a prespecified robustness check.
- Pass **historically demonstrated positive and economically material gross-spend causal effect of the selected action vs no action** only if (i) the chosen action is an email; (ii) primary p < 0.05 and 95% lower bound >0; (iii) estimated lift >= **$0.25 per customer** and 95% **lower bound >$0.10 per customer**; (iv) bootstrap lower bound >0; (v) no source or randomization integrity failure. These monetary cutoffs are **prespecified research significance thresholds**, not observed actual mailing costs.
- No fixed sample-size-based early stop, no post-hoc subgroup selection, no exclusion of zero-spend customers, no one-sided significance tests, no unplanned multiplicity.
- Secondary and explicitly non-confirmatory: conversion and visit differences, selected-vs-randomized 1/3 mixture, selected-vs-other-email, gross revenue per 1,000 customers, and source-arm counts.

## Economic interpretation: measured and unmeasured

- **Actually measured:** two-week **gross retail `spend` USD per customer**, not profit, sales margin, return on advertising spend or Signal revenue.
- **Illustrative only:** gross-profit contribution under margin `m=0.35` and send cost `c=$0.02`: (m\Delta_{\$} - c) USD per customer. Sensitivity at margins 0.20/0.35/0.50 and per-email costs $0/$0.02/$0.10. The data do **not** identify `m` or `c`. Report break-even cost (m\Delta_{\$}), with uncertainty.
- A positive spend effect qualifies as economic evidence of **sales**, but cannot support a **verified net-profit** claim until actual margins, opportunity cost, deliverability and sending costs are known.

## Additional validity and operational limitations

- Count/check all three treatment groups, randomized assignment balance (treatment counts, pre-period `history, recency, mens, womens, newbie` mean standardized differences), no missing/censored labels as represented in the CSV.
- No timestamp or customer identifier is provided: cannot examine time-series shifts, repeated-customer clusters or contemporaneous transportability; assume each published row is a unique experimental unit as described by the publisher. Randomized trial was historical (2008).
- The selected action is **not executed by Signal**; this is an independently observed prior randomized trial used to evaluate an offline Signal-derived decision. We cannot conclude an actual Signal deployment caused new 2026 outcomes or that Signal improves over the same mean-comparison calculation without Signal.
- Source has externally recorded results but no independent transaction-level audit; data are publisher-supplied anonymized research records.
- No connections to Neon, Workbench, Vercel, production, customer credentials or live email sending. No publication of dataset rows. All evidence artifacts aggregate-only.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm --filter @signal/decision build
node scripts/validation/hillstrom-causal-economic.mjs --self-test
node scripts/validation/hillstrom-causal-economic.mjs
```

Evidence destination: `artifacts/validation/hillstrom-causal-economic-report.json`. This report must mark distinct claims **HISTORICAL_TREATMENT_CAUSAL_LIFT** and **NO_INCREMENTAL_SIGNAL_CAUSAL_ATTRIBUTION** explicitly, without conflating them.
