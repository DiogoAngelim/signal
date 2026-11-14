# Independent-only Signal validation: source access and expected-net-profit limit (2026-11-14)

**Scope change:** External partner recruitment/outreach and the live partner trial are **deferred by user request**. Do not contact a business, enroll anyone, connect Stripe or Workbench, or ask the user to recruit a trial partner unless the user explicitly reopens that scope. [Issue #80](https://github.com/DiogoAngelim/signal/issues/80) was closed **not planned**, not completed.

**Current scientific verdict:** `SIGNAL_SOFTWARE_CAUSAL_INCREMENTAL_NET_PROFIT_NOT_IDENTIFIED`.

## Real independent historical business-profit dataset — authenticated metadata, access gated

[Atkin, Khandelwal and Osman (2017), Exporting and Firm Performance](https://www.povertyactionlab.org/evaluation/improving-rug-firm-performance-through-exporting-egypt): genuine random assignment of an initial export-order opportunity to **74 of 219 Egyptian rug firms**, with **145 controls**; observed **firm profits** rather than clicks or gross donations. The original researchers found a 16–26% profit improvement for offered exporters; **this is the causal effect of export opportunities, not Signal software**.

Official replication data: [Harvard Dataverse, DOI 10.7910/DVN/QOGMVI](https://doi.org/10.7910/DVN/QOGMVI). The official metadata were fetched **successfully** on 2026-11-14 from a GitHub Actions runner:

| Authenticated official metadata field | Value |
|---|---|
| HTTP metadata status | 200 |
| Dataset file | `JPAL_3813.zip` |
| Datafile ID | `3348775` |
| Bytes | `895831` |
| Published file MD5 | `d34d30d45bbabcb5bd21eec31c89a613` |
| File `restricted` property | `false` |
| Data use | CC0 1.0, with citation |
| Dataverse guestbook ID | `269` |
| Direct datafile endpoint HTTP | **400** |
| Server-supplied reason | **"You may not download this file without the required Guestbook response for guestbookID 269."** |

**Do not bypass or invent a guestbook identity, affiliation, or contact address.** Public/unrestricted metadata and CC0 publication **do not** waive the server's required interactive guestbook response. A dataset-dependent analysis must remain blocked until the source is accessed through authorized legitimate means or an equivalently authenticated independently licensed mirror.

No original firm-level Egyptian data were downloaded. Accordingly **no Egyptian training/test policy recommendations, net-profit effect sizes, source checksums, or business claims were computed**.

A second World Bank randomized firm-profit dataset, [Belo Horizonte informal businesses](https://microdata.worldbank.org/catalog/1551/study-description), has **7,796 rows of merged survey content** with randomized treatments and firm-profit variables, but its [Get Microdata](https://microdata.worldbank.org/catalog/1551/get-microdata) page explicitly requires a **login**, even for public-use data. Its survey follow-up was incomplete; 7,796 rows are **not** 7,796 complete independently randomized observed-profit outcomes. Do not scrape, assume public access, or silently replace missing profits with zero.

Other already executed real-data results remain relevant but **not measured net business profit**: Hillstrom email experiment (real gross customer spend, identical risk-neutral actions), JTPA job-training outcomes (real earnings, identical recommendations), and Karlan–List randomized solicitation experiment (real donations, identical Signal and equally informed optimized action; `$0` observed incremental donated USD per donor). These have already falsified some initial superiority claims but do not identify prospective software causal net-profit lift.

## Next independent validation: what advantage is even mathematically possible?

The [actual published Signal quantitative API](../../packages/decision/src/quantitative-decision.ts) computes explicit expected utilities, discounts, downside risk and hard exclusions from **caller-supplied** states, probabilities and state-contingent monetary payoffs. It does not independently estimate calibrated probabilities.

For a frozen context `X` with the exact same feasible set `A(X)`, correct conditional expected net-USD payoffs `m(a,X)=E[Y(a)|X]`, and full information shared between the conventional optimizer and Signal:

```text
a*(X) = argmax over feasible a of m(a,X)
For ANY policy a_signal(X) in the same feasible set,
E[net_profit(a_signal) | X] - E[net_profit(a*) | X] <= 0.

If Signal has incremental operating cost c_signal(X) >= 0,
E[net_profit(a_signal) - c_signal | X] - E[net_profit(a*) | X] <= 0.
```

That is an exact **conditional mathematical upper bound**, not a statement that a human or a real estimated conventional policy always knows the true profit function. Real algorithmic improvements remain possible through **higher-quality previously unknown evidence, better forecast calibration, lower actual process costs, fewer execution failures, or correctly priced safety/irreversibility risks**. A risk-adjusted decision may rationally sacrifice mean expected monetary profit for improved downside safety; this is a different legitimate objective, **not automatically a net-profit improvement**.

### Executable code-compatibility falsification

`node scripts/validation/equal-information-net-profit-bound.mjs` invokes the **real** `evaluateQuantitativeDecision` API on 4,000 deterministic synthetic monetary decision models, independently calculates discounted expected net USD, lower-tail risk, feasibility, optimizer objectives, and action maxima, and requires:

- Zero action disagreements against a conventional solver using the **same risk-adjusted objective and same information**.
- Zero cases with a larger modeled expected net USD than the **risk-neutral** optimizer using the same information.
- Explicit instances where the risk-aware policy sacrifices expected mean to reduce downside risk.
- Zero causal real-world success claims despite green mathematical regression tests.

This test establishes source-code **mathematical parity on stress scenarios**, not independent probability calibration and **not observed financial causality**.

## No-contact empirical research direction

1. Stop searching for favorable datasets or interpreting a grant-training intervention's average profit lift as Signal's software effect.
2. Before another held-out test, implement and independently verify a genuine Signal-specific information-quality or execution-cost improvement that could have a measurable advantage **over a strong comparator with exactly the same raw features and action constraints**. Allow the comparator the same improved information if it can use it; the relevant comparison is deployed *end-to-end decision system* with full costs.
3. For any genuinely accessible, properly licensed historical RCT with observed **operating profit**, freeze pre-treatment features, assignment probability/strata, policies, loss constraints, prediction training and out-of-sample evaluation. Check source custody, sample attrition, intervention expenses, true profit/FX definition, cluster independence and minimum material gain.
4. A successful retrospective policy study may establish **counterfactual policy value**, if assumptions hold, but it **cannot** prove that a business historically profited from deploying software that was not actually assigned and used. Do not output `CAUSAL_SOFTWARE_NET_PROFIT_PROVEN` without a real randomized deployment or a comparably identified natural experiment.

**No partner communication, financial transaction, model threshold change, live actuation, code deployment, financial attribution inflation or fabricated data were performed.**
