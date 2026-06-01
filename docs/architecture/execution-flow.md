# Execution Flow

This document records the current execution model and the target
infrastructure-grade additions.

## Query Flow

```mermaid
sequenceDiagram
  participant Client
  participant HTTP as HTTP Binding
  participant Runtime
  participant Protocol
  participant Handler

  Client->>HTTP: POST /signal/query/:operation
  HTTP->>Runtime: query(operation, payload, metadata)
  Runtime->>Protocol: validate operation name and input
  Runtime->>Handler: execute query handler
  Handler-->>Runtime: result payload
  Runtime->>Protocol: validate result schema
  Runtime-->>HTTP: Signal result
  HTTP-->>Client: structured response
```

Required additions:

- trace context extraction and propagation,
- auth and authorization hooks for protected queries,
- timeout and cancellation behavior,
- audit records for governed queries,
- stable metrics and logs.

## Mutation Flow: Current Risk

```mermaid
sequenceDiagram
  participant Client
  participant Runtime
  participant Idempotency
  participant Handler
  participant Dispatcher
  participant Subscriber

  Client->>Runtime: mutation(operation, payload, idempotencyKey)
  Runtime->>Idempotency: reserve key
  Idempotency-->>Runtime: reserved
  Runtime->>Handler: execute mutation
  Handler-->>Runtime: state changed and event payload
  Runtime->>Dispatcher: dispatch event
  Dispatcher->>Subscriber: deliver event
  Runtime->>Idempotency: complete key with result
  Runtime-->>Client: structured result
```

Risk: handler state, event delivery, and idempotency completion are not one
atomic durability unit.

## Mutation Flow: Infrastructure Target

```mermaid
sequenceDiagram
  participant Client
  participant Runtime
  participant Tx as Transaction
  participant Store as App Store
  participant Idempotency
  participant Outbox
  participant Audit
  participant Dispatcher

  Client->>Runtime: mutation(operation, payload, idempotencyKey)
  Runtime->>Tx: begin
  Tx->>Idempotency: reserve or replay
  Tx->>Store: apply mutation state change
  Tx->>Outbox: write event record
  Tx->>Audit: append audit record
  Tx->>Idempotency: complete with result metadata
  Tx-->>Runtime: commit
  Runtime-->>Client: structured result
  Dispatcher->>Outbox: claim durable event
  Dispatcher->>Dispatcher: retry, backoff, dead-letter, replay
```

Invariant: mutation state and durable event record commit together or neither
commits.

## Event Flow

```mermaid
flowchart TD
  Event[Event payload]
  Validate[Validate event schema]
  Envelope[Create Signal envelope]
  Outbox[Persist to outbox]
  Dispatch[Dispatch through transport]
  Consumer[Subscriber or consumer]
  Dedupe[Replay-safe duplicate suppression]
  Result[Success, retry, or dead letter]

  Event --> Validate --> Envelope --> Outbox --> Dispatch --> Consumer --> Dedupe --> Result
```

Required additions:

- durable outbox,
- transport retry policy,
- dead-letter records,
- replay command/API,
- queue lag and depth metrics,
- idempotent consumers.

## Idempotency Flow

```mermaid
flowchart TD
  Request[Mutation request]
  Key[Idempotency key and fingerprint]
  Reserve{Record exists?}
  New[Reserve pending record]
  Replay[Replay completed result]
  Conflict[Reject fingerprint conflict]
  Execute[Execute mutation]
  Complete[Complete durable result]
  Quarantine[Quarantine invalid stored result]

  Request --> Key --> Reserve
  Reserve -- no --> New --> Execute --> Complete
  Reserve -- completed and same fingerprint --> Replay
  Reserve -- different fingerprint --> Conflict
  Replay -- invalid stored shape --> Quarantine
```

Required additions:

- schema validation before replay,
- expiration policy,
- tenant-aware uniqueness,
- transaction coupling with mutation and outbox,
- recovery for pending records after process crash.

## Decision Memory Flow

```mermaid
flowchart LR
  Snapshot[Reality snapshot]
  Policy[Policy version]
  Decision[Decision record]
  Outcome[Outcome]
  Replay[Replay snapshot]
  Calibration[Calibration and trust history]
  Audit[Audit export]

  Snapshot --> Decision
  Policy --> Decision
  Decision --> Outcome
  Outcome --> Replay
  Replay --> Calibration
  Decision --> Audit
  Outcome --> Audit
```

Required additions:

- policy/model/adapter versions on every governed decision,
- tenant/source isolation,
- pagination,
- archive and restore,
- reconstruction tests.

## Stocks Optimizer Adapter Flow

```mermaid
flowchart TD
  StockData[App-shaped stock data]
  Metrics[Generic metric inputs]
  Pruning[Pruning and viability]
  Meaning[Meaning and purpose]
  Commitment[Commitment inputs]
  Evaluation[Framework evaluation]
  ViewModel[App-facing view models]
  Contract[Consumer contract tests]

  StockData --> Metrics --> Pruning --> Meaning --> Commitment --> Evaluation --> ViewModel --> Contract
```

Required additions:

- tracked consumer contract,
- schemas and fixtures,
- provider verification in CI,
- explicit support status if full app contract remains outside the repository.
