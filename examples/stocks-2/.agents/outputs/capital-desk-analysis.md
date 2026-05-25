# Stocks Capital Desk — Capital Allocation Analysis
**Evaluation Date:** May 22, 2026  
**Current Decision:** DO NOT TRADE  
**Confidence Score:** 41.2 / 100  
**Lifecycle Mode:** Warmup (214 closed trades, maturity score 41.2%)

---

## Executive Summary

The model is **not ready for capital deployment**. Of 12 activation conditions required to flip the decision to "Trade", **8 are unmet** — spanning every dimension of the framework: performance, risk controls, model trust, and data pipeline completeness. The two most critical blockers are a Sharpe Ratio of 0.68 (needs ≥ 1.00) and a Win Rate of 47.3% (needs ≥ 52%). Both are trending downward. Combined with a Backtest/Live Drift of 12.4% — 55% above the 8% ceiling — the model is currently demonstrating meaningful overfit to historical data, which explains the confidence collapse in live conditions.

The three conditions already met (Data Coverage 94.1%, Signal Correlation 0.71, Beta vs SPY 0.89) provide a solid infrastructure and market-neutrality foundation. The path to activation is not structural — the data pipeline works, the signals are correlated, and market exposure is controlled. The gap is in model generalization and raw per-trade edge.

---

## Section 1: Performance Analysis

| Metric | Current | Required | Gap | Trend |
|---|---|---|---|---|
| Sharpe Ratio | 0.68 | ≥ 1.00 | −0.32 | ↓ Down |
| Win Rate | 47.3% | ≥ 52% | −4.7pp | ↓ Down |
| Avg Return / Trade | 0.31% | ≥ 0.25% | +0.06pp | → Flat |
| Profit Factor | 1.12 | ≥ 1.30 | −0.18 | → Flat |
| Annualised Return | 8.4% | ≥ 12% | −3.6pp | ↑ Up |

### Key Finding: Signal Profitability Exists, But Inconsistently Captured

The Avg Return / Trade of 0.31% clears its threshold — the model is finding real per-trade edge. However, that edge is being **captured on fewer than half of all trades** (Win Rate 47.3%). This combination is the signature of a high-variance strategy: when it wins, it wins meaningfully; when it loses, it loses enough to drag the overall Sharpe below acceptable levels.

The Profit Factor of 1.12 confirms this: for every $1.12 of gross profit, the model is generating $1.00 of gross loss. That's a thin buffer — any deterioration in the win/loss ratio flips the model to net-negative. The 1.30 threshold requires the model to increase its profit-per-loss ratio by ~16%.

**The Annualised Return trend (↑) is the only bright spot in performance** — it suggests the model is finding more edge per unit of time in recent history. If this improvement persists and translates into more consistent win capture, the Profit Factor and Win Rate may recover.

### Implication

The performance block is not a data or infrastructure problem — it is a strategy refinement problem. The signal exists (Avg Return / Trade passes). The challenge is increasing the consistency of activation and reducing losing trade size.

---

## Section 2: Risk Analysis

| Metric | Current | Required | Gap | Trend |
|---|---|---|---|---|
| Max Drawdown | −18.7% | ≥ −15% | −3.7pp | ↓ Worsening |
| Volatility (Ann.) | 22.4% | ≤ 20% | +2.4pp | ↑ Rising |
| VaR 95% (1-day) | −2.1% | ≥ −2.5% | +0.4pp | → Flat |
| Calmar Ratio | 0.45 | ≥ 0.60 | −0.15 | ↓ Down |
| Beta vs SPY | 0.89 | ≤ 1.10 | — | → Pass |

### Key Finding: Risk Envelope Is Too Wide and Expanding

The model is carrying 3.7 percentage points more drawdown than the mandate allows, and annualised volatility is running 2.4pp above ceiling — and **both are moving in the wrong direction**. Drawdown is worsening; volatility is rising. This is not a transient spike — it is a directional deterioration.

The Calmar Ratio of 0.45 (required ≥ 0.60) captures the compounded effect: the model is not generating enough return per unit of drawdown endured. At 0.45, an investor suffers $1 of maximum drawdown for every $0.45 of annual return. The threshold requires that ratio to improve by 33%.

The one green signal here is **Beta vs SPY at 0.89** — well within the ≤ 1.10 limit. The strategy is not amplifying broad market risk, which means the volatility problem is idiosyncratic (strategy-specific), not systemic. That is an important distinction: the risk excess can be addressed through position sizing and signal filtering, without restructuring the market exposure model.

