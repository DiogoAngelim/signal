# Discovery Intelligence

Discovery Intelligence is the highest learning layer in Signal. It is generic framework code: callers provide discoveries, decisions, outcomes, restrictions, and traces from any domain, and the module measures whether discovery behavior is creating durable value.

## Architecture

Pipeline position:

```text
Discovery -> Recognition -> Judgement -> Agency -> Resolve -> Wisdom -> Survival -> Discovery Intelligence -> Output
```

The engine evaluates five reusable dimensions:

- Discovery lifecycle maturity: stage distribution, promotion, abandonment, false discoveries, novelty conversion, trust conversion, and institutional conversion.
- Opportunity economics: ACT, WAIT, REJECT, and RESTRICT values plus avoided loss, missed upside, and net opportunity cost.
- Governance effectiveness: every restriction is audited as `avoided loss - missed upside`.
- Institutional knowledge: conversion from discovery into knowledge, policy, standard, and institutional assets.
- Meta-learning: calibration, trust, survival, decision quality, and governance trends over traces and outcomes.

## Public API

```ts
import { evaluateDiscoveryIntelligence } from "./discovery-intelligence/engine";

const result = evaluateDiscoveryIntelligence({
  discoveries,
  decisions,
  outcomes,
  restrictions,
  traces,
});
```

`evaluateDiscoveryIntelligence` returns:

- `score`
- `maturity`
- `economics`
- `governance`
- `institutionalization`
- `metaLearning`
- `recommendations`

The compatibility module path is also available at `signal/modules/discovery-intelligence`.

## Design Guarantees

- No trading-specific, weather-specific, logistics-specific, healthcare-specific, or fraud-specific assumptions live in the engine.
- Economic comparison always evaluates ACT, WAIT, REJECT, and RESTRICT.
- Restriction effectiveness is always `avoidedLoss - missedUpside`.
- Empty input returns score `0` with a data-collection recommendation rather than inventing confidence.
- Trends can be positive or negative; only final scores are bounded to `0..100`.
