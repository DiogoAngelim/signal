# Features

## Protocol

- standard Signal envelope
- explicit versioned operation names
- typed success and failure results
- structured error categories
- derived capability documents
- JSON-schema artifacts for public documents

## Runtime

- explicit operation registration
- immutable request-scoped context
- input and result validation
- in-process query, mutation, and event execution
- idempotency reservation, replay, and conflict handling
- deadline and cancellation checks at runtime boundaries

## Reliability Primitives

- pluggable idempotency store
- normalized payload fingerprinting
- replay metadata on successful replays
- delivery attempt metadata
- correlation and causation propagation
- replay-safe consumer helpers
- pluggable consumer dedupe hooks

## Bindings

- thin HTTP binding
- in-process execution surface
- transport-independent envelopes and results

## Developer Ergonomics

- strict TypeScript
- explicit `defineQuery`, `defineMutation`, and `defineEvent` helpers
- runnable generic examples
- reference server
