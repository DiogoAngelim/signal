# Signal Framework

Signal is a domain-neutral framework for turning observed state into governed action.

For the compact system map, see [Signal Framework Architecture](./ARCHITECTURE.md).

The first-class lifecycle is:

```txt
Perception -> Reflection -> Calibration -> Decision -> Pruning -> Purpose -> Agency -> Action
```

Each layer has a separate responsibility:

- Perception: what is happening?
- Reflection: how trustworthy is my understanding?
- Calibration: how much of the current confidence is supported by past evidence?
- Decision: what should happen?
- Pruning: what evidence should be kept, reduced, isolated, quarantined, ignored, or reviewed?
- Purpose: is this decision aligned with the human's desired future and sustainable behavior?
- Agency: should the decision be allowed to proceed?
- Action: execute the approved intent.
- Legacy: what durable accomplishments were earned?

Reflection increases self-awareness. Calibration turns raw confidence into evidence-backed confidence. Pruning improves what the system chooses to ignore. Agency increases autonomy. These layers do not contain application-specific logic.

## Reflection

Reflection evaluates understanding before a decision is committed. It does not decide what is best, does not approve execution, and does not execute anything.

Use `reflect(input)` to inspect:

- historical predictions, decisions, and outcomes
- confidence calibration against observed correctness
- nearest historical states and outcome distributions
- agreement or contradiction across perception layers
- missing, stale, unknown, or low-quality inputs
- counterfactual candidate evaluations

```ts
import { reflect } from "./signal-framework";

const reflection = reflect({
  predictions: [
    { id: "p1", confidence: 80, expectedOutcome: "accepted" },
  ],
  outcomes: [
    { predictionId: "p1", label: "accepted" },
  ],
  currentState: { load: 42, mode: "steady" },
  history: [
    {
      id: "prior-1",
      state: { load: 40, mode: "steady" },
      outcome: { label: "accepted" },
    },
  ],
  perceptionLayers: {
    information: 82,
    quality: 78,
    stability: 80,
  },
  inputs: [
    { key: "source-a", value: "present", quality: 95 },
  ],
  requiredInputs: ["source-a"],
  candidateDecisions: [
    { id: "continue", confidence: 76, expectedUtility: 20 },
    { id: "pause", confidence: 62, expectedUtility: 8, uncertainty: 30 },
  ],
});

console.log(reflection.reflectionScore);
console.log(reflection.recommendedConfidenceCap);
```

The result is auditable. Component scores, weights, formulas, reasons, known unknowns, and normalized sub-results are returned alongside `reflectionScore`.

## Calibration

Calibration compares prior beliefs with outcomes so later confidence is earned, not merely asserted. It is generic: predictions, outcomes, metadata, and labels can come from any domain.

Use `calibrate(input)` or `calibrateConfidence(input)` to inspect:

- historical accuracy
- calibration error
- Brier score when outcomes can be interpreted as binary
- 0-10, 10-20, ..., 90-100 reliability buckets
- calibrated confidence
- trustworthiness
- warnings such as insufficient history, poor calibration, overconfidence, unstable outcomes, or low trustworthiness

```ts
import { InMemoryCalibrationStore, calibrate } from "./signal-framework";

const store = new InMemoryCalibrationStore();

await store.record({
  id: "prior-routing-1",
  timestamp: "2026-01-01T12:00:00.000Z",
  prediction: { expectedOutcome: "accepted" },
  confidence: 82,
  outcome: { label: "accepted" },
  metadata: { workflow: "document-routing" },
});

const calibration = calibrate({
  current: {
    prediction: { expectedOutcome: "accepted" },
    confidence: 90,
  },
  history: await store.list({ metadata: { workflow: "document-routing" } }),
});

console.log(calibration.rawConfidence);
console.log(calibration.calibratedConfidence);
console.log(calibration.trustworthiness);
```

History stores are available for in-process and file-backed memory:

```ts
import {
  FileSystemCalibrationStore,
  InMemoryCalibrationStore,
} from "./signal-framework";

const volatileHistory = new InMemoryCalibrationStore();
const durableHistory = new FileSystemCalibrationStore("./signal-history.json");
```

Calibration never inflates confidence when evidence is thin. If history is insufficient, the result says so explicitly instead of pretending certainty exists.

## Decision

Decision remains the layer that chooses an intent. It may use perception, reflection, and calibration output, but it must not execute the intent. A decision result should be treated as a proposal until Agency authorizes it.

Generic examples:

- A document workflow decides to route a file for review.
- A support workflow decides to ask for more information.
- A device-control workflow decides to reduce an actuator setting.
- A release workflow decides to continue a staged rollout.

## Agency

Agency evaluates whether a supplied decision may proceed. It does not generate a better decision and does not execute the decision.

Use `authorize(input)` or its alias `commit(input)` to evaluate:

- authority level
- generic constraints
- human-review policy
- uncertainty thresholds
- reflection quality
- calibrated decision confidence
- execution readiness

```ts
import { authorize } from "./signal-framework";

const agency = authorize({
  decision: {
    id: "decision-1",
    type: "route-item",
    confidence: 82,
    uncertainty: 18,
    impact: 30,
  },
  reflection: {
    reflectionScore: reflection.reflectionScore,
    recommendedConfidenceCap: reflection.recommendedConfidenceCap,
  },
  calibration,
  authority: { level: "operator" },
  requiredAuthority: "observer",
  constraints: [
    { id: "rate", type: "rate-limit", value: 4, limit: 10 },
    { id: "quality", type: "quality-requirement", value: 90, limit: 70 },
  ],
  reviewPolicy: { mode: "review-when-uncertainty-high", uncertaintyThreshold: 60 },
  execution: { readiness: 90 },
});

console.log(agency.status);
console.log(agency.agencyScore);
console.log(agency.calibratedConfidence);
```

