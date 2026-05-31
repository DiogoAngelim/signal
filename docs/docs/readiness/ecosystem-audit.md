---
title: Ecosystem Readiness Audit
---

# Ecosystem Readiness Audit

Status: initial public-readiness audit.

Date: 2026-05-31.

This audit records what the repository proves today. It does not authorize
removal. Anything listed as merge, deprecate, or archive candidate still needs
usage proof, a migration plan, a rollback plan, and compatibility verification.

## Evidence Gathered

- `pnpm -r list --depth -1` now discovers 42 root workspace projects.
- `rg --files -g package.json -g '!**/node_modules/**'` finds 85 package manifests across the full repository.
- `rg --files -g '*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}' -g '!**/node_modules/**' -g '!**/dist/**'` finds 155 test files.
- Public protocol artifacts exist in `spec/`, `spec/fixtures/`, and `schemas/`.
- GitHub Actions now contain a Signal core workflow, one landing deployment workflow, and one Stocks-Optimizer API workflow.

## Verification From This Audit

These checks passed after the workspace and documentation updates:

```bash
pnpm install --frozen-lockfile
pnpm --filter @signal/docs typecheck
pnpm --filter @signal/docs build
pnpm --filter @signal/landing build
pnpm --filter @signal/reference-server typecheck
pnpm --filter @signal/protocol test
pnpm --filter @signal/runtime test
pnpm --filter @signal/sdk-node test
pnpm --filter @signal/binding-http test
pnpm --filter @signal/examples test
pnpm --filter @signal/decision test
pnpm --filter @signal/decision-memory test
pnpm --filter @signal/agency test
pnpm --filter @signal/semantic-state test
pnpm --filter @digelim/02.received build
pnpm --filter @digelim/02.received test
pnpm --filter @digelim/03.validated build
pnpm --filter @digelim/03.validated test
pnpm --filter @digelim/12.signal build
pnpm --filter @digelim/12.signal test
pnpm --filter stocks-optimizer test
pnpm --filter stocks-optimizer typecheck
pnpm --filter @workspace/api-server db:migrate:validate
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/signal-markets build
pnpm build
```

Counts observed:

- `@signal/protocol`: 14 tests passed.
- `@signal/runtime`: 30 tests passed.
- `@signal/sdk-node`: 2 tests passed.
- `@signal/binding-http`: 2 tests passed.
- `@signal/examples`: 27 tests passed.
- `@signal/decision`: root and Stocks-Optimizer artifact packages both passed 6 tests each.
- `@signal/decision-memory`: root and Stocks-Optimizer artifact packages both passed 6 tests each.
- `@signal/agency`: root and Stocks-Optimizer artifact packages both passed 32 tests each.
- `@signal/semantic-state`: 17 tests passed.
- `@digelim/02.received`: build passed; 9 tests passed after index-signature-safe field access fixes.
- `@digelim/03.validated`: build passed; 9 tests passed after index-signature-safe field access fixes.
- `@digelim/12.signal`: build passed; 4 tests passed after environment field access was made TypeScript-strict.
- `stocks-optimizer`: API coverage run passed 385 tests; UI coverage run passed 72 tests.
- `stocks-optimizer` typecheck passed for API and UI workspaces.
- Stocks-Optimizer migration validation checked 1 signal API migration.
- Root `pnpm build` now passes for the Signal and Stocks-Optimizer workspace.

Warnings still worth tracking:

- pnpm emits a Node `url.parse()` deprecation warning during commands.
- pnpm reports ignored dependency build scripts for `core-js` and `sharp`.
- `esbuild-plugin-pino` declares an unmet peer range for the resolved esbuild version.
- Docusaurus warns that `onBrokenMarkdownLinks` should move before v4.
- The Stocks-Optimizer Vite build warns about browser externalization for `node:fs/promises` and `node:path` from calibration history code, plus one large output chunk.

## Package Classification

### Keep

These packages are part of the current Signal or Stocks-Optimizer operating
surface and should remain stable.

| Area | Packages | Reason |
| --- | --- | --- |
| Signal protocol/runtime | `@signal/protocol`, `@signal/runtime`, `@signal/sdk-node`, `@signal/binding-http`, `@signal/idempotency-postgres`, `@signal/examples`, `@signal/reference-server` | They define and demonstrate the public protocol, runtime, SDK, HTTP binding, storage adapter, examples, and server. |
| Signal decision layer | `@signal/decision`, `@signal/decision-memory`, `@signal/agency`, `@signal/semantic-state` | They provide generic decision records, memory, agency evaluation, and semantic state support. |
| Documentation and adoption | `@signal/docs`, `@signal/landing` | They are the public adoption surface. |
| Stocks-Optimizer | `stocks-optimizer`, `@workspace/api-server`, `@workspace/signal-markets`, `@workspace/api-client-react`, `@workspace/api-zod`, `@workspace/db`, `@workspace/binance-execution-worker`, `@workspace/mockup-sandbox` | They are the flagship implementation and deployment surface. |
| Compatibility packages | `@digelim/01.intent` through `@digelim/15.sync`, `@digelim/signal-protocol` | Keep until their relationship to the newer `@signal/*` protocol/runtime packages is documented and migration is verified. |
| Weather reference server | `weather-signal-server` | Keep as a separate private side server outside the Signal/Stocks root release path until its Fastify/plugin type stack is repaired and support status is explicit. |

