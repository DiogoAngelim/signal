# Governance — Phase 11

## Overview

Signal's governance model defines rollback strategy, policy lifecycle, and operational controls. All governance decisions are locally enforced and auditable.

## Rollback Strategy

### Code Rollback

1. **Git revert**: Any commit can be reverted via `git revert <sha>`
2. **Lockfile rollback**: `pnpm-lock.yaml` is version-controlled; revert to previous lockfile for dependency issues
3. **Schema rollback**: Protocol schemas are versioned (`v1`, `v2`); previous versions remain supported during migration
4. **Configuration rollback**: Environment variables and config files are version-controlled

### Data Rollback

1. **Idempotency store**: Records are append-only; no rollback needed (replay handles correctness)
2. **Audit chain**: Immutable; no rollback possible (by design — tamper-evident)
3. **Application data**: Rollback via application-level compensation (not Signal's concern)

### Rollback Procedure

```
1. Identify the failing change (git bisect if needed)
2. Revert the commit: git revert <sha>
3. Verify: pnpm test:library
4. Verify: pnpm proof:reference
5. Deploy reverted version
6. Record rollback in audit log
```

### Rollback Criteria

- Any correctness SLO violation → immediate rollback
- Security vulnerability discovered → immediate rollback
- Performance regression > 50% → rollback within 1 hour
- Non-critical bug → fix forward unless customer impact

## Policy Lifecycle

### Policy States

1. **Proposed**: New policy documented in ADR
2. **Under Review**: Team review and discussion
3. **Adopted**: Policy enforced in code (tests, linters, runtime checks)
4. **Deprecated**: Policy marked for removal; grace period
5. **Retired**: Policy removed; migration complete

### Policy Categories

| Category | Examples | Enforcement |
|----------|----------|-------------|
| Security | Auth required, zero-trust, tenant isolation | Runtime `authorize()` gate |
| Correctness | Idempotency required, replay safety, deterministic fingerprint | Runtime checks + tests |
| Observability | Structured logging, trace context, metrics | `SignalLogEntry` schema |
| Architecture | Layer dependencies, immutability | Fitness tests (Phase 8) |
| Operations | Rollback procedure, deployment checklist | Runbook documentation |

### Policy Change Process

1. Create ADR documenting proposed change
2. Identify affected code and tests
3. Implement enforcement (code + tests)
4. Validate all phases pass
5. Merge and deploy

## Operational Controls

- **Feature flags**: Not currently implemented; operations are always-on
- **Circuit breaker**: `CircuitBreakerState` in `resilience.ts` provides automatic failure isolation
- **Rate limiting**: Not in Signal core; implement at HTTP binding layer
- **Graceful degradation**: Queries continue when idempotency store is unavailable; mutations fail safely