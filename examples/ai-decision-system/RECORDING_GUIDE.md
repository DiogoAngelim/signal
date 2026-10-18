# Instructor recording script — Build AI Decision Systems with Signal

**Target runtime:** 75–90 minutes  
**Audience:** developers and security practitioners comfortable reading basic TypeScript  
**Canonical implementation:** `src/index.ts`, `test/triage.test.ts`, and Signal's actual `@signal/decision/core` APIs  
**Recording status:** record only after the clean-checkout commands below have run successfully. Capture terminal output; do not simulate successful results.

## Instructor preparation

1. Check out and pin the exact commit being recorded: `git rev-parse HEAD`.
2. Use Node.js 20+ and the repository-pinned pnpm 10.12.4.
3. From the repository root, run:

```bash
node --version
corepack pnpm --version
corepack pnpm install --filter @signal/ai-decision-system --filter '!signal-workspace' --frozen-lockfile
corepack pnpm --filter @signal/ai-decision-system build
corepack pnpm --filter @signal/ai-decision-system test
corepack pnpm --filter @signal/ai-decision-system typecheck
corepack pnpm --filter @signal/ai-decision-system start
```

4. Keep `COURSE_LAB.md`, the 27-slide deck, `src/index.ts`, and `test/triage.test.ts` open.
5. For live coding, use a temporary scratch copy of `src/index.ts` and progressively reveal the eight checkpoints. Do not leave a partially implemented file in the canonical project or imply that incomplete intermediate states compile. If the course is presented as a true from-zero coding session, prepare and verify a compiling checkpoint commit for every stage before recording.
6. The example is offline, deterministic, synthetic, and advisory. It has no trained model, provider calls, automated response, durable audit log, or production security guarantee.

## 0–7 minutes — Welcome, scope, and the contract (slides 1–6)

**On screen:** title slide, then repository in VS Code. Open the source-accurate Mermaid architecture diagram near the top of `COURSE_LAB.md`; use it to preview the five main transitions before following the code. Keep the diagram's boundaries visible: the heuristic is advisory, policy is application-owned, storage is volatile, replay compares selected fields, and outcome review is separate.

**Say:**  
“Welcome. In this course we will follow a synthetic security alert through validation, evidence assessment, an explicit application policy, a decision record, replay, and later outcome review. Our goal is not to make an AI score look authoritative. Our goal is to make the decision process inspectable, bounded, and testable.

“We are using the actual Signal repository and its real `@signal/decision/core` APIs. The code in the repository is the source of truth; the slides are a guide. This example does not call an AI provider, train a model, page an analyst, or contain a host. It produces an advisory triage priority only.”

**Show:** `examples/ai-decision-system/README.md`, `src/index.ts`, `test/triage.test.ts`.

**Checkpoint 1 — Model the boundary.** Point out `Severity`, `EvidenceDirection`, `TriagePriority`, `AlertSignal`, `SecurityAlert`, `DecisionTimeSnapshot`, and `EvaluatedDecision`.

**Say:**  
“Notice that `DecisionTimeSnapshot` contains the alert, capture time, and estimator metadata, but not a later outcome. We must not allow information learned later to leak into the description of what was known at decision time.”

**Verify:** the type definitions contain no outcome field in the snapshot.

## 7–14 minutes — Reproduce the baseline (slides 7–8)

**On screen:** terminal at repository root.

Run the clean-checkout commands listed above, or show the saved output from the same pinned commit if recording time is limited. If a command fails, stop and diagnose the actual error.

**Say:**  
“These commands install the focused workspace dependencies with the frozen lockfile, build the real example, run its tests, typecheck it, and execute the synthetic fixtures. The results on screen are the evidence of whether this commit works; a command written in a guide is not evidence that it passed.”

**Expected fixture outcomes to verify against actual output:**

| Fixture | Heuristic estimate | Priority |
| --- | ---: | --- |
| `confirmed-critical` | 100/100 | `escalate` |
| `high-score-unconfirmed` | 94/100 | `analyst-review` |
| `low-background` | 14/100 | `monitor` |

**Say:**  
“The most important comparison is the first and second alert. A score of 94 does not escalate when the required corroborating evidence is absent. The number is not a verdict.”

