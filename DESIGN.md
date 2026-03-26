# Design

## Principles

- protocol-first over implementation-first
- explicit over implicit
- transport-independent over transport-defined
- inspectable behavior over framework magic
- generic reliability primitives over business-domain modules

## Key Trade-Offs

- versioned names are mandatory, which is more verbose but safer
- idempotency is explicit per mutation, which avoids hidden retry behavior
- event consumers must be replay-safe, which shifts responsibility toward durable projections and dedupe
- bindings stay thin, which keeps the protocol portable

## Reliability Model

Signal provides the primitives that orchestration-heavy systems need:

- idempotency records
- replay metadata
- correlation and causation propagation
- delivery attempt metadata
- deadline and cancellation metadata
- consumer dedupe hooks

Signal does not implement the orchestration engine itself.
