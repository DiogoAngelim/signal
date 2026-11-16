# Lúmina first-journey preview

**Status:** Isolated design-review implementation. Not production-ready, not merged, not deployed.

## Activation

Lúmina lives at `/lumina-preview` inside the existing Signal Markets Vite app.

- Local Vite development: route is available automatically.
- Production/staging build: route is **disabled by default**. Set `VITE_ENABLE_LUMINA_PREVIEW=true` at build time only in an authorized review environment.
- Existing `/` and `/dashboard` routes retain their previous components. This preview has no navigation entry in the production dashboard.

The route is lazy-loaded so ordinary dashboard users do not download the preview component.

## Working first-visit experience

1. A peaceful welcome accepts free text or one of three optional starters.
2. The deterministic local conversation asks about when the money might be needed if that is missing.
3. If an illustrative amount is missing, one question asks for one. It may be invented.
4. A controlled React visual distinguishes hypothetical accessible money from market exposure and shows the arithmetic impact of an *explicitly hypothetical* 20% decline in the exposed portion.
5. A slider and supported text commands modify the **same** underlying scenario.
6. A practice choice can be saved to in-memory history; reset keeps the in-tab history, and the user can clear it. Refresh discards it.

## Evidence and authorization

- Current data types explicitly distinguish `user-provided`, `illustrative`, `verified-external`, and `unavailable`. The preview uses **only** the first two.
- No market prices, live signals, forecasts, real positions, brokerage connections, credential capture, AI advisor, or trade execution.
- `Save this practice choice` is not Buy, Sell, order submission, or a portfolio update. Practice records are marked `provenance: "illustrative"`, `executed: false`.
- The 20% price fall is an example stress magnitude, not a probability, predicted return, or actual asset performance.
- Limited typed phrases are explicitly scoped. Unsupported requests receive a truthful fallback rather than invented financial answers.
- No network request, API submission, localStorage, or durable personal-memory write is made by the preview itself.
- Nothing in this page modifies verified holdings, execution records, or the backend's eligibility gates.

## QA and remaining gates

Tests added to the frontend's existing Vitest script:

- `src/lib/lumina-journey.test.ts`: contextual clarification, parsing, visual/text consistency, hypothetical arithmetic, no execution, session-only choices, bounds, and invalid input.
- `src/pages/lumina-preview.test.tsx`: initial render and absence of deceptive financial controls.

Run in `examples/stocks-optimizer` after dependencies are installed:

```bash
pnpm --filter @signal/decision build
pnpm --filter @workspace/signal-markets typecheck:lumina
pnpm --filter @workspace/signal-markets test
pnpm --filter @workspace/signal-markets build
```

The original self-contained prototype passed Chromium interaction checks at 320, 390, 768 and 1440px before the port. **Those results do not certify this React version**. Its new runtime still needs a rendered review, keyboard and screen-reader validation, real-device checks, full CI and performance/reliability verification.

The full frontend `typecheck` currently reports unrelated Recharts chart typings and workspace initialization errors on the base code. The preview has a scoped `typecheck:lumina` gate, while the full frontend test and production build must still pass independently. CI results, not the existence of test files, determine pass/fail status.

## Next joint experience

After this feature branch's review, design returning to a previously saved practice choice and the in-context explanation of a meaningful real event. Verified webhook events should only be integrated once source authentication, replay protection, deduplication and reconciled execution-state contracts are in place. Do not use the Practice model to fabricate them.
