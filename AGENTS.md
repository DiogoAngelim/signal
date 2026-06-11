# AGENTS.md — Architecture Contract

## No-Backflow Architecture

This system enforces a strict unidirectional dependency DAG:

```
Signal (pure contracts and types)
  → Domain (decision reasoning)
    → Execution (infra only)
      → Post-Trade (read-only audit)
```

### Layer Definitions

| Layer | Packages | Role |
|-------|----------|------|
| **Signal** | `packages/kernel`, `api/protocol` | Pure contracts, type definitions, pipeline interfaces |
| **Domain** | `packages/agency`, `packages/commitment`, `packages/decision`, `packages/decision-memory`, `packages/semantic-state` | Decision reasoning: evidence, assessment, commitment, learning |
| **Execution** | `api/runtime`, `api/sdk-node`, `api/binding-http`, `server/db` | Infrastructure: runtime dispatch, HTTP binding, database |
| **Post-Trade** | `signal-cli` | Read-only audit, verification, replay |

### Forbidden Dependencies (Backward Edges)

1. **Signal → Domain/Execution/Post-Trade**: Signal must not import from any downstream layer
2. **Domain → Signal**: Domain must not import from Signal (it receives data via function args, not imports)
3. **Domain → Execution/Post-Trade**: Domain must not import from downstream layers
4. **Execution → Signal/Domain**: Execution must not import from upstream layers
5. **Post-Trade → any upstream**: Post-Trade must not import from Signal, Domain, or Execution
6. **Circular dependencies**: No circular imports between any modules

### Allowed Dependencies (Forward Edges)

- `Domain → Signal`: type-only imports from `@signal/protocol` are allowed (shared contracts)
- `Execution → Domain`: `@signal/runtime` may import from `@signal/protocol` (shared contracts)
- `Execution → Signal`: `@signal/sdk-node` may import from `@signal/runtime` and `@signal/protocol`
- `Post-Trade`: fully independent, no upstream imports

### Enforcement

- **dependency-cruiser**: `.dependency-cruiser.js` enforces forbidden edges at CI time
- **CI pipeline**: `.github/workflows/signal-core.yml` runs `pnpm arch:check`
- **TypeScript**: `tsconfig.base.json` enforces module boundaries via path aliases

### Violation Response

If a violation is detected:
1. CI fails immediately
2. The violating import must be removed
3. Data must flow forward via function arguments, not backward via imports
4. No refactoring of unrelated code is permitted