# Governance and Protocol Evolution

This document describes Signal's governance model, how protocol changes are
managed, and why contracts are treated as first-class artifacts.

## Why Governance Matters

Signal's protocol defines the shared language that all packages, adapters, and
applications speak. Changes to the protocol affect every consumer. Without
governance discipline, protocol changes can:

- Break existing consumers without warning
- Introduce incompatible semantics under the same operation name
- Undermine replay by changing what historical evidence means
- Erode trust in audit trails if contracts are silently modified

Governance ensures that protocol evolution is deliberate, transparent, and
backward-compatible.

## Governance Artifacts

### RFCs (Request for Comments)

Protocol and runtime design decisions are captured as RFCs in `spec/RFC-*.md`:

| RFC | Title | Scope |
|-----|-------|-------|
| RFC-0001 | Signal Protocol Core | Operation names, kinds, envelopes, errors, results |
| RFC-0002 | Signal HTTP Binding | HTTP transport adaptation of protocol operations |
| RFC-0003 | Signal Runtime Node Reference | In-process execution engine specification |
| RFC-0004 | Signal Idempotency | Idempotency key semantics and conflict resolution |
| RFC-0005 | Signal Event Processing | Event dispatch, subscribers, and deduplication |
| RFC-0006 | Signal Execution Context and Outcomes | Context propagation and outcome tracking |

RFCs are design records. They document what was decided, why, and what
alternatives were considered. Once published, an RFC represents a commitment
to the described contract.

### Schemas

Published JSON schemas live in `spec/contracts/schemas/`:

- Envelope schemas (request/response shapes)
- Error schemas (structured error codes)
- Result schemas (typed result objects)
- Capability schemas (runtime operation discovery)
- Operation payload schemas (input/output for each operation)

Schemas are the machine-readable contract. They are used for validation,
testing, and compatibility checking.

### Fixtures

Shared contract fixtures live in `spec/contracts/fixtures/`:

- Protocol conformance fixtures (used by `@signal/protocol` tests)
- Commitment golden fixtures (used by `@signal/commitment` tests)

Fixtures are the reference data for contract conformance. They ensure that
implementations match the published contracts.

### Constitution

The Signal Constitution (`docs/constitution.md`) defines the rules that
govern Signal's behavior and evolution:

- Signal is a correctness layer
- Signal is protocol-first and transport-independent
- Queries, Mutations, and Events are explicit contracts
- Dangerous mutations must declare risk
- Production guarantees require executable evidence
- Simplicity beats flexibility

The constitution is the highest-level governance document. Any change that
violates the constitution is rejected, regardless of its technical merit.

## Protocol Evolution Rules

### 1. Versioned Operations Are Immutable Contracts

Once an operation is published (e.g., `payment.capture.v1`), its input
schema, result schema, and semantics cannot change. If a change is needed,
a new version must be created (e.g., `payment.capture.v2`).

**Why:** Immutable contracts protect consumers. A consumer that depends on
`v1` can continue to depend on it without fear that its behavior will change
underneath.

### 2. New Versions Require New Names

Adding a field, changing a field type, or altering semantics requires a new
operation version. The old version continues to exist.

**Why:** This prevents silent breakage. Consumers opt into new versions
explicitly; they are not forced into them.

### 3. Protocol Changes Require RFCs

Any change to the protocol surface (new operation kinds, envelope changes,
error code additions) must be documented in an RFC before implementation.

**Why:** RFCs create a record of what was decided and why. They enable
review, discussion, and informed consent before changes are committed.

### 4. Schema Changes Require Compatibility Checking

Any change to a published schema must be validated against existing fixtures.
If the change breaks fixture conformance, it must be documented and
communicated.

**Why:** Fixtures are the reference data for contract conformance. Breaking
fixtures means breaking contracts.

### 5. Constitution Changes Require Deliberation

Changes to the constitution require broader review than changes to individual
packages. The constitution defines the system's identity; changing it changes
what Signal is.

**Why:** The constitution is the highest-level governance document. Changes
to it affect every package, adapter, and application.

## Compatibility Expectations

### Backward Compatibility

- New operation versions must not break existing versions
- New schema fields should be optional
- New error codes should be additive, not replacement
- New envelope fields should be optional

### Forward Compatibility

- Consumers should ignore unknown fields
- Consumers should handle unknown error codes gracefully
- Consumers should not depend on operation ordering

### Breaking Changes

Breaking changes are allowed only in new major versions. A breaking change
is any change that would cause a conforming consumer to fail. Examples:

- Removing an operation
- Changing a field type
- Changing a field from optional to required
- Changing error code semantics
- Changing envelope structure

## Contract-First Artifacts

Contracts are first-class artifacts in Signal. This means:

1. **Contracts are published** — Schemas and fixtures are stored in
   `spec/contracts/` and are version-controlled alongside code.

2. **Contracts are tested** — Protocol conformance is verified against
   fixtures. Breaking a fixture breaks the build.

3. **Contracts are documented** — RFCs explain what contracts mean, not just
   what they contain.

4. **Contracts are immutable** — Once published, a contract does not change.
   New versions are created instead.

5. **Contracts are the source of truth** — When code and contract disagree,
   the contract wins. Code is fixed to match the contract.

## Governance Process

### Proposing a Change

1. **Write an RFC** — Document the proposed change, its motivation,
   alternatives, and impact.
2. **Publish the RFC** — Add it to `spec/RFC-*.md`.
3. **Review** — Discuss the RFC with maintainers and consumers.
4. **Implement** — Once the RFC is accepted, implement the change.
5. **Validate** — Run conformance tests against fixtures.
6. **Publish** — Update schemas and fixtures in `spec/contracts/`.

### Responding to a Violation

If a governance violation is detected:

1. The violating change must be reverted or amended.
2. The contract must be restored to its published state.
3. If a new contract is needed, follow the proposing-a-change process.
4. No refactoring of unrelated code is permitted to fix a violation.

## Governance and Domain Independence

Signal's governance model is domain-agnostic. Protocol contracts define
generic concepts (evidence, assessment, decision, outcome, learning) that
apply across domains. Domain-specific contracts (e.g., `payment.capture.v1`)
are application-level, not platform-level.

This separation ensures that:

- Platform governance focuses on cross-domain contracts
- Application governance focuses on domain-specific contracts
- The platform can evolve without breaking applications
- Applications can evolve without breaking the platform

## Relationship to Hardening

Signal's hardening phases (see `hardening/`) provide the quality evidence
that governance decisions depend on:

- **Architecture Review** (phase-00) — Validates architectural choices
- **Risk Register** (phase-01) — Identifies risks that governance must address
- **Security Model** (phase-03) — Defines trust boundaries that governance enforces
- **Replay Certification** (phase-06) — Certifies replay guarantees
- **Architecture Fitness** (phase-08) — Validates dependency direction rules
- **Governance Readiness** (phase-11) — Assesses governance maturity
- **ADRs** (phase-12) — Records architectural decisions

These artifacts inform governance decisions and provide evidence that
governance rules are being followed.