# Signal Engineering and Architecture Score

This standard defines a repeatable, evidence-based score for the engineering
quality of Signal itself. It evaluates the platform as software infrastructure;
it does not score whether a consuming application makes better real-world
decisions.

The score is intended for architecture reviews, release assessments, regression
tracking, and prioritization. It is not a marketing grade or a substitute for
security review, production certification, or domain-specific validation.

## 1. Evaluation principles

1. **Evidence over assertion.** A documented guarantee is not proof that the
   guarantee is implemented or holds under failure.
2. **Behavior over feature count.** More abstractions and capabilities do not
   earn points by existing.
3. **Failure paths matter.** Correctness includes retries, concurrency,
   cancellation, partial failure, restart, recovery, and degraded dependencies.
4. **Measure cost as well as capability.** Latency, throughput, memory, CPU,
   database work, network traffic, operational burden, and adoption effort
   matter.
5. **Do not hide critical weaknesses in an average.** Mandatory gates and
   dimension caps apply even when the weighted score is high.
6. **Separate fact from confidence.** Every score has evidence references,
   validation status, confidence, and known limitations.
7. **Compare like with like.** Assessments record commit, scope, environment,
   workload, tool versions, and rubric version.
8. **Reward simplicity.** An abstraction earns credit when it reduces coupling,
   risk, duplication, or cognitive load—not merely because it is reusable.

## 2. Score dimensions and weights

The overall score has nine dimensions. Subdimension weights are percentages
within each dimension; dimension weights sum to 100%.

| Dimension | Weight | Scope |
|---|---:|---|
| Functional correctness and effectiveness | 18% | Contract correctness, invariants, deterministic behavior, safe execution |
| Reliability and resilience | 16% | Fault tolerance, retries, concurrency, recovery, graceful degradation |
| Performance and resource efficiency | 12% | Latency, throughput, CPU, memory, I/O, scaling, cost |
| Architecture and design quality | 14% | Boundaries, cohesion, coupling, extensibility, consistency, simplicity |
| Security, privacy, and integrity | 12% | Threat controls, authorization, isolation, secrets, data and audit integrity |
| Maintainability and evolvability | 10% | Change safety, code health, compatibility, dependency and migration management |
| Testing and verification | 8% | Test depth, determinism, adversarial coverage, independent validation |
| Developer experience and adoption | 6% | Installation, documentation, APIs, diagnostics, integration effort |
| Operability and delivery | 4% | Observability, deployment, SLOs, runbooks, release and rollback discipline |

### 2.1 Subdimensions

#### A. Functional correctness and effectiveness — 18%

| Subdimension | Weight |
|---|---:|
| Contract precision, schema validation, and version semantics | 15% |
| Invariant enforcement and state-transition correctness | 20% |
| Determinism, canonicalization, and reproducibility | 15% |
| Idempotency, replay semantics, and side-effect safety | 20% |
| Authorization and policy ordering in execution paths | 10% |
| Error semantics, edge cases, and input boundary handling | 10% |
| End-to-end usefulness of the core platform capabilities | 10% |

Effectiveness here means that implemented engineering capabilities accomplish
their specified technical purpose. It does not mean that a customer or
application achieved a better external outcome.

#### B. Reliability and resilience — 16%

| Subdimension | Weight |
|---|---:|
| Failure isolation and fault containment | 15% |
| Retry policy, budgets, deadlines, and cancellation | 15% |
| Concurrency control, leases, fencing, and race safety | 20% |
| Persistence durability and consistency under failure | 15% |
| Recovery after process, broker, database, or network failure | 20% |
| Backpressure, bounded work, and graceful degradation | 10% |
| Redundancy and failover behavior where applicable | 5% |

#### C. Performance and resource efficiency — 12%

| Subdimension | Weight |
|---|---:|
| Latency: median and tail percentiles under defined workloads | 20% |
| Throughput and saturation behavior | 15% |
| CPU and memory efficiency, including leak behavior | 15% |
| Database query efficiency, contention, and connection use | 15% |
| Network and serialization overhead | 10% |
| Scaling behavior as data, concurrency, and replicas increase | 15% |
| Cost efficiency per operation or workload unit | 10% |

Performance scores require reproducible benchmarks. Without a defined workload
and measured baseline, mark the relevant subdimension **Not measured** rather
than assigning a speculative high score.

#### D. Architecture and design quality — 14%

| Subdimension | Weight |
|---|---:|
| Dependency direction and boundary enforcement | 15% |
| Cohesion, coupling, and separation of concerns | 15% |
| Protocol and API design; compatibility discipline | 15% |
| Modularity and composability without needless abstraction | 10% |
| Domain and transport independence where promised | 10% |
| Consistency of patterns and ownership | 10% |
| Complexity, conceptual load, and minimality | 15% |
| Extensibility and replaceability of infrastructure adapters | 10% |

