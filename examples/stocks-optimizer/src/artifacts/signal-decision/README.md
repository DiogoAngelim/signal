# @signal/decision

Generic decision intelligence for Signal.

This package is additive to the protocol/runtime architecture. It provides a typed strategic layer for coherence, outcomes, accountability, prediction, simulation, wisdom, decision records, and human-language explanations without binding Signal to a transport or a domain.

```ts
import { evaluateDecision } from "@signal/decision";

const result = evaluateDecision({
  decisionId: "example:1",
  observation: { event: "candidate-ready" },
  modules: {
    discovery: 82,
    judgment: 73,
    purpose: 68,
    trust: 58,
    calibration: 62,
    recovery: 70,
    agency: 64,
  },
});
```

The same layer can be used by finance, logistics, operations, safety review, or any other domain that can express module evidence as scores, confidence, risk, and explanations.
