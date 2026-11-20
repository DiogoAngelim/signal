# Verified investing backend

An opt-in, evidence-gated Stocks Optimizer backend. Software checks, a real data feed, a profitable historical model, prospective evidence, and a qualified personal portfolio are different claims. This package does not equate them or guarantee investment returns.

## Architecture and exact dependencies

`authenticated provider -> causal features -> ridge/logistic estimation -> chronological selection -> actual Signal isotonic calibration -> untouched final test -> frozen model -> prospective ledger -> personal risk/cash-flow constraints -> MPT -> executable lot audit -> permissions -> Spot adapter`

The existing application exposes the persistent service through `/api/investing/*` when `VERIFIED_INVESTING_INTERNAL_URL` is configured. Both standalone and serverless API paths use this gateway. Long-running research, SQLite persistence, streaming and worker leases belong to the persistent service, not an ephemeral serverless invocation.

**`dependency-lock.json` is authoritative for exact release pins.** The actual Signal runtime/protocol/ports/decision sources are snapshotted from the recorded main commit, not reimplemented. The private tradingview-data repository is consumed through its authenticated versioned HTTPS contract, not copied into this public repository. A mismatched data release fails closed. Current reviewed data implementation includes stalled-stream recovery, authenticated health checks and request draining.

Legacy research remains non-executable. Legacy Binance order creation is disabled; reads and cancellations are retained. No deployment, credentials or trading permissions are changed by checking out this source branch.

## Build and test

Node 22.16 or later is required; `node:sqlite` is experimental in Node 22. Review and test runtime upgrades.

```sh
TOOLING_DIR="$(mktemp -d)"
npm install --ignore-scripts --no-audit --no-fund --prefix "$TOOLING_DIR" esbuild@0.25.12 zod@4.1.12
VERIFIED_TOOLING_DIR="$TOOLING_DIR" node scripts/build.mjs
node --test test/*.test.mjs
```

No repository bootstrap or dependency lifecycle scripts are executed by this isolated build. The source-signature scanner is a targeted check, not a general malware certification. Generated market fixtures and simulated clocks test software, never strategy performance. A separate read-only actual-market probe is `node scripts/live-research-probe.mjs`; failed gates remain failed.

## Start safely

Use `config.paper.example.json` as a schema example, not as your personal financial profile. Store the real configuration outside the repository, owner-readable only (`chmod 600`), with an absolute ledger path in a private directory. Create a high-entropy bearer token through your secret manager and store only its SHA-256 digest, subject, scopes and expiry in `apiKeys`. Inject the provider read token through the environment. Do not commit credentials or expose them to the frontend.

```sh
export VERIFIED_INVESTING_CONFIG=/absolute/private/investing.json
node src/server.mjs
```

The default listener is loopback port 4030. An operator-configured authenticated TLS reverse proxy and a persistent volume are required for remote operation. Configure the original application's `VERIFIED_INVESTING_INTERNAL_URL` to that service; the gateway forwards the original user's authorization rather than substituting an administrator token.

The ledger binds an account owner and paper/testnet/live mode. One renewable writer lease is enforced at transaction and final order-send boundaries. A second worker sharing that ledger cannot take over while the first lease is valid. The process stops scheduling, drains in-flight requests and then closes storage on shutdown. This is not a distributed multi-region account lock; never use the same real account across independent ledgers.

## Authenticated API

| Method | Path under `/api/investing` | Scope | Purpose |
|---|---|---|---|
| GET | `/capabilities` | investing:read | Actual configured features, data/runtime identities and limitations |
| GET | `/operations` | investing:read | Worker state and unresolved execution reservations |
| POST | `/profile` | investing:write | Risk tolerance, horizon, reserves, goals and cash flows |
| POST | `/research` | investing:write | `{symbol:"BTCUSDT",timeframes:["1d"],bars:2500}` |
| GET | `/report?id=<hash>` | investing:read | Exact research evidence and failures |
| GET | `/signals?strategies=<hashes>` | investing:read | Model analysis and blockers, not orders |
| GET | `/stream?strategies=<hashes>` | investing:read | Authenticated SSE with token revocation checks |
| POST | `/plan` | investing:write | `{strategies:["frozen-model-hash"]}`; account-specific exact lot proposal |
| POST | `/execute` | investing:execute | `{planHash:"server-created-hash"}`; paper or separately gated broker |
| POST | `/reconcile` | investing:reconcile | Read-only exchange reconciliation of an uncertain plan |

