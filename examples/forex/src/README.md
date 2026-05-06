# Signal Markets Deployment

This workspace is ready to deploy on Vercel.

Use `examples/stocks` as the Vercel project root so the `lib` and `src` folders sit at the same level.

## What Vercel uses

- Build command: `pnpm --dir src run build`
- Output directory: `src/artifacts/signal-markets/dist/public`
- API entrypoint: `api/index.cjs`

## Environment variables

- `TRADINGVIEW_DATA_BASE_URL` (optional): override the TradingView quote endpoint
- `NODE_ECU_API_BASE_URL` (optional): external signal engine endpoint
- `ENABLE_BACKGROUND_SIGNAL_ENGINE` (optional): enable the long-running backend signal refresh loop. Defaults to `true` for the Node server and `false` on Vercel serverless.
- `STOCK_SIGNAL_BOOTSTRAP_SCOPES` (optional): comma-separated startup watchlist scopes such as `exchange:US` or `market:NASDAQ`.
- `STOCK_SIGNAL_BOOTSTRAP_SYMBOLS_PER_SCOPE` (optional): how many symbols to seed per bootstrap scope. Defaults to `24`.
- `STOCK_SIGNAL_REFRESH_INTERVAL_MS` (optional): backend signal refresh cadence in milliseconds. Defaults to `60000`.

If `NODE_ECU_API_BASE_URL` is not set on Vercel, the API falls back to the built-in heuristic signal generator instead of trying to call `localhost`.

## Backend-owned signals

When the API server runs as a long-lived Node process, it now keeps a backend watchlist alive, refreshes quotes on an interval, persists the latest quote+signal snapshots, and continues retraining signal state even when no dashboard tab is open.

Useful endpoints:

- `POST /api/stocks/quotes` with `withSignals: true`: registers symbols with the backend watchlist and returns the latest persisted backend snapshots when fresh.
- `GET /api/stocks/signals/status`: shows whether the background engine is enabled, when it last ran, and how many symbols/snapshots are currently tracked.

## Local verification

```bash
pnpm --dir src run build
pnpm dlx vercel build --yes
```
