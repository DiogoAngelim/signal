# Recording guide: auditable AI-assisted alert triage (60–90 minutes)

Use the commands from the Signal repository root. This example is offline and deterministic; do not imply that it calls an AI provider or performs containment.

## 0–8 min — Signal and scope

**Objective:** Explain the separation of evidence assessment, application policy, execution, and review.

- Introduce Signal as decision-processing infrastructure, not a predictive model.
- Open `packages/decision/src/core.ts` and identify the public evidence-centered API used by the example.
- State that the fixtures are synthetic and that the output is a triage recommendation, not an operational response action.

**Narration:** “We are not training a model or connecting to a security provider. We are examining how an application can represent evidence, make a bounded decision, and preserve enough context to review that decision later.”

## 8–18 min — Run the fixtures

Run:

```bash
pnpm --filter @signal/ai-decision-system start
```

- Inspect `EXAMPLE_ALERTS` and `runExample` in `src/index.ts`.
- Compare `confirmed-critical`, `high-score-unconfirmed`, and `low-background`.
- The high-score case has no telemetry and remains analyst review.
- Describe the replay output as a comparison of captured inputs, the example's result fields, and Signal's coherence assessment—not proof of a tamper-proof audit log.

**Narration:** “A score is an input to judgment, not a verdict. The same numerical score can lead to different actions when evidence and policy differ.”

## 18–30 min — Validation and provenance

- Walk through `validateAlert`: required fields, ISO date-time validation, unique signal IDs, score bounds, and explicit errors.
- Inspect `estimateRiskLocally` and its fixed version name.
- Trace how `evaluateAlert` turns each signal into evidence with source, observed time, quality, reliability, freshness, independence, and traceability.
- Show that the heuristic estimate is recorded as neutral evidence with score and version metadata.

**Narration:** “This estimator is deliberately a deterministic heuristic. Its score is not a calibrated probability and cannot authorize escalation.”

## 30–44 min — Assessment and policy

- Follow `assessDecisionEvidence` in `evaluateAlert`.
- Inspect the assessment implementation under `packages/decision/src/assessment/`.
- Review `TRIAGE_RULES` and `canEscalate`: critical severity, two distinct source labels with strong evidence, and no contradictions.
- Review the regression test proving two indicators sharing the same source label do not count as two sources.
- Explain that labels and independence scores are supplied claims, not proof of real-world independence.
- Review `canMonitor`; all other cases require analyst review.
- Explain that `assessCoherence` is recorded because Signal's decision record uses it; `coherence.actionAllowed` does not choose the security priority.

**Narration:** “Signal assesses the evidence; this example's application policy selects the triage priority. Those are separate responsibilities.”

## 44–56 min — Decision record and accountability

- Follow `createDecisionRecord` and the captured reality snapshot.
- Inspect `assessment.journal` and its evidence references.
- Follow `createAccountabilityReport` and `attachAccountability`.
- Run `pnpm --filter @signal/ai-decision-system test`.
- State that the store is process-local and no persisted hash-chained runtime audit log is created or verified.

## 56–68 min — Replay and determinism

- Follow `replayCapturedDecision`: it re-evaluates the captured alert and timestamp, then calls Signal's `replayDecision`.
- Identify the fields compared by the wrapper: priority, estimator score, and selected journal fields. Signal's helper compares coherence assessments.
- Run the determinism and replay tests.
- Avoid claiming that this proves tamper resistance, replays external side effects, or verifies a runtime audit history.

**Narration:** “Replay is only as meaningful as the inputs and comparisons it actually uses. Here, we compare a deterministic teaching example; we are not proving a production audit chain.”

## 68–78 min — Later outcome review

- Trace `reviewLaterOutcome` into Signal's `reviewDecisionOutcome`.
- Show that `DecisionTimeSnapshot` has no outcome field.
- Run the outcome-separation test.
- Explain that review does not mutate the original record or update/train the estimator.

## 78–90 min — Edge cases and production boundary

Run the checks:

```bash
pnpm --filter @signal/ai-decision-system build
pnpm --filter @signal/ai-decision-system test
pnpm --filter @signal/ai-decision-system typecheck
```

Review malformed input, weak evidence, contradictory evidence, missing corroboration, repeated evaluation, and outcome separation in `test/triage.test.ts`.

Close by distinguishing this teaching example from a deployable security control: synthetic fixtures, illustrative thresholds, no response actions, volatile storage, no calibration, and no provider integration.

For a future real estimator, discuss captured provider output and provenance, explicit provider failures, validated thresholds, policy separation, and durable access-controlled storage. Do not silently fetch new model outputs during replay.
