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

Replay is not a debugging convenience. It is an architectural property that
emerges from Signal's design: every operation produces deterministic evidence,
every decision carries a journal, and every audit trail is hash-chained.

## Replay Principles

### 1. Deterministic Evidence

Every operation in Signal produces deterministic evidence. Given the same
inputs, the same audit trail is produced. This is enforced by:

- **Idempotency keys** — Mutations are identified by logical request, not by
  execution attempt. Retrying the same logical request produces the same
  result.
- **Schema-validated payloads** — Input normalization ensures that equivalent
  payloads produce equivalent evidence, regardless of key ordering or
  formatting differences.
- **SHA-256 fingerprinting** — Payloads are fingerprinted with SHA-256 before
  storage. The fingerprint is part of the audit trail, ensuring that payload
  tampering is detectable.

### 2. Hash-Chained Audit Trail

Signal's audit trail is an append-only hash chain:

- Each audit entry includes the SHA-256 hash of the previous entry.
- The chain is immutable once written.
- Tampering with any entry breaks the chain.
- The chain can be verified from any point to the genesis entry.

This provides cryptographic proof that the audit trail has not been modified
since it was written.

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
- **Verify the audit chain** — Confirm that the hash chain is intact and no
  entries have been tampered with.
- **Reproduce the execution path** — Given the same inputs and the same
  handler logic, produce the same result.
- **Trace causation** — Follow correlation IDs, trace IDs, and causation IDs
  across nested operations.
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

Every operation in Signal collects evidence:

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

This reconstruction path works for any domain — trading, healthcare,
cybersecurity, education, or any other domain that uses Signal's
decision-processing model.

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