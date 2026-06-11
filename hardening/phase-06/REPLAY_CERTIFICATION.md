# Replay Certification — Phase 6

## Overview

Signal guarantees that replaying the same mutation with the same idempotency key and payload produces the same result. This document certifies the replay mechanism, describes the hash chain, and provides the deterministic proof.

## Hash Chain Description

Signal uses a SHA-256 hash chain for audit evidence integrity:

1. **Genesis entry**: Previous hash = `0x00...00` (64 zero hex characters)
2. **Each subsequent entry**: Previous hash = hash of the preceding entry
3. **Entry content**: `stableStringify({ sequence, timestamp, operationName, operationKind, messageId, outcome, idempotencyKey, payloadFingerprint, previousHash })`
4. **Hash computation**: `SHA-256(entryContent)` → 64 hex characters

The `fingerprint()` function in `api/runtime/src/hash.ts` provides deterministic payload hashing:
- `stableStringify()` sorts object keys alphabetically
- Undefined values are filtered
- Arrays maintain insertion order
- Result: `SHA-256(stableStringify({ kind, name, payload, auth }))`

This ensures that the same logical request always produces the same fingerprint, enabling idempotency replay detection.

## Replay Procedure

### Step 1: Initial Execution
```
POST /signal/mutation/payment.capture.v1
idempotencyKey: "tenant_acme:capture:001"
payload: { tenantId: "tenant_acme", ... }
→ Result: { ok: true, result: {...}, meta: { outcome: "completed", idempotency: { status: "recorded" } } }
```

### Step 2: Safe Retry (Same Key, Same Payload)
```
POST /signal/mutation/payment.capture.v1
idempotencyKey: "tenant_acme:capture:001"
payload: { tenantId: "tenant_acme", ... } (identical)
→ Result: { ok: true, result: {...}, meta: { outcome: "replayed", idempotency: { status: "replayed" }, replay: { replayed: true, reason: "idempotency" } } }
```

### Step 3: Conflict Detection (Same Key, Different Payload)
```
POST /signal/mutation/payment.capture.v1
idempotencyKey: "tenant_acme:capture:001"
payload: { tenantId: "tenant_acme", amountCents: 99900 } (different!)
→ Result: { ok: false, error: { code: "IDEMPOTENCY_CONFLICT", message: "The idempotency key was reused with different input" } }
```

### Step 4: Verification
- Replay result matches original result exactly
- Audit evidence recorded for both original and replay
- Subscriber dedupe prevents duplicate side effects
- Idempotency store records the replay status

## Deterministic Proof

**Theorem**: For any mutation `M` with idempotency key `K` and payload `P`, if `M` is executed twice with the same `K` and equivalent `P`, the second execution returns the same result as the first without re-executing the handler.

**Proof**:
1. `fingerprint({ kind: "mutation", name: M, payload: P, auth: A })` is deterministic because `stableStringify` produces the same string for the same input (keys sorted, undefined filtered).
2. On first execution, the idempotency store reserves key `K` with `payloadFingerprint = F`.
3. Handler executes, result `R` is stored: `complete({ K, F, result: R })`.
4. On second execution with same `K` and `P`, `fingerprint()` produces the same `F`.
5. Store `reserve({ K, F })` returns `{ state: "replayed", record: { status: "completed", result: R } }`.
6. Runtime returns `R` directly without calling the handler.
7. Therefore, the result is identical and the handler is not re-invoked. ∎

**Corollary**: If `P` differs, `F` differs, and the store returns `{ state: "conflict" }`, producing `IDEMPOTENCY_CONFLICT`. This prevents silent data corruption from key reuse with different intent.