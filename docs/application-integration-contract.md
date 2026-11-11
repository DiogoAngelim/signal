# Application Integration Contract

This document is the required implementation and verification standard for integrating an application with Signal. It exists because a dependency name, adapter scaffold, operation declaration, or successful unit test does not prove that an application executes through Signal.

## 1. Integration states

Every application must be assigned exactly one evidence-backed state:

- **Not assessed** — no application-level review has been completed.
- **Not applicable** — a written assessment explains why Signal would add no material value.
- **Planned** — a design exists, but executable integration is not present.
- **Scaffolded** — declarations or adapters exist, but at least one runtime path is disconnected, stubbed, or non-persistent.
- **Integrated** — real application operations execute through a real Signal runtime and pass the integration contract below.
- **Validated in deployment** — Integrated, plus a named deployment has been exercised against its real identity, persistence, delivery, and operational boundaries.
- **Production validated** — deployment validation plus documented production SLOs, security controls, recovery evidence, operational ownership, and measured real workload evidence.

Never promote a state based on intent, a package import, mocks alone, or a green build. State the exact commit, test suite, environment, and evidence date.

## 2. Mandatory architecture

An application integration must use the actual Signal packages and supported SDK entry point. Local placeholder packages, no-op registries, copied runtime code, or look-alike packages are not integrations.

Required path:

`application request/event → trusted application boundary → Signal runtime → registered operation → domain handler/ports → application persistence and side effects → Signal result/event/audit`

The application owns its domain model, user experience, identity provider, authorization policy, and external side effects. Signal supplies reusable protocol/runtime and decision lifecycle capabilities. Do not move domain ownership into Signal merely to increase adoption.

### Runtime lifecycle

- Construct one appropriately scoped runtime per application process or documented isolation boundary.
- Retain the runtime instance; do not discard it after registering handlers.
- Register real Queries, Mutations, and Events during deterministic startup.
- Attach the runtime to the actual request/event lifecycle.
- Close/drain it during shutdown and handle startup failure explicitly.
- Configure durable idempotency, inbox/outbox, decision memory, and audit adapters where the application's reliability requirements call for them. In-memory defaults are development/demo-only unless explicitly justified.
- Pin compatible Signal package versions. Do not resolve an unpublished or incompatible SDK by silently substituting a local stub.

## 3. Decision design

For each proposed use case, document:

1. The decision or operational objective.
2. Inputs, evidence sources, provenance, freshness, and missing-data behavior.
3. Constraints, policy, hard stops, and human approval requirements.
4. Deterministic decision inputs and versioned policy/model identifiers.
5. Uncertainty semantics and how confidence is interpreted.
6. The action boundary and rollback/compensation behavior.
7. Outcome definition, observation window, reviewer, and learning feedback path.

Use the full lifecycle only where it adds value:

`Collect → Normalize → Analyze → Assess evidence/uncertainty → Optimize → Decide → Authorize → Execute → Observe → Review → Learn`

AI may summarize evidence, propose hypotheses, and assist with analysis. AI output is not trusted identity, authorization, verified evidence, deterministic policy, or permission to execute. Deterministic constraints and approval gates remain authoritative. Confidence must not be described as probability of correctness unless its statistical meaning is explicitly defined and empirically validated.

## 4. Security and tenant boundaries

- Derive identity from a trusted server-side authentication boundary; never trust tenant, actor, role, or approval claims supplied only in request bodies.
- Resolve tenant and resource authorization before dispatch and enforce it again at the domain boundary where appropriate.
- Scope idempotency keys, decision memory, audit access, and event subscriptions to the correct tenant/security boundary.
- Validate operation schemas and reject unknown or incompatible protocol versions.
- Keep secrets and signing keys outside source control; document custody, rotation, and recovery.
- Redact credentials and sensitive payload fields from logs, audit records, telemetry, and error responses.
- Document proxy/network trust assumptions and service-to-service authentication.
- Test cross-tenant access denial, spoofed identity, replay, duplicate delivery, and unauthorized execution.

Signal's runtime hooks do not replace the application's identity provider or complete resource-level authorization policy.

## 5. Reliability and side effects