### Improve

| Area | Evidence | Needed action |
| --- | --- | --- |
| Workspace discovery | Before this audit, documented filters such as `@signal/protocol`, `@signal/docs`, and `@signal/reference-server` matched no root workspace projects. | Keep root workspace coverage aligned with documented commands. |
| Public exports | Several public packages rely on `main` and `types` without explicit `exports`. | Add explicit exports in a compatibility-preserving release. |
| Duplicate package names | Root packages and Stocks-Optimizer artifacts both contain `@signal/agency`, `@signal/decision`, and `@signal/decision-memory`. | Document whether artifacts are vendored snapshots, deployment copies, or separate publish targets. |
| Dependency reproducibility | The root pnpm catalog uses many `latest` entries. Lockfiles exist at root and in nested apps. | Pin catalog versions and document which lockfile is canonical for each deployable unit. |
| CI coverage | CI now validates the core protocol/runtime/docs surface and Stocks-Optimizer API. | Extend CI with release packaging, rollback drills, and non-flagship example status before public release. |
| Documentation scope | The docs now have architecture, concepts, guides, examples, and reference pages, but Stocks-Optimizer integration remains separate under `examples/stocks-optimizer/docs`. | Link the flagship implementation from public docs without copying market logic into Signal. |
| Root internal modules | `packages/core`, `packages/http`, `packages/security`, `packages/transport`, and `packages/utils` have source files but no package manifest. | Document whether these are legacy internal modules, test fixtures, or future packages. |

### Merge Candidates

| Candidate | Why | Safe path |
| --- | --- | --- |
| Root `@signal/agency`, `@signal/decision`, `@signal/decision-memory` and Stocks-Optimizer artifact copies | Duplicate package names make filters ambiguous and can confuse contributors. | Compare source, publish status, and import paths. Keep adapters or snapshots until deploy compatibility is proven. |
| Root `signal-framework/` and `examples/stocks-optimizer/src/artifacts/signal-framework/` | Both contain framework modules and tests. | Treat one as canonical only after diff, test parity, and deployment proof. |
| `@digelim/*` compatibility packages and `@signal/*` protocol/runtime packages | They overlap in protocol/runtime concepts. | Publish a migration guide and compatibility adapter before any deprecation. |

### Deprecate Candidates

Do not deprecate yet. These need usage proof first.

| Candidate | Reason to review | Required proof |
| --- | --- | --- |
| Removed non-flagship example app snapshots | The weather, stocks, forex, and rider snapshots have been removed so `examples/stocks-optimizer` is the only maintained example app. | Confirm no deploy, import, or docs references still point at removed example paths. |

### Archive Candidates

Do not archive yet.

| Candidate | Reason to review | Required proof |
| --- | --- | --- |
| `full_missing_scaffold/` | Appears to be scaffold output. | Confirm no imports, no docs links, and no deploy dependency. |
| `shadcn_ui_missing_components/` | Appears to be UI scaffold support. | Confirm no active app import or install path. |
| Generated build output directories | `dist`, `docs/build`, `landing/out`, and artifact `dist` folders exist locally. | Confirm ignore/tracking policy and release artifact policy. |

## Public API Surface

Signal public APIs are currently centered on:

- `@signal/protocol`: envelopes, names, kinds, results, errors, schemas, and capabilities.
- `@signal/runtime`: registry, query execution, mutation execution, event dispatch, idempotency, execution context, perception, and capabilities.
- `@signal/sdk-node`: helpers for runtime creation and operation definitions.
- `@signal/binding-http`: Fastify HTTP binding and capabilities routes.
- `@signal/idempotency-postgres`: PostgreSQL idempotency store.
- `@signal/decision`: generic decision evaluation, replay, prediction, simulation, wisdom, outcomes, accountability, and operation registration.
- `@signal/decision-memory`: decision memory storage, retention, replay, compaction, summary, and environment-backed store creation.
- `@signal/agency`: agency state evaluation, policy, learning, memory, calibration, outcome, and self-diagnosis helpers.
- `@signal/examples`: runnable flows for minimal runtime, post publication, HTTP publication, idempotency storage, custom transport, payment capture, escrow release, onboarding, and Kafka/PostgreSQL.

Compatibility APIs exist under `@digelim/*` and `@digelim/signal-protocol`.
Their relationship to the `@signal/*` APIs needs a public migration statement.

