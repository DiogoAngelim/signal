# Architecture Diagrams

These Mermaid diagrams are the baseline architecture diagrams for Phase 1.

## System Context

```mermaid
flowchart TD
  Consumer[Consumer applications]
  Reference[Reference server]
  HTTP[HTTP binding]
  SDK[Node SDK]
  Runtime[Signal runtime]
  Protocol[Signal protocol]
  Contracts[Contracts and schemas]
  Idempotency[Idempotency store]
  Outbox[Transactional outbox]
  Transport[Event transport]
  Audit[Audit trail]
  Decision[Decision memory]
  Framework[Signal framework]
  Stocks[Stocks Optimizer contract]

  Consumer --> HTTP
  Consumer --> SDK
  Reference --> HTTP
  HTTP --> Runtime
  SDK --> Runtime
  Runtime --> Protocol
  Contracts --> Protocol
  Runtime --> Idempotency
  Runtime --> Outbox
  Outbox --> Transport
  Runtime --> Audit
  Runtime --> Decision
  Framework --> Stocks
  Stocks --> Contracts
```

## Target Mutation Durability

```mermaid
flowchart TD
  Request[Mutation request]
  Validate[Validate envelope and payload]
  Begin[Begin transaction]
  Reserve[Reserve idempotency key]
  Apply[Apply state mutation]
  Event[Write event to outbox]
  Audit[Append audit record]
  Complete[Complete idempotency result]
  Commit[Commit transaction]
  Dispatch[Async dispatch]
  Retry[Retry or dead-letter]
  Response[Return result]

  Request --> Validate --> Begin --> Reserve --> Apply --> Event --> Audit --> Complete --> Commit
  Commit --> Response
  Commit --> Dispatch --> Retry
```

## Observability Path

```mermaid
flowchart LR
  Ingress[Ingress request]
  Trace[Trace context]
  RuntimeSpan[Runtime spans]
  Metrics[Metrics]
  Logs[Structured logs]
  Audit[Audit records]
  Events[Event traces]
  Dashboard[Dashboards and alerts]

  Ingress --> Trace
  Trace --> RuntimeSpan
  RuntimeSpan --> Events
  RuntimeSpan --> Metrics
  RuntimeSpan --> Logs
  RuntimeSpan --> Audit
  Metrics --> Dashboard
  Logs --> Dashboard
  Events --> Dashboard
```

## Governance Path

```mermaid
flowchart TD
  Change[Proposed protocol or architecture change]
  RFC[RFC]
  ADR[ADR]
  Contract[Contract diff]
  Tests[Compatibility and conformance tests]
  Docs[Docs and migration guide]
  Gate[Institutional readiness gate]
  Release[Release]

  Change --> RFC
  Change --> ADR
  RFC --> Contract
  ADR --> Contract
  Contract --> Tests
  Contract --> Docs
  Tests --> Gate
  Docs --> Gate
  Gate --> Release
```

## Module Boundary Direction

```mermaid
flowchart BT
  Apps[Apps and examples]
  Transports[Transports]
  SDKs[SDKs]
  Runtime[Runtime]
  Protocol[Protocol]
  Legacy[Legacy and compatibility]

  Apps --> SDKs
  Apps --> Transports
  Transports --> Runtime
  SDKs --> Runtime
  Runtime --> Protocol
  Legacy -. wrap or migrate .-> Runtime
  Legacy -. wrap or migrate .-> Protocol
```

Canonical packages must point inward toward protocol and runtime. Legacy and
compatibility packages may wrap canonical packages, but canonical packages must
not depend on legacy packages.
