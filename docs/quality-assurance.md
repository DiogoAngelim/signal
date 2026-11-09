# Signal Quality and Assurance Standard

This document defines the assurance model for Signal itself. It complements the
Signal Constitution, protocol RFCs, dependency rules, and replay/auditability
specification. It does not define requirements for applications that consume
Signal.

## 1. Assurance vocabulary

Signal documentation and release reports must distinguish:

- **Specified** — a behavior or guarantee has a written, testable contract.
- **Implemented** — production code implements that contract.
- **Tested** — automated tests exercise the behavior.
- **Validated** — results have been checked against an independent oracle,
  fixture, or reproducible external procedure.
- **Operationally observed** — the behavior has been observed in a running
  environment under stated conditions.

One level must never be presented as proof of a stronger level. In particular,
a passing unit test does not prove production operation, and package
installation does not prove semantic correctness.

## 2. Core invariants

The following invariants apply across Signal packages:

1. Every public operation has an explicit, versioned contract.
2. Published operation semantics are immutable; semantic changes require a
   new version.
3. Every state-changing operation has an explicit idempotency policy.
4. Authorization and policy checks occur before protected handler execution
   and before reserving durable execution state.
5. An event represents a fact that has already happened.
6. Replaying a request must not silently repeat an external side effect.
7. Historical assessments retain the evidence and policy versions that
   produced them.
8. Unknown, assumed, contradicted, and missing information remain distinct.
9. A conclusion must not claim stronger support than its traceable evidence.
10. Repeated copies of one source are not independent corroboration.
11. A numerical score is not a probability unless its probabilistic meaning
    and calibration have been established.
12. Cryptographic hashes establish content fingerprints; they do not establish
    source truth or authenticity by themselves.

These invariants should be expressed as executable tests wherever practical,
including property-based, metamorphic, adversarial, and regression tests.

## 3. Determinism contract

Signal must distinguish deterministic domain results from operational metadata.

### Deterministic behavior

For a fixed operation version, canonical input, policy version, and explicit
deterministic dependencies, Signal's normalized domain result must be stable.
Canonicalization must be documented and versioned because changing it can
change fingerprints and idempotency behavior.

### Operational metadata

Message identifiers, wall-clock timestamps, durations, delivery attempts,
and externally observed state are not inherently deterministic. They must be
captured as explicit execution metadata and must not be confused with the
deterministic domain result.

A replay guarantee must state which of the following it provides:

- reconstruction of the recorded input and evidence;
- verification of recorded hashes and links;
- reproduction of a deterministic domain result;
- re-delivery of an event;
- execution of an external side effect.

These are different guarantees. Signal must not imply that replaying an
operation can safely repeat an external side effect.

## 4. Canonical serialization and fingerprints

Fingerprint inputs must be represented using a documented canonical JSON
subset. The runtime serializer:

- sorts object keys by code-unit order;
- preserves array order;
- omits undefined object properties;
- represents undefined array entries and sparse slots as null;
- serializes valid Date values as ISO-8601 strings;
- rejects non-finite numbers, unsupported JavaScript values, invalid dates,
  accessors, non-plain objects, symbol-keyed enumerable properties, and
  circular references.

Callers should pass plain, schema-validated data. A fingerprint is only
meaningful when every participant uses the same canonicalization contract.

Changing canonicalization is a compatibility-sensitive change. It requires
regression fixtures and an explicit migration assessment before release.

## 5. Evidence, lineage, and time

Evidence quality is multidimensional. Source reliability, integrity,
relevance, freshness, independence, replication, traceability, and coverage
must not be collapsed into an unexplained universal score.

Evidence relationships should preserve source lineage. Multiple documents
derived from one original source must not be counted as independent
corroboration. Circular support and copied claims must be detectable or
explicitly marked as unresolved.

Temporal records should distinguish, where applicable:

- event time: when the described event occurred;
- observation time: when the evidence was observed;
- recording time: when Signal received or persisted it;
- verification time: when the claim was checked;
- validity interval: when the evidence is applicable.

Authenticity, integrity, freshness, and truth are separate properties.


### Evidence lineage and source independence

Decision evidence may declare a `sourceRef.sourceId` and
`derivedFromEvidenceIds`. Signal traces derived evidence back to root source
identities, reports missing references and cycles, and identifies evidence
items sharing the same root source. Copies and derivative reports therefore
do not increase the independent root-source count.

