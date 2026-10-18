# Instructor recording guide — Build AI Decision Systems with Signal

**Target runtime:** 140–175 minutes for the core course; add 45–60 minutes for the independent policy exercise and review. These are planning estimates, not measured recording times.  
**Audience:** developers and security practitioners comfortable reading basic TypeScript.  
**Canonical implementation:** `examples/ai-decision-system/src/index.ts`, `test/triage.test.ts`, and Signal's actual `@signal/decision/core` APIs.  
**Teaching format:** repository-first walkthrough with eight individually verifiable compiling checkpoints—not a from-zero reconstruction from partial source fragments.

## Instructor preparation

1. Check out the exact baseline commit: `3c9e122484ab7134eddf51452503afdb1fc0a4a4` on `course/repository-first-decision-system`. Record `git rev-parse HEAD` and do not silently switch versions mid-recording.
2. Use Node.js 20+ and the repository-pinned pnpm 10.12.4.
3. From the repository root, run the clean-checkout gate:

```bash
node --version
corepack pnpm --version
corepack pnpm install --filter @signal/ai-decision-system --filter '!signal-workspace' --frozen-lockfile
corepack pnpm --filter @signal/ai-decision-system build
corepack pnpm --filter @signal/ai-decision-system test
corepack pnpm --filter @signal/ai-decision-system typecheck
corepack pnpm --filter @signal/ai-decision-system start
```

4. Keep the 27-slide deck, `COURSE_LAB.md`, `src/index.ts`, and `test/triage.test.ts` open.
5. **Do not progressively delete/append code fragments in the canonical file.** Each checkpoint starts from the complete, compiling repository implementation; inspect the named region and run the listed verification. A checkpoint is not a partial file state.
6. Capture real terminal output. If a command fails, stop and diagnose the actual error rather than simulating a pass.
7. The example is offline, deterministic, synthetic, and advisory. It has no trained model, provider calls, automated response, durable audit log, or production security guarantee.

## Core course sequence

### 0–15 minutes — Welcome, architecture, and baseline (slides 1–8)

**Show:** `README.md`, the architecture diagram in `COURSE_LAB.md`, `src/index.ts`, and `test/triage.test.ts`.

**Say:** “We will follow a synthetic alert through validation, evidence assessment, explicit application policy, a decision record, replay, and later outcome review. The goal is not to make a score look authoritative; it is to make the decision process inspectable and testable. We are using the real Signal repository and its real APIs. This example does not call an AI provider, train a model, page an analyst, or contain a host.”

Run the clean-checkout gate. Expected fixture outcomes to verify from actual output: `confirmed-critical` = 100 / `escalate`; `high-score-unconfirmed` = 94 / `analyst-review`; `low-background` = 14 / `monitor`.

### Checkpoint 1 — Model the decision-time boundary (slides 1–6)

**On screen:** types and `DecisionTimeSnapshot`.

**Say:** “We first make the input and output contract explicit. The snapshot contains the alert, capture time, and versioned estimator, but no later outcome. That prevents retrospective knowledge from being presented as if it were available at decision time.”

**Verify:** `corepack pnpm --filter @signal/ai-decision-system build` passes; the snapshot has no outcome field.

### Checkpoint 2 — Validate before reasoning (slides 7–10)

**On screen:** `validateAlert`, timestamp helpers, and validation tests.

**Demonstrate:** invalid severity, NaN/out-of-range score, impossible date `2025-02-30T09:14:00Z`, and duplicate signal ID.

**Say:** “Validation is a boundary, not cosmetic cleanup. We reject malformed facts instead of silently turning them into plausible-looking evidence.”

**Verify:** `corepack pnpm --filter @signal/ai-decision-system test` passes the validation case.

### Checkpoint 3 — Keep the heuristic advisory (slides 11–12)

**On screen:** `SEVERITY_BASE`, `estimateRiskLocally`, and the 94/100 fixture.

**Say:** “This deterministic formula is a teaching heuristic, not a trained model or calibrated probability. The number is contextual evidence, not authorization. The critical 94/100 case remains analyst-review because it has no corroborating telemetry.”

**Verify:** run the test suite; the high-score boundary remains intact.

### Checkpoint 4 — Use Signal's real evidence API (slides 13–14)

