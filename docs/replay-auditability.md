# Replay and Auditability

This document describes Signal's replay model, determinism expectations,
auditability guarantees, and how these properties serve decision processing
across domains.

## Why Replay Exists

Replay exists because consequential decisions must be verifiable after the
fact. When a decision produces an unexpected outcome, the ability to
reconstruct exactly what happened — what evidence was available, what was
assumed, what was unknown — is essential for:

- **Learning** — Understanding why a decision went wrong requires
  reconstructing the decision context, not just the outcome.
- **Accountability** — Auditors, regulators, and reviewers need to see the
  full reasoning trail, not just the result.
- **Debugging** — Production failures often depend on specific input
  combinations that are impossible to reproduce without stored evidence.
- **Compliance** — Many domains (finance, healthcare, security) require
  traceable decision records by regulation.
- **Trust** — Systems that can explain their decisions earn more trust than
  systems that cannot.

Replay is a design objective, not a blanket runtime guarantee. Signal currently supports
idempotent result replay when a durable adapter has stored the completed result,
and it provides evidence/journal and audit-chain primitives. It does not yet
persist a complete, versioned replay envelope for every execution or provide a
general-purpose deterministic re-execution engine. Deterministic reconstruction
requires operation/version identifiers, canonical inputs, policy/configuration
versions, handler artifact identity, and snapshots of all external reads. Runtime
metadata such as message identifiers, wall-clock timestamps, and durations may
legitimately differ.

## Versioned replay evidence records

Signal now provides an explicit replay-evidence contract and PostgreSQL
persistence for execution records. A record binds:
- operation name and version;
- handler artifact SHA-256 digest and policy version;
- canonical JSON input and its fingerprint;
- explicitly captured external-read snapshots, each with an observation time
  and content fingerprint;
- normalized result and its fingerprint;
- execution ID and capture timestamp.

Use createReplayEvidenceRecord from @signal/runtime to construct the record,
verifyReplayEvidenceRecord before trusting it, and ReplayEvidencePort to persist
it. The PostgreSQL implementation is createPostgresReplayEvidenceStore from
@signal/idempotency-postgres. Migration 0006_immutable_replay_evidence.sql
creates immutable persistence with row mutation/truncate guards, tenant-scoped
row-level security, and an insert-only application contract. Reads and writes
must supply the tenant identity; PostgreSQL enforces the transaction-local
signal.tenant_id setting for each adapter operation.

replayWithEvidence verifies the record, requires exact operation, handler
artifact, and policy identity, supplies captured external reads to the
deterministic computation, and rejects result divergence. This supports
reconstruction after process restart when the record and compatible handler
artifact are retained.

Capture is explicit: Signal cannot automatically observe arbitrary database
reads, network calls, environment variables, clock access, randomness, or
application globals. The application must record every decision-relevant
external read at its boundary. The supplied replay computation must be pure
and side-effect-free; the helper cannot prevent arbitrary I/O inside a callback.
External actions must be represented as separate commands and must never be
reissued by replay.

Replay snapshots may contain sensitive application data. Capture the minimum
fields required to reproduce the decision, redact credentials and bearer
tokens before persistence, encrypt storage and backups, retain database row-level security and tenant
scoping, and define retention/deletion requirements before enabling capture. A fingerprint does not anonymize the
underlying snapshot.

Exact handler artifact matching is intentionally conservative. A newer handler
or policy must not be substituted silently. Cross-version replay requires
retaining the original executable artifact or an independently validated
compatibility adapter. This repository does not yet certify historical
execution across arbitrary runtime upgrades.

## Replay Principles

### 1. Deterministic Evidence

Signal aims to reproduce normalized domain results when the operation
version, canonical input, policy, handler logic, and captured external
dependencies are unchanged. Execution metadata is not deterministic by
default. The guarantees are enforced by:

- **Idempotency keys** — When a mutation uses a configured idempotency store,
  a retry of the same logical request can return the previously recorded
  result instead of executing the handler again. Durable guarantees require a
  durable store and a defined key scope.
- **Schema-validated payloads** — Input validation and canonical
  serialization make supported equivalent payload representations produce
  equivalent fingerprints.
- **SHA-256 fingerprinting** — Payloads are fingerprinted before storage.
  Fingerprints allow comparison with previously recorded content; their
  assurance depends on protecting the trusted fingerprint or record.

### 2. Hash-Chained Audit Trail

Signal can represent audit records as a hash chain:

- Each audit entry includes the SHA-256 hash of the previous entry.
- Verification recomputes the chain and detects changes to linked records or
  their ordering relative to a trusted chain head or checkpoint.
- The chain can be checked from a retained checkpoint back through its
  recorded predecessors.

A hash chain alone does not make storage immutable. If an attacker can rewrite
all records and replace the only retained chain head, the rewritten chain may
still be internally consistent. A hash chain also does not prove who created
the source evidence, whether a claim is true, or when the evidence existed.
Stronger authenticity and tamper-resistance claims require protected
checkpoints, signatures, trusted timestamps, and access controls as
appropriate.

### 3. Journal Before Outcome

Decisions are journaled before outcomes are known. The journal captures:

- Evidence that was available at decision time
- Assumptions that were made
- Unknowns that were acknowledged
- Reasoning that led to the judgment
- Confidence level and cap sources

This prevents hindsight bias. When reviewing a decision after the outcome is
known, the journal shows what was believed at the time — not what should have
been believed with perfect knowledge.

### 4. Outcome Review Separation

Outcome, review, verification, and lesson are separate concepts:

- **Outcome** records what happened.
- **Review** explains why it happened and what should change.
- **Verification** checks whether a claim or target is valid.
- **Lesson** is reusable learning extracted from review.

