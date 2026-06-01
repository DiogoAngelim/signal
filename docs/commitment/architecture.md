# Commitment Architecture

## Module

Implementation package: `@signal/commitment`

Main entry points:

- `evaluateCommitment(input)`
- `resolveCommitmentPolicy(policy)`
- `listCommitmentOperations()`
- `registerCommitmentOperations(registry)`

Protocol operation:

- `commitment.evaluate.v1`

Compatibility re-export:

- `signal/modules/commitment/index.ts`

## Evaluation Flow

1. Normalize decisions.
2. Resolve policy.
3. Normalize global constraints.
4. Block on critical hard global constraints.
5. Score each decision:
   - confidence
   - user trust
   - system confidence
   - historical reliability
   - combined trust
   - risk
   - expected utility
   - quality
6. Exclude targets that fail target hard constraints or policy gates.
7. Resolve resource basis.
8. Run the selected strategy.
9. Compute total abstract commitment.
10. Apply requested, maximum, minimum, global, and target caps.
11. Return recommendations, reasons, limiters, invalidation, monitoring, and audit data.

## Policies

Built-in policies:

- `conservative`
- `balanced`
- `aggressive`
- `exploratory`
- `preservation`
- `compounding`
- `custom`

Policies configure:

- minimum confidence
- minimum trust
- total commitment cap
- per-target cap
- risk tolerance
- commitment multiplier
- minimum viable commitment
- fallback strategy
- constraint reduction factors
- invalidation tolerance
- monitoring sensitivity
- `sharpe_like` objective settings

## Strategies

`equal_weight`

Assigns equal share to each eligible decision.

`confidence_weighted`

Weights targets by confidence and trust.

`risk_adjusted`

Weights targets by quality: confidence, trust, risk tolerance, and expected utility.

`sharpe_like`

Generalizes Risk Divider's Sharpe optimization. It optimizes generic outcome series by reward relative to variability using deterministic seeded search. It supports composite, reward-to-variability, downside-adjusted, drawdown-adjusted, and return objectives.

`constraint_first`

Weights targets by quality while preferring targets with available cap room.

## Determinism

Risk Divider used `Math.random()` in its optimizer. Signal replaces this with a seeded Mulberry32 generator derived from input, policy, version, or caller seed. No runtime clock is used. Invalid or missing `now` resolves to `1970-01-01T00:00:00.000Z`.

## Result Shape

Every `CommitmentResult` contains:

- `status`
- `mode`
- `policy`
- `strategy`
- `totalRecommended`
- `normalizedCommitment`
- per-target recommendations
- reasons
- limiters
- invalidation
- monitoring plan
- audit

The output remains abstract. `amount: 100` means 100 units of caller-supplied resource, not dollars, shares, hours, or positions.

## Invalidation

Invalidation includes:

- confidence deterioration
- trust deterioration
- risk increase
- evidence deterioration
- policy violations
- resource violations

A result without invalidation is incomplete.

## Monitoring

Monitoring includes:

- metrics and thresholds
- signals to watch
- events to emit or consume later
- future checks

This gives future Signal learning systems a stable surface without coupling the commitment module to storage or background jobs.
