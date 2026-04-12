# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Weather Signal (`artifacts/weather-signal`)
- **Type**: React + Vite + TypeScript + TailwindCSS + shadcn/ui + Framer Motion
- **Preview path**: `/`
- **Purpose**: Premium weather risk monitoring app for non-technical users
- **Features**: Landing page, dashboard with region cards, region detail view, live updates feed, dark mode
- **Data**: Mock data only (6 regions: NYC, Miami, Houston, Juiz de Fora, São Paulo, Lisbon)
- **State**: Zustand for dark mode, selected region, refresh tracking
- **API layer**: `src/lib/api.ts` — isolated mock implementations; swap for real REST/WS when backend ready
- **Status levels**: Calm / Watch / Warning / Critical (defined in `src/lib/statusConfig.ts`)
- **Key files**:
  - `src/data/mockRegions.ts` — all mock region data
  - `src/data/mockUpdates.ts` — live feed mock entries
  - `src/lib/api.ts` — API layer (replace for real backend)
  - `src/lib/statusConfig.ts` — status color/label config
  - `src/store/useWeatherStore.ts` — Zustand store

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/weather-signal run dev` — run Weather Signal locally
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