## Internal Modules

Internal or unclear modules include:

- `packages/core`, `packages/http`, `packages/security`, `packages/transport`, and `packages/utils`: source-only modules covered by root tests.
- `signal-framework/`: generic decision and reasoning modules with tests.
- `signal/modules/`: small module area with discovery-intelligence source.
- `api/` and `public/`: deployment or static asset surface.
- `weather-signal-server/`: private side server with its own package manifest and lockfile, currently outside the root workspace release path.
- `examples/stocks-optimizer/`: the maintained flagship example app and deployment surface.

These should be documented before public adoption instructions point at them.

## Build Systems

- Root package manager: pnpm.
- Signal packages: TypeScript `tsc`, Vitest, c8 coverage where configured.
- Docs: Docusaurus.
- Landing: Next.js static export.
- Stocks-Optimizer API: esbuild, TypeScript, Node test runner, c8.
- Stocks-Optimizer UI: Vite, React, Vitest.
- Workflow automation: GitHub Actions for Signal core checks, landing deployment, and Stocks-Optimizer API.

## Test Coverage Map

Current test files cover:

- Signal protocol conformance, envelopes, errors, results, runtime behavior, perception, HTTP binding, SDK, idempotency, and examples.
- Decision, agency, decision memory, semantic state, and signal framework modules.
- Stocks-Optimizer API behavior, model lifecycle, market backtests, decision intelligence, Binance execution module, and dashboard/UI logic.
- Weather server routes, normalization, replay, dedupe, policy, scoring, webhooks, and WebSocket behavior.

Known gaps:

- No single release workflow currently proves package publishing, rollback, deployment recovery, and every non-flagship example workspace together.
- Non-flagship example workspaces are not root-workspace release gates.
- `weather-signal-server` is not a root-workspace release gate until its standalone build/type stack is fixed.
- Public docs should state which tests prove each contract before release.

## Failure Modes

Signal:

- Invalid envelope or operation name.
- Payload schema validation failure.
- Unsupported operation.
- Handler business rejection.
- Deadline exceeded or cancellation.
- Idempotency conflict when the same key is reused with a different normalized payload.
- Replay or redelivery requiring consumer dedupe.
- Transport binding mismatch.

Stocks-Optimizer:

- Missing or invalid production environment variables.
- Postgres outage or migration checksum drift.
- Queue backlog, lease expiry, exhausted retries, or dead-letter growth.
- Webhook target timeout, redirect, invalid signature, SSRF block, or oversized response.
- SSE client overload or write timeout.
- Market data provider timeout, stale cache, rate limit, or missing historical coverage.
- Binance live execution gate failure, stale account sync, exchange filter rejection, kill switch, or regional egress block.

## Single Points Of Failure

- Postgres is the durable source for production signal API persistence and decision memory.
- A single API web process or queue worker can become a capacity bottleneck.
- Secret material controls API keys, webhook secrets, ingestion signatures, and encryption.
- Market data providers affect Stocks-Optimizer decision freshness.
- Vercel deployment and Binance network eligibility affect execution architecture.
- Documentation deployment currently points at the landing workflow; the Docusaurus docs build is verified by the Signal core workflow.

## Compatibility Risks

- Duplicate package names make `pnpm --filter @signal/decision` select both root and Stocks-Optimizer artifact packages.
- `latest` catalog entries weaken reproducibility even with a lockfile.
- Multiple package managers and nested lockfiles can confuse contributors.
- CJS packages and ESM apps coexist; public exports need explicit compatibility tests.
- Compatibility packages under `@digelim/*` need migration guidance before any rename or removal.
- The root workspace now covers more projects, so root `build`, `test`, and `typecheck` commands have a larger and more accurate blast radius.

## Release Gate

No public release should proceed until these pass from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @signal/protocol test
pnpm --filter @signal/runtime test
pnpm --filter @signal/sdk-node test
pnpm --filter @signal/binding-http test
pnpm --filter @signal/examples test
pnpm --filter @signal/docs build
pnpm --filter @signal/landing build
pnpm --filter stocks-optimizer test
pnpm --filter stocks-optimizer typecheck
pnpm --filter @workspace/api-server db:migrate:validate
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/signal-markets build
```

Production release also requires:

- migration rollback or forward-fix plan
- deployment rollback plan
- package rollback plan
- Postgres backup and restore verification
- webhook redrive procedure
- queue dead-letter procedure
- environment variable review
- examples verified against the current docs

## Adoption Readiness Score

Current status is not 10/10. The strongest evidence is protocol/runtime tests,
Stocks-Optimizer API tests, documented migration validation, and explicit
security gates around webhooks and Binance execution.

The biggest adoption blockers are workspace/package ambiguity, duplicate package
names, incomplete cross-ecosystem CI, unclear legacy package status, and docs
that need to connect the protocol, runtime, and flagship implementation more
directly.