#### E. Security, privacy, and integrity — 12%

| Subdimension | Weight |
|---|---:|
| Threat modeling and secure defaults | 10% |
| Authentication, authorization, and least privilege | 15% |
| Tenant and data isolation | 15% |
| Input validation, injection resistance, and abuse limits | 10% |
| Secret handling, redaction, and privacy boundaries | 10% |
| Cryptographic integrity, key lifecycle, and trust anchoring | 15% |
| Supply-chain and dependency security | 10% |
| Auditability, tamper detection, and retention controls | 15% |

A hash chain alone does not prove authenticity or immutability. Security claims
must identify the trusted keys, storage permissions, and external trust
boundaries on which they depend.

#### F. Maintainability and evolvability — 10%

| Subdimension | Weight |
|---|---:|
| Readability, local reasoning, and code organization | 15% |
| Change isolation and regression risk | 15% |
| Type safety and static analysis | 10% |
| Duplication, dead code, and obsolete compatibility surfaces | 10% |
| Dependency hygiene and upgrade strategy | 10% |
| Schema, data, and protocol migration safety | 15% |
| Refactoring cost and ease of extension | 15% |
| Ownership clarity and architectural decision records | 10% |

#### G. Testing and verification — 8%

| Subdimension | Weight |
|---|---:|
| Unit and component coverage of meaningful behavior | 10% |
| Integration tests against real supported dependencies | 15% |
| Contract and conformance tests | 15% |
| Property-based, metamorphic, and invariant testing | 15% |
| Adversarial, fault-injection, and chaos testing | 15% |
| Race, restart, crash-boundary, and recovery testing | 15% |
| Reproducibility, flake control, and independent oracles | 10% |
| Regression prevention and CI enforcement | 5% |

Line coverage is supporting information only. It is not a substitute for
behavioral coverage, meaningful assertions, or independent oracles.

#### H. Developer experience and adoption — 6%

| Subdimension | Weight |
|---|---:|
| Install, build, and first successful proof | 20% |
| API discoverability and conceptual clarity | 20% |
| Documentation accuracy and task-oriented completeness | 15% |
| Error messages, diagnostics, and debugging experience | 15% |
| Examples and reference implementations | 15% |
| Integration effort and cognitive load | 15% |

The adoption test should be measured with a clean environment and a developer
who did not author the feature. Record elapsed time, blockers, and assistance
required.

#### I. Operability and delivery — 4%

| Subdimension | Weight |
|---|---:|
| Metrics, logs, traces, and diagnostic usefulness | 20% |
| SLOs, alerting, dashboards, and incident ownership | 20% |
| Deployment, configuration, and environment safety | 15% |
| Backup, restore, disaster recovery, and runbooks | 20% |
| Release gates, artifact provenance, rollback, and change control | 15% |
| Capacity planning and operational cost visibility | 10% |

## 3. Rating scale

Score every applicable subdimension from 0 to 5. Convert to a 0–10 scale by
multiplying by two.

| Rating | Meaning | Evidence standard |
|---:|---|---|
| 0 | Absent or fundamentally broken | No implementation, or known failure of the required behavior |
| 1 | Ad hoc | Partial implementation; major gaps; mostly manual or unverified |
| 2 | Basic | Happy path works; important edge cases or failure modes remain |
| 3 | Defined and tested | Clear contract, implementation, and repeatable tests for normal and important edge cases |
| 4 | Strong | Adversarial and failure-path evidence; robust integration; measurable quality; controlled limitations |
| 5 | Exceptional | Independently reproducible, benchmarked where relevant, sustained under representative stress, operationally evidenced, and continuously governed |

A 5 is deliberately difficult to earn. A passing CI run alone cannot justify a
4 or 5. Scores should use whole or half points; apparent precision beyond that
is misleading.

## 4. Evidence and maturity labels

Every subdimension must include one or more evidence records. Classify each
claim at its strongest demonstrated level:

| Level | Label | Meaning |
|---|---|---|
| E0 | Unspecified | No explicit contract or requirement |
| E1 | Specified | Written, testable requirement or guarantee |
| E2 | Implemented | Production code implements the behavior |
| E3 | Tested | Automated tests exercise the behavior |
| E4 | Independently validated | Checked against an independent oracle, fixture, reproducible procedure, or external system |
| E5 | Operationally observed | Observed in a running environment under documented conditions |

These levels are ordered, but evidence is claim-specific. An E5 result for one
path does not upgrade a different path. A test double does not count as a real
broker, database, or external service. A simulation does not count as
production operation.

Each evidence record should include:

- claim and subdimension;
- source path, test name, workflow run, benchmark, or artifact link;
- commit SHA and date;
- environment and dependency versions;
- test or workload conditions;
- result and failure details;
- evidence level E0–E5;
- limitations and known untested cases.

### 4.1 Confidence

Assign confidence separately from the score:

- **High:** direct, repeatable evidence covers the important cases.
- **Medium:** evidence exists but coverage, independence, or representativeness is limited.
- **Low:** primarily source inference, documentation, or narrow tests.

Confidence is not a probability. It describes the strength and completeness of
the assessment evidence.

## 5. Calculation

For each subdimension, calculate its 0–10 score. Within each dimension,
calculate the weighted mean of applicable subdimensions. Then calculate the
weighted mean of the nine dimension scores.

```text
dimension_score =
  sum(subdimension_score * subdimension_weight)
  / sum(applicable_subdimension_weights)

raw_overall =
  sum(dimension_score * dimension_weight) / 100
```

Dimension weights are percentages. If a subdimension is genuinely not
applicable, record the rationale and exclude its weight from that dimension's
denominator. Do not use N/A to mean unknown, untested, or inconvenient.
Unknown and unmeasured items remain visible and reduce evidence confidence.

Do not silently redistribute an entire dimension's weight when the dimension
itself is unmeasured. Report the overall score as **provisional** if a major
dimension cannot be assessed.

Report one decimal place, alongside the dimension profile. Never report the
overall number alone.

## 6. Non-compensatory gates and score caps

The weighted mean must not conceal critical defects. Apply the lowest
applicable cap after calculating the raw score.

| Condition | Maximum overall score |
|---|---:|
| Known critical correctness defect in a core execution path | 4.9 |
| Known critical security or tenant-isolation vulnerability | 4.9 |
| Data corruption or unsafe duplicate side effects in a supported core path | 4.9 |
| Required durability or recovery guarantee is contradicted by implementation | 5.9 |
| Core contracts or dependency boundaries are materially unenforced | 6.9 |
| No repeatable automated verification for core behavior | 6.9 |
| Performance is a core stated requirement but has no reproducible measurement | No performance excellence claim; mark score provisional |

Also apply a dimension cap where appropriate:
- a critical unresolved issue caps the affected dimension at 3.0/10;
- a material untested guarantee caps the affected subdimension at 5.0/10;
- documentation alone cannot score implementation, test, or operational
  evidence.

A cap requires a written finding and a link to the evidence. Do not apply
subjective penalties without a reproducible rationale.

## 7. Mandatory engineering metrics

Use these metrics when relevant. Record the workload and environment alongside
every measurement.

### Correctness
- Contract/conformance pass rate.
- Invariant violation count.
- Idempotency conflict and duplicate-side-effect results.
- Replay equivalence rate for deterministic domain results.
- Authorization-before-handler verification.
- Schema and protocol compatibility results.

### HTTP abuse resistance
- Requests admitted and rejected at the configured per-route threshold.
- False-admission and false-rejection counts across a defined request burst.
- p50/p95/p99 latency for admitted and rejected requests.
- Rate-limit state cardinality and memory overhead under high-cardinality client keys.
- Correctness of retry-after and rate-limit response headers.
- Shared-store consistency and failover behavior when a distributed store is configured.

### In-memory circuit-breaker permit safety
- Stale closed-state permits are rejected after the breaker generation changes.
- Only the current half-open probe permit can close or reopen the breaker.
- Probe lease renewal, expiry, and late-completion fencing are verified.
- Closed-state permit acquisition and outcome p50/p95/p99 and throughput are measured across concurrency levels.
- Sampled peak heap/RSS and CPU are recorded under the same workload.

### Distributed circuit-breaker coordination
- Half-open probe grants per eligible cooldown cycle; the required invariant is exactly one.
- Stale probe-token completion rejection after lease expiry and takeover.
- Probe lease renewal success and expired-lease reclamation.
- p50/p95/p99 acquisition latency and probe-cycle throughput across concurrent adapter instances.
- Database contention, lock waits, pool saturation, and resource use under representative concurrency.
- Coordination-store failure behavior: protected operations must not proceed when permit acquisition cannot be established.

### Reliability
- Successful completion rate under defined fault profiles.
- Recovery time and recovery point where persistence is involved.
- Duplicate, lost, and reordered event counts.
- Lease-expiry and stale-owner rejection results.
- Retry amplification and exhausted retry budgets.
- Queue age, delivery lag, dead-letter rate, and backlog recovery time.