- Use durable idempotency for retriable mutations.
- Use transactional outbox/inbox patterns when state changes and event publication must be coordinated.
- Make consumer deduplication and acknowledgement ordering explicit.
- Test lease expiry, fencing, worker crash, retry, dead-letter handling, and recovery.
- Treat external side effects as potentially at-least-once unless the external provider supplies a stronger idempotency contract. A transactional outbox alone does not guarantee exactly-once effects in a third-party system.
- Define replay compatibility across schema, handler, policy, and model versions. Fail closed when replay cannot be interpreted safely.
- Do not replay irreversible external side effects without an explicit replay policy and idempotency/compensation design.

## 6. Required integration test layers

Every integration must provide automated evidence for:

1. **Wiring:** the actual application entry point creates and retains the actual Signal runtime; registered handlers are reachable through the real transport or event consumer.
2. **Behavior:** each declared operation invokes a real handler and produces a meaningful domain result; placeholder return values are prohibited.
3. **Persistence:** relevant state survives process restart using the configured durable adapter.
4. **Authorization:** unauthenticated, spoofed, cross-tenant, and unauthorized requests fail closed.
5. **Idempotency and replay:** retries do not duplicate domain state; replay compatibility and conflicts are tested.
6. **Events:** outbox/inbox delivery, deduplication, acknowledgement ordering, retry, and dead-letter behavior are exercised where events are used.
7. **Decision quality:** evidence provenance, missing/contradictory evidence, hard constraints, uncertainty, policy versioning, and approval gates are tested.
8. **Learning:** outcomes can be associated with prior decisions; no learning claim is made from unobserved or synthetic outcomes.
9. **Failure recovery:** database, worker, provider, and process failures are tested at the boundaries the application claims to support.
10. **Operational readiness:** health checks, telemetry, bounded-cardinality metrics, logs, alert ownership, migration, backup/restore, and shutdown are documented.

Mocks are useful for isolated unit tests but cannot satisfy wiring, persistence, deployment, or production-validation requirements.

## 7. Application integration dossier

Each application must maintain `docs/signal-integration.md` (or an equivalent linked document) containing:

- application purpose, owners, and repository/commit;
- Signal integration state from section 1;
- decision use cases and why each is valuable;
- architecture diagram and real request/event flow;
- exact Signal packages and versions;
- operation registry (name, kind, schema/version, handler, authorization, side effects);
- identity, tenant, persistence, and secret boundaries;
- idempotency, event, replay, and audit configuration;
- human approval and AI responsibility boundaries;
- test commands and evidence for each required layer;
- deployment environment and observed limitations;
- unresolved risks and next validation step.

A checklist with links to source and test files is preferred over unsupported prose.

## 8. Repository-wide example policy

Every entry under `examples/` must be inventoried. Classify each as a runnable application, library/SDK example, submodule, pointer/placeholder, fixture, or documentation-only example. A submodule is assessed in its own repository; a pointer file is not a runnable application. Do not report an example as integrated merely because its name appears in this repository.

For runnable applications, decide explicitly whether Signal is materially useful. If useful, integrate it and provide the dossier and tests. If not, add a short rationale and keep the example independent. SDK/library examples must demonstrate the supported real SDK rather than a local imitation.

The inventory must record path, kind, owning repository, use case, integration state, and evidence links. CI should fail when a new runnable example lacks an inventory entry and an explicit applicability decision.

## 9. Change and release gate

Before an integration is merged:

- run the application's full relevant test, typecheck, lint, build, and migration checks;
- run Signal's library checks and affected contract/proof suites;
- verify dependency graph and package exports;
- inspect the final diff for stubs, placeholder handlers, dead runtime instances, insecure identity assumptions, and misleading comments/docs;
- record failures and unvalidated boundaries honestly;
- use a reviewable pull request; do not silently commit application integrations directly to production branches.

A successful integration test is not a production certification. Production claims require deployment-specific evidence.

## 10. Future application assessment workflow

When asked whether an application can benefit from Signal:

1. Inspect the current repository and identify consequential decisions, state transitions, evidence, events, side effects, audit needs, and learning opportunities.
2. Compare the application's current architecture with Signal's actual supported capabilities and package contracts.
3. Identify high-value use cases, expected benefit, implementation cost, operational burden, and risks.
4. Recommend **integrate**, **selectively integrate**, or **do not integrate**, with explicit rationale.
5. On authorization to proceed, implement the smallest complete vertical slice first, then expand to the maximum set of capabilities that materially improve the application.
6. Complete the application dossier, automated tests, documentation, and deployment validation. Never equate a proposal or scaffold with a completed integration.

The goal is not universal dependency on Signal. The goal is to make consequential application decisions more explicit, reliable, auditable, and improvable where that is demonstrably useful.
