# Lúmina first-visit and returning-journey preview

**Status:** Isolated design-review implementation. Not production-ready, not merged, not deployed.

## Activation

Lúmina lives at `/lumina-preview` inside the existing Signal Markets Vite app.

- Local Vite development: route is available automatically.
- Production/staging build: route is **disabled by default**. Set `VITE_ENABLE_LUMINA_PREVIEW=true` at build time only in an authorized review environment.
- Existing `/` and `/dashboard` routes retain their previous components. This preview has no navigation entry in the production dashboard.

The route is lazy-loaded so ordinary dashboard users do not download the preview component.

## Working first-visit and returning experience

1. A peaceful welcome accepts free text or one of three optional starters.
2. The deterministic local conversation asks about when the money might be needed if that is missing.
3. If an illustrative amount is missing, one question asks for one. It may be invented.
4. A controlled React visual distinguishes hypothetical accessible money from market exposure and shows the arithmetic impact of an *explicitly hypothetical* 20% decline in the exposed portion.
5. A slider and supported text commands modify the **same** underlying scenario.
6. An explicitly saved Practice choice is retained in this browser tab's `sessionStorage` across reloads. Reset keeps saved choices; unsaved conversations and drafts are not persisted.
7. On a subsequent visit, Lúmina quietly shows the most recent **illustrative** choice: resume it, begin fresh, inspect previous Practice choices, or forget it.
8. Resuming restores the original illustrative amount, goal, timeframe and allocation without changing the historical snapshot. New adjustments are still hypothetical.
9. “What changed?” says **no market changes have been observed** by this prototype. It never invents gains, losses, notifications or external events.
10. “Don't remember this” erases the active saved choice; if several choices make “this” ambiguous, it asks the user to select a record in History. “Forget choice” and “Clear practice history” remove the relevant tab-scoped records.

## Evidence and authorization

- Current data types explicitly distinguish `user-provided`, `illustrative`, `verified-external`, and `unavailable`. The preview uses **only** the first two.
- No market prices, live signals, forecasts, real positions, brokerage connections, credential capture, AI advisor, or trade execution.
- `Save this practice choice` is not Buy, Sell, order submission, or a portfolio update. Practice records are marked `provenance: "illustrative"`, `executed: false`.
- The 20% price fall is an example stress magnitude, not a probability, predicted return, or actual asset performance.
- Limited typed phrases are explicitly scoped. Unsupported requests receive a truthful fallback rather than invented financial answers.
- There is no network request, API submission, `localStorage`, or remote memory write by this preview. Only explicitly saved structured Practice choices are retained using `sessionStorage` (versioned schema, validated and field-whitelisted, up to 25 records).
- Free-form conversation text, unsaved amounts, drafts and arbitrary input are never persisted. Stored Practice history is **not encrypted or synchronized**, and tab restoration behavior depends on the browser. A production implementation will require a genuinely secure, user-controlled cross-device memory service.
- Forgetting a Practice choice deletes it from the reducer and tab storage. This demonstration has **no** server-side personal memory or real transaction history to delete.
- Nothing in this page modifies verified holdings, execution records, or the backend's eligibility gates.

## QA and remaining gates

Tests added to the frontend's existing Vitest script:

- `src/lib/lumina-journey.test.ts`: contextual clarification, parsing, visual/text consistency, hypothetical arithmetic, no execution, session-only choices, bounds, and invalid input.
- `src/pages/lumina-preview.test.tsx`: initial render and absence of deceptive financial controls.
- `src/pages/lumina-preview.interaction.test.tsx`: first visit, Practice save, same-tab remount/return, honest unavailability, targeted forgetting and non-restoration.
- `src/lib/lumina-returning.test.ts`: immutable saved intentions, resumption, ambiguous forget commands, and no fabricated outcomes.
- `src/lib/lumina-practice-session.test.ts`: versioning, scoped deletion, validation against forged fills, redaction of unsaved input, and blocked-storage fallback.

Run in `examples/stocks-optimizer` after dependencies are installed:

```bash
pnpm --filter @signal/decision build
pnpm --filter @workspace/signal-markets typecheck
pnpm --filter @workspace/signal-markets typecheck:lumina
pnpm --filter @workspace/signal-markets test
pnpm --filter @workspace/signal-markets build
```

The original self-contained prototype passed Chromium interaction checks at 320, 390, 768 and 1440px before the port. **Those results do not certify this React version**. Its new runtime still needs a rendered review, keyboard and screen-reader validation, real-device checks, full CI and performance/reliability verification.

The preview includes scoped `typecheck:lumina` and a restored full frontend typecheck gate. This branch also corrects existing Vite type declarations, Recharts injected-content typings, and the legacy DOM-test environment so those checks can run. CI enforces full typecheck, scoped typecheck, all frontend tests, and the Vite build. A successful build is **not** a production release or a substitute for rendered/browser accessibility QA.

## Next joint experience

After review, the next shared journey is understanding a **meaningful verified event** and resolving an attentive notification. Verified webhook events must only be integrated once source authentication, replay protection, deduplication, and reconciled execution-state contracts are in place. Never use the Practice model to fabricate them.