This separation ensures that replay reconstructs the decision context
accurately, without conflating what happened with why it happened or what
should change.

## What Replay Guarantees

### Replay CAN:

- **Reconstruct the decision context** — What evidence was available, what
  was assumed, what was unknown, and what confidence was assigned.
- **Verify audit-chain consistency** — Confirm that records link correctly
  and match a trusted retained chain head or checkpoint. Without a trusted
  checkpoint, verification establishes internal consistency, not proof that
  the entire history was never rewritten.
- **Reproduce deterministic domain results** — When the operation version,
  canonical inputs, policy, handler logic, and captured external dependencies
  are the same. Execution metadata may differ.
- **Trace causation** — Follow correlation IDs, trace IDs, and causation IDs
  where the application/runtime has persisted them.
- **Identify idempotency conflicts** — Detect when a retried request changed
  its intent (different payload, same idempotency key).

### Replay CANNOT:

- **Reproduce external state** — If a handler reads from an external database
  or API, replay cannot reproduce that external state unless it was captured
  as evidence.
- **Guarantee identical side effects** — If a handler writes to an external
  system, replaying the operation may produce a different external result.
  Signal's replay is about evidence reconstruction, not side-effect
  reproduction.
- **Predict future outcomes** — Replay reconstructs the past; it does not
  forecast the future.

## Determinism Expectations

Signal expects handlers to be deterministic. Non-deterministic handlers
undermine replay. The following sources of non-determinism are identified and
mitigated:

| Source | Risk | Mitigation |
|--------|------|------------|
| `Date.now()` / `Math.random()` | Different timestamps/random values on replay | Capture time/randomness at the call boundary; store in evidence |
| External API calls | Different responses on replay | Capture external responses as evidence; treat as cached inputs |
| Database reads | Different state on replay | Capture read results as evidence; treat as cached inputs |
| Concurrent execution | Non-deterministic ordering | Serialize operations within a correlation scope |

Handlers that require non-deterministic inputs should capture those inputs as
evidence before using them. This ensures that replay can reconstruct the
decision with the same inputs that were available at decision time.

## Auditability

### Evidence Collection

Signal exposes evidence primitives. Whether an application records a complete
evidence set depends on its integration; the runtime does not automatically
capture arbitrary external reads or every handler dependency:

- **Input evidence** — The normalized payload, idempotency key, and
  authorization context.
- **Execution evidence** — The operation name, kind, timestamp, and handler
  result.
- **Audit evidence** — The hash-chained audit entry, including the previous
  hash and the current fingerprint.
- **Event evidence** — Emitted events, subscriber deliveries, and deduplication
  records.

### Stewardship Ledger

The stewardship ledger provides a traceability summary for any decision:

- **Traceability score** — How well the decision is connected to evidence,
  outcomes, and lessons.
- **Missing links** — Decisions without outcomes, outcomes without reviews,
  threats without evidence.
- **Warnings** — Threats or protections that lack supporting evidence.

Use `assessment.ledger` or `createStewardshipLedger(input)` when a product
needs to show which decisions, outcome reviews, lessons, evidence, threats,
and protections support a recommendation.

### Redacted Audit

Audit evidence is redacted for cross-tenant access. A tenant can only see
audit entries for their own operations. This is enforced at the storage layer,
not at the audit layer — the audit chain is complete, but access is filtered.

## Trace Reconstruction

When investigating a decision, the following reconstruction path is available:

1. **Start with the decision ID** — Every decision has a unique identifier.
2. **Retrieve the journal** — The journal shows what was known, assumed, and
   unknown at decision time.
3. **Follow the audit chain** — The hash chain proves the decision was not
   tampered with.
4. **Check the outcome review** — If an outcome review exists, it shows what
   happened and what should change.
5. **Check the lesson** — If a lesson was extracted, it shows what was learned.
6. **Check the memory** — If the lesson survived review, it may be in
   decision memory, influencing future decisions.

This reconstruction path is a target workflow. It is complete only when the
application has persisted all required evidence and has an independently trusted
audit checkpoint. Domain-specific validation and regulatory review remain
necessary.

## Historical Decision Analysis

Signal's decision memory enables historical analysis:

- **Pattern detection** — Repeated lessons, surviving assumptions, and
  recurring contradictions can be identified across decisions.
- **Calibration checking** — Confidence levels can be compared against actual
  outcomes to assess whether the system is well-calibrated.
- **Assumption tracking** — Assumptions that repeatedly fail can be flagged
  for review.
- **Evidence quality trends** — Evidence quality scores can be tracked over
  time to identify degradation.

## Failure Investigation

When a decision produces a failure:

1. **Replay the decision** — Reconstruct the full context from stored evidence.
2. **Check the journal** — Was the failure foreseeable? Were the right
   unknowns acknowledged?
3. **Check the assumptions** — Did any assumptions fail? Were they flagged as
   risky?
4. **Check the evidence** — Was the evidence quality sufficient? Was any
   evidence missing or misleading?
5. **Check the confidence** — Was the confidence level appropriate given the
   evidence quality?
6. **Extract a lesson** — What should change next time?

This investigation process is domain-agnostic. The same steps apply whether
the failure is a bad trade, a misdiagnosis, a missed security alert, or an
incorrect recommendation.

## Post-Trade Layer

The `signal-cli` package provides the post-trade layer for read-only audit,
verification, and replay. It must not import from any upstream layer (Signal,
Domain, or Execution). It operates on published audit evidence and contract
artifacts only.

Post-trade tools include:

- **Audit** — Read and verify audit chains
- **Verify** — Check hash chain integrity
- **Replay** — Reconstruct decisions from stored evidence
- **Build** — Compile and package audit artifacts
- **Test** — Run audit conformance tests