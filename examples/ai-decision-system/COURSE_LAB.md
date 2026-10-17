# Repository-first course lab — Build AI Decision Systems with Signal

> **Status:** teaching branch; not a production security system. This lab uses the **real** `@signal/decision/core` APIs and the checked-in TypeScript application. No standalone imitation of Signal is used.

## The engineering contract

**Input:** a validated synthetic security alert and an explicit capture timestamp.

**Output:** a triage recommendation (`escalate`, `analyst-review`, or `monitor`), a rationale, a Signal assessment, and a reviewable Signal decision record.

**Boundaries:** no trained ML model, no provider calls, no automated security response, no immutable or durable audit log. The heuristic score is advisory, and two distinct source labels do not prove actual source independence.

## Start here: reproducible baseline

Open the repository root in VS Code. Use Node.js 20+ and pnpm 10.12.4 (the package-manager version declared by the repository). Prefer `corepack pnpm` if pnpm is not installed globally.

```bash
node --version
corepack pnpm --version
corepack pnpm install --filter @signal/ai-decision-system --filter '!signal-workspace' --frozen-lockfile
corepack pnpm --filter @signal/ai-decision-system build
corepack pnpm --filter @signal/ai-decision-system test
corepack pnpm --filter @signal/ai-decision-system typecheck
corepack pnpm --filter @signal/ai-decision-system start
```

These are **commands to run**, not claims of successful execution. The expected checked-in fixture decisions, according to the source and README, are:

| Fixture | Advisory estimate | Priority |
| --- | ---: | --- |
| `confirmed-critical` | 100 | `escalate` |
| `high-score-unconfirmed` | 94 | `analyst-review` |
| `low-background` | 14 | `monitor` |

Capture the real terminal output during recording. Stop and diagnose failures; do not narrate a pass that did not occur.

## The eight progressive checkpoints

Each checkpoint starts from the real application in `examples/ai-decision-system/src/index.ts`. For a code-building recording, create a **temporary scratch copy** of that file in VS Code, then progressively reveal/implement the indicated regions in the order below; restore the authoritative checked-in file before running the complete suite. This avoids pretending that partially implemented exports will typecheck. An alternative is to prepare eight separately compiled teaching commits before filming.

### 1. Model the boundary (slides 1–6)

**Build:** `Severity`, `EvidenceDirection`, `TriagePriority`, `AlertSignal`, `SecurityAlert`, `DecisionTimeSnapshot`, `EvaluatedDecision`.

**Say:** “We are not asking an AI model to decide what happens to an alert. We are defining a contract for evidence and an explicit policy for the recommendation. A later outcome is intentionally absent from the decision-time snapshot.”

**Check:** the snapshot has `alert`, `capturedAt`, and versioned `estimator`, but no `outcome`.

### 2. Validate the input (slides 7–10)

**Build:** `validateAlert`, `asRecord`, `requiredString`, `requiredTimestamp`, `boundedScore`, `isSeverity`, and `isDirection`.

**Show:** invalid severity, NaN, impossible date `2025-02-30T09:14:00Z`, and duplicate signal ID all throw `TypeError`.

**Say:** “Validation is not cosmetic cleanup. It prevents the decision record from looking authoritative when the underlying facts were malformed.”

**Check:** the test named “validates a complete alert and rejects malformed or out-of-range input”.

### 3. Add the advisory heuristic (slides 11–12)

**Build:** `SEVERITY_BASE` and `estimateRiskLocally`.

```ts
const estimate =
  SEVERITY_BASE[alert.severity] +
  Math.round(alert.assetCriticality * 0.2) +
  Math.min(16, supporting * 4) -
  Math.min(12, contradicting * 4);
return Math.max(0, Math.min(100, estimate));
```

**Say:** “This number is neither a calibrated probability nor an authorization. We will explicitly represent it as neutral evidence.”

**Check:** the 94-point critical alert without telemetry must remain `analyst-review`.

### 4. Call Signal's real evidence API (slides 13–14)

**Build:** the `evaluateAlert` mapping from `AlertSignal` to `DecisionEvidence`; call `assessDecisionEvidence` imported from `@signal/decision/core`.

```ts
const assessment = assessDecisionEvidence({
  decisionId,
  createdAt: decisionAt,
  evidence: [severityEvidence, ...signalEvidence, modelEvidence],
  known,
  unknowns,
  assumptions,
  contradicted,
  desiredConfidence: 90,
  importance: alert.assetCriticality,
  reasoningSummary,
});
```

The snippet above is **structural pseudocode**: the actual source in `src/index.ts` contains the full literal evidence, known/unknown, and assumptions objects. Use that source for the executable implementation.

**Say:** “Signal describes the evidence and captures its limits. It does not select the application’s triage priority.”

**Check:** `model:risk-estimate` has `direction: "neutral"`; the assessment journal references the evidence IDs.

### 5. Write application policy (slides 15–18)

**Build:** `TRIAGE_RULES`, `meetsStrongEvidenceThresholds`, `buildRationale`, and the priority gates inside `evaluateAlert`.

