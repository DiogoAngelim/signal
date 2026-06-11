# Signal Dependency Rules

This document defines the explicit dependency direction rules that govern
Signal's package architecture. These rules are enforced in CI by
`dependency-cruiser` (`.dependency-cruiser.js`) and by TypeScript path aliases
(`tsconfig.base.json`).

## Dependency DAG

Signal enforces a strict unidirectional dependency DAG:

```txt
Signal (pure contracts and types)
  → Domain Packages (reasoning logic)
    → Protocol (shared contracts only)

Ports (pure interfaces)
  ← Runtime (execution mechanics)
  ← Interface packages (SDK, HTTP binding)

Runtime (execution)
  → Protocol (shared contracts)
  → Ports (injected interfaces)

Interface packages (SDK, HTTP binding)
  → Runtime
  → Ports

Applications and examples
  → Interface packages
  → Domain packages
  → Protocol

Post-Trade (signal-cli)
  → (no upstream dependencies)
```

## Allowed Dependencies

| From | To | Reason |
|------|----|--------|
| **Apps** | → Interface packages | Applications use SDK and HTTP binding to interact with Signal |
| **Apps** | → Domain packages | Applications use decision, agency, commitment for reasoning |
| **Apps** | → Protocol | Applications may reference protocol contracts directly |
| **Interface** | → Kernel (runtime, ports) | SDK and HTTP binding delegate to runtime and ports |
| **Kernel (Runtime)** | → Protocol | Runtime uses protocol contracts for execution |
| **Kernel (Runtime)** | → Ports | Runtime depends on port interfaces for dependency inversion |
| **Domain** | → Protocol | Domain packages use protocol for type-only shared contracts |
| **Ports** | → (nothing) | Ports are pure interfaces with zero dependencies |

## Forbidden Dependencies

| From | To | Why |
|------|----|-----|
| **Ports** | → Runtime | Ports define interfaces; they must not depend on implementations |
| **Ports** | → Domain | Ports must not depend on any domain package |
| **Ports** | → Interface packages | Ports must not depend on SDK or HTTP binding |
| **Runtime** | → Apps | Runtime must not depend on any application |
| **Runtime** | → Domain packages | Runtime must not import domain logic; it receives domain behavior through injected `DecisionPort` |
| **Runtime** | → Interface packages | Runtime must not import SDK or HTTP binding |
| **Domain** | → Runtime | Domain packages must not depend on execution mechanics |
| **Domain** | → Infrastructure | Domain packages must not depend on storage, transport, or server packages |
| **Domain** | → Apps | Domain packages must not depend on applications |
| **Signal (Protocol/Kernel)** | → Domain | Protocol must not depend on domain packages |
| **Signal (Protocol/Kernel)** | → Execution | Protocol must not depend on runtime or infrastructure |
| **Signal (Protocol/Kernel)** | → Post-Trade | Protocol must not depend on audit/CLI tools |
| **Post-Trade** | → Any upstream | signal-cli must not import from Signal, Domain, or Execution layers |
| **Adapters** | → Adapters | No cross-adapter dependencies; adapters communicate through the kernel |

## Layer Definitions

### Signal Layer

| Package | Path | Role |
|---------|------|------|
| `@signal/protocol` | `api/protocol` | Shared language, contracts, type definitions |
| `@signal/kernel` | `packages/kernel` | Plugin-based signal pipeline kernel, orchestration |

### Ports Layer

| Package | Path | Role |
|---------|------|------|
| `@signal/ports` | `api/ports` | Pure port interfaces for dependency inversion |

### Domain Layer

| Package | Path | Role |
|---------|------|------|
| `@signal/decision` | `packages/decision` | Decision-quality model: evidence, assessment, learning |
| `@signal/decision-memory` | `packages/decision-memory` | Durable decision memory and learning records |
| `@signal/agency` | `packages/agency` | Agency pipeline: state evaluation, calibration, policy |
| `@signal/commitment` | `packages/commitment` | Commitment evaluation from decisions and constraints |
| `@signal/semantic-state` | `packages/semantic-state` | Semantic-state resolution and lexicon |

