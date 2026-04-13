# Signal Markets Deployment

This workspace is ready to deploy on Vercel.

Use `examples/stocks` as the Vercel project root so the `lib` and `src` folders sit at the same level.

## What Vercel uses

- Build command: `pnpm --dir src run build`
- Output directory: `src/artifacts/signal-markets/dist/public`
- API entrypoint: `api/index.js`

## Environment variables

- `TRADINGVIEW_DATA_BASE_URL` (optional): override the TradingView quote endpoint
- `NODE_ECU_API_BASE_URL` (optional): external signal engine endpoint

If `NODE_ECU_API_BASE_URL` is not set on Vercel, the API falls back to the built-in heuristic signal generator instead of trying to call `localhost`.

## Local verification

```bash
pnpm --dir src run build
pnpm dlx vercel build --yes
```
