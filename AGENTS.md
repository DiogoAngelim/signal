# AGENTS.md — Architecture Contract

## No-Backflow Architecture

This system enforces a strict unidirectional dependency DAG:

```
Signal (pure market logic)
  → Optimizer (sole financial authority)
    → Execution (infra only)
      → Post-Trade (read-only audit)
```

### Layer Definitions

| Layer | Packages | Role |
|-------|----------|------|
| **Signal** | `packages/kernel`, `api/protocol` | Pure market logic, type definitions, pipeline interfaces |
| **Optimizer** | `packages/agency`, `packages/commitment`, `packages/decision`, `packages/decision-memory`, `packages/semantic-state` | Financial authority: risk, calibration, commitment, decision-making |
| **Execution** | `api/runtime`, `api/sdk-node`, `api/binding-http`, `server/db` | Infrastructure: runtime dispatch, HTTP binding, database |
| **Post-Trade** | `signal-cli` | Read-only audit, verification, replay |

### Forbidden Dependencies (Backward Edges)

1. **Signal → Optimizer/Execution/Post-Trade**: Signal must not import from any downstream layer
2. **Optimizer → Signal**: Optimizer must not import from Signal (it receives data via function args, not imports)
3. **Optimizer → Execution/Post-Trade**: Optimizer must not import from downstream layers
4. **Execution → Signal/Optimizer**: Execution must not import from upstream layers
5. **Post-Trade → any upstream**: Post-Trade must not import from Signal, Optimizer, or Execution
6. **Circular dependencies**: No circular imports between any modules

### Allowed Dependencies (Forward Edges)

- `Optimizer → Signal`: type-only imports from `@signal/protocol` are allowed (shared contracts)
- `Execution → Optimizer`: `@signal/runtime` may import from `@signal/protocol` (shared contracts)
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