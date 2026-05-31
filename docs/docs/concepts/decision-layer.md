# Decision Layer

Signal remains protocol-first: versioned queries, mutations, events, idempotency, runtime execution, transport bindings, and replay safety are still the foundation. The decision layer is an additive package for systems that need to decide whether, how much, and why to act.

```text
Signal protocol/runtime
  -> explicit operations
  -> transport-independent dispatch
  -> replay-safe events
  -> pluggable storage

Signal decision layer
  -> coherence
  -> prediction
  -> simulation
  -> wisdom
  -> accountability
  -> outcomes
  -> memory and replay
```

The package is `@signal/decision`. It is generic and does not know about markets, trading, weather, logistics, or any other domain. Downstream applications translate their own evidence into module scores and context.

## Pipeline

```text
Observation
-> Discovery
-> Judgment
-> Purpose
-> Need
-> Coherence
-> Prediction
-> Simulation
-> Wisdom
-> Agency
-> Action
-> Outcome
-> Learning
-> Calibration
-> Accountability
-> Memory
```

Coherence, simulation, and wisdom can block or reduce agency. No module is allowed to dominate by itself.

## Coherence

Coherence asks whether the system agrees enough to act.

It compares Discovery, Judgment, Purpose, Need, Trust, Reflection, Recovery, Memory, Learning, Calibration, Identity, Awareness, and Agency. The default rules catch contradictions such as:

- high Discovery with low Trust
- high Agency with weak Purpose
- high Judgment or Trust with low Calibration
- low Recovery with high Agency
- weak Need or Identity with strong Agency

The output includes `coherenceScore`, `coherenceStatus`, `consensusLevel`, `actionAllowed`, `actionScale`, and adjustments to trust, agency, and confidence.

## Outcomes

Outcome Intelligence closes the loop with reality. It classifies results as success, failure, partial success, unexpected success, unexpected failure, or inconclusive.

An outcome updates:

- Trust
- Calibration
- Memory
- Learning
- Recovery
- Judgment
- Coherence

Short-term, medium-term, and long-term outcomes can be recorded against the same decision.

## Prediction

Prediction evaluates possible futures without assuming a domain. A caller can provide labels such as "conditions improve" or "liquidity drops"; the layer returns scenarios with probability, reward, risk, downside, uncertainty, purpose alignment, need alignment, assumptions, and warning signs.

## Simulation

Simulation compares paths instead of scoring one path in isolation:

- act normally
- act smaller
- wait
- block action

The result includes expected, best-case, worst-case, survival, and regret scores, then recommends `act`, `reduce`, `wait`, `block`, or `escalate`.

## Wisdom

Wisdom protects survival. Its core rule is:

```text
Long-term survival outranks short-term opportunity.
```

High upside with catastrophic downside becomes `avoid` or `proceed-small`. Low confidence with high irreversibility becomes `avoid`.

## Decision Records

Every meaningful decision can produce a `SignalDecisionRecord` with observation, module evidence, coherence, prediction, simulation, wisdom, agency, action, outcome, accountability, and a human summary.

Records support:

- storage
- retrieval
- replay with original data
- replay with current knowledge
- audit and accountability reports

## API Operations

The decision package exposes protocol-style operation definitions:

```text
decision.evaluate.v1
decision.replay.v1
decision.outcome.record.v1
decision.accountability.get.v1
decision.scenarios.predict.v1
decision.simulate.v1

decision.evaluated.v1
decision.blocked.v1
decision.action_scaled.v1
decision.outcome_recorded.v1
decision.replayed.v1
```

These definitions are transport-independent. A runtime can register them directly, while an application can also expose them through HTTP routes.

## Stocks Optimizer Integration

The stocks optimizer translates market evidence into generic decision inputs, then consumes the generic output.

```text
Stocks Optimizer
  -> market data and strategy evidence
  -> generic Signal decision modules
  -> @signal/decision
  -> action permission, scale, explanation
  -> frontend guide and execution posture
```

The app exposes at least:

- `coherenceScore`
- `coherenceStatus`
- `consensusLevel`
- `predictionScenarios`
- `simulationRecommendation`
- `wisdomDecision`
- `outcomeAccuracy`
- `accountabilitySummary`
- `decisionReplayAvailable`
- `actionAllowed`
- `actionScale`

Those fields influence position size, maximum exposure, risk state, signal confidence, execution permission, portfolio posture, and human explanation.

## Frontend Language

The frontend should lead with a friendly guide, not raw module jargon:

```text
Step 1 - What is happening?
Step 2 - What matters?
Step 3 - What could happen next?
Step 4 - What did Signal test?
Step 5 - What should I do now?
Step 6 - Why?
Step 7 - What will Signal learn from this?
```

Detailed metrics stay available in expandable "Why" and "Evidence" sections.

## Example

```ts
import { evaluateDecision } from "@signal/decision";

const result = evaluateDecision({
  decisionId: "decision-123",
  observation: { candidate: "generic-action" },
  modules: {
    discovery: 82,
    judgment: 76,
    purpose: 72,
    need: 70,
    trust: 68,
    recovery: 78,
    calibration: 74,
    agency: 65,
  },
});

console.log(result.actionAllowed);
console.log(result.actionScale);
console.log(result.record.humanSummary);
```

## Replay Example

```ts
import {
  assessCoherence,
  createInMemoryDecisionRecordStore,
} from "@signal/decision";

const store = createInMemoryDecisionRecordStore([result.record]);
const current = assessCoherence({
  discovery: 90,
  trust: 35,
  agency: 82,
  purpose: 40,
  recovery: 32,
});

const replay = store.replay("decision-123", current);
console.log(replay?.replayResult);
```
