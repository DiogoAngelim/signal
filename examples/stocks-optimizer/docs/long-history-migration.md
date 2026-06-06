# Long-History Migration Notes

## Data Contract

`tradingview-data` JSON responses should include:

- `bars`: daily OHLCV candles, optionally with `regime` and `regimeConfidence`
- `coverage`: `HistoryCoverage`
- `audit`: `CandleAudit`
- `regimes`: regime segments
- `regimeStats`: derived regime metadata when available

CSV responses remain supported. If metadata is absent, `stocks-optimizer` derives coverage, audit, and regime statistics locally.

## Environment Defaults

- `STOCK_BACKTEST_HISTORY_BARS`: defaults to `3780`
- `STOCK_BACKTEST_LOOKBACK_YEARS`: defaults to `15`
- `TRADINGVIEW_HISTORY_CACHE_TTL_MS`: caches `HistoricalDataset` responses

## Release Checklist

- Verify `summary.historyDiagnostics` is present.
- Verify dashboard renders History Coverage, Regime Coverage, History Depth, Regime Diversity, and Coverage Status.
- Verify `robustnessDiagnostics` contains `historyDepthScore`, `regimeCoverageScore`, `sampleDiversityScore`, and `regimeDiversityScore`.
- Verify high history scores may raise trust, calibration, discovery confidence, and recognition recurrence.
- Verify high history scores do not clear Survival Memory, proof lanes, governance locks, or sizing caps.
