# RFC-0001: Signal Protocol Core

## 1. Abstract

Signal Protocol v1 defines a transport-independent application protocol for queries, mutations, and events. This RFC describes the public contract for message structure, naming, response shape, idempotency, versioning, and conformance. The protocol is intentionally small so different runtimes can implement the same behavior without sharing implementation details.

## 2. Terminology

- **Query**: a read-only operation that returns information without changing durable state.
- **Mutation**: an explicit state-changing command that MAY emit events after the state change is established.
- **Event**: an immutable fact that records that something happened.
- **Envelope**: the normalized wrapper around every Signal message.
- **Operation name**: the versioned name that identifies a public operation, such as `payment.capture.v1`.
- **Normalized payload**: the canonical payload used when comparing idempotency requests.
- **Idempotency key**: a caller-provided key that allows a mutation to be replayed safely.
- **Binding**: a transport-specific way to carry Signal messages, such as HTTP or an in-process runtime.

## 3. Envelope

Every public Signal message MUST use the `signal.v1` envelope. The envelope separates the protocol contract from the transport that carried the message.

### 3.1 Required Fields

The envelope MUST include:

- `protocol`
- `kind`
- `name`
- `messageId`
- `timestamp`
- `payload`

### 3.2 Standard Metadata Fields

Implementations SHOULD also carry:

- `source` for origin metadata such as runtime or transport
- `context` for correlation, causation, and tracing
- `delivery` for transport delivery metadata
- `auth` for request authentication and authorization context
- `meta` for extension data that does not belong in the core protocol

### 3.3 Envelope Rules

- `protocol` MUST be `signal.v1`.
- `kind` MUST be `query`, `mutation`, or `event`.
- `name` MUST be a versioned operation name.
- `messageId` MUST uniquely identify the message instance.
- `timestamp` MUST be an ISO-8601 timestamp.
- `payload` MUST satisfy the schema for the named operation.
- Transport-specific details MUST NOT replace the envelope.

## 4. Naming

### 4.1 Rules

All operations MUST follow the pattern `<domain>.<action>.<version>`.

- names MUST be lowercase
- names MUST be dot-separated
- names MUST include a version suffix
- the action MUST be explicit
- event names SHOULD use past tense when that makes the fact easier to read

### 4.2 Examples

- `payment.capture.v1`
- `payment.status.v1`
- `payment.captured.v1`
- `user.onboarded.v1`

### 4.3 Naming Guidance

Implementations SHOULD avoid names that hide intent, such as `create`, `update`, or `process` without a domain prefix. A consumer SHOULD be able to read the name and understand whether the operation reads state, changes state, or publishes a fact.

## 5. Semantics

### 5.1 Queries

Queries MUST be read-only. A query MUST NOT change durable state and MUST NOT emit domain events. A query MUST be safe to retry. Query handlers MAY use transient caches or indexes, as long as the visible behavior remains read-only.

### 5.2 Mutations

Mutations MAY change durable state. A mutation MAY emit events after the new logical state is known. Every mutation MUST declare an idempotency mode:

- `required`
- `optional`
- `none`

When idempotency is required, the caller MUST send an idempotency key. Same idempotency key plus same normalized payload MUST resolve to the same logical result. Same idempotency key plus different normalized payload MUST conflict.

### 5.3 Events

Events are immutable facts. An event MUST be safe to consume more than once. Consumers MUST tolerate duplicate delivery. The protocol does not define a global total order for events. Implementations MAY preserve local order inside a single execution path, but they MUST NOT expose that as a protocol guarantee.

## 6. Result Model

Signal uses a single success/failure result model for all bindings.

### 6.1 Success

A successful result MUST use:

- `ok: true`
- `result`

Implementations MAY include `meta` when additional machine-readable data is useful.

### 6.2 Failure

A failed result MUST use:

- `ok: false`
- `error`

The error object MUST include a machine-readable code and a human-readable message.

## 7. Error Model

Implementations MUST use structured errors. The error object SHOULD include:

- `code`
- `message`
- `retryable`
- `details`

The `code` MUST be stable and machine-readable. The `retryable` flag SHOULD be set when the caller may try again without changing the request. Common v1 codes include validation errors, not found, conflict, idempotency conflict, unauthorized, forbidden, unsupported operation, retryable error, and internal error.

## 8. Versioning

Breaking changes MUST use a new version suffix in the operation name. `payment.capture.v1` and `payment.capture.v2` are distinct public operations. A runtime MAY support both versions at the same time. A change that alters input shape, result shape, or semantics in a breaking way MUST introduce a new version.

## 9. Security Considerations

Implementations SHOULD validate envelopes, names, inputs, and outputs before executing side effects. Bindings SHOULD treat authentication and authorization as explicit request metadata. Protocol messages SHOULD avoid carrying secrets unless the application requires them and has a clear policy for storage and logging.

## 10. Observability Considerations

Implementations SHOULD preserve `messageId`, `correlationId`, `causationId`, and `traceId` across nested operations and emitted events. `messageId` identifies one message instance. `correlationId` groups a flow. `causationId` identifies the parent message that led to the current one. `traceId` MAY be supplied by tracing systems and forwarded unchanged.

## 11. Conformance

A Signal-compatible system MUST:

1. validate the standard envelope
2. enforce versioned operation names
3. implement the result and error model
4. preserve the semantics of queries, mutations, and events
5. enforce mutation idempotency when required
6. make events replay-safe to consume

An implementation SHOULD publish capabilities and SHOULD document the bindings it supports.
