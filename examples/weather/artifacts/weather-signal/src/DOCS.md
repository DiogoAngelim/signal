# Weather Signal

## Overview
Weather Signal is a premium React + TypeScript web application designed as a calm, premium weather risk monitoring tool for non-technical people. It now connects to the Weather Signal Server backend for live data.

## Final File Tree
```
src/
├── App.tsx
├── DOCS.md
├── components/
│   ├── dashboard/
│   │   ├── LiveUpdatesFeed.tsx
│   │   ├── ProviderHealth.tsx
│   │   ├── RegionCard.tsx
│   │   ├── RegionGrid.tsx
│   │   └── SummaryBar.tsx
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   └── Navbar.tsx
│   ├── region/
│   │   ├── AlertStrip.tsx
│   │   ├── EventTimeline.tsx
│   │   ├── ForecastChart.tsx
│   │   ├── RiskDrivers.tsx
│   │   └── StatusBadge.tsx
│   └── ui/
│       └── [shadcn/ui components]
├── data/
│   ├── mockRegions.ts
│   └── mockUpdates.ts
├── types/
│   └── weather.ts
├── hooks/
│   └── [custom hooks if any]
├── index.css
├── lib/
│   ├── api.ts
│   ├── statusConfig.ts
│   └── utils.ts
├── main.tsx
├── pages/
│   ├── DashboardPage.tsx
│   ├── LandingPage.tsx
│   ├── RegionDetailPage.tsx
│   └── not-found.tsx
├── store/
│   └── useWeatherStore.ts
└── vite-env.d.ts
```

## How to run locally
Run the following command from the workspace root:
```bash
pnpm --filter @workspace/weather-signal run dev
```

## Backend Integration
The API layer lives in `src/lib/api.ts` and integrates with the Weather Signal Server REST API and WebSocket.
Use these env vars when running the frontend:

- `VITE_API_BASE_URL` (default: `/api`)
- `VITE_WS_BASE_URL` (optional, overrides WebSocket URL)
- `VITE_API_PROXY_TARGET` (default: `http://localhost:8080` for Vite proxy)

The map tab uses OpenStreetMap tiles via Leaflet and does not require an API key.

The mock data remains in `src/data/mockRegions.ts` and `src/data/mockUpdates.ts` as reference fixtures, but the app now fetches live data by default.

Backend polling defaults to 5 minutes for forecasts and 3 minutes for alerts. For large region lists, the server supports request batching via `PROVIDER_BATCH_SIZE` and `PROVIDER_BATCH_DELAY_MS` in the backend `.env`.

## Design Choices
- **Aesthetic**: "Serene authority". Minimalist, uncluttered layout with generous white space. Uses an Inter-based typographic hierarchy.
- **Color**: Semantic status colors (Calm, Watch, Warning, Critical) that act as the primary visual communication. Color is used sparingly elsewhere.
- **Dark Mode**: Slate/Navy tones instead of pure black for a more elegant, softer feel.
- **Motion**: Framer Motion is used for soft fade-ins and gentle slides, respecting `prefers-reduced-motion` settings.
- **Mobile-first**: Responsive grids and panel layouts that work seamlessly on phones and desktops.
- **Accessibility**: High contrast text, clear focus rings, and proper semantic HTML. Keyboard navigability is built in.