# Signal Markets Deployment

This workspace is ready to deploy on Vercel.

Use `examples/stocks/src` as the Vercel project root.

## What Vercel uses

- Build command: `pnpm run build`
- Output directory: `artifacts/signal-markets/dist/public`
- API entrypoint: `api/index.js`

## Environment variables

- `TRADINGVIEW_DATA_BASE_URL` (optional): override the TradingView quote endpoint
- `NODE_ECU_API_BASE_URL` (optional): external signal engine endpoint

If `NODE_ECU_API_BASE_URL` is not set on Vercel, the API falls back to the built-in heuristic signal generator instead of trying to call `localhost`.

## Local verification

```bash
pnpm run build
pnpm dlx vercel build --yes
```
