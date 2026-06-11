# SLOs — Phase 5

## Overview

Signal's Service Level Objectives define the correctness guarantees that the system must meet. These are non-negotiable for production operation.

## SLO Definitions

| SLO | Target | Measurement | Rationale |
|-----|--------|-------------|-----------|
| Deterministic execution | 100% | Same input + same auth → same fingerprint | Idempotency depends on deterministic fingerprinting |
| Audit correctness | 100% | Every completed/replayed/failed mutation produces audit evidence | Constitution requires executable evidence |
| Replay correctness | 100% | Same idempotency key + same payload → same result | Replay safety is a core Signal guarantee |
| Idempotency conflict detection | 100% | Same key + different payload → IDEMPOTENCY_CONFLICT | Prevents silent data corruption |
| Authorization enforcement | 100% | Every mutation with `authorize()` defined must pass auth before execution | Zero-trust security model |
| Schema validation | 100% | Every operation input/output validated by Zod schema | Type safety at runtime boundary |
| Subscriber dedupe | 100% | Same messageId + consumerId → single delivery | Prevents duplicate side effects |
| Event ordering | 100% | Events emitted in handler order | Causation chain integrity |

## Measurement Method

Each SLO is verified by:
1. **Unit tests**: Direct runtime calls with controlled inputs
2. **Integration tests**: Full HTTP binding → runtime → store path
3. **Reference proof**: `pnpm proof:reference` exercises the complete high-risk path
4. **Adversarial tests**: Conflicting inputs, missing auth, expired deadlines

## Error Budget

For correctness SLOs at 100%, the error budget is **zero**. Any violation is a blocking issue that must be resolved before proceeding.

- Deterministic execution violation → STOP, fix fingerprint logic
- Audit correctness violation → STOP, fix evidence recording
- Replay correctness violation → STOP, fix idempotency store

## Compliance Evidence

- `pnpm proof:reference` passes
- `pnpm test:library` passes
- All SLOs measured in test suite
- No open correctness bugs