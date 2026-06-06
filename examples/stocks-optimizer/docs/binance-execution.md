# Binance Execution Module

`binance-execution` is the Stocks-Optimizer execution-only adapter for Binance Spot.
It transforms already-approved decisions into Binance orders. It does not discover,
rank, trust, calibrate, recover, size strategy intent, or govern strategy promotion.

## Architecture

```txt
Stocks Optimizer / Signal
  -> approved decision
  -> sizing-adapter
  -> risk-guard
  -> exchange-cache + order-validator
  -> order-router
  -> Binance client or dry-run simulator
  -> execution-state store
  -> account-sync + position-reconciler
  -> metrics + health check
```

Source lives in:

```txt
src/artifacts/api-server/src/modules/binance-execution/
```

The API server exposes opt-in routes under:

```txt
/api/binance-execution/*
```

Existing strategy and quote routes continue to produce decisions only. Automatic
execution is available only through the cron/admin-protected auto-execution route
and is disabled unless `BINANCE_AUTO_EXECUTE_SIGNALS=true`.

For deployments where Binance blocks Vercel egress with HTTP `451`, use Vercel
as the control plane and run the execution worker on a Binance-eligible host:

```txt
Vercel Stocks Optimizer
  -> /api/binance-execution/decisions
  -> signed pull from execution worker
  -> worker sizing/risk/reconciliation/order routing
  -> Binance Spot Testnet or Live
```

The worker lives in:

```txt
src/artifacts/binance-execution-worker/
```

## Security

The module supports Spot order execution only. It does not include withdrawals,
transfers, margin borrowing, futures, or liquidation APIs.

Logs redact:

```txt
apiKey
secret
signature
token
authorization
```

Execution routes require `BINANCE_EXECUTION_ADMIN_SECRET` or `ADMIN_SECRET`
outside `dry_run`.

## Modes

Supported modes:

```txt
dry_run
testnet
live
```

Default mode is `dry_run`.

Live mode requires all gates:

```txt
BINANCE_MODE=live
BINANCE_LIVE_TRADING_ENABLED=true
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
BINANCE_CONFIRM_LIVE_TRADING=true
BINANCE_RISK_GUARD_LIVE_TRADING_APPROVED=true
killSwitch=false
```

If any gate fails, the module fails closed and rejects execution.

## Sizing Semantics

`appSizePct` is normalized strategy exposure, not a portfolio percentage.

```txt
1.0  = 100% of strategy equity
0.5  = 50% of strategy equity
0.25 = 25% of strategy equity
```

For one trade with `$20` strategy equity:

```txt
appSizePct=0.5 -> $10 allocation
```

For multiple trades, weights are proportional when total requested exposure
exceeds full strategy equity:

```txt
BTC 1.0, ETH 0.5, SOL 0.5 on $20
BTC $10, ETH $5, SOL $5
```

The sizing adapter never allocates more than available equity, strategy cap,
daily notional cap, or per-order notional cap. It rejects allocations below
Binance minimum notional and never inflates orders to satisfy exchange minimums.

For live system-managed allocation, use:

```txt
BINANCE_ALLOCATION_MODE=system_proportional
BINANCE_MAX_NOTIONAL_PER_ORDER=system
BINANCE_MAX_DAILY_NOTIONAL=system
BINANCE_MAX_OPEN_ORDERS=system
```

In this mode, actionable BUY signals split all available strategy equity
proportionally by their `appSizePct` weights. `EXIT` decisions are sized from
the actual synced base-asset position, not from quote equity. Binance exchange
filters, account balances, idempotency, stale-state checks, and kill switch
controls still fail closed.

## Risk Controls

The risk guard rejects when:

```txt
kill switch active
configuration invalid
live trading gates incomplete
account sync stale
decision stale
confidence below threshold
trust below threshold
symbol not allowed
daily notional exceeded
open order limit exceeded
duplicate decision
cooldown active
exchange filter violation
reconciliation drift detected
market orders not explicitly approved
```

Market orders require all three:

```txt
ALLOW_MARKET_ORDERS=true
config.allowMarketOrders=true
riskGuard.marketOrdersApproved=true
```

Default routing uses `LIMIT_MAKER` or `LIMIT`.

## Execution Flow

