# Architecture

Signal is intentionally layered.

## Layers

- Protocol: envelopes, names, results, errors, capabilities, conformance
- Runtime: operation registry, execution, idempotency integration, event dispatch
- Bindings: HTTP and future transport adapters
- Storage: idempotency and replay state
- Downstream modules: business logic built on top of Signal

## Request Flow

1. A binding receives a request.
2. The binding maps it into Signal payload and metadata.
3. The runtime validates the operation name and payload.
4. The runtime freezes request-scoped context.
5. The runtime executes the query or mutation.
6. Mutations may emit events after logical state is established.
7. The runtime returns a structured result with logical outcome metadata.
8. Bindings map that result to transport-specific status codes without changing the body contract.

## Event Flow

1. A mutation emits a versioned event.
2. The runtime creates a standard event envelope.
3. The dispatcher delivers that envelope to subscribers.
4. Replay-safe consumers dedupe by `messageId` when needed.
5. No global ordering guarantee is assumed.
