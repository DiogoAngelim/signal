# AI-Assisted Security Alert Triage with Signal

**Course promise:** Follow a synthetic security alert from validated input through evidence assessment, an explicit triage decision, recording, deterministic re-evaluation, and later outcome review. Learn why a high heuristic score is evidence—not a verdict—and where Signal's guarantees stop.

The instructor's recording guide is in [RECORDING_GUIDE.md](./RECORDING_GUIDE.md). For the repository-first hands-on course, follow [COURSE_LAB.md](./COURSE_LAB.md), which teaches the actual Signal APIs and includes a test-first policy challenge.

## Audience and prerequisites

For developers or security practitioners who can read basic TypeScript and JSON. No machine-learning, security-operations, or Signal expertise is required.

- Node.js 20 or newer
- pnpm 10.12.4, pinned by the Signal workspace
- A checkout of the Signal repository

## Clean-checkout setup and verification

Run these commands from the Signal repository root:

```bash
node --version
pnpm --version
pnpm install --filter @signal/ai-decision-system --filter '!signal-workspace' --frozen-lockfile
pnpm --filter @signal/ai-decision-system build
pnpm --filter @signal/ai-decision-system test
pnpm --filter @signal/ai-decision-system typecheck
pnpm --filter @signal/ai-decision-system start
```

The filtered install selects the example and its workspace dependency while excluding the unrelated root importer named `signal-workspace`. The example compiles the actual `packages/decision` source with its own TypeScript compiler and Node type definitions; it does not require that package's Vitest test runner and does not replace Signal APIs with mocks. The test script uses Node's built-in test runner and includes ten tests on this teaching branch (nine original cases plus a five-dimension evidence-gate regression case).

Expected demo priorities:

| Alert | Heuristic estimate | Triage |
| --- | ---: | --- |
| Corroborated critical alert | 100/100 | Escalate |
| Critical alert with high score but no telemetry | 94/100 | Analyst review |
| Low-severity alert, no signals | 14/100 | Monitor |

No database, credentials, external AI provider, or network service is used at runtime.

## What the example teaches

- `validateAlert` rejects malformed timestamps, duplicate signal IDs, missing strings, and out-of-range scores rather than fabricating evidence.
- `estimateRiskLocally` is a deterministic teaching heuristic, not a trained model or calibrated probability. Its score is captured with provenance as neutral evidence.
- `assessDecisionEvidence` from `@signal/decision/core` records evidence quality, knowns, unknowns, assumptions, contradictions, and traceability.
- The explicit policy escalates only a critical alert with at least two distinct source labels whose supporting evidence passes quality, reliability, freshness, independence, and traceability thresholds, with no contradictory signal. Labels and independence scores are claims in supplied data, not proof of real-world independence.
- Monitoring requires all three conditions: low or medium severity, no supplied signals, and a score at or below 30. The score cannot trigger escalation.
- Signal decision records, accountability, in-memory storage, `replayDecision`, and `reviewDecisionOutcome` demonstrate decision representation and retrospective review. Generic coherence and stewardship outputs do not select this example's triage priority or authorize an action.

## Boundaries and limitations

Fixtures and thresholds are synthetic teaching choices—not production security guidance. The example returns priorities only; it does not page responders, quarantine hosts, or execute actions.

`createInMemoryDecisionRecordStore` is process-local and volatile. The example does not provide durable or immutable storage, authentication, signatures, hash-chain verification, or tamper detection. `replayCapturedDecision` re-evaluates the captured alert and timestamp, compares priority, score, and journal fields, and calls Signal's `replayDecision` to compare coherence. It does not replay external side effects or verify a runtime audit history. Later outcome review does not change the original record, replay, policy, or estimator.

## Troubleshooting

- If the filtered install fails, capture the first failing package and exact registry error. A clean checkout still needs the declared TypeScript and Node type packages from the configured registry.
- If dependencies are already installed, try build/test/typecheck without rerunning installation; these commands do not need network access.
- `pnpm arch:check` is a repository-wide check requiring workspace development dependencies and is not a prerequisite for this example. Report it as unavailable rather than as passing if those dependencies were excluded.
- Do not remove `--frozen-lockfile` or change unrelated dependencies merely to work around a registry failure.

## Replacing the heuristic

Keep any future provider adapter outside the policy. Capture and validate its score, model/version, timestamp, and provenance as decision-time evidence. Replay captured responses rather than silently fetching new ones. Provider failures, calibration, authorization, durable storage, and operational monitoring are outside this teaching example.
