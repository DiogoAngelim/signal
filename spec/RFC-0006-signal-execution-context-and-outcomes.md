# RFC-0006: Signal Execution Context and Outcomes

## 1. Abstract

This RFC defines the execution-context metadata and logical outcome metadata used by the Signal Protocol v1 reference runtime. The goal is to make deadlines, cancellation, replay, delivery attempts, and logical completion states explicit without coupling the protocol to any transport or business domain.

## 2. Terminology

- **Execution context**: the request-scoped metadata available while a query, mutation, or event handler runs.
- **Logical outcome**: the protocol-level result of execution, independent from HTTP or broker status codes.
- **Deadline**: the latest time at which the runtime should begin or continue work.
- **Cancellation**: cooperative termination requested by the caller or transport.
- **Replay metadata**: machine-readable metadata that explains why a result was replayed.

## 3. Context Model

The public Signal envelope MAY include a `context` object and a `delivery` object. The reference runtime uses those sections to preserve request metadata across bindings.

### 3.1 Context Fields

The v1 reference runtime recognizes these context fields:

- `correlationId`
- `causationId`
- `idempotencyKey`
- `deadlineAt`
- `traceId`
- `trace`

The `trace` object MAY include `traceId`, `spanId`, `parentSpanId`, and `state`.

### 3.2 Delivery Fields

The v1 reference runtime recognizes these delivery fields:

- `mode`
- `attempt`
- `consumerId`
- `replayed`
- `subscription`
- `transportMessageId`

Bindings MAY carry more fields, but they MUST NOT remove or redefine the standard ones.

### 3.3 Auth and Meta

The `auth` section remains transport-independent and application-defined. Implementations MAY include a structured `actor`, `subject`, and `scopes`, but the protocol MUST still allow additional auth metadata. The `meta` section remains an extension surface for information that does not belong in the core contract.

## 4. Deadline and Cancellation Semantics

Deadlines and cancellation are cooperative runtime features.

- A runtime SHOULD reject execution before handler work begins when `deadlineAt` has already passed.
- A runtime SHOULD reject execution before handler work begins when the request has already been cancelled.
- A runtime MAY expose the same metadata to handlers so downstream code can cooperate.
- Signal v1 does not define forced interruption of in-flight business logic.

The recommended protocol error codes are:

- `DEADLINE_EXCEEDED`
- `CANCELLED`

## 5. Logical Outcomes

Signal v1 keeps the success/failure result envelope:

- success: `{ ok: true, result, meta? }`
- failure: `{ ok: false, error }`

When `meta` is present on success, the reference runtime SHOULD set:

- `meta.outcome = "completed"` for first execution
- `meta.outcome = "replayed"` for replayed logical results

The runtime SHOULD also include machine-readable metadata for:

- message and causality identifiers
- idempotency status
- replay reason and original message id when known
- deadline metadata when supplied
- delivery metadata when supplied

## 6. Replay Metadata

When a runtime replays a stored mutation result because of idempotency, it SHOULD include:

- `meta.outcome = "replayed"`
- `meta.idempotency.status = "replayed"`
- `meta.replay.replayed = true`
- `meta.replay.reason = "idempotency"`
- `meta.replay.originalMessageId` when available

This metadata is part of the logical outcome, not a transport concern.

## 7. Conformance

A Signal-compatible runtime that claims support for RFC-0006 MUST:

1. preserve recognized context and delivery metadata
2. surface logical outcome metadata for completed and replayed success results
3. classify deadline and cancellation failures explicitly
4. keep these semantics transport-independent