The reported `sourceDiversityScore` is a bounded descriptive ratio, not a
probability or a claim that the source is truthful. When lineage metadata is
provided, it conservatively caps the declared independence score. Without
source identity or dependency metadata, independence remains unverified.

### Temporal validity and freshness

Evidence may distinguish `eventAt`, `observedAt`, `recordedAt`,
`verifiedAt`, `validFrom`, and `validUntil`. Temporal assessment uses the
assessment's explicit `createdAt` as its `asOf` reference, making the result
reproducible. It classifies evidence as current, expired, not yet valid,
unknown-validity, stale relative to a declared source freshness window, or
invalid due to malformed/inconsistent temporal metadata.

Unknown validity is not silently treated as current. Staleness and validity
are separate dimensions: evidence can be within its validity interval but
older than the source's freshness window. Expired, not-yet-valid, stale, and
invalid evidence conservatively cap the aggregate freshness score by the
proportion of unaffected evidence; this is a transparent heuristic, not a
probability.

## 6. Statistical claims

Any published confidence probability requires:

1. a precise definition of the event being assigned probability;
2. an independently labeled evaluation dataset;
3. a documented sampling and split methodology;
4. calibration and discrimination metrics appropriate to the task;
5. sample-size and uncertainty reporting;
6. subgroup and drift analysis where relevant;
7. versioned evaluation results.

A heuristic score must be named and documented as a score, not presented as a
probability. Accuracy alone is insufficient when abstention, class imbalance,
or asymmetric error costs matter.


### Calibration evaluation

The `@signal/agency` calibration evaluator reports Brier score, expected
calibration error (ECE), maximum calibration error, signed calibration bias,
and confidence-bucket reliability data. The default evaluation minimum is 100
completed labeled outcomes and at least 10 samples in each populated bucket;
below either threshold, the status remains `insufficient_data`, even though
descriptive metrics may be calculated.

Calibration reports approximate 95% confidence intervals for the mean Brier
loss and signed calibration bias when at least 30 completed observations are
available. Bucket-level observed outcome rates use Wilson score intervals;
the corresponding calibration-error interval subtracts the Wilson bounds
from the bucket's mean confidence. Directional bias is marked positive or
negative only when its approximate interval excludes zero; otherwise it is
reported as not significant or insufficient. The normal-approximation
intervals assume independent observations and can be misleading for clustered,
weighted, or temporally dependent samples. Bucket intervals are not adjusted
for multiple comparisons. These intervals do not establish that the evaluation
sample is representative: callers must document sampling, selection,
labeling, and population coverage, and must not infer absence of sampling bias
from a narrow interval.

The legacy `calibrationError` field is signed cohort-level confidence bias,
not ECE. `calibratedConfidence` is a cohort-level adjustment, not a
per-prediction calibrated probability. Neither should be presented as a
validated probability mapping. Empirical calibration claims still require
representative, independently labeled data and ongoing drift evaluation.

The `evaluateCalibrationDrift` API compares chronological, equally sized
windows of completed outcomes. It reports the change in ECE between the first
and last window, excludes records with invalid timestamps, and returns
`insufficient_data` until every window meets its configured sample floor.
This is a descriptive monitoring signal only: it does not establish
statistical significance, causation, or subgroup fairness. Cohorts should be
segmented by domain and decision class by the caller before interpreting
drift; aggregate metrics can conceal subgroup degradation.

## 7. Uncertainty and decision robustness

Decision assessment already distinguishes unknowns, assumptions,
contradictions, evidence coverage, and confidence caps. Prediction scenarios
carry explicit uncertainty, and simulation applies a bounded heuristic
uncertainty penalty to action scores while comparing expected, worst-case,
best-case, survival, and regret scores across action variants. These are
complementary safeguards, not a formal probability distribution over all
possible outcomes or a variance decomposition.

The current simulation is a deterministic scenario comparison using
documented heuristic weights. Its output is not a statistical confidence
interval, a Monte Carlo estimate, or proof that a recommendation is robust to
small changes in assumptions. A decision is not robust merely because one
scenario produces a favorable score. Before describing a recommendation as
robust, the caller must stress-test plausible ranges for material inputs and
report whether the selected action changes. When perturbation bounds or
scenario probabilities are unsupported, Signal must preserve that uncertainty
rather than manufacture precision.

