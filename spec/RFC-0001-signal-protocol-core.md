# RFC-0001: Signal Protocol Core

## 1. Abstract

Signal defines a small application protocol for queries, mutations, and events. The protocol specifies a versioned message envelope, versioned operation names, and a standard result model.

## 2. Terminology

- **Query**: a read-only operation that MUST not change durable state.
- **Mutation**: an explicit state-changing command that MAY emit events.
- **Event**: an immutable fact that records that something happened.
- **Envelope**: the normalized message wrapper used by every protocol message.
- **Idempotency key**: a client-provided key used to replay a mutation safely.

## 3. Envelope

Signal messages MUST use the envelope defined by the `signal.v1` protocol. The envelope MUST include `protocol`, `kind`, `name`, `messageId`, `timestamp`, and `payload`.

Implementations SHOULD also carry `source`, `context`, `delivery`, `auth`, and `meta` when available.

## 4. Semantics

### 4.1 Queries

Queries MUST be read-only. They MUST be safe to retry. They MUST NOT emit domain events.

### 4.2 Mutations

Mutations MAY change durable state. Mutations MUST declare idempotency mode as `required`, `optional`, or `none`. Mutations with `required` idempotency MUST reject requests without an idempotency key.

### 4.3 Events

Events MUST be immutable facts. Consumers MUST tolerate duplicate delivery. The protocol does not define a global ordering guarantee.

## 5. Error Model

Protocol errors MUST use a machine-readable `code`. Implementations SHOULD set `retryable` when the caller may try again without changing the request.

## 6. Versioning

Breaking changes MUST use a new version suffix in the operation name. `v1` and `v2` are distinct operations.

## 7. Security Considerations

Implementations SHOULD validate all inputs. Bindings SHOULD treat auth data as explicit request metadata rather than as an implicit global state.

## 8. Observability Considerations

Implementations SHOULD preserve `messageId`, `correlationId`, `causationId`, and `traceId` across bindings and nested emits.

## 9. Conformance

A Signal-compatible system MUST implement envelope validation, versioned names, result envelopes, mutation idempotency semantics, and duplicate-tolerant event consumption expectations.