1. Receive one or more approved decisions.
2. Sync account state.
3. Load and cache Binance `exchangeInfo`.
4. Reconcile expected and actual positions.
5. Allocate notional using normalized sizing semantics.
6. Generate deterministic `clientOrderId` from decision id, strategy id, symbol, and action.
7. Normalize quantity and price against Binance filters.
8. Run risk guard.
9. Reserve capital before placement.
10. Route to dry-run simulator, testnet, or live Binance Spot.
11. Persist decision, order, reservation, snapshot, metrics, and kill-switch state.

## Take Profit

The local worker can create take-profit `EXIT` decisions for worker-created
filled `BUY` orders. The exit still flows through the same sizing, risk guard,
exchange filter validation, idempotency, reconciliation, and kill-switch checks.

Enable it on the worker:

```txt
BINANCE_TAKE_PROFIT_ENABLED=true
BINANCE_TAKE_PROFIT_FEE_BPS=20
BINANCE_TAKE_PROFIT_BUFFER_BPS=5
BINANCE_TAKE_PROFIT_ORDER_TYPE=LIMIT
```

Target price:

```txt
entryPrice * (1 + expectedMovePct / 100) * (1 + (feeBps + bufferBps) / 10000)
```

The worker only triggers when the live ticker price is at or above the computed
target. It sells no more than the synced free base-asset balance and the filled
BUY quantity. Market orders remain disabled; take-profit exits use `LIMIT` or
`LIMIT_MAKER` only. If a signal does not include `expectedMovePct`, the worker
skips take-profit for that order instead of inventing a target.

When a take-profit exit is accepted, the worker records the source BUY signal in
`BINANCE_WORKER_CLEARED_SIGNALS_FILE` and filters that fingerprint out of future
decision pulls. This prevents the same completed signal from being re-bought
while the optimizer is still publishing it. The record is pruned automatically
once the strategy emits a materially different signal for that symbol.

Manual worker check:

```sh
curl -X POST http://localhost:8787/take-profit/check \
  -H 'Authorization: Bearer <BINANCE_WORKER_ADMIN_SECRET>'
```

Inspect or reset cleared signals:

```sh
curl http://localhost:8787/cleared-signals \
  -H 'Authorization: Bearer <BINANCE_WORKER_ADMIN_SECRET>'

curl -X DELETE http://localhost:8787/cleared-signals \
  -H 'Authorization: Bearer <BINANCE_WORKER_ADMIN_SECRET>'
```

## Reconciliation

The reconciler compares expected positions from stored fills with actual Binance
balances and open orders. Drift pauses trading through the kill switch and shows
up in health checks and metrics.

## Dry Run

Dry run is the default and requires no Binance credentials.

```sh
BINANCE_MODE=dry_run
pnpm --filter @workspace/api-server dev
```

Execute a decision:

```sh
curl -X POST http://localhost:4010/api/binance-execution/execute \
  -H 'content-type: application/json' \
  -d '{"decision":{"id":"dry-1","symbol":"BTCUSDT","action":"BUY","confidence":0.9,"trust":0.9,"appSizePct":0.5,"strategyId":"demo","timestamp":"2026-05-30T12:00:00.000Z","price":100}}'
```

## Testnet

```txt
BINANCE_MODE=testnet
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
BINANCE_EXECUTION_ADMIN_SECRET=...
BINANCE_ALLOWED_SYMBOLS=*
BINANCE_ALLOCATION_MODE=system_proportional
BINANCE_MAX_NOTIONAL_PER_ORDER=system
BINANCE_MAX_DAILY_NOTIONAL=system
BINANCE_MAX_OPEN_ORDERS=system
```

Use the same execution endpoints with:

```txt
Authorization: Bearer <BINANCE_EXECUTION_ADMIN_SECRET>
```

## Automatic Execution

Decision-only pull endpoint for an external worker:

```txt
GET /api/binance-execution/decisions?market=BINANCE&strategyId=stocks-optimizer&limit=20
Authorization: Bearer <BINANCE_EXECUTION_ADMIN_SECRET>
```

This endpoint builds Binance decisions from Stocks-Optimizer signals but does
not contact Binance and does not place orders.

Manual strategy execution:

```sh
curl -X POST /api/binance-execution/execute-strategy \
  -H 'Authorization: Bearer <BINANCE_EXECUTION_ADMIN_SECRET>' \
  -H 'content-type: application/json' \
  -d '{"market":"BINANCE","strategyId":"stocks-optimizer","limit":20}'
```

Cron/admin-protected automatic strategy execution:

```txt
GET /api/binance-execution/auto-execute
Authorization: Bearer <CRON_SECRET or BINANCE_EXECUTION_ADMIN_SECRET>
```

