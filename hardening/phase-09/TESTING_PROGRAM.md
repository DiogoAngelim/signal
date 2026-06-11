# Testing Program — Phase 9

## Overview

Signal's testing program covers five categories: unit tests, integration tests, replay tests, adversarial tests, and failure injection tests. All tests run locally via `pnpm test:library`.

## Test Categories

### 1. Unit Tests

Test individual functions and modules in isolation.

| Test Suite | Location | Coverage |
|------------|----------|----------|
| Hash/fingerprint | `api/runtime/src/hash.test.ts` | `fingerprint()`, `stableStringify()` |
| Protocol schemas | `api/protocol/src/*.test.ts` | Zod schema validation, parse/encode |
| Runtime core | `api/runtime/src/runtime.test.ts` | `executeMutation`, `executeQuery` |
| Idempotency store | `api/runtime/src/store.test.ts` | Reserve, complete, conflict detection |
| Event dispatcher | `api/runtime/src/dispatcher.test.ts` | Subscriber dedupe, delivery |
| Errors | `api/runtime/src/errors.test.ts` | `createSignalError` structure |
| Audit chain | `api/runtime/src/audit-chain.test.ts` | Entry creation, chain verification |
| Resilience | `api/runtime/src/resilience.test.ts` | Retry policy, circuit breaker |
| Observability | `api/runtime/src/observability.test.ts` | Logger, metrics recorder |

### 2. Integration Tests

Test full paths across module boundaries.

| Test Suite | Location | Coverage |
|------------|----------|----------|
| HTTP binding → Runtime | `api/binding-http/src/*.test.ts` | Request → response cycle |
| Reference server | `server/reference-server/test/*.test.ts` | Full stack: HTTP → runtime → store |
| High-risk flow | `server/reference-server/test/high-risk-flow.test.ts` | Auth → idempotency → handler → audit |

### 3. Replay Tests

Verify idempotency and replay correctness.

| Test | Description |
|------|-------------|
| Same key + same payload → same result | Execute mutation twice, verify identical result |
| Replay does not re-execute handler | Handler called exactly once |
| Replay records outcome = "replayed" | Meta.outcome reflects replay status |
| Subscriber not called on replay | Dedupe prevents duplicate side effects |

### 4. Adversarial Tests

Test system behavior under hostile inputs.

| Test | Description |
|------|-------------|
| Missing idempotency key on required mutation | Returns error with IDEMPOTENCY_KEY_REQUIRED |
| Invalid auth context | Returns FORBIDDEN before idempotency |
| Conflicting idempotency key | Returns IDEMPOTENCY_CONFLICT |
| Malformed request body | Returns VALIDATION_ERROR |
| Unknown operation name | Returns UNKNOWN_OPERATION |
| Expired deadline | Returns DEADLINE_EXCEEDED |
| Extra unknown fields | Schema strict mode rejects |
| Extremely large payload | Graceful error, no crash |

### 5. Failure Injection Tests

Test resilience under failure conditions.

| Test | Description |
|------|-------------|
| Idempotency store unavailable | Returns SERVICE_UNAVAILABLE, no silent failure |
| Handler throws | Error captured in audit, no unhandled exception |
| Subscriber throws | Does not affect mutation result |
| Concurrent reservation race | Only one reservation succeeds |
| Audit chain tampering | `verifyChain()` returns false |

## Execution

```bash
# Run all tests
pnpm test:library

# Run specific categories
pnpm --filter @signal/runtime test
pnpm --filter @signal/protocol test
pnpm --filter @signal/binding-http test
pnpm --filter @signal/reference-server test

# Run with coverage
pnpm test:library --coverage