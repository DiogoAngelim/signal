# Signal Distribution API

The `stocks-optimizer` backend exposes a platform-neutral signal gateway for REST, Server-Sent Events, and signed webhooks. It is backend-only and does not require any frontend changes.

## Environment

Required in production:

```txt
SIGNAL_API_KEYS=key-one:reader|emitter|webhook_admin|auditor
```

Optional:

```txt
SIGNAL_INGESTION_SIGNING_SECRET=shared-ingest-secret
SIGNAL_REQUIRE_EMIT_SIGNATURE=true
SIGNAL_API_RATE_LIMIT_MAX=120
SIGNAL_API_RATE_LIMIT_WINDOW_MS=60000
SIGNAL_API_CORS_ORIGINS=https://example.com
SIGNAL_API_BODY_LIMIT=1mb
SIGNAL_WEBHOOK_MAX_ATTEMPTS=3
SIGNAL_WEBHOOK_RETRY_BASE_MS=500
SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS=false
```

In non-production, `dev-signal-key` is accepted unless `SIGNAL_API_ALLOW_DEV_KEY=false`.

## Authentication

All signal, stream, webhook, audit, and metrics routes require API-key auth:

```txt
Authorization: Bearer <api-key>
```

For EventSource clients that cannot send headers, `/signals/stream` also accepts `?apiKey=<api-key>`.

Roles:

```txt
reader         Read signals and streams
emitter        Emit signals
webhook_admin  Manage webhooks
auditor        Read audit and metrics
admin          All permissions
```

## Endpoints

Versioned routes are mounted under `/api/v1`; non-versioned `/api` aliases are also available.

```txt
GET  /health
GET  /ready
GET  /api/v1/capabilities
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
GET  /api/v1/audit/signals
```

## Signal Payload

`POST /api/v1/signals/emit` accepts either the envelope directly or `{ "signal": envelope }`.

```json
{
  "protocol": "stocks-optimizer.signal",
  "version": "1.0",
  "id": "sig-001",
  "messageId": "msg-001",
  "timestamp": "2026-05-31T17:30:00.000Z",
  "source": "stocks-optimizer",
  "venue": "NASDAQ",
  "symbol": "AAPL",
  "timeframe": "1m",
  "kind": "buy",
  "confidence": 74,
  "trust": 81,
  "risk": 32,
  "exposure": 2,
  "sizingMode": "micro",
  "maxExposure": 6,
  "reason": "Breakout confirmed with controlled risk.",
  "explanation": "The signal has aligned confidence, trust, and fresh data.",
  "metrics": {
    "calibratedConfidence": 78,
    "dataFreshnessMs": 10
  },
  "modules": {
    "discovery": { "score": 82 },
    "judgement": { "trust": 80 },
    "calibration": { "confidence": 78 }
  },
  "status": "confirmed",
  "idempotencyKey": "stocks-optimizer:AAPL:2026-05-31T17:30:00Z"
}
```

The response includes the normalized signal plus trust metadata:

```json
{
  "accepted": true,
  "duplicate": false,
  "latencyMs": 3.2,
  "signal": {},
  "trust": {
    "rawConfidence": 74,
    "calibratedConfidence": 78,
    "trustScore": 81,
    "riskState": "normal",
    "exposureCap": 6,
    "actionability": "actionable"
  },
  "acceptedAt": "2026-05-31T17:30:00.100Z",
  "sequence": 1
}
```

Duplicate `idempotencyKey` values return `accepted: false` and the original record.

## Signed Ingestion

If `SIGNAL_INGESTION_SIGNING_SECRET` is set, clients may sign emitted signals. If `SIGNAL_REQUIRE_EMIT_SIGNATURE=true`, signatures are required.

Signature input:

```txt
<timestamp>.<json-signal-body>
```

Headers:

```txt
X-Stocks-Optimizer-Timestamp: 2026-05-31T17:30:00.000Z
X-Stocks-Optimizer-Signature: sha256=<hmac-hex>
```

Signed requests are replay-protected inside the configured tolerance window.

## Streaming

Server-Sent Events:

```bash
curl -N \
  -H "Authorization: Bearer $SIGNAL_API_KEY" \
  "https://host/api/v1/signals/stream?symbol=AAPL&minTrust=70"
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

The stream sends `ready`, `heartbeat`, and `signal` events. Reconnect with `Last-Event-ID` or `lastEventId` to replay missed events.

## Webhooks

Register a webhook:

```bash
curl -X POST "https://host/api/v1/webhooks" \
  -H "Authorization: Bearer $SIGNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://consumer.example.com/stocks-optimizer",
    "secret": "consumer-shared-secret",
    "filters": { "symbols": ["AAPL"], "minTrust": 70 }
  }'
```

Webhook requests include:

```txt
X-Stocks-Optimizer-Timestamp
X-Stocks-Optimizer-Signature
X-Stocks-Optimizer-Event
X-Stocks-Optimizer-Delivery-Id
```

The signature input is:

```txt
<timestamp>.<event>.<delivery-id>.<raw-body>
```

JavaScript verification:

```js
import crypto from "node:crypto";

export function verifyWebhook({ secret, timestamp, event, deliveryId, body, signature }) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${event}.${deliveryId}.${body}`)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Webhook failures retry with exponential backoff and are recorded in the audit trail. Localhost and private-network destinations are blocked unless `SIGNAL_WEBHOOK_ALLOW_PRIVATE_TARGETS=true` in non-production.

## Errors

Errors use a consistent shape:

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

## Deployment Notes

The API is bundled with `@workspace/api-server` and routed through `api/api-catchall.js` on Vercel. It uses in-memory storage by default for low-latency hot-path delivery; the storage adapter in `src/storage/signal-store.ts` is the replacement point for durable database persistence.