The route is inert until:

```txt
BINANCE_AUTO_EXECUTE_SIGNALS=true
BINANCE_AUTO_EXECUTE_MARKET=BINANCE
BINANCE_AUTO_EXECUTE_LIMIT=20
```

`BINANCE_ALLOWED_SYMBOLS=*` disables the local symbol allowlist. Binance
`exchangeInfo`, account balances, order filters, min notional, max position, and
risk limits still apply before any order is submitted.

On Vercel, Cron Jobs can call this route from `vercel.json`; Vercel sends
`CRON_SECRET` as the `Authorization: Bearer ...` header when that environment
variable is configured. Cron timing is UTC and depends on the Vercel plan.

## External Worker

Use the worker when the app host cannot legally or reliably reach Binance.
Do not use a proxy or VPN to disguise a restricted location.

Local testnet run:

```sh
cp src/artifacts/binance-execution-worker/.env.example .env.worker.local
# Fill BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_WORKER_ADMIN_SECRET,
# and STOCKS_OPTIMIZER_EXECUTION_SECRET.
set -a
source .env.worker.local
set +a
pnpm worker:build
pnpm worker:start
```

Verify:

```sh
curl http://localhost:8787/livez

curl -X POST http://localhost:8787/sync \
  -H 'Authorization: Bearer <BINANCE_WORKER_ADMIN_SECRET>'

curl -X POST http://localhost:8787/run-once \
  -H 'Authorization: Bearer <BINANCE_WORKER_ADMIN_SECRET>' \
  -H 'content-type: application/json' \
  -d '{"market":"BINANCE","strategyId":"stocks-optimizer","limit":20}'
```

Enable interval automation only after manual `sync` and `run-once` are healthy:

```txt
BINANCE_WORKER_AUTO_EXECUTE=true
BINANCE_WORKER_INTERVAL_MS=60000
```

Worker deployment should use a durable disk or database-backed state file. The
default local state path is `.local-cache/binance-execution-state.json`; set
`BINANCE_EXECUTION_STATE_FILE` explicitly on production workers.

Docker build from the `examples/stocks-optimizer` root:

```sh
docker build \
  -f src/artifacts/binance-execution-worker/Dockerfile \
  -t stocks-optimizer-binance-worker .
```

## Live Deployment

Before live:

1. Run the full test suite.
2. Confirm `/api/binance-execution/health` is healthy in `dry_run`.
3. Confirm testnet orders, cancellations, reconciliation, and kill switch.
4. Confirm the execution host is eligible to access the exchange API.
5. Use durable execution state storage for production live trading.
6. Set live env vars and deploy.
7. Start with low caps:

```txt
BINANCE_MAX_NOTIONAL_PER_ORDER
BINANCE_MAX_DAILY_NOTIONAL
BINANCE_MAX_OPEN_ORDERS
BINANCE_ALLOWED_SYMBOLS
BINANCE_MIN_CONFIDENCE
BINANCE_MIN_TRUST
```

8. Enable live only with explicit config approval and risk guard approval.

## Rollback

Immediate rollback:

```sh
curl -X POST /api/binance-execution/kill-switch \
  -H 'Authorization: Bearer <secret>' \
  -H 'content-type: application/json' \
  -d '{"action":"enable","reason":"rollback"}'
```

Then cancel open orders:

```sh
curl -X DELETE /api/binance-execution/orders \
  -H 'Authorization: Bearer <secret>'
```

Set `BINANCE_MODE=dry_run` and redeploy if the incident requires disabling all
external exchange writes.

## Troubleshooting

`kill_switch_active`: inspect state and reason, reconcile, then disable only
after the root cause is fixed.

`stale_sync`: call `/api/binance-execution/sync` and check Binance connectivity.

`exchange_filter_violation`: inspect quantity, price, min notional, max position,
and open order filters from cached exchange info.

`duplicate_decision`: expected idempotency behavior. Reuse the prior order record
instead of resubmitting the same decision id.

`missing_expected_move`: a filled BUY order cannot be closed by the take-profit
guard because its source decision did not include `expectedMovePct`.

`binance_418`: Binance ban protection triggered. Trading is paused immediately.
Wait for the ban window to clear and investigate request volume before disabling
the kill switch.

HTTP `451`: the host is not eligible to access Binance from its current egress
location. Move the execution worker to an eligible host or use the legally
available exchange API for your jurisdiction, such as a Binance.US adapter for
US accounts.
