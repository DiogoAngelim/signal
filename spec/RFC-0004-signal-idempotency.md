# RFC-0004: Signal Idempotency

## 1. Abstract

This RFC defines idempotency semantics for Signal mutations.

## 2. Terminology

- **Normalized payload**: the canonical payload representation used for comparison.
- **Replay**: returning the same logical result for the same idempotency key and normalized payload.

## 3. Rules

### 3.1 Modes

- `required`: the mutation MUST reject requests without an idempotency key.
- `optional`: the mutation MAY use an idempotency key when supplied.
- `none`: the mutation MUST ignore idempotency.

### 3.2 Comparison

Same idempotency key plus same normalized payload MUST resolve to the same logical result. Same idempotency key plus different normalized payload MUST conflict.

### 3.3 Storage

Implementations that promise retry safety MUST persist idempotency records durably. PostgreSQL is the reference store.

## 4. Error Model

Conflicts SHOULD use a machine-readable conflict code and SHOULD be treated as non-retryable until the caller changes the request.

## 5. Security Considerations

Idempotency keys MUST be scoped carefully. Implementations SHOULD avoid accepting opaque keys without a payload fingerprint.

## 6. Observability Considerations

Implementations SHOULD record the operation name, idempotency key, payload fingerprint, and replay outcome.

## 7. Conformance

A conformant idempotency implementation MUST persist records, detect payload conflicts, and replay completed results when the same logical request repeats.
