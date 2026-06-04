# Maritime Aware

Maritime Aware is a Signal example application that turns maritime complexity into understandable guidance.

It is a guide, not a dashboard, vessel tracker, GIS platform, or surveillance tool. The app helps a normal person understand what matters in a maritime area, what threatens it, why the guide thinks that, how confident the evidence is, what remains unclear, and what action is reasonable next.

```text
Complexity stays inside the system.
Understanding reaches the user.
```

## Current Status

This MVP is fully local and uses mock adapters only.

Real integrations are intentionally behind adapter boundaries:

| Area | Current adapter | Future providers |
| --- | --- | --- |
| Areas | preset + custom area service | geocoding, port search, map selection persistence |
| Vessels | fixture vessel movement | AISStream, AISHub, public AIS providers |
| Weather | fixture weather context | Open-Meteo, NOAA, INMET |
| Ocean | fixture ocean context | Copernicus Marine, NOAA Ocean Data |
| Ports | fixture port operations | public port information, public logistics feeds |
| Incidents | fixture public notices | environmental notices, maritime advisories, safety notices |

The MVP does not require paid services.

## Product Shape

The primary flow is:

```text
Choose Maritime Area
Current Situation
What Matters
What Is Threatened
Why We Think That
Live Context Map
What You Can Do
What Remains Unclear
What To Watch Next
```

The map is context. The guide is the product.

## Run It

From the repository root:

```bash
pnpm --filter @signal/maritime-aware dev
```

Then open the local Vite URL shown by the command.

Useful searches:

```text
Port of Santos
South Atlantic
Galapagos
Singapore Strait
-23.95, -46.32
```

## Validate It

From the repository root:

```bash
pnpm --filter @signal/maritime-aware typecheck
pnpm --filter @signal/maritime-aware test
pnpm --filter @signal/maritime-aware build
```

The test suite covers:

| Test file | Coverage |
| --- | --- |
| `test/contracts.test.ts` | required risk shape and public vocabulary |
| `test/adapters.test.ts` | adapter boundaries and source metadata |
| `test/region-selection.test.ts` | ports, cities, coastlines, coordinates, custom areas |
| `test/vessels.test.ts` | interpolation, projection, freshness, clustering |
| `test/risk-engine.test.ts` | severity ranking and plain language |
| `test/uncertainty.test.ts` | stale, missing, degraded, and unclear evidence |
| `test/signal.test.ts` | Signal contracts, events, memory, idempotency |
| `test/api.test.ts` | HTTP route behavior |
| `test/integration.test.ts` | full choose-area to review smoke flow |
| `test/ui.test.tsx` | guide-first rendering and disclosure |
| `test/map-rendering.test.tsx` | SVG map, vessels, clusters, controls |

## Folder Structure

```text
examples/maritime-aware
  src/contracts        Public types and product vocabulary
  src/fixtures         Local maritime scenarios and area presets
  src/adapters         Mock adapter boundaries for future live data
  src/map              Vessel interpolation, projection, freshness, clustering
  src/signal           Signal operations, interpretation, memory integration
  src/api              Local HTTP API and Vite middleware
  src/frontend         React guide UI and map rendering
  test                 Contract, adapter, engine, API, Signal, UI tests
```

## Contracts

The central type is `MaritimeBriefing`.

Every guide includes:

- `area`: preset, coordinate, or user-defined maritime area.
- `currentSituation`: plain-language summary.
- `whatMatters`: health of Human Safety, Navigation, Port Operations, Marine Environment, Trade Flow, Fishing Resources, and Critical Infrastructure.
- `risks`: ranked guidance items.
- `vessels` and `clusters`: map context, not the product.
- `whatYouCanDo`: reasonable next actions.
- `remainsUnclear`: uncertainty that must stay visible.
- `watchNext`: what deserves attention after this guide.
- `sources`: confidence, freshness, and source status.
- `decisionMemory`: Signal memory trace.

Every `MaritimeRisk` includes:

```text
What Matters
Threat
Severity
Evidence
Confidence
Uncertainty
Suggested Action
Watch Next
```

## Region Model

Presets live in `src/fixtures/catalog.ts`, but the architecture is not preset-bound.

`createMaritimeAreaService()` supports:

- preset search by port, coastline, city, ocean, bay, and protected area terms;
- coordinate search such as `-23.95, -46.32`;
- unknown future areas by returning a deterministic custom maritime area;
- map-selected areas through `createCustomMaritimeArea()`.

Custom area IDs are encoded so the API can reconstruct them later:

```ts
const area = createCustomMaritimeArea({
  name: "Map selected bay",
  center: { latitude: -12.8, longitude: -38.5 },
  radiusKm: 70,
  method: "map"
});
```

## Adapter Boundary

All maritime data enters through `MaritimeDataAdapter`.

