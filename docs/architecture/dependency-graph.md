# Dependency Graph

Status: baseline graph from the Phase 0 audit.

## Package Graph

```mermaid
flowchart LR
  Protocol["@signal/protocol"]
  Runtime["@signal/runtime"]
  SDK["@signal/sdk-node"]
  HTTP["@signal/binding-http"]
  Idem["@signal/idempotency-postgres"]
  Examples["@signal/examples"]
  Ref["@signal/reference-server"]
  Decision["@signal/decision"]
  DecisionMemory["@signal/decision-memory"]
  Agency["@signal/agency"]
  Commitment["@signal/commitment"]
  Semantic["@signal/semantic-state"]
  Backend["@digelim/* backend compatibility"]
  Framework["signal-framework"]
  Contracts["contracts/schemas/spec"]

  Runtime --> Protocol
  SDK --> Runtime
  SDK --> Protocol
  HTTP --> Runtime
  HTTP --> Protocol
  Idem --> Runtime
  Idem --> Protocol
  Examples --> HTTP
  Examples --> Protocol
  Examples --> Runtime
  Examples --> SDK
  Examples --> Idem
  Ref --> HTTP
  Ref --> Examples
  Ref --> Idem
  Ref --> Protocol
  Ref --> Runtime
  Ref --> SDK
  DecisionMemory --> Decision
  Agency --> Decision
  Agency --> Semantic
  Commitment --> Decision
  Backend -. compatibility .-> Protocol
  Backend -. compatibility .-> Runtime
  Framework -. adapter .-> Commitment
  Contracts --> Protocol
```

## External Dependencies

| Package | External Dependencies Of Architectural Interest |
| --- | --- |
| `@signal/protocol` | `zod` |
| `@signal/binding-http` | `fastify` |
| `@signal/idempotency-postgres` | `drizzle-orm`, `pg` |
| `@signal/examples` | `kafkajs`, `pg` |
| docs | Docusaurus toolchain |
| tests | Vitest and TypeScript toolchain |

## Desired Direction

- Public protocol definitions flow outward from `@signal/protocol`.
- Runtime behavior flows outward from `@signal/runtime`.
- Transports adapt to runtime behavior rather than redefining it.
- Persistence adapters implement runtime interfaces rather than owning protocol
  semantics.
- Compatibility packages either wrap canonical packages or clearly declare
  legacy behavior.

## Forbidden Direction

- Canonical packages must not import compatibility packages.
- Protocol contracts must not depend on application code.
- Runtime contracts must not depend on HTTP binding details.
- Durable store schemas must not be changed without migration compatibility
  tests.
- Examples must not become hidden dependencies of canonical packages.