### Performance and efficiency
- p50, p95, and p99 latency; report warm/cold and success/error paths separately.
- Throughput at stated concurrency and saturation point.
- CPU time, peak and steady-state memory, allocation rate, and leak trend.
- Database queries, lock waits, connection use, and transaction duration.
- Bytes serialized/transferred and payload-size sensitivity.
- Cost per 1,000 operations or another explicitly defined unit.
- Efficiency ratio: useful successful operations per unit of resource consumed.

### Architecture and maintainability
- Enforced dependency violations.
- Cyclic dependency count.
- Public API surface and compatibility breaks.
- Change impact: modules/files affected by representative changes.
- Duplicate implementations and abstractions without demonstrated reuse.
- Clean-install and clean-build success.

### Security and integrity
- Critical/high findings and remediation age.
- Tenant-isolation and authorization test results.
- Secret leakage/redaction test results.
- Dependency vulnerability and provenance status.
- Audit tamper, key rotation, restore, and checkpoint substitution tests.

### Assurance and operations
- Test flake rate and repeatability.
- Escaped defect rate and regression recurrence.
- CI duration and failure diagnosis time.
- Alert coverage for defined failure modes.
- Restore drill success and time.
- Release rollback success.

Do not create arbitrary universal thresholds. Establish budgets from Signal's
actual service requirements, then version them and enforce them in CI or
release gates.

## 8. Benchmark protocol

A performance score requires a benchmark report containing:

1. Commit SHA, build mode, runtime, operating system, hardware, and dependency
   versions.
2. Workload mix, payload sizes, concurrency, duration, warm-up, and data volume.
3. Baseline and candidate measured under the same conditions.
4. At least three independent runs for ordinary comparisons; more where
   variance is high.
5. p50/p95/p99 latency, throughput, errors, CPU, memory, and relevant I/O.
6. Raw results, scripts, and analysis.
7. Variance and confidence intervals where the sample supports them.
8. Explicit limitations and known confounders.

Use sustained, burst, and saturation tests. Include realistic database and
network behavior for claims about those dependencies. Avoid comparing results
from different environments as if they were controlled experiments.

## 9. Assessment report format

Every formal Signal assessment should publish:

- rubric version and assessment date;
- repository, commit SHA, and evaluated scope;
- environment and validation profile;
- overall score, raw score, and any applied cap;
- all nine dimension scores and their subdimension breakdowns;
- evidence level and confidence for every material finding;
- observed vs. implemented vs. tested vs. independently validated vs.
  operationally observed distinctions;
- unmeasured and not-applicable items with reasons;
- critical findings and release blockers;
- top improvements ranked by expected risk reduction or quality gain per unit
  of engineering effort;
- comparison with the previous assessment, including score changes caused by
  rubric changes rather than code changes.

Recommended status labels:

- **Insufficient evidence:** scope or evidence is too incomplete for a
  defensible score.
- **Foundational:** core concepts exist; important guarantees are incomplete.
- **Developing:** core behavior is implemented and tested; significant
  assurance or operational gaps remain.
- **Strong:** broad correctness, resilience, architecture, and verification
  evidence; remaining risks are bounded.
- **Exceptional:** independently validated, benchmarked, operationally
  observed, and continuously governed across supported critical paths.

These labels are descriptive, not certification levels.

## 10. Scope boundaries for Signal

Include engineering qualities intrinsic to Signal:

- protocol, contracts, runtime, adapters, domain packages, persistence,
  idempotency, event delivery, replay, audit, decision primitives, learning
  primitives, security, and operational tooling;
- package architecture, dependency graph, API compatibility, build/release
  systems, tests, documentation, and developer adoption;
- performance, resource use, resilience, and operational behavior.

Exclude from this score:

- whether a consuming application makes better decisions;
- investment returns, clinical outcomes, educational outcomes, or other
  application-domain success metrics;
- commercial traction, revenue, product-market fit, and user satisfaction
  except where measuring the technical developer adoption experience;
- claims of production readiness that have not been operationally evidenced.

A separate application evaluation may measure real-world decision
effectiveness. It must not be folded into this engineering score.

## 11. Governance and cadence

- Keep this rubric versioned. Changes to dimensions, weights, gates, or scale
  require a documented rationale and a new rubric version.
- Reassess after major architectural changes and before significant releases.
- Run a lightweight regression score on each major release; perform a full
  evidence review periodically and after material incidents.
- Preserve previous reports so score trends remain auditable.
- When the rubric changes, if practical, rescore the prior baseline using the
  new version to separate actual engineering progress from scoring-method
  changes.
- Assign an owner and due date to every critical finding.
- Never improve a score by weakening tests, deleting a requirement, changing a
  benchmark workload, or reclassifying an untested item as N/A.

The goal is not to maximize a number. It is to make Signal's engineering
strengths, limitations, and next highest-value improvements objectively
visible.
