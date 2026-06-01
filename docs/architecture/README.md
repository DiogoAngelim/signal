# Signal Architecture

Status: Phase 1 baseline.

This directory records the architecture that future consolidation work must
preserve or deliberately change through RFC and ADR review. It is intentionally
descriptive first: duplicate or legacy paths must not be removed until their
replacement behavior is proven equivalent by tests.

## Reading Order

1. [System Architecture](system-architecture.md)
2. [Dependency Graph](dependency-graph.md)
3. [Module Map](module-map.md)
4. [Ownership Map](ownership-map.md)
5. [Execution Flow](execution-flow.md)
6. [Protocol Lifecycle](protocol-lifecycle.md)
7. [Diagrams](diagrams.md)

## Canonical Architecture Position

- `@signal/protocol` is the canonical protocol contract.
- `@signal/runtime` is the canonical query, mutation, event, idempotency, and
  dispatch runtime.
- `@signal/sdk-node` is the canonical Node developer helper API.
- `@signal/binding-http` is the canonical HTTP binding.
- `@signal/idempotency-postgres` is the canonical durable idempotency adapter.
- `backend/*`, root legacy source modules, and compatibility packages must be
  treated as compatibility or legacy surfaces until equivalence is proven.
- `signal-framework` is a domain-neutral framework layer and must not silently
  redefine core protocol semantics.

## Consolidation Rule

No code path is removed simply because it is older or duplicated. Removal
requires:

- import and package usage inventory,
- replacement equivalence tests,
- migration notes,
- compatibility policy review,
- rollback plan,
- release note visibility.

## Required Future Enforcement

The next architecture step is to convert this documentation into machine
enforced boundaries:

- package-level boundary manifests,
- forbidden import checks,
- public API snapshots,
- contract generation,
- compatibility/conformance tests,
- CI ownership gates.