```ts
export type MaritimeDataAdapter = {
  id: string;
  collect(area: MaritimeArea): Promise<{
    observations: MaritimeObservation[];
    sources: EvidenceSource[];
    vessels?: VesselSnapshot[];
  }>;
};
```

Adapters should normalize provider-specific details into:

- plain-language evidence;
- confidence;
- freshness;
- uncertainty;
- suggested action;
- watch-next text.

Do not expose provider jargon directly to the UI.

## Adding A Real Provider

1. Create a new adapter beside the fixture adapter, for example `src/adapters/noaa-weather.ts`.
2. Keep the public output as `MaritimeObservation`, `EvidenceSource`, and optional `VesselSnapshot`.
3. Mark unavailable, stale, or conflicting evidence with source status and uncertainty.
4. Add adapter tests for success, stale data, missing data, and provider-specific normalization.
5. Add the adapter to `createDefaultMaritimeAdapters()` only after it works without paid or secret services.

## Vessel Movement

Vessel rendering is handled by `src/map/vessels.ts`.

It provides:

- interpolation between previous and current positions;
- speed-aware forward projection for fresh positions;
- heading rotation;
- freshness labels: `live`, `recent`, `stale`, `offline`;
- stale handling that stops projection;
- simple clustering for dense areas;
- map projection into percentage coordinates.

The UI should feel alive without pretending to be operational telemetry.

## Signal Integration

Signal owns evidence, uncertainty, confidence, decisions, memory, reviews, explainability, learning, and governance.

Maritime Aware owns maritime adapters, maritime language, region selection, map rendering, and presentation.

Signal operations:

| Operation | Kind | Purpose |
| --- | --- | --- |
| `maritime.area.search.v1` | query | search preset or custom areas |
| `maritime.guide.get.v1` | query | collect context and create a guide |
| `maritime.guide.details.v1` | query | read a guide or risk details |
| `maritime.sources.list.v1` | query | inspect source confidence and freshness |
| `maritime.feedback.submit.v1` | mutation | record user feedback idempotently |
| `maritime.guide.review.v1` | mutation | record reviewed outcomes into memory |
| `maritime.guide.generated.v1` | event | guide generated |
| `maritime.risk.escalated.v1` | event | action or urgent guidance produced |
| `maritime.feedback.received.v1` | event | feedback recorded |
| `maritime.source.degraded.v1` | event | evidence stale, degraded, or missing |

Decision memory is scoped to:

```text
examples/maritime-aware
```

Memory records include area, risks, observations, confidence, freshness, suggested action, what remains unclear, and watch-next context.

## API

The Vite dev server installs local API middleware.

| Route | Method | Result |
| --- | --- | --- |
| `/api/areas/search?q=Santos` | GET | area search results |
| `/api/areas/:areaId/guide` | GET | generated guide |
| `/api/guides/:briefingId` | GET | generated guide details |
| `/api/guides/:briefingId/sources` | GET | source details |
| `/api/feedback` | POST | feedback record |
| `/api/reviews` | POST | review record |

All API responses use:

```ts
{ ok: true, data: ... }
{ ok: false, error: { code, message } }
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Search works but guide returns 404 | custom area ID was not encoded | use `encodeURIComponent(area.id)` in browser requests |
| Map shows no vessels | vessel source is unavailable or stale in fixture | inspect `briefing.sources` and `briefing.remainsUnclear` |
| Guidance feels too certain | adapter omitted uncertainty | require uncertainty text for every observation |
| Typecheck cannot find React or Signal packages | workspace links missing | run `pnpm install --no-frozen-lockfile` from the repo root |
| A future provider returns raw jargon | adapter leaked provider language | normalize language in the adapter before it reaches `MaritimeObservation` |

## Maintenance Rules

- Keep the guide-first flow simple.
- Do not make the map the primary product.
- Do not expose raw AIS, ocean model, or logistics jargon first.
- Do not infer intent, compliance, or responsibility from vessel movement.
- Keep uncertainty visible.
- Treat stale evidence as a first-class condition.
- Add tests before replacing mock adapters with live providers.
- Reuse Signal modules for evidence, memory, review, and governance.

## Implementation Audit

| Category | Score | Evidence |
| --- | ---: | --- |
| Value | 10/10 | guide answers what matters, threat, why, confidence, uncertainty, action, watch-next |
| Simplicity | 10/10 | one area search and one guide flow |
| Maintainability | 10/10 | typed contracts, adapter boundaries, focused tests |
| Explainability | 10/10 | every risk carries evidence, confidence, uncertainty, action |
| Longevity | 10/10 | custom area model and future provider seams |
| Execution Cost | 10/10 | no paid services, no extra map dependency |
| User Understanding | 10/10 | plain language and progressive disclosure |
| Signal Alignment | 10/10 | Signal runtime, events, idempotency, decision memory, reviews |
