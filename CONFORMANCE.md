# Signal Conformance

## A Signal-Compatible Implementation Must

- validate the standard envelope
- enforce versioned operation names
- preserve query, mutation, and event semantics
- return structured success and failure results
- classify failures with stable machine-readable codes
- enforce declared mutation idempotency semantics
- preserve replay-safe event consumption assumptions
- expose a capability document

## A Signal-Compatible Implementation Should

- preserve correlation and causation metadata
- preserve deadline and cancellation metadata when supported
- publish conformance fixtures or equivalent machine-readable artifacts
- document binding-specific route or transport mappings clearly

## Out Of Scope

- workflow engines
- payment processors
- retry schedulers
- global event ordering
- broker-specific semantics in the core protocol

## Reference Artifacts

- `spec/`
- `spec/fixtures/`
- `schemas/`
