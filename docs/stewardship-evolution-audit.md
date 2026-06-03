# Signal Stewardship Evolution Audit

Date: 2026-06-02

This audit treats stewardship as Signal's highest-order contract: preserve what matters, reduce threats, improve evidence, improve decisions, and keep the process explainable. The implemented batch is intentionally small and additive. It extends the existing decision stewardship layer instead of creating a new system.

## Current Stewardship Score

Post-batch score: 8.0 / 10.

Signal already has domain-agnostic decision evaluation, outcome review, decision memory, learning memory, evidence assessment, accountability replay, and stewardship assessment. The main weakness was proof: the system could advise and learn, but the decision -> outcome -> lesson -> evidence chain was not exposed as a first-class ledger.

## Maximum Achievable Stewardship Score

Maximum achievable without reducing simplicity or compatibility: 8.7 / 10.

Higher maturity requires durable storage, migration, and application display work. Those belong in later isolated batches because they touch infrastructure, persistence, or product workflows.

## Stewardship Gap Analysis

- Preservation: strong. Existing policy blocks, reversibility checks, and concentration-risk checks preserve downside protection.
- Threat Reduction: adequate. Threats are explicit, but threat evidence links were not previously audited.
- Evidence Quality: improved. Stewardship assessments now include ledger traceability and missing evidence references.
- Decision Quality: improved. The assessment can show whether a recommendation is grounded in reviewed outcomes and lessons.
- Explainability: improved. Ledger gaps are plain-language strings.
- Optionality: strong. The new mechanism is additive and does not force application behavior.
- Adaptability: strong. The ledger is domain-agnostic and reusable across investing, education, health, disaster readiness, infrastructure, and operations.
- Efficiency: unchanged. The ledger is computed from existing inputs.

## Evidence Gap Analysis

Fixed in this batch:

- Decision id, outcome review, lesson, and evidence links are now measured explicitly.
- Missing evidence references are surfaced instead of silently ignored.
- Lessons generated from outcome reviews now retain source review ids and optional evidence ids.

Remaining:

- Persisted stewardship ledgers should be added through existing decision-memory storage, not a new store.
- Applications should decide which ledger gaps matter for their domain workflows.

## Governance Gap Analysis

Fixed in this batch:

- A stewardship assessment can now say whether the proof chain is complete.
- Threats and protections without evidence links are reported as ledger warnings.

Remaining:

- Repository-wide governance still needs a documented policy for when applications may hide, collapse, or override ledger warnings.

## Complexity Reduction Plan

- Keep stewardship in `packages/decision/src/stewardship`.
- Do not add a separate ledger package or database table until persistence is required.
- Preserve existing public exports and add only compatible exports.
- Treat domain language, dashboards, and actions as application-layer concerns.

## Stewardship Ledger Improvements

Implemented:

- Added `createStewardshipLedger`.
- Added `StewardshipLedger` types.
- Added `ledger` to `StewardshipAssessment`.
- Added optional `evidenceIds` to `StewardshipOutcomeReview`.
- Added optional `sourceOutcomeReviewId` to `StewardshipLesson`.

## Domain Boundary Corrections

No domain-specific concepts were added to Signal. The ledger uses generic subjects, decisions, reviews, lessons, evidence, threats, and protections. Domain-specific scoring, labels, dashboards, and actions remain application-layer responsibilities.

Potential naming concern:

- Existing `prediction` APIs are compatibility surfaces. They should continue to be framed as scenario or uncertainty exploration, not as optimization for prediction. Renaming public APIs is not approved in this batch because it would reduce compatibility.

## Regression Protection Plan

Implemented tests protect:

- Complete decision -> outcome -> lesson -> evidence chains.
- Missing decision ids, missing outcome reviews, and missing evidence references.
- Outcome-review evidence ids surviving lesson interpretation.
- Assessments carrying a complete ledger without changing recommendation behavior.

## Ten-Year Survival Improvements

The ledger improves long-term interpretability because future maintainers can inspect why a lesson was trusted. The implementation uses plain data structures, stable ids, and existing stewardship inputs.

Remaining ten-year risks:

- Generated or vendored app copies must stay in sync when present.
- Persistent memory schemas need explicit migration history before ledger storage is added.
- Application UIs need progressive disclosure so ledger warnings help users without overwhelming them.

## Exact Architecture Changes

- The existing stewardship assessment now produces a traceability ledger.
- Outcome interpretation now preserves the source review id and evidence ids on generated lessons.
- Root package exports expose the new ledger builder and types.

## Exact Code Changes

- `packages/decision/src/stewardship/stewardshipLedger.ts`
- `packages/decision/src/stewardship/types.ts`
- `packages/decision/src/stewardship/outcomeInterpreter.ts`
- `packages/decision/src/stewardship/stewardshipAdvisor.ts`
- `packages/decision/src/stewardship/index.ts`
- `packages/decision/src/index.ts`

## Exact UI Changes

None. UI is application-layer work. Applications may surface `assessment.ledger.gaps`, `assessment.ledger.warnings`, and `assessment.ledger.traceability.score`.

## Exact Test Changes

- `packages/decision/src/stewardship/__tests__/stewardshipLedger.test.ts`
- `packages/decision/src/stewardship/__tests__/outcomeInterpreter.test.ts`
- `packages/decision/src/stewardship/__tests__/stewardshipAdvisor.test.ts`

## Exact Migration Plan

No data migration is required for this batch.

Future persistence migration:

1. Add a backward-compatible decision-memory field for stewardship ledger snapshots.
2. Store only compact ledger summaries and ids, not raw provider history.
3. Backfill only when a decision already has outcome reviews and evidence.
4. Keep application-specific labels outside the shared Signal schema.

## Re-run Audit Result

After this batch, no further safe improvement is available inside the stewardship assessment layer without moving into persistence, application UI, or public API renaming. Those are separable follow-up batches because they increase blast radius.

## Final Speed And Quality Assessment

Final cleanup optimized ledger evidence usage by indexing lesson, threat, and protection references before building evidence traces. This keeps the ledger simple while avoiding repeated scans as review history grows.

Speed benchmark:

- Workload: 10,000 ledger builds, each with 100 evidence items, 100 lessons, 100 outcome reviews, 50 threats, and 50 protections.
- Before cleanup: 0.20364 ms per ledger build.
- After cleanup: 0.09121 ms per ledger build.
- Result: about 55% faster on this synthetic ledger workload.

Quality assessment excluding `examples/`:

- `pnpm --filter @signal/decision test`: passed.
- `pnpm --filter @signal/decision typecheck`: passed.
- `pnpm --filter @signal/decision lint`: passed.
- `pnpm typecheck:library`: passed across 29 non-example workspace projects.
- `pnpm lint:library`: passed across 29 non-example workspace projects.
- `pnpm test:library`: passed after building the non-example library surface.
