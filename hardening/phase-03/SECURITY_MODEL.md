# Security Model — Phase 3

## Overview

Signal's security model enforces zero-trust principles at the operation boundary. Every mutation requires explicit authorization before execution. No implicit trust is granted based on network position, service identity, or transport layer.

## Threat Model

| Threat ID | Threat | Attack Vector | Impact | Mitigation |
|-----------|--------|---------------|--------|------------|
| T-001 | Unauthorized mutation execution | Direct runtime call without auth | Critical | `authorize()` gate before idempotency reservation |
| T-002 | Idempotency key collision across tenants | Shared key namespace | Critical | Tenant-prefixed idempotency keys; Postgres RLS |
| T-003 | Replay attack with modified payload | Same key, different intent | High | Payload fingerprint verification; IDEMPOTENCY_CONFLICT |
| T-004 | Sensitive data in audit trail | Payment tokens in evidence | High | Redaction in audit output; token masking |
| T-005 | Cross-tenant data access | Missing tenant scope in auth | Critical | Auth subject includes tenant; scope verification |
| T-006 | Event injection by compromised subscriber | Malicious event dispatch | Medium | Events only emitted from mutation context; no direct publish API |
| T-007 | Denial of service via idempotency store exhaustion | Flooding reservation requests | Medium | Store capacity limits; TTL on pending records |
| T-008 | Supply chain compromise via dependency | Malicious package update | High | Exact version pinning; lockfile verification; override policy |

## Trust Boundaries

### Boundary 1: External → Transport Layer
- **Trust level**: Zero
- **Enforcement**: HTTP binding validates request structure before passing to runtime
- **Data crossing**: Raw HTTP payload → validated Signal request

### Boundary 2: Transport → Execution Layer
- **Trust level**: Zero
- **Enforcement**: Runtime validates auth context before any operation
- **Data crossing**: Validated request → authorized execution context

### Boundary 3: Execution → Idempotency Store
- **Trust level**: Partial (authenticated operation)
- **Enforcement**: Idempotency keys include tenant prefix; fingerprint includes auth
- **Data crossing**: Operation name + key + fingerprint → reservation

### Boundary 4: Execution → Event Dispatch
- **Trust level**: Partial (authenticated mutation)
- **Enforcement**: Events only emitted from mutation handler context
- **Data crossing**: Event payload → subscriber delivery

### Boundary 5: Execution → Audit Chain
- **Trust level**: Full (internal)
- **Enforcement**: Audit entries are immutable and hash-chained
- **Data crossing**: Execution outcome → tamper-evident record

## Zero-Trust Principles

1. **Never trust, always verify**: Every mutation call must pass `authorize()` regardless of source
2. **Explicit auth required**: No ambient authority; auth context must be provided per-request
3. **Tenant isolation by default**: Idempotency keys, auth subjects, and audit records are tenant-scoped
4. **Least privilege**: Scopes must explicitly include operation permissions
5. **Defense in depth**: Auth gate → idempotency reservation → schema validation → handler execution
6. **Assume breach**: Audit chain is tamper-evident; evidence is recorded before and after state changes
7. **No implicit trust from network**: Same enforcement for in-process and HTTP calls

## Authorization Flow

```
Request → Auth Validation → authorize() gate → Idempotency Reservation → Handler → Audit Record
              ↓ FAIL            ↓ FAIL              ↓ FAIL            ↓ FAIL      ↓ ALWAYS
           BAD_REQUEST     FORBIDDEN/UNAUTH   IDEMPOTENCY_CONFLICT  ERROR     Evidence recorded
```

## Security Controls Summary

- **Auth gate**: `authorize()` runs before idempotency reservation (R-004 mitigation)
- **Tenant isolation**: Idempotency keys include tenant prefix (R-005 mitigation)
- **Data redaction**: Audit evidence strips sensitive fields (R-006 mitigation)
- **Idempotency enforcement**: Required-idempotency mutations reject missing keys (R-015 mitigation)
- **Immutable audit**: Hash-chained entries prevent tampering
- **Schema validation**: Zod schemas validate all inputs before handler execution