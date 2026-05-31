# Signal Distribution API

The `stocks-optimizer` backend exposes a backend-only signal gateway for REST reads, signed signal ingestion, Server-Sent Events, and signed webhooks. The API is versioned under `/api/v1` and keeps non-versioned `/api` aliases for compatibility.

## Architecture

- Express API routes validate every request with strict Zod schemas and structured error responses.
- `SignalStorageAdapter` is the repository boundary for signals, latest indexes, idempotency keys, webhooks, delivery attempts, audit logs, API keys, secret rotation metadata, replay keys, and queue jobs.
- Production storage is Postgres through `PostgresSignalStore`; local tests use `MemorySignalStore`.
- Webhook delivery is at-least-once through the durable `signal-webhooks` queue. Signal emission persists the signal and enqueues webhook jobs without waiting on external consumers.
- SSE streaming is authenticated, scope checked, heartbeat based, reconnectable with `Last-Event-ID`, and protected by client and write-timeout limits.

## Infrastructure

Required for production:

```txt
Postgres database
One API web process
One or more signal queue worker processes
Secret manager for API key pepper, encryption key, webhook secrets, and ingestion signing secret
Metrics/log drain and alerting provider
Backup/restore process for Postgres
```

## Environment

Use `.env.example` as the canonical variable list. Production must not use plaintext `SIGNAL_API_KEYS`.

Required in production:

```txt
NODE_ENV=production
DATABASE_URL=postgres://...
SIGNAL_STORAGE_DRIVER=postgres
SIGNAL_SECRET_ENCRYPTION_KEY=<32-byte base64, 64 hex, or high-entropy secret material>
SIGNAL_API_KEY_HASH_PEPPER=<high-entropy pepper>
SIGNAL_API_ALLOW_DEV_KEY=false
SIGNAL_BOOTSTRAP_ADMIN_KEY_HASH=sha256=<hmac of bootstrap key using pepper>
SIGNAL_API_CORS_ORIGINS=https://consumer.example.com
SIGNAL_REQUIRE_EMIT_SIGNATURE=true
SIGNAL_INGESTION_SIGNING_SECRET=<shared ingest secret>
```

Important tuning:

```txt
SIGNAL_QUEUE_MAX_DEPTH=10000
SIGNAL_WEBHOOK_MAX_ATTEMPTS=5
SIGNAL_WEBHOOK_RETRY_BASE_MS=500
SIGNAL_WEBHOOK_TIMEOUT_MS=5000
SIGNAL_WEBHOOK_RESPONSE_MAX_BYTES=65536
SIGNAL_WEBHOOK_REDIRECT_LIMIT=3
SIGNAL_STREAM_MAX_CLIENTS=1000
SIGNAL_STREAM_WRITE_TIMEOUT_MS=2000
SIGNAL_API_RATE_LIMIT_MAX=120
SIGNAL_API_RATE_LIMIT_WINDOW_MS=60000
```

## Migrations

Validate migrations in CI and before deploy:

```bash
pnpm --filter @workspace/api-server db:migrate:validate
```

Apply migrations:

```bash
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/api-server db:migrate
```

The migrator records versions and checksums in `signal_schema_migrations`. Checksum drift fails. Destructive statements are blocked by validation unless `ALLOW_DESTRUCTIVE_MIGRATIONS=true` is explicitly set with an approved rollback plan.

Rollback guidance: prefer forward-fix migrations. For destructive schema changes, first deploy additive columns/tables, dual-write if needed, backfill, then remove old schema in a separately approved migration after backups are verified.

## Queue Workers

Build first:

```bash
pnpm --filter @workspace/api-server build
```

Run a queue worker:

```bash
pnpm --filter @workspace/api-server worker:signal-queue
```

Workers claim due jobs with leases, retry with exponential backoff, and move exhausted jobs to `dead_letter`. The API can run an inline worker in local/test mode; production should run separate workers and set capacity alerts on queue backlog and dead-letter growth.

Redrive dead-letter jobs:

```bash
curl -X POST "$BASE/api/v1/admin/queue/redrive" \
  -H "Authorization: Bearer $ADMIN_SIGNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"queue":"signal-webhooks"}'
```

## Authentication

All sensitive routes require scoped API keys. Managed keys are generated once, stored only as HMAC hashes with a prefix for lookup, can expire, can be revoked, and maintain `lastUsedAt`.

Scopes:

```txt
signals:read
signals:emit
signals:stream
webhooks:read
webhooks:write
audit:read
admin:keys
```

Create a key:

```bash
curl -X POST "$BASE/api/v1/admin/api-keys" \
  -H "Authorization: Bearer $ADMIN_SIGNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"consumer-a","scopes":["signals:read","signals:stream"]}'
```

The response includes the plaintext `secret` once. Store it immediately in the consumer secret manager.

Rotate a key:

```bash
curl -X POST "$BASE/api/v1/admin/api-keys/$KEY_ID/rotate" \
  -H "Authorization: Bearer $ADMIN_SIGNAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"graceSeconds":3600}'
```

Revoke a key:

```bash
curl -X POST "$BASE/api/v1/admin/api-keys/$KEY_ID/revoke" \
  -H "Authorization: Bearer $ADMIN_SIGNAL_KEY"
```

## Signal Ingestion

`POST /api/v1/signals/emit` accepts the envelope directly or `{ "signal": envelope }`. Every signal must include a stable `id` and `idempotencyKey`; duplicates return the original record and do not enqueue duplicate deliveries.

If `SIGNAL_REQUIRE_EMIT_SIGNATURE=true`, clients sign:

```txt
<timestamp>.<json-signal-body>
```

Headers:

```txt
X-Stocks-Optimizer-Timestamp
X-Stocks-Optimizer-Signature: sha256=<hmac-hex>
```

Signed requests are rejected when stale, invalid, or replayed inside the tolerance window.

## Delivery Guarantees

- Webhooks are at least once.
- Delivery IDs are stable per webhook/signal/event dedupe key.
- Consumers must dedupe by `X-Stocks-Optimizer-Delivery-Id`.
- Retries use exponential backoff from `SIGNAL_WEBHOOK_RETRY_BASE_MS`.
- Exhausted jobs move to dead letter and can be redriven.
- Signals are retained by the database retention policy; do not delete signal records before the documented replay window expires.

## Webhooks

Register:

```bash
curl -X POST "$BASE/api/v1/webhooks" \
  -H "Authorization: Bearer $WEBHOOK_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://consumer.example.com/hook","filters":{"symbols":["AAPL"],"minTrust":70}}'
```

Rotate webhook secret:

```bash
curl -X POST "$BASE/api/v1/webhooks/$WEBHOOK_ID/rotate-secret" \
  -H "Authorization: Bearer $WEBHOOK_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"graceSeconds":86400}'
```

Outbound headers:

```txt
X-Stocks-Optimizer-Timestamp
X-Stocks-Optimizer-Signature
X-Stocks-Optimizer-Event
X-Stocks-Optimizer-Delivery-Id
```

Signature input:

```txt
<timestamp>.<event>.<delivery-id>.<raw-body>
```

Security defaults:

- HMAC SHA-256 signatures.
- Constant-time comparison helper.
- HTTPS required in production.
- DNS and IP SSRF checks block localhost, private ranges, link-local addresses, and metadata-style destinations.
- Redirects are followed only up to `SIGNAL_WEBHOOK_REDIRECT_LIMIT` and revalidated.
- Requests time out and response bodies are capped.
- Secrets are encrypted at rest and never returned except once at creation/rotation.

## Streaming

```bash
curl -N \
  -H "Authorization: Bearer $STREAM_KEY" \
  "$BASE/api/v1/signals/stream?symbol=AAPL&minTrust=70"
```

Supported filters:

```txt
symbol
venue
kind
timeframe
minTrust
lastEventId
```

The stream sends `ready`, `heartbeat`, and `signal` events. Reconnect with `Last-Event-ID` or `lastEventId` to replay missed events up to the database retention window.

## API Stability

Stable endpoints:

```txt
GET  /health
GET  /ready
GET  /api/v1/capabilities
GET  /api/v1/openapi.json
GET  /api/v1/metrics
GET  /api/v1/signals/latest
GET  /api/v1/signals/:id
GET  /api/v1/signals
POST /api/v1/signals/emit
GET  /api/v1/signals/stream
POST /api/v1/webhooks
GET  /api/v1/webhooks
DELETE /api/v1/webhooks/:id
POST /api/v1/webhooks/:id/test
POST /api/v1/webhooks/:id/rotate-secret
GET  /api/v1/audit/signals
POST /api/v1/admin/api-keys
GET  /api/v1/admin/api-keys
POST /api/v1/admin/api-keys/:id/rotate
POST /api/v1/admin/api-keys/:id/revoke
POST /api/v1/admin/queue/redrive
```

Errors use:

```json
{
  "error": {
    "code": "invalid_signal",
    "message": "Signal payload failed schema validation.",
    "details": [],
    "requestId": "req-id"
  }
}
```

Backward compatibility policy: add fields, do not remove or rename fields inside `/api/v1`; introduce `/api/v2` for breaking changes and keep `/api/v1` until consumers have migrated.

## Observability

`GET /api/v1/metrics` includes storage stats, queue stats, process memory, stream client counts, counters, p50/p95/p99 latency summaries, and no secrets.

Alert thresholds to wire into the provider:

```txt
API 5xx rate > 2% for 5 minutes: sev2
API p95 latency > 500ms for 10 minutes: sev3
API p99 latency > 1500ms for 5 minutes: sev2
Queue depth > 75% of SIGNAL_QUEUE_MAX_DEPTH: sev2
Dead-letter count increases by > 0 in 5 minutes: sev2
Webhook failure rate > 5% over 10 minutes: sev2
Database health check failed for 2 minutes: sev1
Auth failures > 100 per key/IP in 5 minutes: sev2
Stream disconnect spike > 3x baseline: sev3
Storage capacity > 80%: sev2
```

Response actions:

```txt
sev1: page primary operator, freeze deploys, check database and queue worker health.
sev2: notify backend on-call, inspect metrics/audit logs, redrive or pause consumers as needed.
sev3: create incident ticket, compare baseline and deploy history.
```

## Disaster Recovery

Backups: enable point-in-time recovery for Postgres and keep daily logical backups long enough to cover the signal replay retention window.

Restore: restore to a new database, run `db:migrate`, validate `/ready`, start workers with `SIGNAL_QUEUE_INLINE_WORKER=false`, then switch traffic.

Audit replay: use `signal_audit_logs` plus `signal_records` to reconstruct accepted signals and delivery outcomes.

Partial delivery: redrive `dead_letter` webhook jobs after confirming consumer idempotency.

Duplicate delivery: consumers dedupe by delivery ID; API dedupes signal emit by idempotency key.

Bad deploy rollback: stop new workers, roll back API, leave Postgres schema forward-compatible, then redrive failed queue jobs.

Retention cleanup: prune replay keys, old audit logs, and old webhook delivery attempts only after the documented retention period and backup verification.

## CI/CD

Required checks:

```bash
pnpm --filter @workspace/api-server db:migrate:validate
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server build
pnpm audit --audit-level=high
```

Deployments must fail if migration validation, typecheck, tests, build, or high/critical dependency audit fails.
