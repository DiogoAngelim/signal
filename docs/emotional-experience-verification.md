# Emotional experience verification

Implementation: Signal/Lumina PR #90; companion Symbiosis PR #53. Plan: [emotional-experience-plan.md](emotional-experience-plan.md).

## Reproducible checks

- `node scripts/check-human-support-mirror.mjs` verifies byte identity between the canonical `packages/decision/src/human-support.ts` and the standalone example's `signal-decision` package, plus public exports. The example has its own pnpm workspace and does not resolve the root package automatically.
- `pnpm --filter @signal/decision typecheck` and `pnpm --filter @signal/decision test` exercise the shared policy and existing decision package.
- Existing Lúmina integrated CI performs actual PostgreSQL/Better Auth migrations in its isolated CI service, API typecheck/build and owner-scoped HTTP tests, frontend typecheck/build/tests, and Playwright across 320, 390, 768 and 1440px. The new support spec is in the existing Playwright test directory.
- API provider tests use intercepted fetch and synthetic keys, not live model calls or real account credentials.
- Symbiosis has separate evidence-readiness and default-guidance tests. It is private; its source and tests must not be copied into public Signal artifacts.

## Findings and corrections

Initial source `5268e9cd` passed Signal core and library typechecking, but failed the Lúmina API import check because the standalone package lacked the new exports. Root library lint also identified two unformatted new files. Those failures are retained as evidence, not ignored: the canonical files were formatted using the repository's pinned Biome and the standalone source/export surface reconciled in `45ac27d8`. A dedicated permanent contract workflow now detects future drift. Temporary integration workflows removed themselves and are not part of the resulting source tree.

The exact current commit requires fresh CI; an earlier passing run does not establish a later commit's status. Use PR #90 checks and its evidence comments for final outcomes. A Vercel READY build alone does not prove application runtime acceptance.

## Explicit limits

This is bounded support based on explicit EN/PT cues and user controls, not general emotion recognition. Phrase filters do not prove semantic safety; real model evaluations and human review remain required. Support-language controls are not full application localization. Derived cues/preferences are not persisted, but account conversations continue to follow the disclosed existing message-retention policy. Local guided replies are labelled as local.

No real participant study, independent emotional-benefit replication, production deployment, native financial-policy change, database migration outside isolated CI, real financial action or causal financial-performance claim follows from these changes. The human-validation protocol and artifact-bound Symbiosis gate deliberately keep these claims separate.
