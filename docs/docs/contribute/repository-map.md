---
title: Repository Map
---

# Repository Map

This page records the cleanup audit and the current navigation model.

## Beginner Map

```txt
packages/protocol              Protocol contract
packages/runtime               Query, Mutation, Event execution
packages/sdk-node              Node helper API
packages/binding-http          HTTP adapter
packages/idempotency-postgres  Postgres idempotency adapter
packages/examples              Runnable examples
apps/reference-server          First local server
docs                           Beginner documentation
spec                           RFCs and fixtures
schemas                        JSON schemas
```

## Public API Surface

| Package | Status | Entry Point | Purpose |
| --- | --- | --- | --- |
| `@signal/protocol` | public | `packages/protocol/src/index.ts` | Envelopes, names, results, errors, schemas, capabilities |
| `@signal/runtime` | public | `packages/runtime/src/index.ts` | Runtime, registry, dispatcher, idempotency, execution |
| `@signal/sdk-node` | public | `packages/sdk-node/src/index.ts` | `createSignalRuntime`, `defineQuery`, `defineMutation`, `defineEvent` |
| `@signal/binding-http` | public | `packages/binding-http/src/index.ts` | HTTP routes and Fastify server |
| `@signal/idempotency-postgres` | public | `packages/idempotency-postgres/src/index.ts` | Postgres-backed idempotency |
| `@signal/examples` | public | `packages/examples/index.ts` | Runnable examples |
| `@signal/reference-server` | public | `apps/reference-server/src/app.ts` | Local HTTP server |

## Keep

These areas are active because package manifests, workspace entries, tests,
imports, docs, or deployment config reference them:

- `packages/protocol`
- `packages/runtime`
- `packages/sdk-node`
- `packages/binding-http`
- `packages/idempotency-postgres`
- `packages/examples`
- `packages/agency`
- `packages/decision`
- `packages/decision-memory`
- `packages/semantic-state`
- `packages/commitment`
- `apps/reference-server`
- `landing`
- `docs`
- `spec`
- `schemas`
- `fixtures`
- `signal-framework`
- `backend/*`
- `packages/signal-protocol`

## Keep But Clarify Later

These areas are useful or referenced, but not beginner-facing:

- `packages/core`, `packages/http`, `packages/security`, `packages/transport`, `packages/utils`: source-only legacy modules covered by root tests.
- `backend/*`: compatibility packages published as `@digelim/*`.
- `signal-framework`: decision and reasoning modules used by tests.
- `signal/modules`: small re-export area for selected framework modules.

## Removed As Proven Clutter

These were removed because search found no active imports, package entrypoints,
workspace entries, tests, docs links, build references, or deploy references:

- generated Docusaurus state in `docs/.docusaurus`
- generated docs build output in `docs/build`
- stale root documentation files replaced by this docs set
- `repo.txt`
- `architecture.png`
- `NRC-Emotion-Lexicon`
- `full_missing_scaffold` and its zip archive
- `shadcn_ui_missing_components` and its zip archive
- checked-in `.signal-example-training` snapshots
- stale root `EXAMPLE.ts`

## Build Scripts

| Command | Purpose |
| --- | --- |
| `pnpm --filter @signal/reference-server... build` | Build the Quick Start server and dependencies |
| `pnpm --filter @signal/reference-server start` | Run the local server |
| `pnpm --filter @signal/examples test` | Verify examples |
| `pnpm --filter @signal/docs build` | Build documentation |
| `pnpm --filter @signal/landing build` | Build landing page |

## Tests

Core tests live beside their packages:

- `packages/protocol/test`
- `packages/runtime/test`
- `packages/sdk-node/test`
- `packages/binding-http/test`
- `packages/examples/test`
- `apps/reference-server/test`

Larger or compatibility tests live in:

- `packages/agency/src`
- `packages/decision/src`
- `packages/decision-memory/test`
- `signal-framework`
- `backend/*/test`
- `test`

## What You Learned

The beginner path is small, and the larger repo is still documented so
contributors can avoid accidental cleanup.

## Next Recommended Page

[What Is Signal?](../what-is-signal.md)

Estimated reading time: 8 minutes.
