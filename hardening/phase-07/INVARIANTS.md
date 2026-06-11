# Invariants — Phase 7

## Overview

Runtime invariants that must hold at all times. Violation of any invariant is a blocking bug.

## Runtime Invariants

| ID | Invariant | Enforcement | Test |
|----|-----------|-------------|------|
| INV-001 | `fingerprint()` is deterministic: same input → same output | `stableStringify` sorts keys; SHA-256 is deterministic | `hash.test.ts` |
| INV-002 | Every mutation with `idempotency: "required"` rejects missing idempotency key | Runtime check in `executeMutation` | `runtime.test.ts` |
| INV-003 | `authorize()` runs before idempotency reservation | Code order in `executeMutation` | `high-risk-flow.test.ts` |
| INV-004 | Replay returns the same result as the original execution | Idempotency store returns stored result | `runtime.test.ts` |
| INV-005 | Different payload with same key → `IDEMPOTENCY_CONFLICT` | Fingerprint comparison in store | `store.test.ts` |
| INV-006 | Events are only emitted from mutation handler context | `emit` only available on `SignalExecutionContext` | `runtime.test.ts` |
| INV-007 | Subscriber dedupe prevents duplicate delivery | `createReplaySafeSubscriber` tracks messageId | `dispatcher.test.ts` |
| INV-008 | Request context is frozen after normalization | `freezeRequestContext` deep-freezes | `execution.test.ts` |
| INV-009 | Schema validation rejects invalid input | Zod `.parse()` on input and output | `protocol.test.ts` |
| INV-010 | Audit chain entries are hash-linked and verifiable | `verifyChain()` checks hash continuity | `audit-chain.ts` tests |
| INV-011 | Protocol errors are structured and machine-readable | `createSignalError` enforces structure | `errors.test.ts` |
| INV-012 | Operation names follow `domain.action.vN` pattern | Convention enforced by documentation and tests | Conformance tests |

## CI-Style Local Tests

These tests run locally as part of `pnpm test:library`:

```bash
# Run all invariant tests
pnpm test:library

# Specific invariant checks
pnpm --filter @signal/runtime test        # INV-001 through INV-009
pnpm --filter @signal/protocol test       # INV-011, INV-012
pnpm --filter @signal/binding-http test   # Transport invariant
pnpm --filter @signal/reference-server test # End-to-end invariant
```

### Test Categories

1. **Fingerprint determinism test**: Same payload → same hash across 1000 runs
2. **Idempotency replay test**: Execute → replay → verify same result
3. **Idempotency conflict test**: Same key + different payload → conflict
4. **Authorization gate test**: Missing auth → FORBIDDEN before idempotency
5. **Subscriber dedupe test**: Same messageId → single delivery
6. **Schema validation test**: Invalid input → VALIDATION_ERROR
7. **Audit chain integrity test**: Build chain → verify → tamper → verify fails
8. **Context immutability test**: Mutating frozen context throws