## 14–23 minutes — Checkpoint 2: validate the input (slides 9–10)

**On screen:** `validateAlert` and its tests.

**Say:**  
“Before we assess evidence, we validate the envelope. We check required strings, severity and direction enums, ISO date-time values, finite scores between zero and one hundred, the signal-array limit, and unique signal IDs. Invalid input raises a clear error instead of being silently repaired.”

**Demonstrate:** invalid severity, NaN or out-of-range score, impossible date `2025-02-30T09:14:00Z`, and duplicate signal ID. Use the tests for the canonical assertions.

**Ask:** “Why reject the input instead of assigning a default?”

**Answer:** “A default can turn missing or malformed facts into a plausible-looking decision record. Rejecting makes the boundary explicit.”

**Checkpoint exit condition:** the validation test passes and each malformed example is rejected.

## 23–30 minutes — Checkpoint 3: calculate an advisory estimate (slides 11–12)

**On screen:** `estimateRiskLocally` and `SEVERITY_BASE`.

**Say:**  
“This is a deterministic teaching heuristic, not a trained model, calibrated probability, or authorization. It starts from a severity base, adds a bounded contribution from asset criticality and supporting signals, subtracts a bounded contribution from contradicting signals, and clamps the result to zero through one hundred. We record the version as `local-heuristic-v1`.”

Show the implementation rather than substituting a separate score calculator.

**Ask:** “What should a high score do when the required evidence is missing?”

**Answer:** “It should remain advisory. The application policy—not the score alone—selects the triage priority.”

**Checkpoint exit condition:** the high-score fixture remains `analyst-review`.

## 30–39 minutes — Checkpoint 4: use Signal's evidence API (slides 13–14)

**On screen:** `evaluateAlert`, the `DecisionEvidence` mapping, and the import of `assessDecisionEvidence` from `@signal/decision/core`.

**Say:**  
“Each signal becomes evidence with direction, source, observation time, quality, reliability, freshness, independence, and traceability. The assessment also records knowns, unknowns, assumptions, contradictions, desired confidence, importance, and a reasoning summary. The heuristic score is represented as neutral evidence; it does not support the threat claim merely because the number is high.”

**Show:** the evidence IDs and the assessment journal.

**Say:**  
“Signal describes the evidence and its limits. The application still owns its domain-specific policy. We should not confuse an evidence assessment with an authorization to act.”

**Checkpoint exit condition:** the model estimate has neutral direction and journal references correspond to the evidence IDs.

## 39–50 minutes — Checkpoint 5: make policy explicit (slides 15–18)

**On screen:** `TRIAGE_RULES`, `meetsStrongEvidenceThresholds`, `canEscalate`, `canMonitor`, and `buildRationale`.

**Say:**  
“Escalation requires critical severity, at least two distinct source labels whose supporting evidence passes every configured threshold, and no contradictory signal. The five dimensions are quality at least 70, reliability at least 70, freshness at least 60, independence at least 70, and traceability at least 60. A single failed dimension means that signal does not qualify as strong supporting evidence.”

**Demonstrate:** the duplicate-source regression test, a weak signal, and contradictory evidence. Then show the parameterized regression test that lowers each of the five dimensions individually and expects escalation to be withheld.

**Say:**  
“Two indicators with the same source label are not two sources. Also, a label and an independence score are claims in supplied data—not proof of real-world organizational or technical independence. A contradiction blocks escalation even if the remaining evidence otherwise meets the source-count requirement.”

**Checkpoint exit condition:** duplicate labels do not count twice; each degraded evidence dimension withholds escalation; contradictions block escalation; a high heuristic score alone cannot escalate.

## 50–58 minutes — Checkpoint 6: create the reviewable record (slide 19)

**On screen:** `createDecisionRecord`, `createAccountabilityReport`, `attachAccountability`, and `createExampleStore`.

**Say:**  
“The policy selects the triage priority. Signal's coherence assessment is included in the record for comparison and replay, but `coherence.actionAllowed` does not choose the security priority in this example. The accountability report records that no response action was taken.”

Inspect the evidence journal, `humanSummary`, rationale, and accountability fields.

