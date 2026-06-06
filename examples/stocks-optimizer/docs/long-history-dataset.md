# Long-History Dataset Integration

`tradingview-data` can now return up to 15 years of daily candles with coverage, candle audit, regime segments, and regime statistics. `stocks-optimizer` consumes that as `HistoricalDataset`, `HistoryCoverage`, `CandleAudit`, and `RegimeType`.

## What Changes

- Backtests request `STOCK_BACKTEST_HISTORY_BARS=3780` and `STOCK_BACKTEST_LOOKBACK_YEARS=15` by default.
- Dataset ingestion derives and caches regime statistics per symbol, then summarizes them once per market run.
- Discovery receives `regimeCoverageScore` and long-history regime states for bull, bear, crash, recovery, and volatility transition comparisons.
- Recognition emits `historicalSimilarityConfidence` from long-history depth, regime coverage, diversity, and current-regime representation.
- Calibration and trust can receive a capped credit from stronger history while still using recency-weighted outcomes.
- Robustness diagnostics now include `historyDepthScore`, `regimeCoverageScore`, `sampleDiversityScore`, and `regimeDiversityScore`, and feed them into `overfitRisk`.
- The dashboard displays History Coverage, History Depth, Regime Coverage, Regime Diversity, and Coverage Status.

## Safety Boundary

Extended history improves intelligence, calibration, recurrence matching, trust, and overfit diagnostics.

Extended history does not:

- clear Survival Memory
- satisfy recovery proof lanes
- unlock governance locks
- restore sizing
- override recent clean outcome requirements

Sizing restoration still requires recent clean outcomes, recovery proof, and trust restoration.

## Performance

Derived regime statistics are cached by symbol, requested depth, candle count, and last candle timestamp. The market summary is computed once per backtest run and then threaded through readiness, discovery, recognition, robustness, and dashboard output. This avoids repeated recomputation across 500+ asset scans.
