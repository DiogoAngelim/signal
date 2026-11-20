# Verification record - 2026-11-15

## Completed operational follow-up

At Signal revision `6faed923c630b56ed5404709707cb03bba2556b7`, workflow run `43773041988` executed **59 tests: 59 passed, zero failed/skipped**. Instrumented non-bundled source coverage was **90.87% lines / 82.22% branches / 91.59% functions**. This denominator includes the added service and operational modules, unlike the original smaller suite. The earlier revision `284f97f...` had 35 tests and 85.81% line coverage; the numbers are not full-program or production verification scores.

The actual pinned Signal runtime and isotonic calibration were built and exercised. Tests now include real HTTP startup, authentication/revocation, stream shutdown, SQLite restart, a verified backup/restore drill, lease exclusion, unknown-order recovery, preserved partial fill quantities, independent post-rounding risk audits, bounded lot repair, and an end-to-end paper pipeline using the actual Signal runtime. The simulated elapsed days and generated prices in that paper fixture are explicitly NOT prospective investment-performance evidence.

The latest follow-up also fences writes inside transactions and at the final broker POST boundary, refreshes time before restart reconciliation, and preserves a paper drawdown high-water mark without requiring a trade. These additions have their own `execution-fencing.test.mjs`; judge the final head by its CI checks, not by the preceding 59-test count.

## Provider and consumer evidence

The data dependency is now pinned to reviewed tradingview-data revision `0b721f7182ce0f29c04db75b5b4f107cb88fc35d`. Associated checks completed successfully: provider contract `43773334155`, cross-service integration `43773334217`, and read-only real-provider smoke `43773334211`.

Cross-service integration started both actual service implementations, used the real pinned Signal adapter, enforced provider/user authentication and release matching, ran isolated research, and verified report persistence. Its exchange data was a controlled fixture, not real performance evidence. The private provider source was not published into this repository.

The separate real-provider smoke observed 10 actual closed BTCUSDT daily candles, three distinct public WebSocket exchange updates, and authenticated HTTP delivery of a fresh quote. At the recorded smoke run, delivered quote age was 580 ms and observation duration was 4246 ms. These are observations from that CI host, not latency/SLA guarantees or proof of the user's production deployment. Zero exchange orders were placed and no exchange account credentials were used.

## Actual strategy experiment: rejected, unchanged

The public-market research probe retrieved 2500 BTCUSDT daily bars in three requests and searched 12 predefined candidates. The selection winner `ml-mixed-f16-l1` made **zero trades** in 343 untouched final-test daily observations, returning **0%**. The exposure-matched buy-and-hold sleeve returned approximately **-7.12494%**. Cash outperforming a falling market does not establish predictive alpha.

Six promotion gates failed: adequate trading sample, positive net return, statistically supported benchmark excess, calibrated forecast, doubled-cost stress and walk-forward stability. The Brier score 0.2298978565 did not improve the 0.2288953545 constant baseline. The strategy remained unpromoted: validation false, prospective false, live trading approval false. Exact data/model hashes and partitions are in `evidence/2026-11-15-btcusdt-probe.json`. Repeating the same probe established reproducibility, not a new independent holdout.

No model or parameter change was made to rescue that known losing final test during the operational follow-up. Future strategy development needs genuinely untouched evaluation data, appropriate research-search accounting and qualifying prospective observations.

## Still not established

No real strategy or personalized portfolio policy is certified for live trading. No newly frozen production model has accrued the required real prospective period. Actual user risk/goal/cash-flow inputs, a reconciled account, exchange testnet fills, production TLS/host/volume operation and production backup restoration remain unverified. The deployment connection is not configured in this session. No production configuration or live-trading setting was enabled.

The provider branch cleaned suspicious pre-existing obfuscated executable blocks and records the affected source objects. It does not establish that old hosts/credentials were unaffected; operator investigation remains required before source/host clearance can be asserted.

Global-equity entitlements, long intraday archives, equity corporate actions, taxes, cross-currency/multi-account accounting, HA execution and a full independently evaluated personal-allocation policy remain outside the completed implementation/verification scope. The continuous MPT objective certificate and post-rounding feasibility certificate do not prove optimal future investment returns. This record does not claim zero gaps or maximum independent expert ratings.
