# Module Map

This map classifies repository areas by architectural status. It is the baseline
for future domain-boundary enforcement.

| Path | Status | Purpose | Public API | Allowed Dependencies | Forbidden Dependencies |
| --- | --- | --- | --- | --- | --- |
| `packages/protocol` | Canonical | Protocol names, envelopes, results, errors, capabilities, schema helpers | Yes | Validation libraries, generated contract helpers | Runtime, transports, app code, compatibility packages |
| `packages/runtime` | Canonical | Query, mutation, event execution, dispatch, idempotency, replay helpers | Yes | `@signal/protocol`, runtime interfaces | HTTP binding internals, app-specific adapters, compatibility packages |
| `packages/sdk-node` | Canonical SDK | Node helper API for defining operations and creating runtimes | Yes | `@signal/protocol`, `@signal/runtime` | HTTP server internals, app packages |
| `packages/binding-http` | Canonical transport | Fastify HTTP routes and server binding | Yes | `@signal/protocol`, `@signal/runtime`, Fastify | Application state stores, compatibility packages |
| `packages/idempotency-postgres` | Canonical persistence adapter | Durable PostgreSQL idempotency | Yes | `@signal/protocol`, `@signal/runtime`, Drizzle, pg | HTTP binding, examples, app code |
| `packages/examples` | Examples | Runnable usage examples | Public examples | Canonical packages, selected infrastructure clients | Canonical package internals |
| `apps/reference-server` | Reference app | Local HTTP reference server | Public app | Canonical packages, examples, idempotency adapter | Private compatibility internals |
| `docs` | Documentation | Product docs, generated site source, roadmap | Public docs | Docusaurus, source references | Runtime-only assumptions without source links |
| `spec` | Protocol governance | RFCs and protocol fixtures | Public spec | Protocol docs and fixtures | Runtime implementation details as normative behavior |
| `schemas` | Published schemas | Current JSON schema artifacts | Public contracts | Generated contract output once available | Hand changes after generation becomes canonical |
| `contracts` | Planned canonical contracts | Query, mutation, event, OpenAPI, AsyncAPI, JSON Schema generation | Public contracts | Protocol definitions and generators | App-only behavior unless declared consumer contract |
| `backend/*` | Compatibility | Published `@digelim/*` compatibility modules | Compatibility API | Canonical packages after migration, internal compatibility helpers | New canonical protocol semantics |
| `backend/signal` | Duplicate compatibility risk | Second protocol/runtime implementation | Compatibility API | Canonical wrappers after migration | Divergent envelope, error, event, or idempotency behavior |
| `packages/core`, `packages/http`, `packages/security`, `packages/transport`, `packages/utils` | Legacy source | Older source modules covered by root tests | Legacy only | Root compatibility test helpers | New canonical dependencies without ownership decision |
| `signal-framework` | Framework layer | Domain-neutral engines, reasoning modules, Stocks Optimizer adapter | Framework API | Pure helpers, explicit package APIs | Redefining Signal protocol/runtime semantics |
| `packages/decision`, `packages/decision-memory`, `packages/agency`, `packages/commitment`, `packages/semantic-state` | Higher-level public packages | Decision, memory, agency, commitment, semantic state | Public APIs | Canonical protocol/runtime where needed, persistence adapters | Hidden coupling to examples or local-only data |
| `landing` | Website | Product website | Public site | Next.js frontend dependencies | Runtime internals |
| `.github/workflows` | CI/CD | Build, docs, API, and integration workflows | Operational API | Workspace commands and verified scripts | References to untracked required applications |

## Boundary Manifest Template

Each module must eventually declare:

```yaml
module: packages/runtime
purpose: Query, mutation, event execution and runtime coordination.
owner: Runtime
status: canonical
public_api:
  - src/index.ts
internal_api:
  - src/internal/**
allowed_dependencies:
  - packages/protocol
forbidden_dependencies:
  - packages/binding-http
  - backend/**
  - apps/**
compatibility_policy: stable
```

## Enforcement Plan

1. Add boundary manifests in report-only mode.
2. Generate the dependency graph from source imports.
3. Fail CI on newly introduced forbidden imports.
4. Snapshot public exports for canonical packages.
5. Require ADR review for status changes.
