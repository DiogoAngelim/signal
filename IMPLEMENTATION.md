# Implementation

Signal currently ships as a protocol package plus a Node.js reference runtime.

## Implemented Packages

- `packages/protocol`
- `packages/runtime`
- `packages/sdk-node`
- `packages/binding-http`
- `packages/idempotency-postgres`
- `packages/examples`
- `apps/reference-server`

## Enforced Guarantees

- versioned operation names are validated
- envelopes are validated before public execution
- queries validate input and result and remain read-only by contract
- mutations validate input and result and honor declared idempotency mode
- request context is frozen per execution
- replayed idempotent results surface standardized replay metadata
- deadline and cancellation failures use explicit error codes
- events preserve correlation and causation metadata
- replay-safe consumer helpers dedupe by `messageId`
- capability documents are derived from registered operations and subscriptions

## Current Boundaries

- the runtime is Node.js-specific, but the protocol is not
- storage is pluggable, not built into the core
- transport bindings stay thin and must not redefine protocol semantics