Possible statuses include `approved`, `denied`, `deferred`, `escalated`, `requires-review`, `limited`, and `rollback`. Custom statuses are supported.

The result is auditable. It includes raw confidence, calibrated confidence, trustworthiness, calibration warnings, authority evaluation, constraint evaluation, review requirements, status-resolution notes, reasons, component scores, weights, and thresholds.

## Pruning

Pruning is Signal's generic restraint layer. It improves ignorance effectiveness:
signals, rules, metrics, explanations, and recommendation contributors that
should be ignored are ignored precisely, while useful and survival-critical
evidence is preserved.

Use `evaluatePruning(input)` to inspect candidates:

```ts
import { evaluatePruning } from "./signal-framework";

const pruning = evaluatePruning({
  candidates: [
    {
      candidateId: "source-a",
      candidateType: "raw-signal",
      sourceModule: "recognition",
      historicalUtility: 18,
      predictiveContribution: 12,
      decisionContribution: 10,
      noiseScore: 88,
      overfitRisk: 72,
      evidenceQuality: 80,
      sampleSize: 64,
      survivalValue: 20,
    },
  ],
});

console.log(pruning.recommendedAction);
console.log(pruning.ignoredSignals);
console.log(pruning.trace);
```

Pruning outputs `pruningScore`, `ignoranceEffectivenessScore`, action scores,
penalties, `evidenceConfidence`, warnings, missing inputs, degraded-mode status,
trace data, contributing factors, and opposing factors. Allowed actions are
`keep`, `reduce`, `isolate`, `quarantine`, `ignore`, and `review`.

Safety rules:

- Useful but redundant evidence is reduced and preserved as backup evidence.
- Noisy low-utility evidence is ignored only when evidence is adequate.
- Overfit evidence is quarantined until cross-regime validation improves trust.
- Weak evidence cannot increase confidence.
- Survival-critical evidence is kept unless evidence against it is extremely strong.
- Frontend-confusing evidence can be hidden from primary views without deleting it.

See [Signal Pruning](./pruning/README.md) for the scoring model, storage
interfaces, integration notes, and examples.

## Purpose

Purpose is Signal's generic human alignment layer. It consumes one required
input, `ambition`, then derives the rest of the profile automatically. Ambition
means desired future intensity, not risk tolerance.

Use `evaluatePurpose(input)` to inspect whether a path is helping the user move
toward the future they want in a way they can sustain:

```ts
import { evaluatePurpose } from "./signal-framework";

const purpose = evaluatePurpose({
  ambition: 72,
  currentPath: { progress: 68, survivability: 82 },
  behavior: [{ discipline: 70, patience: 64, stressTolerance: 62 }],
});

console.log(purpose.purposeStatement);
console.log(purpose.satisfactionScore);
console.log(purpose.alignmentTrustScore);
```

Purpose outputs `purposeScore`, `alignmentScore`, `satisfactionScore`,
`retentionScore`, `advocacyScore`, `goalProgressScore`,
`alignmentTrustScore`, `behavioralAmbition`, `purposeStatement`,
`purposeConfidence`, warnings, explanation, and trace data. It can lower
priority when high expected return is poorly aligned with the user, and it never
overrides survival.

See [Signal Purpose](./purpose/README.md) for the model and integration notes.

## Action

Action is the only layer that executes. It should consume an approved Agency result and the original decision intent. The framework keeps Agency separate from Action so execution can be replaced, simulated, reviewed, retried, or rolled back without changing decision logic.

## Legacy

Legacy records permanent operator progression after recovery and before identity presentation. It calculates reputation, selects operator titles, unlocks achievements and badges, tracks campaign completions, stores milestones and unlock history, and detects prestige eligibility.

Use `evaluateLegacy(input)` with domain-neutral scores, counters, flags, prior history, and optional custom rules. Identity surfaces should consume `legacy.title` and `legacy.history` rather than deriving accomplishments directly.

See [Signal Legacy](./legacy/README.md) for the lifecycle, rule model, event catalog, persistence pattern, and migration guide.

## Generic Usage Examples

Document processing:

- Perception reads file metadata and extraction quality.
- Reflection checks prior extraction accuracy, stale inputs, and layer agreement.
- Calibration adjusts confidence based on similar file outcomes.
- Decision proposes routing the file to review or auto-classification.
- Agency verifies authority, review policy, and quality constraints.
- Action routes the file only if Agency approves.

Support routing:

- Perception observes message urgency, completeness, and confidence.
- Reflection checks whether similar cases were handled correctly.
- Calibration checks whether past urgency confidence matched outcomes.
- Decision proposes reply, escalation, or request-for-info.
- Agency checks operator authority and review thresholds.
- Action sends or queues the approved intent.

Device automation:

- Perception observes sensor values and stability.
- Reflection checks freshness, missing readings, and historical outcomes.
- Calibration tempers confidence when past sensor predictions were unreliable.
- Decision proposes a setting change.
- Agency checks resource, timing, and safety constraints.
- Action applies the setting only after approval.

Release governance:

- Perception observes test results, rollout state, and incident signals.
- Reflection evaluates completeness, consistency, and prior rollout outcomes.
- Calibration compares prior rollout confidence with realized outcomes.
- Decision proposes continue, pause, or rollback.
- Agency checks authority, rate limits, human-review rules, and readiness.
- Action changes rollout state only when authorized.

These examples are intentionally generic. Application adapters may translate local data into Signal inputs, but Reflection, Calibration, and Agency remain reusable framework capabilities.
