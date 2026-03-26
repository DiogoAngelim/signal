# RFC-0004: Signal Idempotency

## 1. Abstract

This RFC defines idempotency semantics for Signal mutations. The goal is to make retries safe without hiding whether a mutation changed state. Idempotency is a protocol behavior, not an application-specific convention.

## 2. Terminology

- **Normalized payload**: the canonical payload representation used for comparison.
- **Payload fingerprint**: the stable digest of the normalized payload.
- **Reservation**: the temporary record that marks a request as in progress.
- **Replay**: returning the same logical result for the same idempotency key and normalized payload.
- **Conflict**: the condition where the same idempotency key is reused with different normalized input.

## 3. Record Model

An idempotency record SHOULD store:

- `operationName`
- `idempotencyKey`
- `payloadFingerprint`
- `status`
- `result` when the request completed successfully
- `error` when the request failed
- `messageId` when the runtime can link the record to a published message
- timestamps for creation and update

The reference store persists these records in PostgreSQL. Other durable stores MAY be used if they preserve the same semantics.

## 4. Semantics

### 4.1 Modes

- `required`: the mutation MUST reject requests without an idempotency key.
- `optional`: the mutation MAY use an idempotency key when supplied.
- `none`: the mutation MUST ignore idempotency semantics.

### 4.2 Reservation

When a request arrives, the runtime SHOULD reserve the idempotency key before executing the mutation handler. A reserved record SHOULD be marked `pending` until the mutation completes or fails. If another request arrives while the record is pending, the runtime MAY report that the request is inflight or MAY wait depending on the binding, but it MUST NOT execute the mutation twice for the same logical request.

### 4.3 Completion

When the mutation succeeds, the runtime MUST store the logical result and mark the record completed. A later request with the same idempotency key and same normalized payload MUST return the same logical result rather than executing the handler again.

### 4.4 Failure

When the mutation fails, the runtime SHOULD store the structured error and mark the record failed. If the same logical request is repeated, the runtime MAY replay the stored failure when that is the clearest outcome.

### 4.5 Conflict

Same idempotency key plus different normalized payload MUST conflict. The runtime MUST treat this as a non-retryable protocol error until the caller changes the request or supplies a new key.

## 5. Error Model

Idempotency conflicts SHOULD use a machine-readable conflict code such as `IDEMPOTENCY_CONFLICT`. The error SHOULD be non-retryable unless the caller changes the request. Inflight reservations MAY surface as retryable errors when the caller can safely try again later.

## 6. Versioning

The idempotency rules in this RFC describe Signal Protocol v1. Any change to payload comparison, record lifecycle, or replay behavior that would alter visible semantics MUST use a new protocol version or a clearly documented binding-specific extension.

## 7. Security Considerations

Idempotency keys MUST be scoped carefully. Implementations SHOULD scope keys by operation and tenant or application context when relevant. Implementations SHOULD compare normalized payload fingerprints instead of trusting raw JSON byte order. Idempotency keys MUST NOT be treated as secrets or as authentication data.

## 8. Observability Considerations

Implementations SHOULD record the operation name, idempotency key, payload fingerprint, replay outcome, and message identifier. That metadata makes it possible to explain why a request was replayed, conflicted, or completed.

## 9. Conformance

A conformant idempotency implementation MUST:

1. persist records durably
2. reserve requests before executing the handler
3. detect payload conflicts
4. replay completed logical results
5. store structured failures when useful
6. expose the same behavior across retries

PostgreSQL is the reference store for the Node.js implementation, but the protocol allows other stores that preserve the same semantics.