### Execution Layer

| Package | Path | Role |
|---------|------|------|
| `@signal/runtime` | `api/runtime` | Core execution: registry, dispatch, idempotency, audit |
| `@signal/sdk-node` | `api/sdk-node` | Node SDK for defining operations and creating runtimes |
| `@signal/binding-http` | `api/binding-http` | HTTP transport adapter |
| `@signal/idempotency-postgres` | `api/idempotency-postgres` | PostgreSQL idempotency adapter |
| `@signal/db` | `server/db` | Database scripts, migrations, and adapters |

### Post-Trade Layer

| Package | Path | Role |
|---------|------|------|
| `signal-cli` | `signal-cli` | Read-only audit, verification, replay |

## Runtime Purity Rules

`@signal/runtime` is a pure execution kernel. It must not import:

- ❌ HTTP or SDK transport layers (`@signal/sdk-node`, `@signal/binding-http`)
- ❌ Domain logic (`@signal/decision`, `@signal/agency`, `@signal/commitment`, etc.)
- ❌ Server infrastructure (`@signal/db`)
- ❌ Any application or example package

Runtime is constructed with injected ports:

```typescript
const runtime = new SignalRuntime({
  eventPort,        // required — event dispatch
  storagePort,      // optional — for idempotency
  decisionPort,     // optional — for domain logic
  observabilityPort, // optional — for lifecycle hooks
});
```

Domain behavior enters the runtime through `DecisionPort`, not through
imports. This is the mechanism that keeps runtime domain-agnostic.

## Domain Package Purity Rules

Domain packages must not import:

- ❌ Runtime (`@signal/runtime`)
- ❌ Ports (`@signal/ports`)
- ❌ Interface packages (`@signal/sdk-node`, `@signal/binding-http`)
- ❌ Server infrastructure (`@signal/db`)
- ❌ Any application or example package

Domain packages may import:

- ✅ `@signal/protocol` — for type-only shared contracts

## Enforcement

These rules are enforced through three mechanisms:

1. **`dependency-cruiser`** (`.dependency-cruiser.js`) — Validates dependency
   direction at CI time. Forbidden imports cause build failure.

2. **TypeScript path aliases** (`tsconfig.base.json`) — Enforce module
   boundaries through compiler path resolution.

3. **CI pipeline** (`.github/workflows/signal-core.yml`) — Runs
   `pnpm arch:check` to verify architectural fitness.

### Violation Response

If a dependency violation is detected:

1. CI fails immediately.
2. The violating import must be removed.
3. Data must flow forward through function arguments, not backward through
   imports.
4. No refactoring of unrelated code is permitted to fix a violation.

## Diagram

```mermaid
flowchart TB
  subgraph Apps["Applications"]
    App1["examples/aware"]
    App2["examples/stocks-optimizer"]
    App3["server/reference-server"]
  end

  subgraph Interface["Interface Packages"]
    SDK["@signal/sdk-node"]
    HTTP["@signal/binding-http"]
  end

  subgraph Kernel["Signal Kernel"]
    RT["@signal/runtime"]
    Proto["@signal/protocol"]
    Ports["@signal/ports"]
  end

  subgraph Domain["Domain Packages"]
    Dec["@signal/decision"]
    Mem["@signal/decision-memory"]
    Ag["@signal/agency"]
    Com["@signal/commitment"]
    Sem["@signal/semantic-state"]
  end

  subgraph PostTrade["Post-Trade"]
    CLI["signal-cli"]
  end

  Apps --> Interface
  Apps --> Domain
  Apps --> Proto
  Interface --> RT
  Interface --> Ports
  RT --> Proto
  RT --> Ports
  Domain --> Proto
  PostTrade -.->|no upstream| Kernel
  PostTrade -.->|no upstream| Domain

  style PostTrade fill:#f9f,stroke:#333,stroke-dasharray: 5 5