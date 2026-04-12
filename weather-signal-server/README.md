# Weather Signal Server

Weather Signal Server is a Node.js + TypeScript backend that ingests forecasts and official alerts, normalizes them into a single event model, scores regional risk, makes policy decisions, and publishes the results via REST, WebSocket streams, and outbound webhooks.

## What It Is
A real-time hazard intelligence backend for frontend dashboards, automation workflows, and operational response tools. It exposes a clean REST API, WebSocket streams, and webhook delivery with retries.

## What It Does
- Ingests forecast data from Open-Meteo
- Ingests official U.S. alerts from NOAA/NWS
- Normalizes payloads into `signal.weather.v1`
- Computes regional hazard/risk scores
- Evaluates policy decisions
- Publishes results via REST, WebSocket, and webhooks

## Why It Is Useful
- Centralizes forecast + alert ingestion behind one API
- Provides deterministic, explainable risk scores
- Reduces frontend complexity with normalized output
- Supports near real-time updates for multiple regions
- Enables automated downstream actions via webhooks

## Architecture Overview
Pipeline:
1. Load configured regions
2. Poll forecast providers
3. Poll alert providers
4. Validate payloads
5. Normalize provider payloads into `NormalizedEvent`
6. Deduplicate and retain recent events
7. Compute risk scores
8. Evaluate policy decisions
9. Publish to REST + WebSocket + webhooks
10. Store recent outputs for replay

Key modules:
- Providers: `src/providers`
- Normalization: `src/normalization`
- Scoring: `src/scoring`
- Policy: `src/policy`
- Services: `src/services`
- Store: `src/store`
- Routes: `src/routes`
- WebSockets: `src/websocket`
- Webhooks: `src/webhooks`

## Configuration
Create `.env` from the example:

```
cp .env.example .env
```

Environment variables:
- `HOST` (default `0.0.0.0`)
- `PORT` (default `8080`)
- `LOG_LEVEL` (default `info`)
- `FORECAST_POLL_INTERVAL_MS` (default `300000`)
- `ALERT_POLL_INTERVAL_MS` (default `180000`)
- `EVENT_RETENTION_LIMIT` (default `500`)
- `WEBHOOK_TIMEOUT_MS` (default `5000`)
- `WEBHOOK_RETRY_COUNT` (default `3`)
- `REGION_CONFIG_PATH` (default `./regions.json`)
- `PROVIDER_BATCH_SIZE` (default `3`)
- `PROVIDER_BATCH_DELAY_MS` (default `250`)
- `ENABLE_PROVIDER_OPENMETEO` (default `true`)
- `ENABLE_PROVIDER_NWS` (default `true`)
- `DEMO_MODE` (default `false`)

Use `PROVIDER_BATCH_SIZE` and `PROVIDER_BATCH_DELAY_MS` to stagger provider requests when monitoring many regions.

## Region Configuration
Regions are loaded from `regions.json` by default.

Example:
```json
{
  "id": "nyc",
  "name": "New York City",
  "country": "US",
  "state": "NY",
  "latitude": 40.7128,
  "longitude": -74.006,
  "timezone": "America/New_York",
  "criticalityWeight": 1.2,
  "tags": ["coastal", "urban_dense"]
}
```

## Install
From the repo root:

```
cd weather-signal-server
npm install
```

Create the environment file:

```
cp .env.example .env
```

Start the server:

```
npm run dev
```

Build + start:
```
npm run build
npm run start
```

Run tests:
```
npm run test
```

Manual scripts:
```
npm run poll:forecast
npm run poll:alerts
npm run replay
npm run smoke
```

## How To Use

### REST API Overview
System:
- `GET /health`
- `GET /ready`
- `GET /api/providers/health`

Regions:
- `GET /api/regions`
- `GET /api/regions/:regionId`

Forecasts:
- `GET /api/regions/:regionId/forecast`
- `GET /api/forecast/latest`

Alerts:
- `GET /api/regions/:regionId/alerts`
- `GET /api/alerts/active`

Risk:
- `GET /api/regions/:regionId/risk`
- `GET /api/risk/latest`

Decisions:
- `GET /api/regions/:regionId/decisions`
- `GET /api/decisions/recent`

Events:
- `GET /api/events/recent`
- `GET /api/events/replay?limit=100`

Webhooks:
- `GET /api/webhooks`
- `POST /api/webhooks`
- `DELETE /api/webhooks/:id`

Manual control:
- `POST /api/poll/forecast`
- `POST /api/poll/alerts`
- `POST /api/recompute/risk`
- `POST /api/recompute/decisions`

### WebSocket Usage
Endpoint: `ws://HOST:PORT/ws`

Subscribe example:
```json
{ "action": "subscribe", "channel": "weather.alerts", "regionId": "nyc" }
```

Supported channels:
- `weather.alerts`
- `weather.risks`
- `weather.decisions`
- `weather.providerHealth`
- `weather.events`

Message shape:
```json
{
  "channel": "weather.risks",
  "type": "computed",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": { "regionId": "nyc", "compositeRisk": { "score": 0.82 } }
}
```

### Webhook Usage
Register:
```bash
curl -X POST http://localhost:8080/api/webhooks \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/webhook","events":["weather.alert.issued"]}'
```

Delivery payload:
```json
{
  "event": { "name": "weather.alert.issued", "payload": { "...": "..." } },
  "deliveredAt": "2024-01-01T00:00:00Z",
  "attempt": 1
}
```

### Demo Mode
Set `DEMO_MODE=true` to use built-in fixtures for Open-Meteo and NWS. This allows the app to run without external network dependencies.

### Adding a New Provider
1. Implement the `Provider` interface in `src/providers`.
2. Add normalization in `src/normalization`.
3. Register the provider in `src/main.ts` (and CLI if needed).

### Curl Examples
List regions:
```bash
curl http://localhost:8080/api/regions
```

Fetch latest forecast:
```bash
curl http://localhost:8080/api/forecast/latest
```

Trigger forecast poll:
```bash
curl -X POST http://localhost:8080/api/poll/forecast
```

Get a region risk score:
```bash
curl http://localhost:8080/api/regions/nyc/risk
```

List active alerts:
```bash
curl http://localhost:8080/api/alerts/active
```

### Frontend Fetch Example
```ts
const response = await fetch("/api/regions/nyc/risk");
const { data } = await response.json();
console.log(data);
```

### Frontend WebSocket Example
```ts
const socket = new WebSocket("ws://localhost:8080/ws");

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ action: "subscribe", channel: "weather.risks", regionId: "nyc" }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  console.log(message);
});
```

### Example Webhook Registration
```bash
curl -X POST http://localhost:8080/api/webhooks \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/webhook","events":["weather.alert.issued","weather.risk.computed"],"regionIds":["nyc"]}'
```

### Manual Workflow Example
```bash
curl -X POST http://localhost:8080/api/poll/forecast
curl -X POST http://localhost:8080/api/poll/alerts
curl -X POST http://localhost:8080/api/recompute/risk
curl -X POST http://localhost:8080/api/recompute/decisions
```

## Contributing
1. Create a feature branch off `main`.
2. Keep changes focused and add tests for new behavior.
3. Run the checks before opening a PR:

```
npm run test
npm run lint
```

4. Document any new endpoints or configuration changes in this README.
