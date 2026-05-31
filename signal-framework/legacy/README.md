# Signal Legacy

Legacy turns temporary outcomes into permanent accomplishments.

It is a pure, domain-neutral module for progression history: achievements, badges, milestones, campaign completions, unlocks, reputation, operator titles, prestige eligibility, and victory detection. It does not make trading, execution, sizing, governance, market, routing, logistics, payments, weather, or agent decisions.

## Architectural Position

Legacy sits after Recovery and before Identity:

```txt
Discovery -> Recognition -> Belief -> Judgement -> Agency -> Resolve -> Recovery -> Legacy -> Identity
```

Recovery answers whether authority has been restored. Legacy records what was earned. Identity presents the Legacy result.

Identity should consume `legacy.title`, `legacy.reputation`, and durable history from `legacy.history`. It should not calculate titles, achievements, or accomplishments directly.

## Lifecycle

1. Normalize scores, counters, flags, prior history, and replayed events.
2. Calculate reputation from configurable weighted dimensions.
3. Evaluate rule-driven campaigns, achievements, badges, milestones, unlocks, prestige, titles, and victories.
4. Emit only new events with stable idempotency keys.
5. Return a complete output snapshot plus append-only `history`.

```ts
import { evaluateLegacy } from "./signal-framework";

const legacy = evaluateLegacy({
  scores: {
    trust: 88,
    recovery: 86,
    governance: 84,
    survival: 90,
    agency: 87,
    wisdom: 83,
  },
  counters: {
    cleanOutcomeCount: 3,
  },
  flags: {
    normalSizingRestored: true,
    governanceApproved: true,
  },
});

console.log(legacy.title.name);
console.log(legacy.reputation.rank);
console.log(legacy.history.achievements);
```

## Reputation Model

Default reputation inputs are:

- Trust
- Recovery
- Governance
- Survival
- Agency
- Wisdom

Default thresholds:

| Score | Rank |
| --- | --- |
| 0-19 | Unknown |
| 20-39 | Trainee |
| 40-59 | Operator |
| 60-79 | Commander |
| 80-100 | Institutional |

Weights and thresholds are configurable through `config.reputationWeights` and `config.reputationThresholds`. When custom weights are supplied, they replace the defaults.

## Achievement Model

Achievements are rule driven:

```ts
{
  id: "two-completions",
  name: "Two Completions",
  description: "Two durable completions were recorded.",
  rarity: "common",
  category: "custom",
  condition: { kind: "counter", counter: "completions", operator: ">=", value: 2 },
}
```

Supported condition kinds include score, counter, flag, achievement, campaign, event, reputation, rank, all, any, and not. A rule may also provide a deterministic `evaluate(context)` predicate.

Default achievements include First Clean Outcome, Three Clean Outcomes, Recovery Complete, Governance Approved, Trust Architect, Discovery Master, Wisdom Keeper, and Institutional Operator.

## Campaign Framework

Campaigns have start, complete, and optional fail conditions:

```ts
{
  id: "recovery-program",
  name: "Recovery Program",
  startCondition: { kind: "score", metric: "recovery", operator: ">", value: 0 },
  completeCondition: { kind: "score", metric: "recovery", operator: ">=", value: 80 },
}
```

Completed campaigns are permanent. Replaying old events or evaluating a lower score later will not delete completion history.

## Prestige Framework

Default prestige eligibility requires:

- Trust >= 80
- Recovery >= 80
- Governance >= 80
- Wisdom >= 80
- Agency >= 80

Prestige does not reset history. It adds a prestige level, prestige badges, and prestige titles. Level is derived from the minimum requirement score: 80+ is level 1, 90+ is level 2, and 96+ is level 3.

## Event Catalog

Legacy emits replay-safe events:

- `legacy.achievement.unlocked`
- `legacy.badge.earned`
- `legacy.milestone.reached`
- `legacy.unlock.granted`
- `legacy.title.changed`
- `legacy.reputation.updated`
- `legacy.campaign.completed`
- `legacy.prestige.unlocked`
- `legacy.victory.detected`

Every event includes:

```ts
{
  type,
  timestamp,
  idempotencyKey,
  payload,
}
```

Idempotency keys are stable by event type and entity id. `replayLegacyEvents(events, history)` applies each key once.

## Persistence

Use `LegacyMemoryStore` for in-process persistence, or persist `legacy.history` in an application-owned store:

```ts
const output = evaluateLegacy({ history: storedHistory, scores });
await save(output.history);
```

Signal does not own the database. Applications own durable storage and pass history back into Legacy.

## Migration Guide

1. Stop deriving operator titles in Identity or UI code.
2. Map existing recovery, trust, governance, survival, agency, and wisdom values into `LegacyInput.scores`.
3. Map existing proof counts into `LegacyInput.counters`.
4. Map irreversible facts into `LegacyInput.flags`.
5. Persist `legacy.history`.
6. Render Identity from `legacy.title`, `legacy.reputation`, `legacy.achievements`, `legacy.badges`, `legacy.campaigns`, `legacy.milestones`, `legacy.unlocks`, and `legacy.prestige`.