**Say:**  
“The store is in memory and process-local. It is not durable, immutable, tamper-proof, or a verified audit chain. We should describe the implementation we have—not the one we might build later.”

**Checkpoint exit condition:** journal references match the captured evidence IDs, the summary matches the rationale, and `accountability.actionTaken` is false.

## 58–66 minutes — Checkpoint 7: replay captured inputs (slides 20–22)

**On screen:** `replayCapturedDecision` and the replay tests.

**Say:**  
“Replay re-evaluates the captured alert and timestamp, compares defined application fields such as priority and estimator score, and calls Signal's `replayDecision` to compare coherence assessments. This is a bounded comparison of selected fields. It does not replay external side effects, verify a runtime audit history, or prove tamper resistance.”

Run the deterministic replay test and point out the fields compared.

**Checkpoint exit condition:** unchanged captured inputs yield the expected same-result comparison in the test.

## 66–72 minutes — Checkpoint 8: review a later outcome (slides 23–24)

**On screen:** `reviewLaterOutcome`, `reviewDecisionOutcome`, and the outcome-separation test.

**Say:**  
“An outcome is new knowledge. We record it as a separate review rather than rewriting the original decision-time snapshot. The review does not silently train the heuristic, change the original decision, or update the replay inputs.”

Show that a mismatched decision ID is rejected and that the original record remains unchanged.

**Checkpoint exit condition:** the outcome review is separate and non-mutating.

## 72–84 minutes — Independent challenge: test-first policy change (slides 25–26)

**On screen:** `test/triage.test.ts` and the policy constant in `src/index.ts`.

**Say:**  
“Now we will change the real application, not a disconnected companion. Our proposed policy requires three qualified source labels instead of two. First, we write the expected behavior as a test. Then we run it and observe the failure under the existing policy. Only then do we change the rule.”

Follow the full sequence in `COURSE_LAB.md`:
1. Add the stricter-policy test before changing implementation.
2. Run the focused suite and capture the actual failure.
3. Change the threshold from two to three.
4. Re-run tests and inspect the existing two-source fixture contract conflict.
5. Resolve the conflict intentionally by either adding a genuinely distinct third qualified synthetic source and updating expectations, or reverting the policy after demonstrating its impact.
6. Run build, test, and typecheck after the final fixture/policy choice.

**Say:**  
“A failing test is information. We do not delete a meaningful existing assertion merely to get a green run. We decide which behavior the example is meant to teach, update the contract deliberately, and verify the entire suite.”

Do not claim this optional challenge passed unless the commands were actually run after the final policy choice.

## 84–90 minutes — Close: what this example proves, and what it does not (slide 27)

**Say:**  
“We have made a small decision process explicit: validate input, assess evidence, apply a separate policy, record the result, replay selected fields, and review later outcomes. The tests express executable expectations, including the rule that a high heuristic score cannot substitute for evidence.

“This is still a teaching example. Its fixtures and thresholds are synthetic. The estimator is not calibrated. Source independence is not independently verified. Storage is volatile. There is no provider integration or automated response. A real deployment would need domain validation, security and privacy review, access control, durable storage, monitoring, failure handling, calibration, and an operationally approved policy.

“The principle is: evidence before action, policy before automation, and tests before trust. Start from the README, inspect the real source, run the tests, and make one explicit contract change at a time.”

## Recording checklist

- [ ] Pin and state the exact Git commit.
- [ ] Verify the clean install, build, tests, typecheck, and fixture run; save actual output.
- [ ] Match slide numbers and claims to the 27-slide deck.
- [ ] Demonstrate the 94/100 case remaining `analyst-review`.
- [ ] Demonstrate duplicate source labels, contradictions, and all five evidence-dimension regressions.
- [ ] Distinguish Signal assessment from application policy.
- [ ] State that source-label independence is not independently verified.
- [ ] State that replay compares selected fields and is not proof of tamper resistance.
- [ ] State that storage is in-memory and volatile.
- [ ] If demonstrating the stricter policy challenge, run all checks after resolving the fixture/policy conflict.
- [ ] Never describe an unexecuted command as passing or this example as production-ready.
