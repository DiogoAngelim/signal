# Risk Register — Phase 1

## Overview

This risk register identifies, categorizes, and rates risks to the Signal production hardening process. Each risk includes likelihood, impact, mitigation, and owner.

## Risk Categories

- **Correctness**: Risks to deterministic execution, replay safety, and audit integrity
- **Security**: Risks to authorization, tenant isolation, and data protection
- **Operational**: Risks to deployment, monitoring, and incident response
- **Supply Chain**: Risks from dependencies, build tooling, and third-party code
- **Architectural**: Risks from layer boundary violations and coupling

## Risk Table

| ID | Category | Risk | Likelihood | Impact | Score | Mitigation | Owner |
|----|----------|------|------------|--------|-------|------------|-------|
| R-001 | Correctness | Non-deterministic execution due to Date.now() or random values in handlers | Medium | Critical | High | Enforce `fingerprint()` for all idempotency; ban Date.now() in handlers; use stableStringify | Runtime |
| R-002 | Correctness | Replay returns stale result after schema evolution | Low | Critical | High | Version operations immutably; schema validation on replay | Protocol |
| R-003 | Correctness | Audit evidence lost during mutation failure | Low | High | Medium | Idempotency store records failures; audit before state change | Execution |
| R-004 | Security | Authorization bypass via direct runtime call | Medium | Critical | High | `authorize()` runs before idempotency reservation; runtime enforces auth gate | Runtime |
| R-005 | Security | Tenant isolation failure in shared idempotency store | Medium | Critical | High | Idempotency keys include tenant prefix; Postgres RLS policies | Idempotency |
| R-006 | Security | Sensitive data leakage in audit/redacted evidence | Low | High | Medium | Redaction in reference proof; audit evidence strips payment tokens | Audit |
| R-007 | Operational | Idempotency store unavailable blocks all mutations | Medium | High | Medium | Memory store fallback for non-production; health check on store | Operations |
| R-008 | Operational | Subscriber side effect duplication on event redelivery | Medium | High | Medium | Replay-safe subscriber deduper; consumerId tracking | Dispatch |
| R-009 | Supply Chain | Dependency vulnerability in zod, fastify, or drizzle | Medium | Medium | Medium | Pin exact versions; `pnpm audit`; override for known CVEs | Supply |
| R-010 | Supply Chain | Build tooling compromise (biome, vite, vitest) | Low | High | Medium | Lockfile integrity; pin devDependencies | Supply |
| R-011 | Architectural | Execution layer imports Protocol mutable state | Low | High | Medium | Protocol exports only frozen/immutable types; architecture fitness test | Architecture |
| R-012 | Architectural | Circular dependency between runtime and binding-http | Low | Medium | Low | Dependency direction enforced: binding-http → runtime → protocol | Architecture |
| R-013 | Correctness | Hash collision in fingerprint() breaks idempotency | Very Low | Critical | Medium | SHA-256 used; collision probability negligible; fingerprint includes kind+name+payload | Runtime |
| R-014 | Operational | Memory idempotency store lost on process restart | High | Medium | High | Production must use Postgres store; memory store only for tests/dev | Operations |
| R-015 | Security | Missing idempotency key on required-idempotency mutation | Medium | High | High | Runtime rejects with BAD_REQUEST if key missing; test enforces | Runtime |

## Summary

- **Correctness**: 3 risks (R-001, R-002, R-003, R-013)
- **Security**: 4 risks (R-004, R-005, R-006, R-015)
- **Operational**: 3 risks (R-007, R-008, R-014)
- **Supply Chain**: 2 risks (R-009, R-010)
- **Architectural**: 2 risks (R-011, R-012)

High-priority risks (score = High): R-001, R-004, R-005, R-014, R-015

These risks are addressed in subsequent hardening phases.