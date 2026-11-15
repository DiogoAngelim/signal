# Verification record - 2026-11-15

## Source-level and CI evidence

At Signal branch revision `9fc87e19a45d486714bc6a77f79a814049de8553`, workflow run `43768780477` executed 33 tests with 33 passing, zero skipped and zero failed. Actual pinned Signal runtime and isotonic-calibration source built successfully. The existing Stocks Optimizer API workflow `43768780467` and Signal quality workflow `43768780492` also succeeded. Later documentation/test additions must be judged by their own final commit checks.

The new suite covers causal indicators, chronological purging, deterministic ML, calibration split separation, cost accounting, fair buy-and-hold benchmarking, failure gates, analytic MPT agreement, 100 deterministic allocation property trials, invalid covariance, cash flows, exact lot rounding, stale/reconciliation guards, durable restart/idempotency, order-POST uncertainty, permission revocation before submission, HTTP scopes and tenant isolation.

Coverage at that revision was 85.52% line / 83.49% branch for instrumented non-bundled files. This is NOT complete verification: service startup, live providers and operational paths require further deployment/integration evidence. Vendor bundles and tests are excluded from the coverage denominator; full imported Signal behavior has its own repository test suite.

## Actual market experiment: rejected

The read-only public-data probe retrieved 2500 BTCUSDT daily bars with three requests and searched 12 preregistered candidates. The selected configuration `ml-mixed-f16-l1` was tested on 343 untouched daily observations. It made zero final-test trades, returned 0%, and failed six promotion gates. Its exposure-matched buy-and-hold sleeve returned approximately -7.12494%, but remaining in cash in a falling market is NOT proof of predictive alpha. Its calibration Brier score did not improve the constant baseline. It was not promoted. The exact aggregate result, hashes, partitions and failed gates are in `evidence/2026-11-15-btcusdt-probe.json` and the CI job log.

No parameter changes were made to rescue that winner after observing this final-test result. Re-running the identical CI probe verifies reproducibility, not a second independent holdout. Future model work must use genuinely new untouched evaluation data and account for the research search history.

## Not proven or enabled

No real strategy is certified for live deployment by this work. No newly frozen model has accrued the required prospective period. No user account credentials, actual risk/goal profile, live account reconciliation, exchange testnet fills, production data-service deployment, backup restore drill or end-to-end production signal delivery was verified. No live order was placed. Trading remains default-paper and gated.

The companion tradingview-data branch removes suspicious pre-existing obfuscated executable source and includes its own security finding report. A code fix does not establish that prior hosts or credentials were unaffected; operator investigation is required before clearing live operation.

The verified free automation source is Binance Spot only; global equities, long intraday archives, corporate actions, cross-currency multi-account accounting and HA deployment are not complete. The MPT certificate applies to the stated estimated convex objective, not future investment outcomes. These limits are recorded rather than scored away as hypothetical maximum expert ratings.