**VaR is close to threshold** (−2.1% vs required ≥ −2.5%) — this metric could pass with relatively small improvements. It is the easiest risk condition to close.

### Implication

Two levers are available without retraining the model: (1) **tighter position sizing** to cap max drawdown and volatility, and (2) **trade filtering** to avoid entering positions where the model has historically over-extended. The market exposure foundation (Beta) does not need to change.

---

## Section 3: Data Quality Analysis

| Metric | Current | Required | Gap | Status |
|---|---|---|---|---|
| Coverage | 94.1% | ≥ 90% | +4.1pp | ✅ Pass |
| Staleness (avg hrs) | 0.4h | ≤ 2.0h | −1.6h | ✅ Pass |
| Feature Completeness | 88.6% | ≥ 90% | −1.4pp | ⚠️ Warn |
| Outlier Rate | 1.8% | ≤ 3% | −1.2pp | ✅ Pass |

### Key Finding: Pipeline Is Healthy — One Small Gap Remains

Data quality is the strongest category in this evaluation. Three of four metrics pass comfortably, and the pipeline shows genuine operational maturity: data is fresh (0.4h average staleness vs 2.0h ceiling), coverage is solid at 94.1%, and the outlier rate of 1.8% is well within acceptable bounds.

The only shortfall is **Feature Completeness at 88.6%** — 1.4 percentage points below the 90% requirement. This means approximately 11.4% of expected features are absent during model evaluation. In a dense signal model, missing features are not neutral — they force the model to make predictions on incomplete inputs, which can systematically degrade prediction quality in exactly the conditions where those features are most informative (e.g., volatility regimes, sector rotations).

**This is the most actionable gap in the entire report.** A 1.4pp improvement in feature completeness requires identifying which features are missing and resolving the upstream data gaps — an infrastructure task, not a model retraining task. It is likely achievable in days to weeks, not months.

### Implication

Close the Feature Completeness gap first. At 1.4pp from threshold, it is the lowest-cost condition to satisfy. Doing so will also potentially improve Model Trust metrics (OOS Accuracy, Drift) by giving the model complete inputs during live inference.

---

## Section 4: Model Trust Analysis

| Metric | Current | Required | Gap | Trend |
|---|---|---|---|---|
| OOS Accuracy | 53.1% | ≥ 57% | −3.9pp | ↓ Down |
| Backtest / Live Drift | 12.4% | ≤ 8% | +4.4pp | ↑ Rising |
| Signal Correlation | 0.71 | ≥ 0.65 | +0.06 | → Pass |
| Model Age (days) | 47d | ≤ 60d | −13d | ↑ Aging |
| Confidence Score | 41.2% | ≥ 55% | −13.8pp | ↓ Down |

### Key Finding: Backtest/Live Drift Is the Root Cause Indicator

The Backtest/Live Drift of 12.4% is the most diagnostic metric in this evaluation. It measures the divergence between what the model predicted in backtesting vs. what it has delivered in live trading. At 12.4% — 55% above the 8% ceiling — the model is experiencing **significant generalization failure**: the patterns it learned historically are not fully replicating in live market conditions.

This explains why OOS Accuracy is declining (↓): the model's out-of-sample predictions are degrading as live data diverges from the training distribution. It also explains the falling Confidence Score (41.2%, trending ↓) — the aggregate framework is correctly penalizing a model showing increasing live-vs-backtest divergence.

**Signal Correlation at 0.71** (threshold ≥ 0.65) is the counter-signal: the raw signals still carry genuine predictive information. The problem is not that the signals are wrong — it is that the model's use of those signals has been over-fitted to historical regimes that no longer fully apply.

**Model Age of 47 days** — within limit but approaching relevance. At 47 of 60 allowed days, the model has 13 days before aging becomes a blocker. If drift is not addressed before the 60-day mark, model age will add a new activation failure.

### Implication

The drift problem requires model recalibration — specifically, re-fitting the model's weighting of signals to current market conditions. This is the highest-effort item on the path to activation. However, because Signal Correlation passes (signals are valid), the recalibration does not require rebuilding the signal library — only reweighting how those signals are combined.

---

## Section 5: Path to Activation — Prioritised Remediation Plan

