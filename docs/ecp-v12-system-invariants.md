# ECP v12 — Economic Control Plane: System Invariants

**Version**: 12.0
**Date**: 2026-06-14

---

## 1. SYSTEM OVERVIEW

The Economic Control Plane (ECP) transforms monetization from a static feature system into a **constrained economic control system** optimizing a multi-objective function over real user behavior.

### Closed Loop

```
telemetry → state estimation → objective optimization → pricing policy →
validation → deploy → compile UI → observe behavior → feed back into telemetry
```

### Files

| File | Role |
|------|------|
| `ecp-types.ts` | Type definitions: SystemState, ControlVariables, Constraints, PricingPolicy |
| `ecp-objective.ts` | Objective function: J = αR + βS + γF + δU |
| `ecp-engine.ts` | Optimization engine, constraint validator, policy simulation, versioning, state estimator, decision frame compiler |
| `ecp-control-loop.ts` | Full closed-loop orchestrator |
| `ecp-index.ts` | Public API barrel export |

---

## 2. ECONOMIC INVARIANTS

### INV-E1: Pricing Always Derived from Objective Function

**Rule**: No pricing value may be set manually. All prices must be the output of `optimizePricingPolicy()`.

**Enforcement**: The `EconomicControlLoop` class is the sole entry point for policy deployment. Direct `PricingPolicy` construction outside the optimizer is forbidden.

### INV-E2: Tiers Always Monotonic

**Rule**: Tier(n+1) ⊇ Tier(n). Every capability in a lower tier must be present in all higher tiers.

**Enforcement**: `validateConstraints()` checks tier monotonicity as a hard constraint. Violations block deployment.

### INV-E3: Pricing Stability Bound

**Rule**: |price(t) - price(t-1)| ≤ 0.2 × price(t-1). No price may change more than 20% between optimization cycles.

**Enforcement**: `validateConstraints()` checks pricing stability as a hard constraint.

### INV-E4: Churn Safety Bound

**Rule**: churnRate ≤ threshold_max. If churn exceeds the safety threshold, the optimization is rejected.

**Enforcement**: `validateConstraints()` checks churn safety. `simulatePolicy()` projects churn impact before deployment.

### INV-E5: Revenue Regression Protection

**Rule**: If revenuePerUser drops > ε after a policy deployment, the system automatically rolls back to the previous policy.

**Enforcement**: `EconomicControlLoop.executeCycle()` checks post-deploy revenue regression and triggers `rollbackTo()` if violated.

---

## 3. BEHAVIORAL INVARIANTS

### INV-B1: Revenue Increases Must Not Degrade Retention Beyond Threshold

**Rule**: Any policy that increases revenue but pushes churn above the safety threshold is rejected.

**Enforcement**: The optimizer's constraint validation layer enforces this before deployment.

### INV-B2: Conversion Improvements Must Not Increase Churn Disproportionately

**Rule**: If a policy's projected churnDelta > 0 and conversionDelta > 0, the ratio churnDelta/conversionDelta must be < 0.5.

**Enforcement**: `simulatePolicy()` projects both deltas. The control loop rejects policies where the ratio exceeds the bound.

### INV-B3: UX Friction Must Remain Bounded

**Rule**: upgradeLatency must not exceed 600 seconds (10 minutes).

**Enforcement**: The objective function's F component (upgrade fluidity) penalizes high latency. The optimizer naturally avoids policies that increase friction.

---

## 4. STRUCTURAL INVARIANTS

### INV-S1: System State Is Observable

**Rule**: Every component of SystemState can be reconstructed from telemetry signals.

**Enforcement**: `estimateState()` builds the full SystemState from TelemetrySignal[].

### INV-S2: Policy Is Explainable

**Rule**: Every deployed PricingPolicy includes `expectedImpact` and `confidence` scores.

**Enforcement**: `optimizePricingPolicy()` always populates these fields. `PolicyVersion` records enable audit trails.

### INV-S3: Optimization Is Deterministic Within Constraints

**Rule**: Given the same state, control, constraints, and random seed, the optimizer produces the same output.

**Enforcement**: The perturbation-based optimizer uses bounded random exploration. For production determinism, a seeded PRNG should replace `Math.random()`.

---

## 5. OBJECTIVE FUNCTION

```
J = αR + βS + γF + δU
```

| Component | Formula | Meaning |
|-----------|---------|---------|
| R | ARPU × conversionRate | Revenue Efficiency |
| S | 1 - churnRate | Retention Stability |
| F | 60 / upgradeLatency | Upgrade Fluidity (normalized) |
| U | Σ(adoption × weight) / N | Feature Utilization Efficiency |

### Default Weights

| Weight | Default | Role |
|--------|---------|------|
| α (alpha) | 0.40 | Revenue priority |
| β (beta) | 0.25 | Retention stability |
| γ (gamma) | 0.15 | UX friction penalty |
| δ (delta) | 0.20 | Feature utilization |

---

## 6. HARD CONSTRAINTS

| ID | Constraint | Default | Type |
|----|-----------|---------|------|
| C1 | Pricing Stability | ≤ 20% change per cycle | Hard |
| C2 | Tier Monotonicity | Tier(n+1) ⊇ Tier(n) | Hard |
| C3 | Churn Safety | ≤ 8% churn rate | Hard |
| C4 | Revenue Regression | ≤ 5% ARPU drop | Hard (post-deploy) |

---

## 7. CONTROL LOOP CYCLE

```
1. ingestTelemetry(signals)
2. estimateCurrentState() → SystemState
3. optimizePricingPolicy(state, control, constraints) → PricingPolicy
4. simulatePolicy(policy, history) → SimulationResult
5. if valid && simulation.passesConstraints → deploy
6. compileDecisionFrame(policy, entitlements) → DecisionFrame
7. observe behavior → feed back into telemetry
```

### Rejection Conditions

- Any hard constraint violation
- Simulation projects churn above threshold
- Simulation projects revenue regression > ε
- Post-deploy revenue regression detected → automatic rollback

---

## 8. VERSIONING + ROLLBACK

- Every deployed policy is registered with `registerPolicyVersion()`
- Policy history is maintained in-memory (production: persist to database)
- `rollbackTo(versionId)` restores a previous policy
- All versions after the rollback target are marked non-rollbackable
- Revenue regression triggers automatic rollback

---

## 9. LAYER GUARANTEE

| Layer | Property |
|-------|----------|
| Telemetry | Real-time behavioral truth |
| State model | System-wide abstraction |
| Objective function | Formal economic goal |
| Optimizer | Constrained solver |
| Policy | Versioned economic decision |
| UI (DecisionFrame) | Deterministic projection layer |

---

## 10. RESULTING SYSTEM PROPERTY

Monetization is no longer a feature system or even a compiler system.

It is:

> **A constrained economic control system optimizing a multi-objective function over real user behavior.**

- Pricing is **mathematically derived**
- Tier structure is **continuously optimized**
- UX remains **consistent** via deterministic compilation
- All changes are **constraint-safe** and **reversible**