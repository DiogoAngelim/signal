# Case study: Workbench application integration

**Status:** Integrated application deployed to production; source, automated regression coverage, typechecking, and production build validated. Authenticated end-to-end workflow and business outcomes remain unverified.  
**Application repository:** [DiogoAngelim/workbench](https://github.com/DiogoAngelim/workbench)  
**Signal package:** [`@signal/decision@0.1.0`](https://github.com/DiogoAngelim/signal/releases/tag/signal-library-v0.1.0)  
**Original package-integration change:** [Workbench PR #178](https://github.com/DiogoAngelim/workbench/pull/178)  
**Economic-indicator integration change:** [Workbench commit 0074950](https://github.com/DiogoAngelim/workbench/commit/0074950549b9a3948812cb7f8fc473afed3e2659)  
**Evidence/provenance integration change:** [Workbench commit 4c8fdc5](https://github.com/DiogoAngelim/workbench/commit/4c8fdc5b5091f0008d1311b9bc0be8c07ae23146)  
**Latest deployed application commit:** `0074950549b9a3948812cb7f8fc473afed3e2659`  
**Production application:** [workbench.naubly.com](https://workbench.naubly.com)

## Purpose

The Reference Lab demonstrates Signal's own technical capabilities. Workbench demonstrates a separate commercial application adopting Signal's decision-evidence assessment within a consequential opportunity workflow while retaining ownership of its commercial records, calculations, recommendations, and approvals.

This is an **application integration case study with a production deployment**. It is not yet a validated customer deployment or a business-outcome case study. Production deployment status must not be confused with authenticated end-to-end workflow validation.

## Integration implemented

Workbench consumes the released, integrity-pinned `@signal/decision@0.1.0` package through its public `@signal/decision/core` entry point. During an authenticated assessment transaction, Workbench maps opportunity evidence and commercial assumptions into Signal's decision-evidence assessment contract.

The integration now covers:

- Evidence quality, provenance, confidence discipline, governance, stewardship, and next-best evidence.
- Explicit evidence direction and persisted evidence classifications, including access to the saved evidence payload needed to recover those classifications.
- Numeric commercial assumptions with units and confidence only when that confidence still applies to the unchanged value. Owner overrides and recurring-model-derived values do not inherit research confidence.
- Unknowns for unverified evidence, missing inputs, and unconfirmed delivery feasibility.
- Governance blockers that participate in Workbench's existing final-proceed gate.
- Persisted Signal assessment output and package provenance, surfaced in the authenticated assessment workspace.

### Deterministic economics are supplied as derived facts

The latest integration passes Workbench-calculated economic outputs into Signal as explicitly classified derived indicators:

| Indicator | Calculation owner |
|---|---|
| Expected revenue after win probability | Workbench |
| Expected direct costs after win probability | Workbench |
| Sales opportunity cost | Workbench |
| Delivery opportunity cost after win probability | Workbench |
| Expected net value | Workbench |
| Expected net value if won | Workbench |
| Break-even win probability | Workbench |
| Break-even status and probability headroom | Workbench |

These indicators retain exact decimal strings alongside numeric values, identify their calculation engine and dependencies, and are linked to the evidence supporting the underlying commercial inputs. Their metadata identifies them as `derived_economic_indicator` facts.

This distinction is important: Signal can assess the evidence, traceability, assumptions, uncertainty, and governance surrounding the economics, but it does not independently recalculate or certify Workbench's economic model. The outputs are conditional model results, not independently verified forecasts.

## Domain ownership and safety

The integration preserves a strict responsibility split:

- **Workbench** remains authoritative for opportunities, evidence records, commercial assumptions, costs, expected value, break-even analysis, recommendations, decisions, approvals, audit history, and outcomes.
- **Signal** supplies reusable decision-evidence assessment, evidence-quality analysis, confidence discipline, governance findings, stewardship guidance, and next-best-evidence recommendations.
- **The application owner** retains control of final commercial actions through Workbench's existing approval workflow.

The adapter deliberately:
- keeps evidence direction neutral rather than inferring that verification means support or contradiction;
- links an AI research assumption only when its unchanged source URL exactly matches a saved evidence URL;
- removes original research attribution when an owner overrides the value or the value is derived from a recurring commercial model;
- records unverified evidence, missing inputs, and unconfirmed delivery feasibility as unknowns;
- normalizes URL identity to its origin and avoids exposing URL query parameters;
- represents Workbench-calculated economics as derived facts, not external evidence or independent forecasts;
- performs no cross-product network request and introduces no new identity or service-token boundary.

## Verification and deployment evidence

### Package integration evidence

The original Workbench package-integration revision passed its recorded CI validation:

| Check | Recorded result |
|---|---|
| Pinned package install and SHA-256 integrity | Passed |
| Dependency audit | Passed |
| Fresh and legacy migration rehearsal | Passed |
| Test suite | 68 files, 663 tests passed |
| TypeScript check | Passed |
| Next.js production build | Passed |
| Aggregate statement coverage | 92.60% |
| Aggregate branch coverage | 85.86% |
| Aggregate function coverage | 97.33% |
| Aggregate line coverage | 95.01% |

The original integration-specific tests covered package provenance, evidence mapping, neutral direction, source-origin identity normalization, exact-URL assumption links, unverified evidence, governance blockers, economics isolation, deterministic output, and 30 shared commercial scenarios. Those 30 scenarios demonstrate reconciliation and regression protection against Workbench's independent economics; they are not 30 historical customer outcomes.

### Subsequent integration evidence

The subsequent Workbench changes extended the adapter to:
- load persisted evidence classifications from saved evidence payloads;
- pass Workbench's deterministic economic outputs into Signal as derived facts;
- retain exact amount strings and attach calculation-engine/dependency metadata;
- display calculated indicators separately from assumptions and uncertainty in the workspace;
- add regression coverage for the derived-economic-indicator contract.

The latest deployed source is commit [`0074950549b9a3948812cb7f8fc473afed3e2659`](https://github.com/DiogoAngelim/workbench/commit/0074950549b9a3948812cb7f8fc473afed3e2659). The production deployment was reported READY at [workbench.naubly.com](https://workbench.naubly.com). Its production build completed TypeScript validation and generated 43 static pages. Runtime error monitoring for the inspected 24-hour window did not surface application runtime errors.

These deployment and build checks establish that the application revision was deployed and built successfully. They do **not** establish that a real authenticated user completed an assessment end to end in the production UI. That workflow still requires a controlled authenticated production exercise.

## Limitations and claims

The integration consumes Signal package version 0.1.0. That release predates newer evidence-lineage and temporal-validity assessments present in the current Signal source tree. Workbench preserves source identity and verification timestamps in metadata, but this package version does not score those dimensions.

This implementation is an in-process decision-domain package integration. It does not establish use of Signal's SDK/runtime, durable event transport, replay infrastructure, or decision-memory runtime in the Workbench assessment path.

The evidence does not establish:
- a customer deployment or independent customer validation;
- authenticated end-to-end completion of the production assessment workflow;
- production latency, throughput, reliability, or SLOs;
- calibration of win probability;
- improvements in proposal conversion, revenue, margin, or delivery performance;
- validated results from real historical commercial outcomes;
- independent validation of Workbench's economic assumptions or calculations.

No customer or business-performance claim should be made until a real deployment workflow and an appropriately authorized outcome dataset have been independently reviewed.

## Interpretation

Signal now has two distinct, complementary forms of reproducible evidence:

1. **Reference Lab:** Signal's own lifecycle and PostgreSQL-backed capabilities exercised through CI, with scenario results and engineering measurements.
2. **Workbench:** a separate commercial application consumes a released Signal decision package, persists Signal's assessment and provenance, supplies deterministic commercial outputs as explicitly derived facts, displays the distinction between calculated indicators and uncertain assumptions, and deploys the integrated application to production.

Together, these demonstrate reusable package adoption, a consequential application integration, explicit domain boundaries, and a production-deployed consuming application. They do not yet establish a customer-validated deployment or improved business outcomes.