To flip the decision from "Do Not Trade" to "Trade", all 8 unmet conditions must be satisfied. The following prioritisation is based on effort-to-impact ratio and directional momentum.

### Tier 1: Infrastructure Fixes (Days to Weeks, No Model Retraining)

| # | Action | Closes Condition | Effort |
|---|---|---|---|
| 1 | Identify and resolve missing feature upstream data gaps | Feature Completeness ≥ 90% | Low |
| 2 | Apply tighter position sizing (reduce max exposure per trade) | Volatility ≤ 20%, Max Drawdown ≥ −15%, Calmar ≥ 0.60 | Low-Medium |
| 3 | Implement trade-level VaR filter (skip trades with predicted VaR > threshold) | VaR passes cleanly | Low |

**Why first:** These actions do not require retraining the model and can be deployed as wrappers or pre-trade filters on the existing system. Position sizing alone could close three risk conditions simultaneously.

### Tier 2: Signal Strategy Refinement (Weeks, Light Retraining)

| # | Action | Closes Condition | Effort |
|---|---|---|---|
| 4 | Tune signal activation thresholds to increase win-rate consistency | Win Rate ≥ 52% | Medium |
| 5 | Add loss-limiting filters on trades with historically high dispersion | Profit Factor ≥ 1.30, Sharpe ≥ 1.00 | Medium |

**Why second:** Win rate and Sharpe improvement require changing when the model enters trades — raising the confidence bar for activation. This reduces trade frequency but increases the proportion of winning trades. This can be done without full model retraining by adjusting prediction confidence thresholds.

### Tier 3: Model Recalibration (Weeks to Months, Full Retraining)

| # | Action | Closes Condition | Effort |
|---|---|---|---|
| 6 | Recalibrate model weights to current market regime (reduce overfitting to historical patterns) | Backtest/Live Drift ≤ 8%, OOS Accuracy ≥ 57%, Confidence Score ≥ 55% | High |

**Why last:** This is the root cause of the model trust failures, but it requires the most work and carries the most risk of regression. It should be initiated in parallel with Tier 1 and Tier 2 work — but the earlier tiers may be deployable before recalibration is complete.

### Estimated Minimum Timeline to Activation

If Tier 1 and Tier 2 work proceeds in parallel with Tier 3 recalibration:

- **Weeks 1–2:** Feature completeness closed, position sizing tightened → 3–4 conditions potentially pass
- **Weeks 3–5:** Signal threshold tuning → Win Rate and Profit Factor improve
- **Weeks 4–8:** Model recalibration complete → Drift, OOS Accuracy, and Confidence Score recover
- **Target activation window:** ~6–8 weeks from now, assuming no adverse market regime shift

---

## Section 6: Risk Flags — Do Not Ignore

1. **Model Age Clock:** The model turns 60 days in approximately 13 days. If recalibration is not scheduled immediately, model age becomes a new blocker before any other conditions are fixed. **Schedule recalibration now.**

2. **Drift is Rising (↑):** The Backtest/Live Drift trend is worsening, not stabilising. Every day without recalibration widens the gap. The current 12.4% is already 4.4pp above ceiling; unchecked, it could reach 15–18% within the evaluation window.

3. **Win Rate and Sharpe Both Trending Down:** Two of the most critical activation conditions are deteriorating simultaneously. The combination — fewer winning trades AND lower risk-adjusted return — suggests the model's edge is eroding in the current market regime. This reinforces the urgency of recalibration.

4. **Profit Factor at 1.12 Has No Safety Margin:** The thinness of the profit buffer (12 cents per dollar of loss) means that any further deterioration in win rate or loss magnitude could flip the model net-negative. Active monitoring of this metric between now and recalibration is essential.

---

## Summary Scorecard

| Category | Pass | Warn | Fail | Score |
|---|---|---|---|---|
| Performance | 0 | 3 | 2 | 0/5 critical pass |
| Risk | 1 | 1 | 3 | 1/5 pass |
| Data Quality | 3 | 1 | 0 | 3/4 pass ✅ |
| Model Trust | 1 | 1 | 3 | 1/5 pass |
| **Overall** | **5** | **6** | **8** | **41.2% confidence** |

**Verdict:** Do Not Trade. Engage recalibration pipeline immediately. Prioritise feature completeness and position sizing as quick wins. Target re-evaluation in 6–8 weeks.

---

*Report generated from live terminal data — May 22, 2026 evaluation run.*
