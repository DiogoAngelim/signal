# Lúmina — application architecture, operations and release gates

**Location:** `examples/stocks-optimizer` in the Signal monorepo.
**Status:** Implementation branch in PR #89. This document does not certify a public deployment.
**Existing legacy dashboard:** still available at `/dashboard`.
**Lúmina main experience:** `/` (and `/lumina`).

## What is implemented

- The approved quiet visual identity, welcoming conversation, goal entry, interactive hypothetical allocation, and detailed context on demand.
- Optional account signup/sign-in backed by Better Auth and PostgreSQL sessions; no brokerage credentials.
- Private, owner-scoped persistent goals, conversations, messages, Practice choices, inbox events and market watches.
- Practice choices are always labelled `provenance=illustrative`, `executed=false`; preserving an intention never creates or modifies an actual holding.
- Clear deletion of a choice, a conversation, a goal, or all Lúmina **application** data. Authentication account and mandatory security records are separate.
- A browser-tab session can remember guest Practice choices without requiring an account. This is distinct from authenticated cross-device PostgreSQL persistence.
- Independent, time-stamped public Binance Spot quotes limited to a short allowlist and a 120-second freshness gate. Failed or stale quotes are not eligible for live financial calculations.
- Optional TradingView-hosted Advanced Chart widget, only loaded when a visitor asks to open it. TradingView widget data are **not** consumed by investment calculation logic.
- Optional **explicitly opt-in** server-side OpenAI Responses API. The user must enable the checkbox before a message can be sent to OpenAI. The API uses `store=false`, but the user-provided message, recent conversation, and goal context are processed by the provider when enabled. Assistant content is retained in the user's own Lúmina conversation DB unless they delete it.
- A quiet inbox and user-created price watches. **Watches are evaluated only when an authenticated user presses Check levels.** No background push or continuous monitoring exists.
- No brokerage access, no trading executor, no external fill reconciliation, and no ability for AI to place an order.

## Development setup

From `examples/stocks-optimizer`:

1. Run `pnpm install --frozen-lockfile` (after the repo's lockfile-refresh workflow has committed the Better Auth dependency).
2. Prepare a local PostgreSQL database and set `DATABASE_URL`.
3. Generate a unique random `BETTER_AUTH_SECRET` with at least 32 characters. Never copy a demo secret to production.
4. Set `BETTER_AUTH_URL=http://localhost:5173` when using the Vite proxy.
5. Run `pnpm --filter @workspace/api-server db:migrate`.
6. Run `pnpm --filter @workspace/api-server db:auth:migrate`; the Better Auth schema is managed by the installed Better Auth version.
7. Start the API on port 4010 and Vite on 5173. Vite proxies `/api` to the local backend. Confirm `GET /api/lumina/capabilities`.
8. Test sign-up, sign-out, sign-in, save a Practice choice, full reload, access from another browser while signed in, and deletion.
9. Run `pnpm --filter @workspace/api-server typecheck`, `test`, `build` and the corresponding `@workspace/signal-markets` scripts.

No public deployment should auto-run migrations on a request. The migration procedure is a controlled release step.

## Production environment

Set the following on the actual **server-side** hosting project:

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | Required: provisioned, backed up, secured PostgreSQL; connection pooling recommended |
| `BETTER_AUTH_SECRET` | Required: independently generated strong secret; never stored in source |
| `BETTER_AUTH_URL` | Production canonical HTTPS URL; omitted on dynamic preview URLs if supported |
| `LUMINA_AUTH_TRUSTED_ORIGINS` | Explicit canonical app origins; no wildcard origin in production |
| `LUMINA_SMTP_HOST`, `LUMINA_SMTP_PORT`, `LUMINA_SMTP_USER`, `LUMINA_SMTP_PASSWORD`, `LUMINA_SMTP_FROM` | Required for production account activation; email verification is mandatory in production |
| `OPENAI_API_KEY` | Optional. Store server-side only; never in `VITE_*` or an uploaded document/chat message |
| `LUMINA_OPENAI_MODEL` | Optional, default `gpt-6-luna`. Verify available model access before enabling |
| `LUMINA_REQUIRE_EMAIL_VERIFICATION` | Optional for local development; always enabled in production regardless of this variable |

The backend denies account operations until DB and auth secret are configured; production sign-up also refuses to initialize without working SMTP configuration. A populated environment variable is not proof that the external email provider actually delivers: verify sign-up, inbox delivery, link expiry, and sign-in.

Set `NODE_ENV=production` for production releases. Never put `OPENAI_API_KEY`, `BETTER_AUTH_SECRET` or SMTP secrets in a frontend build variable.

## Verification and rollout

The dedicated GitHub Actions workflow `.github/workflows/lumina-app.yml` uses an isolated PostgreSQL service and test-only secret to run:

- SQL migration validation and application, plus Better Auth schema migration
- A real HTTP two-user journey: register → receive session cookie → private goals/Practice → other-user isolation → chat → removal
- Backend and frontend typechecks, unit tests and builds

The existing Lúmina first-journey and Signal API CI must remain green. React visual regression and mobile accessibility require browser evidence, not just TypeScript success. Verify the exact deploy commit and environment before production promotion. Never merge to main automatically if API, authentication, persistence, or Vercel deployment checks are failing.

### Permission and provenance boundaries

- Guest mode and Practice mode cannot authenticate as a different user or update verified holdings.
- Backend queries include `owner_id`, with user ID taken from a verified session—not from request JSON, URL query, or a client-auth header.
- Market data from Binance has a source, observation time, request time and freshness state. A stale state blocks new live actionable recommendations.
- The AI prompt is informational and has no trade, webhook or billing tools. AI calls require both a configured server key and explicit user opt-in for the message. The request uses a hashed user ID and `store=false`; this is not equivalent to local-only processing.
- TradingView is a third-party widget. Users should see it only after selecting to load it; the widget's own privacy terms apply.
- User data removal via the app affects goals, choices, messages and inbox. It does not remove authentication account or security/audit records and does not automatically delete provider-side telemetry.

## Deliberately unimplemented until independently verified

1. Authenticated brokerage connections, execution authorization and external **verified fills**, including partial fills, cancellations, idempotency and reconciliation. No sign-in to Lúmina implies brokerage permission.
2. Actual push delivery, quiet hours and continuous watch schedules. This implementation only checks on explicit visits.
3. Per-asset risk/return recommendations qualified by live strategy validation. Source freshness by itself does not establish investment suitability.
4. A browser-reviewed production preview and full deployment observability.
5. Native chart datafeed contracts or TradingView Advanced Charts library licensing beyond the official hosted widget.

The correct release label until these are finished is **Lúmina account-backed Practice and financial exploration**, not a real-money trading platform.