```ts
const canEscalate =
  alert.severity === "critical" &&
  strongSupportingSources.size >=
    TRIAGE_RULES.minimumStrongSourcesToEscalate &&
  contradictorySignals.length === 0;

const canMonitor =
  modelScore <= TRIAGE_RULES.monitorMaximumScore &&
  (alert.severity === "low" || alert.severity === "medium") &&
  alert.signals.length === 0;
```

**Say:** “Two indicators from one source are not corroboration. Every strong supporting signal must pass all five thresholds. A contradiction blocks escalation even if two qualified supporting sources remain.”

**Check:** run the tests for duplicate source labels, conflicting evidence, and the five-dimension qualification matrix added on this branch.

### 6. Create a reviewable record (slide 19)

**Build:** `assessCoherence`, `createDecisionRecord`, `createAccountabilityReport`, `attachAccountability`, `createExampleStore`, and `storeDecision`.

**Say:** “The policy chooses priority. Coherence is recorded for comparison; `coherence.actionAllowed` does not choose our security priority. Accountability says that no response action was taken.”

**Check:** journal references match evidence IDs, `humanSummary` matches rationale, and `accountability.actionTaken` is false.

### 7. Replay captured inputs (slides 20–22)

**Build:** `replayCapturedDecision`. Re-run `evaluateAlert(original.snapshot.alert, original.snapshot.capturedAt)`, compare priority, heuristic score, and selected journal fields, and call Signal’s `replayDecision` for coherence comparison.

**Say:** “A same-result replay is a bounded comparison of defined fields under this code and policy. It is not proof of tamper resistance or complete environmental identity.”

**Check:** `result === "same-result"` and `signalComparison.replayResult === "same-decision"` for unchanged captured inputs.

### 8. Review later outcomes and extend the policy (slides 23–27)

**Build:** `reviewLaterOutcome` using `reviewDecisionOutcome`, and demonstrate that the original record and replay are unchanged.

**Say:** “The later outcome is new knowledge. We preserve it as a separate review instead of rewriting what the system knew when it made the original recommendation.”

**Check:** the outcome-review test verifies non-mutation and rejects a mismatched decision ID.

## Independent challenge — change the *actual* Signal example

**Goal:** make the escalation source-count requirement more conservative, using test-driven development. This is an intentionally changed policy, not a claim that three sources are universally appropriate.

1. In `test/triage.test.ts`, add the test below. Do **not** edit the policy yet.
2. Run the focused test suite and observe the new test fail because the current rule accepts two qualified sources.
3. In `src/index.ts`, change `minimumStrongSourcesToEscalate: 2` to `3`.
4. Re-run the focused test. It should pass. The existing test that expects the two-source fixture to escalate will now fail; this is an expected **contract conflict**, not a reason to ignore the suite.
5. Resolve the conflict deliberately: either revise the synthetic `confirmed-critical` fixture to contain a third genuinely distinct qualified source and update expectations, or revert the policy after demonstrating the impact. Document which contract you chose.
6. Run build, test, and typecheck. Record real results.

```ts
it("requires three qualified sources under the stricter policy", () => {
  const base = EXAMPLE_ALERTS[0];
  const decision = evaluateAlert(base, decisionAt);
  assert.equal(decision.priority, "analyst-review");
  assert.match(decision.rationale, /requires 3 independent/i);
});
```

**Instructor note:** the phrase “independent” in the current rationale refers to distinct *supplied source labels*; it does not establish verified organizational or technical independence. Explain this limitation aloud.

## Source-of-truth map

| Slides | Implementation | Verification |
| --- | --- | --- |
| 1–6 | Type contracts, `evaluateAlert` | Three fixtures |
| 7–10 | `validateAlert` | Invalid inputs |
| 11–14 | `estimateRiskLocally`, `assessDecisionEvidence` | High score remains advisory |
| 15–18 | `TRIAGE_RULES`, `buildRationale` | Source labels, weak evidence, contradictions |
| 19 | `createDecisionRecord`, accountability | Journal/rationale consistency |
| 20–22 | `replayCapturedDecision` | Deterministic comparison |
| 23–25 | `reviewLaterOutcome` | Later knowledge separate |
| 26–27 | Policy extension | Test-first change + complete checks |

## Recording and verification gate

- Pin the branch to a Git commit before recording.
- Run the six baseline commands on a clean checkout and save output.
- Record one real failure and its diagnosis rather than editing it out.
- Use the **actual** `src/index.ts` and `test/triage.test.ts` as the canonical complete implementation; do not silently replace Signal with a companion implementation.
- Verify each narrated slide number and claim against the 27-slide deck.
- Show the distinct outcomes and the high-score-no-escalation boundary.
- Clearly identify source-label independence as an unverified input claim.
- Never call the in-memory store immutable, durable, tamper-proof, or production-ready.
- Re-run the complete suite after restoring or updating all policy fixtures.
- Do not claim this branch passed tests until CI or a local environment actually ran them.

## Technical provenance

Repository: `DiogoAngelim/signal`. This teaching branch adds an explicit regression test covering all five evidence dimensions. It does **not** replace the original example or its APIs. Its baseline README, source, and tests were inspected through GitHub. No build, typecheck, or test execution of this branch is claimed here.
