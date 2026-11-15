# Verified investing backend

An opt-in, fail-closed backend for Stocks Optimizer. It is not a profit guarantee, an independent financial audit, or a claim that any strategy has passed prospective/live testing.

## What is wired

`authenticated data service -> causal indicators -> ridge/logistic training -> chronological selection -> Signal isotonic calibration -> untouched final test -> frozen strategy -> prospective shadow ledger -> personal portfolio constraints -> convex MPT -> decimal lot sizing -> explicit execution permissions -> Spot adapter`

The example API exposes this service through `/api/investing/*` when `VERIFIED_INVESTING_INTERNAL_URL` is configured. Both the standalone and serverless API use the same gateway. The persistent worker owns research isolation, SQLite evidence and streaming. Serverless functions do not pretend to own long-running research or continuous exchange sockets.

Legacy `/strategy` output is marked research-only with zero executable exposure. Obsolete strategy write actions return HTTP 410 with the new endpoint. The legacy Binance client refuses new orders; its account reads and cancellations remain available. No production deployment or account setting is changed merely by this source branch.

## Dependencies and provenance

`dependency-lock.json` identifies exact Signal runtime, protocol, ports and decision source trees from main commit `7352ff381f4809b3bb21e103f127b399782a1526`. These public source trees are snapshotted under `vendor/` and bundled by the adapter. They are not handwritten approximations of Signal. Upgrades require a reviewed snapshot update and the integration tests.

The private tradingview-data repository is NOT copied here. The HTTPS data contract is pinned to its reviewed commit `391a22050247926613412ba48beef1f67354699d`; release mismatch blocks reads. Deploy that exact revision or deliberately update and test the lock. The verified free source currently covers Binance Spot only. It does not grant automated non-display rights to global equities or the TradingView guest feed.

## Build and test

Node 22.16 or later is required (`node:sqlite` is experimental in Node 22; review runtime changes before upgrading).

From this directory:

```sh
TOOLING_DIR="$(mktemp -d)"
npm install --ignore-scripts --no-audit --no-fund --prefix "$TOOLING_DIR" esbuild@0.25.12 zod@4.1.12
VERIFIED_TOOLING_DIR="$TOOLING_DIR" node scripts/build.mjs
node --test test/*.test.mjs
```

This does not run repository bootstrap or dependency lifecycle scripts. The GitHub workflow also scans known unsafe source signatures before importing code. The scanner is not a general malware certification.

For a bounded read-only public-market experiment:

```sh
node scripts/live-research-probe.mjs
```

The probe writes `live-research-evidence.json`. A provider block or failed strategy remains explicitly failed/unavailable. It is not counted as a passing unit test. Generated test fixtures validate mathematical plumbing, not investment performance.

## Start in paper mode

Copy `config.paper.example.json` outside the repository, set an absolute persistent ledger path and your deployed data endpoint, create a high-entropy API token in your secret manager, and store only its SHA-256 digest in `apiKeys`. Set each grant's subject, scopes and expiry. Keep the private configuration file owner-readable only (`chmod 600`). Empty keys in the example authorize nobody. No credentials belong in committed JSON or frontend bundles.

```sh
export VERIFIED_INVESTING_CONFIG=/absolute/private/investing.json
# MARKET_DATA_READ_TOKEN comes from the operator's secret manager.
node src/server.mjs
```

The worker listens on loopback port 4030 by default. Place an authenticated TLS reverse proxy in front of it. Set the existing app's `VERIFIED_INVESTING_INTERNAL_URL` to the worker's HTTPS origin or loopback origin. Original user authorization is forwarded; the gateway never substitutes an admin token. Back up the ledger and verify restore before enabling non-paper operation.

## API

