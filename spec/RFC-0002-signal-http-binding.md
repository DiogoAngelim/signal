# RFC-0002: Signal HTTP Binding

## 1. Abstract

This RFC defines the reference HTTP binding for Signal. It maps query and mutation execution to HTTP routes and exposes the runtime capability document.

## 2. Terminology

- **Binding**: a transport-specific mapping for the protocol.
- **Capability document**: the machine-readable list of supported operations.

## 3. Routes

- `GET /signal/capabilities`
- `POST /signal/query/:name`
- `POST /signal/mutation/:name`

## 4. Request Shape

Requests MUST include a JSON body containing `payload`. The binding SHOULD accept request metadata for `correlationId`, `causationId`, `traceId`, `auth`, `source`, and `idempotencyKey`.

## 5. Semantics

### 5.1 Query Requests

Query requests MUST execute the named query and return a standard result envelope.

### 5.2 Mutation Requests

Mutation requests MUST forward the idempotency key to the runtime. The binding MUST return the stored logical result when the runtime replays a completed mutation.

### 5.3 Capability Requests

The binding MUST expose the runtime capabilities document without requiring operation-specific knowledge from the client.

## 6. Error Model

HTTP status codes are binding-specific. The response body MUST still use the Signal result model when possible.

## 7. Versioning

The path prefix and operation names MAY evolve independently. The operation version suffix remains mandatory.

## 8. Security Considerations

Implementations MUST treat the HTTP binding as an edge boundary. Input validation and auth mapping belong at the binding layer.

## 9. Observability Considerations

The binding SHOULD forward correlation, causation, and trace metadata into the runtime.

## 10. Conformance

A conformant HTTP binding MUST support query execution, mutation execution, and capability retrieval.
