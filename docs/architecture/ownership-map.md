# Ownership Map

Ownership defines who must review changes and what compatibility bar applies.
These owners are architectural domains, not individual people.

| Domain | Owns | Review Required For |
| --- | --- | --- |
| Protocol | `packages/protocol`, `spec`, `schemas`, future `contracts` | Envelopes, operation names, errors, result shape, schema generation, compatibility policy. |
| Runtime | `packages/runtime`, runtime-facing parts of SDK | Query/mutation/event execution, idempotency semantics, dispatcher behavior, deadlines, replay safety. |
| Transport | `packages/binding-http`, transport examples | HTTP binding, request protection, auth hooks, transport contract, OpenAPI. |
| Persistence | `packages/idempotency-postgres`, future outbox/audit stores, decision memory stores | Migrations, transactions, retention, partitioning, restore, migration safety. |
| Security | Auth, authorization, request hardening, secrets, supply chain | Public edge protection, RBAC, JWT validation, audit-sensitive changes. |
| Observability | Metrics, tracing, logs, audit trail | OpenTelemetry names, trace propagation, log fields, dashboards, audit export. |
| Governance | RFCs, ADRs, release policy, compatibility policy | Protocol changes, deprecations, support windows, institutional readiness gate. |
| Developer Experience | CLI, examples, docs, quickstart, `signal doctor` | Onboarding flow, generated app templates, examples, troubleshooting. |
| Ecosystem | Consumer contracts, SDKs, plugin/adapter certification | Stocks Optimizer contract, conformance suite, reference implementations, plugin registry. |
| Compatibility | `backend/*`, legacy root modules, migration wrappers | Legacy support, equivalence tests, deprecation and migration path. |

## Change Classes

| Change Class | Required Evidence |
| --- | --- |
| Public protocol change | RFC state, contract diff, compatibility tests, migration notes. |
| Runtime behavior change | Unit tests, integration tests, replay/idempotency tests, observability impact. |
| Persistence change | Migration tests, rollback or restore plan, data retention impact. |
| Security change | Threat model note, auth/authz tests, audit logging validation. |
| Legacy removal | Usage inventory, equivalence tests, deprecation window, rollback plan. |
| Documentation-only change | Link check and owner review if normative behavior is described. |

## Ownership Rules

- Canonical package changes require the owning domain review.
- Compatibility package changes require both Compatibility and the relevant
  canonical domain review.
- Protocol changes cannot be merged without an RFC reference.
- Architecture changes cannot be merged without an ADR once the ADR process is
  active.
- Operational behavior changes must update runbooks or explicitly state why no
  runbook is affected.