Use authenticated fetch streaming, not tokens in EventSource URLs. Tenant identity comes from the token, never request data. Profiles and accounts are rechecked before submission. Repeated execution requests return the durable prior result, including after plan expiry. Ambiguous or partial fills stop the worker; a restart does not silently retry them. Reconciliation verifies exchange identity, original/executed quantity and terminal status, refreshes account state, and requires a NEW plan. It never submits or cancels an order.

## Research and prospective evidence

Eleven causal features cover trend, momentum, RSI, MACD, Bollinger position, ATR, volatility, relative volume and breakout. Twelve predefined configurations per timeframe form a bounded search, not a universal best-strategy claim. Timeframe partitions share calendar boundaries. Expanding walk-forward selection, purging, embargo and separate calibration precede an untouched final test. The final-test loser is not swapped for a runner-up until a flattering result appears.

Gates include sample/calendar duration, dependence-aware confidence intervals, positive net return, a cost-adjusted exposure-matched benchmark, drawdown, calibration quality, doubled-cost stress and walk-forward stability. At most 5000 bars are retrieved; short intraday datasets can fail calendar-duration gates and need a longer archival system. Multi-timeframe search is not simultaneous ensemble confirmation.

Only fresh server-observed signals after model freezing count toward prospective evidence. Historical closed trades cannot substitute. Requirements include 30 elapsed days, 30 observations/day-clusters, positive net evidence, sufficient outcome coverage and recent observations. Artificially advancing a test clock cannot certify a production strategy. The ledger retains exact model and report hashes.

## Investor constraints and executable quantities

The planner uses settled cash and reconciled holdings, excludes unsettled contributions, reserves imminent withdrawals, observes horizon/exposure/concentration/drawdown constraints and aligns covariance on a common daily grid. Unrealistic goals never cause automatic relaxation of risk limits. Paper drawdown high-water marks persist even when no trades occur.

Shrinkage covariance and L1 turnover costs define the continuous long-only mean-variance problem. Its objective-gap certificate applies only to that estimated convex model. A separate post-rounding audit checks cash, fees, reserve coverage, concentration, exposure, volatility, exchange steps and quantity limits. Bounded one-lot repair can reduce buys, never inflate minimum orders or spend anticipated sales. Infeasible dust or exhausted repair budgets remain explicit blockers.

`portfolioPolicyPerformanceVerified:false` is deliberate: single-asset signal validation and numerical allocation feasibility are not independent proof of a personalized rebalancing policy's future performance or global discrete optimality.

## Optional autonomy and remaining qualification

Paper is the default. Non-paper startup can remain read-only with `permissions.enabled:false`. Optional execution requires real credentials, owner-bound expiring permissions, symbol/notional limits, current reconciled account/cash-flow state, fee ceilings, security/host clearance, qualifying model/forward evidence and an inactive kill switch. Live mode adds a separate acknowledgement. Autonomy has its own enablement and expiry and reloads permission before execution. Never enable key withdrawal permissions.

See [operational verification](docs/operational-verification.md) for a checksum-verified SQLite backup/restore drill and its limitations, and [verification record](VERIFICATION.md) for exact completed evidence. Tests do not verify the user's production host, actual credentials/profile, exchange fills, historical security exposure, or elapsed prospective returns. Free verified automated data currently covers Binance Spot, not unrestricted global equities. Long intraday archives, HA/multi-account accounting, cross-currency conversion, taxes, equity corporate actions and a full personal-policy performance study remain outside the completed verification scope.