Simulation inputs are validated before scoring: scenario probabilities must be
finite, bounded, and have a positive total; scenario score dimensions and
current exposure must be within 0–100; scenario count is capped at 1,000 and
action variants at 100. These bounds limit accidental or hostile resource
amplification. They do not replace request-size limits at the transport layer.
Scenario probabilities are caller-supplied weights and are normalized for
comparison; they are not made empirically valid by normalization.

The `evaluateDecisionRobustness` API adds a deterministic one-factor
sensitivity screen. It perturbs seven scenario dimensions (reward, risk,
downside, uncertainty, purpose alignment, need alignment, and confidence) up
and down by a configured number of points, reruns the same path comparison,
and reports the fraction of perturbations that preserve both the selected action variant and recommendation.
The default perturbation is five points and the default stability threshold is
80%. This is a bounded diagnostic, not an exhaustive multivariate search; it
does not test interactions between factors or changes outside the specified
range. Its status must be reported as `robust` only relative to the tested
perturbations and threshold.

## 8. Reproducibility and operational reliability

Decision records can retain the decision-time reality snapshot, assessment,
scenario set, simulation result, coherence assessment, timestamps, and
version metadata. Replay comparison can identify changes in action permission,
scale, score, and status. Canonical serialization and fingerprints support
stable identity and integrity checks when every participant uses the same
versioned contract.

Replay comparison is not, by itself, a complete deterministic re-execution of
every historical dependency. The in-memory decision record store is
process-local and is not a durable production store. Durable retention,
transactional consistency, backup/restore, access control, and operational
telemetry must be validated against the concrete storage and runtime adapter.
Signal's package CI verifies builds, tests, architecture, package entrypoints,
and consumer installation; it does not establish production latency,
availability, recovery objectives, or resource limits. Those operational
claims require environment-specific integration and load tests.



## 9. Cryptographic assurance boundaries

A SHA-256 fingerprint can show whether bytes match a previously recorded
fingerprint. A hash chain can make changes to linked records detectable when
a trusted chain head or checkpoint is retained independently.

A hash chain alone does not prove:

- who created the evidence;
- whether the source was truthful;
- when the evidence actually existed;
- that an attacker with write access could not rewrite the entire chain;
- that an external side effect occurred.

Claims of authenticity, non-repudiation, or tamper resistance require the
appropriate signatures, protected keys, trusted timestamps, access controls,
or independently retained checkpoints. Documentation must state which
mechanisms are actually implemented.

## 10. Security, privacy, and adversarial assurance

The security test suite must include malformed and oversized inputs,
authorization bypass attempts, tenant-boundary tests, replay attacks,
idempotency collisions, forged metadata, duplicate-source inflation,
contradictory evidence, prompt-injection content in untrusted evidence, and
resource-exhaustion cases.

Logs and diagnostics must not expose secrets or unnecessary evidence content.
Retention, deletion, redaction, and audit requirements must be reconciled
explicitly; immutable audit metadata does not automatically justify retaining
sensitive source material indefinitely.

## 11. Required validation layers

A release candidate should pass all applicable layers:

1. Unit tests for pure functions and state transitions.
2. Contract tests for public schemas, operation versions, and errors.
3. Property-based tests for invariants and edge cases.
4. Metamorphic tests for ordering, irrelevant inputs, and uncertainty behavior.
5. Adversarial tests for untrusted inputs and abuse cases.
6. Golden-fixture regression tests with independently reviewed expected results.
7. Integration tests for storage, transactions, event delivery, and authorization.
8. Isolated package-consumer tests for every declared module format.
9. Reproducible build and artifact-integrity checks.
10. Operational proof for guarantees that depend on real infrastructure.

A skipped or unavailable layer must be reported as unvalidated, not passed.

## 12. Release report

Each release report must include:

- source commit and package versions;
- exact commands and environment versions;
- tests executed and their results;
- evaluation dataset version and metrics;
- security scan results and unresolved findings;
- supported runtime and module matrix;
- artifact hashes and package contents;
- known limitations and deferred risks;
- explicit distinction between tested, validated, and operationally observed
  guarantees.

## 13. Change discipline

Before introducing a new abstraction, dependency, package, schema, or metric:

1. identify the concrete defect or unmet guarantee;
2. show why existing Signal contracts cannot address it;
3. define observable acceptance criteria;
4. assess compatibility and migration consequences;
5. add tests before or alongside implementation;
6. update the relevant RFC or governance document;
7. remove obsolete behavior rather than preserving accidental complexity.

The Signal Constitution remains authoritative. If this document and the
Constitution or a published RFC conflict, resolve the governance conflict
before implementation.
