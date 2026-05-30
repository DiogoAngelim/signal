# @signal/agency

`@signal/agency` is Signal's generic agency layer. It turns decisions into traceable, measurable, learnable, and auditable cycles without embedding application vocabulary in the framework.

The package is intentionally small and deterministic. It does not call external services, infer hidden intent, or require persistent storage. Applications provide their own perception, intelligence, decisions, actions, and outcomes; Signal records the causal chain and evaluates whether the system should trust itself right now.

## Lifecycle

```txt
Perception
→ Intelligence
→ Decision
→ Sizing
→ Policy
→ Action
→ Outcome
→ Learning
→ Self-Diagnosis
```

Every cycle produces an `AgencyTrace`:

```ts
{
  traceId: string;
  timestamp: string;
  perception?: unknown;
  intelligence?: unknown;
  decision: AgencyDecision;
  sizing?: AgencySizing;
  policy: PolicyResult;
  action?: AgencyAction;
  outcome?: OutcomeResult;
  learning?: LearningResult;
  selfDiagnosis: SelfDiagnosisResult;
}
```

The trace preserves the full causal chain:

```txt
perception → intelligence → decision → sizing → policy → action → outcome
```

Learning and self-diagnosis are derived from that chain and from prior traces.

## Public API

```ts
import {
  createAgencyPipeline,
  evaluateAgencyState,
  runAgencyCycle,
} from "@signal/agency";
```

### `createAgencyPipeline(config)`

Creates a reusable pipeline with memory.

```ts
const pipeline = createAgencyPipeline({
  policy: {
    minimumConfidence: 0.7,
    maximumSize: 5,
    humanApprovalRequired: false,
  },
});

const trace = pipeline.runAgencyCycle({
  perception: { sourceReliability: 0.95 },
  intelligence: { evidenceStrength: 0.82 },
  decision: {
    kind: "prepare_response",
    confidence: 0.81,
    rationale: "Evidence is consistent and recent.",
  },
  sizing: {
    size: 2,
    unit: "steps",
    rationale: "The action is useful but still reversible.",
  },
  action: {
    kind: "send_response",
  },
  outcome: {
    success: true,
    reward: 1,
    durationMs: 120,
  },
});

console.log(trace.policy.allowed);
console.log(trace.selfDiagnosis.trust);
```

### `runAgencyCycle(input, config?)`

Runs a single cycle with a fresh in-memory pipeline.

```ts
const trace = runAgencyCycle({
  decision: {
    kind: "collect_context",
    confidence: 0.55,
    rationale: "The current evidence is incomplete.",
  },
});

console.log(trace.outcome?.outcomeLabel); // "unknown"
```

### `evaluateAgencyState(history, config?)`

Evaluates historical traces without running a new action.

```ts
const state = evaluateAgencyState(pipeline.memory.list());

console.log(state.calibration.reliability);
console.log(state.learning.learnedPatterns);
console.log(state.selfDiagnosis.recommendation);
```

## Modules

### Policy

Policy decides whether a requested action is allowed. It supports:

- minimum confidence
- maximum size
- human approval requirements
- explicit block reasons
- reduced-size recommendations

```ts
const policy = evaluatePolicy({
  decision: { kind: "send_response", confidence: 0.62 },
  sizing: { size: 10 },
  config: { minimumConfidence: 0.7, maximumSize: 3 },
});

console.log(policy);
// {
//   allowed: false,
//   maxSize: 3,
//   recommendedSize: 3,
//   requiresApproval: false,
//   reason: "Policy blocked action: confidence_below_minimum, size_above_maximum.",
//   violations: ["confidence_below_minimum", "size_above_maximum"]
// }
```

Policy blocks the requested action when it violates a rule. If the only issue is size, `recommendedSize` tells the application the largest permitted size. The application can submit a new cycle using that reduced size.

### Outcome

Outcome normalizes measurable results after a decision or action.

```ts
const outcome = resolveOutcome({
  success: null,
  reward: 2,
  loss: 1,
  durationMs: 300,
});

console.log(outcome.outcomeLabel); // "positive"
```

Missing outcomes remain explicit:

```ts
resolveOutcome();
// { success: null, outcomeLabel: "unknown" }
```

### Memory

The first memory implementation is in-memory:

```ts
const memory = createInMemoryAgencyMemory();
memory.append(trace);

const chain = memory.causalChain(trace.traceId);
```

The interface is storage-neutral:

```ts
type AgencyMemoryStore = {
  append(trace: AgencyTrace): AgencyTrace;
  list(): AgencyTrace[];
  get(traceId: string): AgencyTrace | undefined;
  causalChain(traceId: string): AgencyCausalChain | undefined;
  clear(): void;
};
```

A later database-backed store can implement the same interface without changing pipeline callers.

### Calibration

Calibration compares predicted confidence with actual outcomes.

```ts
const calibration = calibrateConfidence(history);

console.log(calibration);
// {
//   calibratedConfidence: number,
//   calibrationError: number,
//   reliability: "overconfident" | "underconfident" | "aligned" | "insufficient_data",
//   sampleSize: number
// }
```

### Learning

Learning turns trace history into reusable lessons. It identifies:

- high-confidence decisions with poor outcomes
- decisions blocked by policy
- repeated successful decision kinds
- missing outcome data

```ts
const learning = learnFromTraces(history, calibration);

console.log(learning.learnedPatterns);
console.log(learning.confidenceAdjustment);
console.log(learning.policySuggestions);
```

### Self-Diagnosis

Self-diagnosis answers:

> How much should Signal trust itself right now?

It evaluates:

- data reliability
- calibration health
- overfit risk
- missing outcomes
- recent success rate
- policy violations

```ts
const diagnosis = diagnoseAgencyState({
  history,
  calibration,
  learning,
});

console.log(diagnosis.trust);
console.log(diagnosis.recommendation);
```

Recommendations are:

```ts
"act" | "act_with_reduced_size" | "wait" | "requires_human_review"
```

## Passing Domain Decisions Into Generic Types

Applications should translate domain-specific objects at their boundary and keep the agency layer generic.

```ts
import type { AgencyAction, AgencyDecision, OutcomeInput } from "@signal/agency";

type AppReview = {
  id: string;
  evidenceScore: number;
  summary: string;
};

const review: AppReview = {
  id: "review-123",
  evidenceScore: 0.84,
  summary: "The evidence is fresh and internally consistent.",
};

const decision: AgencyDecision = {
  decisionId: review.id,
  kind: "publish_summary",
  confidence: review.evidenceScore,
  rationale: review.summary,
  metadata: {
    source: "app-adapter",
  },
};

const action: AgencyAction = {
  kind: "publish_summary",
  payload: {
    reviewId: review.id,
  },
};

const outcome: OutcomeInput = {
  success: true,
  reward: 1,
  durationMs: 80,
};
```

The framework does not inspect `kind` beyond deterministic grouping for learning. Domain meaning belongs in the application adapter.

## Deterministic Testing

For repeatable tests, inject a clock and trace id generator:

```ts
const pipeline = createAgencyPipeline({
  clock: () => new Date("2026-01-01T00:00:00.000Z"),
  idGenerator: (_input, sequence) => `trace-${sequence}`,
});
```

## Safety Defaults

- Actions are omitted from traces when policy blocks the cycle.
- Missing outcomes are represented as `{ success: null, outcomeLabel: "unknown" }`.
- Human approval requirements block action unless `approvalGranted` is set for the cycle.
- Calibration reports `insufficient_data` until enough completed outcomes are available.
- Self-diagnosis reduces trust when outcomes are missing, policy violations recur, or confidence is poorly calibrated.
