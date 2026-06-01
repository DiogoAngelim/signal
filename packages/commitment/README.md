# @signal/commitment

Generic commitment evaluation for Signal.

It transforms decisions, trust, constraints, resources, and policies into deterministic abstract commitment recommendations. It does not know domain-specific execution units.

Main API:

```ts
import { evaluateCommitment } from "@signal/commitment";

const result = evaluateCommitment({
  decision: { id: "decision-1", confidence: 0.8, trust: 0.7, risk: 0.3 },
  resource: { available: 1 },
  policy: "balanced",
});
```
