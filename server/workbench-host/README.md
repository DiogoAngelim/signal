# Signal Workbench Host

A dedicated Node.js host for the signed Signal ↔ Workbench connector.

## Routes

- `GET /api/health` — reports runtime readiness without exposing configuration values.
- `POST /api/events` — accepts one versioned Signal lifecycle event, dispatches it through Signal Runtime, and publishes it to Workbench using the owner-specific HMAC credential.
- `GET /api/sync/outcomes` — polls one owner-scoped Workbench outcome page and atomically persists the page and cursor to the dedicated PostgreSQL inbox. It is intended for Vercel Cron once the owner credential is provisioned.

## Required environment

- `SIGNAL_INGEST_SECRET` — independent bearer secret for authenticated upstream Signal event producers (at least 32 characters).
- `WORKBENCH_BASE_URL` — HTTPS origin of the Workbench deployment.
- `WORKBENCH_OWNER_ID` — owner ID in Workbench.
- `WORKBENCH_SIGNAL_TOKEN` — one-time-provisioned owner-specific Workbench credential.
- `SIGNAL_WORKBENCH_DATABASE_URL` — least-privilege PostgreSQL role connection string for the connector inbox.
- `CRON_SECRET` — independent bearer secret for the durable scheduler calling `/sync/outcomes`.

Never reuse the Workbench token as the upstream ingress secret or scheduler secret. Do not log request bodies, tokens, or signatures.

## Event contract

Upstream producers must send the exact v2 Signal event contract accepted by `@signal/workbench-connector`. The source must provide a stable `eventId` and monotonically increasing `sourceRevision` for each `signalId`. The host does not infer owner, relationship, or opportunity identity. Workbench verifies ownership and lifecycle order before persisting an event.

## Delivery and learning boundary

The host returns success only after Workbench acknowledges the event. Producers must retry failed requests using the same immutable event ID and payload. Workbench event ingestion is idempotent.

Outcome snapshots are stored as owner-recorded observations. They are not independently audited labels and are not automatically converted into Signal decision-memory evaluations. Any learning mapping requires a separate governed implementation and sample-quality review.

The `/sync/outcomes` route processes one page per invocation so it can be called by an external durable scheduler. The scheduler must retry non-2xx responses and must not overlap invocations for the same owner.


## Deployment state

The Vercel project is configured as a preview-only Node.js function in `gru1`, rooted at this package and including its monorepo workspace dependencies. The dedicated outcome database and independent ingress/cron secrets are scoped to the host preview branch. The cron schedule remains intentionally inactive until the owner-specific Workbench token is provisioned and authenticated end-to-end validation passes.
