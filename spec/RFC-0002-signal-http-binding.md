# RFC-0002: Signal HTTP Binding

## 1. Abstract

This RFC defines the reference HTTP binding for Signal. The binding maps protocol operations to HTTP routes without changing the protocol itself. It is a transport layer, not a new application contract.

## 2. Terminology

- **Binding**: a transport-specific mapping for the protocol.
- **Capability document**: the machine-readable list of supported operations and bindings.
- **Request wrapper**: the JSON body used by the HTTP binding to carry protocol input.
- **Runtime**: the execution engine that validates and runs Signal operations.

## 3. Envelope and Request Model

The HTTP binding MUST carry protocol input in a JSON request body. The request wrapper is not the protocol envelope. It is the HTTP shape used to deliver the payload and request metadata to the runtime.

### 3.1 Routes

- `GET /signal/capabilities`
- `POST /signal/query/:name`
- `POST /signal/mutation/:name`

### 3.2 Request Body

Requests MUST include:

- `payload`

Requests MAY include:

- `context.correlationId`
- `context.causationId`
- `context.traceId`
- `context.auth`
- `context.source`
- `context.meta`
- `idempotencyKey` for mutations

The `:name` path parameter MUST identify the registered operation.

### 3.3 Response Body

The response body MUST use the Signal result model. The HTTP status code is a binding detail, but the body MUST remain machine-readable and structured.

## 4. Semantics

### 4.1 Query Requests

Query requests MUST execute the named query and return the query result. The reference binding maps successful query execution to HTTP 200 and failed query execution to HTTP 400 while still returning the structured result body.

### 4.2 Mutation Requests

Mutation requests MUST forward the idempotency key and request context to the runtime. The reference binding maps successful mutation execution to HTTP 200 and failed mutation execution to HTTP 409 while still returning the structured result body. If the runtime replays a completed mutation, the binding MUST return the same logical result.

### 4.3 Capability Requests

Capability requests MUST return the runtime capability document. The client MUST be able to inspect the document without knowing any operation-specific details ahead of time.

## 5. Error Model

HTTP status codes MAY vary across bindings, but the body MUST still encode `ok: false` and a structured error object whenever a request fails at the protocol level. If the binding itself cannot parse the request, it SHOULD return a structured validation error when possible.

## 6. Versioning

The path prefix MAY evolve independently from operation names. The operation version suffix remains mandatory. A binding MAY support multiple operation versions at the same time.

## 7. Security Considerations

The HTTP binding is an edge boundary. It MUST validate request bodies, MUST treat auth as explicit input, and SHOULD avoid assuming that headers alone are trustworthy. Any mapping from HTTP headers to protocol metadata MUST be explicit and documented.

## 8. Observability Considerations

The binding SHOULD forward `correlationId`, `causationId`, `traceId`, `source`, and `auth` into the runtime request context. When the binding creates a response, it SHOULD preserve message identifiers and trace data in logs and diagnostics.

## 9. Conformance

A conformant HTTP binding MUST:

1. expose the capability document
2. execute named queries
3. execute named mutations
4. forward idempotency keys for mutations
5. preserve structured protocol responses
6. forward observability metadata

The reference route set is part of the published contract for the Node.js implementation, but other bindings MAY choose different route shapes as long as they document the mapping clearly.
