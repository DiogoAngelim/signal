# Signal Purpose

Purpose is the Human Alignment Engine. It is not a risk, prediction, or
portfolio module. It asks whether the system is helping a user progress toward
the future they want in a way they can sustain.

The only required input is:

```ts
ambition: number // 0..100
```

Ambition means desired future intensity, not risk tolerance. Purpose translates
ambition through a nonlinear curve, then derives growth, preservation,
certainty, opportunity, patience, recovery, volatility, urgency,
participation, and survival preferences automatically.

```ts
import { evaluatePurpose } from "../signal-framework";

const purpose = evaluatePurpose({
  ambition: 72,
  behavior: [{ patience: 70, discipline: 68, stressTolerance: 62 }],
  currentPath: { progress: 66, survivability: 82 },
});

console.log(purpose.purposeStatement);
console.log(purpose.satisfactionScore);
console.log(purpose.alignmentTrustScore);
```

Purpose continuously reconciles declared ambition with observed behavior. A
user can declare ambition 100, but repeated panic exits, reversals, regret, and
low patience can lower behavioral ambition until the system has proof that more
intensity is sustainable.

Primary outputs include `purposeScore`, `alignmentScore`,
`satisfactionScore`, `retentionScore`, `advocacyScore`, `goalProgressScore`,
`alignmentTrustScore`, `behavioralAmbition`, `purposeStatement`,
`purposeConfidence`, `warnings`, `explanation`, and `trace`.

Purpose can reduce priority when expected return is high but alignment is low.
It can increase priority when alignment and survivability are both strong.
Purpose uncertainty lowers confidence, and Purpose never overrides survival.
