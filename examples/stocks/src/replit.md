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

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Signal Markets (`artifacts/signal-markets`)
- **Type**: react-vite, served at `/`
- **Purpose**: Premium stock intelligence platform for non-technical investors
- **Stack**: React + Vite + TailwindCSS + shadcn/ui + Framer Motion + Recharts + wouter + next-themes
- **Pages**:
  - `/` — Landing page (hero, trust section, value props, philosophy, social proof, CTA)
  - `/dashboard` — Main investor dashboard with stock cards, detail panel, portfolio overview, live feed
- **Data**: Fully isolated mock data in `src/lib/mockData.ts` + `src/lib/mockApi.ts`
- **Features**: Dark mode toggle, stock card grid, clickable detail panel with sparkline, live updates feed, portfolio allocation bars, system health footer
- **Design**: Apple-grade calm aesthetic — cool slate palette, restrained color status system (Stable/Rising/Watch/Dip), generous whitespace, rounded cards, soft shadows, Framer Motion animations