All endpoints require a bearer token with the matching scope. The server derives tenant identity from the token, never a body field.

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/api/investing/capabilities` | investing:read | Real configured capabilities and limitations |
| POST | `/api/investing/profile` | investing:write | Risk tolerance, horizon, reserve, goals, contributions/withdrawals |
| POST | `/api/investing/research` | investing:write | `{symbol:"BTCUSDT",timeframes:["1d"],bars:2500}` |
| GET | `/api/investing/report?id=<reportHash>` | investing:read | Exact research report and gate failures |
| GET | `/api/investing/signals?strategies=<hashes>` | investing:read | Current evidence-gated Buy/Hold/Sell analysis |
| GET | `/api/investing/stream?strategies=<hashes>` | investing:read | Authenticated SSE, up to 20 concurrent clients |
| POST | `/api/investing/plan` | investing:write | `{strategies:["frozen-strategy-hash"]}`; exact proposed quantities |
| POST | `/api/investing/execute` | investing:execute | `{planHash:"server-created-plan-hash"}`; paper or permission-gated broker |

Use authenticated fetch streaming; do not put bearer tokens in EventSource query strings. Signal streams contain analysis and blockers; the plan endpoint applies the account-specific sizing and returns quantities, limit prices, fees, target weights, cash reserve, expiry, model references and optimization certificate. Do not execute raw signal directions as orders.

## Research and statistical controls

Eleven causal features cover moving averages, momentum, RSI, MACD, Bollinger position, ATR, volatility, relative volume and breakout. Twelve preregistered configurations per timeframe combine three feature families, two fast lookbacks and two regularization strengths. The search is bounded, not a universal strategy discovery claim.

Training, selection, calibration and final-test partitions are chronological, purged and embargoed. Timeframes use common calendar boundaries; insufficient overlapping history is rejected. Three expanding-window retraining folds are confined to the selection partition. The selected model is frozen before final-test evaluation; a failure never prompts testing runner-ups until one passes. Server reports prevent reusing an already inspected final-test window for promotion.

The final gates require sample size, calendar duration, dependence-adjusted evidence, positive net return, positive lower confidence bound against a cost-adjusted exposure-matched buy-and-hold sleeve, drawdown limit, calibration quality, doubled-cost stress and walk-forward stability. Bootstrap intervals are estimates, not mathematical guarantees under every market process. Costs are explicit assumptions, not measured future fills.

The free retrieval cap is 5000 bars. Very short intervals cannot satisfy a 90-day final-test window within that cap; these fail rather than weakening statistical gates. Multi-timeframe search is not simultaneous multi-timeframe ensemble consensus. Longer intraday archival ingestion is a separate scaling requirement.

## Forward evidence is not historical evidence

Only server-observed fresh quotes emitted after strategy freezing count. Historical closed trades cannot satisfy the prospective gate. Samples mature at the declared horizon, missed outcome windows are rejected, repeated samples are deduplicated, and daily dependence clusters are used. At least 30 elapsed days, 30 observations and 30 day-clusters plus positive net evidence are required. Restarting the worker does not reset the evidence. Shadow quotes are not actual exchange fills.

A newly frozen model therefore cannot immediately receive non-paper trading permission. There is no API to fabricate past observations or set `passed=true`. A durable ledger is required. Until evidence qualifies, the public decision is HOLD with quantity zero and explicit reasons.

## Portfolio and investor constraints

The planner consumes reconciled settled cash/positions and aligns all returns to a common daily covariance grid. It excludes unsettled deposits, avoids double-counting settled contributions, reserves near-term withdrawals, observes position/exposure caps, applies a forecast volatility target and a flow-adjusted historical drawdown constraint. Goals report required growth but never increase risk to force an unrealistic target.

Shrinkage covariance and an L1 turnover penalty form a convex long-only mean-variance problem. An exact linear oracle bounds the objective gap for that stated model. This is not proof of optimal future returns. Expected-return uncertainty, future covariance changes, liquidity and lot rounding limit the interpretation.

Quantities use eight-decimal BigInt arithmetic and round down to exchange lot sizes; orders below minimums become HOLD, never inflated purchases. Buys use currently settled cash, not anticipated sales. Re-plan after confirmed fills. Unvalued holdings, unsupported currencies, unresolved orders or stale data block the plan instead of silently ignoring risk. Increases are restricted to validated entry windows and directional Buy signals.

## Optional autonomous mode

Paper is the default. Testnet/live modes require server-side credentials, explicit expiring owner-bound permissions, reviewed source/host clearance, kill-switch clearance, a symbol allowlist, notional limits, fee ceiling, fresh account/flow reconciliation, matching profile/account/plan hashes and independently mature prospective evidence. Live adds a separate acknowledgement. Credentials are environment-injected by the operator and must not enable withdrawals.

`config.autonomy.enabled` is separate from broker permissions. A sequential bounded worker re-evaluates and sizes plans; it stops on an error, expiry, partial/unknown fill or revoked permission. Permission state is re-read before the actual POST. Deterministic order IDs and a durable reservation prevent duplicate submission after restart. There is no blind retry after an ambiguous exchange response. Recovery requires reconciling actual exchange orders/fills; do not delete the ledger to bypass an unknown state.

This is single-host persistent infrastructure, not a horizontally scalable HA execution cluster. Aggregate limits apply to this configured account owner and ledger; do not configure the same real account independently in multiple workers. Market depth impact, taxes, cross-currency conversion, shorting/leverage, equity corporate actions and complete multi-account accounting are not certified here. A separately reviewed licensed market-data provider is required for automated global-equity coverage.

## Multidisciplinary review

Economics: after-cost edge and a fair benchmark, no fabricated alpha. Statistics: causal features, separate calibration, untouched test and prospective evidence. Trading: exchange filters, stale-book rejection, bounded limits and ambiguous-fill safety. Investing: reserves, horizon, cash-flow constraints and explicit goals. Mathematics: convex feasibility and objective-gap certificate, not future-outcome optimality. Architecture: versioned data/ML/risk/execution ports and a single opt-in gateway. Engineering: deterministic tests, failure injection, durable idempotency, fixed-source budgets and CI. These are implementation controls, not independent expert scores.