**On screen:** evidence mapping and `assessDecisionEvidence`.

**Say:** “Signal structures evidence quality, knowns, unknowns, assumptions, contradictions, and journal references. The heuristic is neutral evidence. Signal's assessment is not the application’s triage policy.”

**Verify:** the application builds against `@signal/decision/core`; do not replace Signal APIs with a mock or companion lab.

### Checkpoint 5 — Apply explicit policy gates (slides 15–18)

**On screen:** `TRIAGE_RULES`, `meetsStrongEvidenceThresholds`, `canEscalate`, `canMonitor`, and `buildRationale`.

**Say:** “Escalation requires critical severity, at least two distinct supplied source labels that each pass all five thresholds, and no contradictory signal. One failed dimension disqualifies that source. Distinct labels and independence scores are claims in the supplied data, not proof of real-world independence.”

**Demonstrate:** duplicate labels, one degraded quality dimension at a time, contradictory evidence, and the high-score case.

**Verify:** run the test suite; all policy boundary cases pass.

### Checkpoint 6 — Record rationale and accountability (slide 19)

**On screen:** `createDecisionRecord`, accountability helpers, and the in-memory store.

**Say:** “The application policy chooses the priority. The record captures rationale and evidence context. The accountability report says no response action was taken. This store is process-local and volatile—not durable, immutable, or tamper-proof.”

**Verify:** run the test suite and inspect the rationale, evidence IDs, and `actionTaken` field.

### Checkpoint 7 — Replay captured inputs (slides 20–22)

**On screen:** `replayCapturedDecision` and its test.

**Say:** “Replay re-evaluates the captured alert and timestamp, compares defined application fields, and asks Signal to compare coherence. This is a bounded selected-field comparison; it does not replay side effects, verify an audit history, or prove tamper resistance.”

**Verify:** run the test suite; unchanged inputs yield `same-result` and Signal's `same-decision` result.

### Checkpoint 8 — Separate later outcomes and close (slides 23–27)

**On screen:** `reviewLaterOutcome`, its test, and the ten-test catalogue.

**Say:** “An outcome is new knowledge. We record it separately instead of rewriting the original decision-time snapshot. It does not silently train the heuristic or change replay inputs.”

**Verify:** run build, test, typecheck, and start; save actual output. The baseline suite has ten top-level test definitions, including the five-dimension regression loop.

## Independent policy exercise — test first (additional 45–60 minutes; slides 25–26)

The student changes the actual application policy from two qualified source labels to three. Add a test first and capture the failing result. Then change the policy constant, add a third distinctly labeled synthetic supporting signal, and update fixture-dependent assertions deliberately. A failed old assertion is a contract conflict to resolve—not a test to delete casually. The solution is not covered by the baseline CI run until build, test, typecheck, and start have been run against the changed code.

**Instructor answer key:** `POLICY_EXERCISE_SOLUTION.md` is on the separate solution branch. This is an exercise variant, not the baseline release; synchronize the slide deck and narration before adopting the stricter policy in a release.

## Closing narration (slide 27)

“We made a small decision process explicit: validate input, assess evidence, apply a separate policy, record the result, replay selected fields, and review later outcomes. The fixtures and thresholds are synthetic. The estimator is not calibrated, source independence is not independently verified, storage is volatile, and replay is not tamper-proof. A real deployment needs domain validation, access controls, durable storage, monitoring, calibration, failure handling, and an approved operational policy. Evidence before action, policy before automation, and tests before trust.”

## Recording sign-off

- [ ] State the exact commit at the beginning and keep it fixed.
- [ ] Run and capture clean install, build, tests, typecheck, and fixture output.
- [ ] Match all 27 slide titles and notes to the script.
- [ ] Demonstrate the 94/100 case remaining `analyst-review`.
- [ ] Demonstrate repeated source labels, each evidence-dimension regression, and contradictions.
- [ ] Distinguish Signal assessment, application policy, accountability, and replay.
- [ ] State that source-label independence is not independently verified.
- [ ] State that the store is volatile and replay compares selected fields.
- [ ] Keep the exercise solution hidden until the test-first failure has been observed.
- [ ] Do not describe the entire repository as green while Signal core workflow run #101 remains unresolved.
- [ ] Do not call the course runtime measured until the full script has been rehearsed aloud.