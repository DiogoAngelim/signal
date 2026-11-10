# Case study: Workbench application integration

**Status:** Source implemented and CI-validated; production and business outcomes not validated  
**Application repository:** [DiogoAngelim/workbench](https://github.com/DiogoAngelim/workbench)  
**Implementation PR:** [Workbench PR #178](https://github.com/DiogoAngelim/workbench/pull/178)  
**Validated application source commit:** `626502bba2df757f5058749cd133b87a95ffaa2d`  
**Final PR-head validation:** [Verify Workbench run 42921568151](https://github.com/DiogoAngelim/workbench/actions/runs/42921568151)

## Purpose

The Reference Lab demonstrates Signal's own technical capabilities. Workbench adds a second, different form of evidence: a real application consumes a released Signal package inside an existing commercial decision workflow while preserving the application's domain ownership and economics.

This is an **application integration case study**, not a customer deployment, production validation, or business-outcome case study.

## Integration implemented

Workbench pins and consumes the released `@signal/decision@0.1.0` package through its public `@signal/decision/core` entry point.

The package artifact is versioned and integrity-pinned:

- Release: [signal-library-v0.1.0](https://github.com/DiogoAngelim/signal/releases/tag/signal-library-v0.1.0)
- Source commit: `65022f0afc137d32e1c7bdc1831a69657825ba22`
- Artifact SHA-256: `05d74042514751bbc9cbabbdfc63e106afa2c4dfb75596697b77986c8b5c1447`

During Workbench's existing authenticated assessment transaction, the application maps opportunity evidence and commercial assumptions into Signal's `assessDecisionEvidence` contract. Signal assesses evidence quality, assumption traceability, confidence discipline, governance, stewardship, and next-best evidence. Workbench persists the full assessment and package provenance, exposes an evidence-review summary in its workspace, and adds Signal governance blockers to the existing final-proceed gate.

## Domain ownership and safety

The integration preserves a strict responsibility split:

- **Workbench** remains authoritative for opportunities, evidence records, commercial assumptions, costs, expected value, break-even analysis, recommendations, decisions, approvals, audit history, and outcomes.
- **Signal** supplies the reusable decision-evidence assessment.
- The final commercial action remains under Workbench's existing owner-controlled workflow.

The adapter deliberately:
- keeps evidence direction neutral rather than inferring that verification means support or contradiction;
- links an AI research assumption only when its unchanged source URL exactly matches a saved evidence URL;
- removes original research attribution when an owner overrides the value or the value is derived from a recurring commercial model;
- records unverified evidence, missing inputs, and unconfirmed delivery feasibility as unknowns;
- normalizes URL identity to its origin and avoids exposing URL query parameters;
- performs no cross-product network request and introduces no new identity or service-token boundary.

## Verification evidence

The successful Workbench CI run validated:

| Check | Result |
|---|---|
| Pinned package install and SHA-256 integrity | Passed |
| Dependency audit | Passed |
| Fresh and legacy migration rehearsal | Passed |
| Test suite | **68 files, 663 tests passed** |
| TypeScript check | Passed |
| Next.js production build | Passed |
| Aggregate statement coverage | 92.60% |
| Aggregate branch coverage | 85.86% |
| Aggregate function coverage | 97.33% |
| Aggregate line coverage | 95.01% |

The integration-specific test suite contains nine tests covering package provenance, evidence mapping, neutral direction, source-origin identity normalization, exact-URL assumption links, unverified evidence, governance blockers, economics isolation, deterministic output, and 30 shared commercial scenarios.

The 30 scenarios exercise Signal and Workbench against the same commercial inputs and assert that Workbench's independent expected-net-value calculation remains unchanged. This demonstrates separation of responsibilities and regression protection; it does not demonstrate that Signal improves commercial decisions or outcomes.

The final PR-head CI run also passed after the documentation-only update: [Verify Workbench #42921568151](https://github.com/DiogoAngelim/workbench/actions/runs/42921568151) and [Quality contract #42921568127](https://github.com/DiogoAngelim/workbench/actions/runs/42921568127).

## Limitations and claims

The integration uses Signal package version 0.1.0. That release predates newer evidence-lineage and temporal-validity assessments present in the current Signal source tree. Workbench preserves source identity and verification timestamps in metadata, but this package version does not score those dimensions.

This implementation does not integrate Signal's SDK/runtime, durable event transport, replay infrastructure, or decision-memory runtime. It is an in-process decision-domain package integration.

The evidence is limited to source implementation, automated tests, type checking, migration rehearsal, and build validation. It does not establish:
- production deployment or production security posture;
- production latency, throughput, reliability, or SLOs;
- calibration of win probability;
- improvements in proposal conversion, revenue, margin, or delivery performance;
- validated results from real historical commercial outcomes.

No customer or business-performance claim should be made until a production deployment and appropriately authorized outcome dataset have been independently reviewed.

## Interpretation

Signal now has two distinct, complementary forms of reproducible technical evidence:

1. **Reference Lab:** Signal's own lifecycle and PostgreSQL-backed capabilities exercised in CI.
2. **Workbench:** a separate application consumes a released Signal decision package, persists its assessment, surfaces its output, and preserves the application's independent economics and approval boundary.

Together, these demonstrate package usability and application-level integration. They do not yet establish production readiness or improved business outcomes.
