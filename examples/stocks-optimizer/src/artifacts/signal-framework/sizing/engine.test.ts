import assert from "node:assert/strict";
import test from "node:test";
import { sizeDecision, type SizingInput } from "./engine";

function base(overrides: Partial<SizingInput> = {}): SizingInput {
  return {
    targetRef: "target",
    confidence: 0.8,
    risk: 0.2,
    ...overrides,
  };
}

test("failed high or critical hard constraints block sizing", () => {
  const result = sizeDecision(base({
    confidence: 95,
    risk: 5,
    constraints: [
      {
        id: "risk-gate",
        label: "Risk gate",
        type: "hard",
        passed: false,
        severity: "high",
        reason: "Risk gate prevents committing capacity.",
      },
      {
        id: "data-gate",
        type: "hard",
        passed: false,
        severity: "critical",
      },
    ],
  }));

  assert.equal(result.decision, "blocked");
  assert.equal(result.mode, "none");
  assert.equal(result.size, 0);
  assert.equal(result.normalizedSize, 0);
  assert.deepEqual(result.audit.blockedBy, ["risk-gate", "data-gate"]);
  assert.ok(result.reasons.includes("Blocked by Risk gate (risk-gate)."));
  assert.ok(result.reasons.includes("Risk gate prevents committing capacity."));
  assert.ok(result.reasons.includes("Blocked by data-gate."));
});

test("soft and non-blocking hard constraints reduce size without blocking", () => {
  const unconstrained = sizeDecision(base({ availableCapacity: 100 }));
  const constrained = sizeDecision(base({
    availableCapacity: 100,
    constraints: [
      { id: "soft-limit", type: "soft", passed: false, severity: "high", reason: "Soft governor is weak." },
      { id: "hard-medium", type: "hard", passed: false, severity: "medium" },
      { id: "fallback-severity", type: "soft", passed: false, severity: "unexpected" as any },
    ],
  }));

  assert.equal(constrained.decision, "allowed");
  assert.ok(constrained.size < unconstrained.size);
  assert.ok(constrained.reasons.includes("soft-limit failed with high severity; sizing reduced."));
  assert.ok(constrained.reasons.includes("Soft governor is weak."));
  assert.ok(constrained.reasons.includes("hard-medium failed with medium severity; sizing reduced."));
  assert.ok(constrained.reasons.includes("fallback-severity failed with medium severity; sizing reduced."));
});

test("confidence scaling increases size as confidence improves", () => {
  const low = sizeDecision(base({ confidence: 0.2, risk: 0.2, availableCapacity: 100 }));
  const moderate = sizeDecision(base({ confidence: 0.5, risk: 0.2, availableCapacity: 100 }));
  const strong = sizeDecision(base({ confidence: 0.8, risk: 0.2, availableCapacity: 100 }));

  assert.ok(low.size < moderate.size);
  assert.ok(moderate.size < strong.size);
  assert.ok(low.reasons.includes("Confidence 20% is low; sizing is conservative."));
  assert.ok(moderate.reasons.includes("Confidence 50% is moderate; sizing remains limited."));
  assert.ok(strong.reasons.includes("Confidence 80% supports sizing."));
});

test("risk scaling reduces size as risk rises", () => {
  const controlled = sizeDecision(base({ confidence: 0.7, risk: 0.2, availableCapacity: 100 }));
  const moderate = sizeDecision(base({ confidence: 0.7, risk: 0.55, availableCapacity: 100 }));
  const high = sizeDecision(base({ confidence: 0.7, risk: 0.85, availableCapacity: 100 }));
  const maximum = sizeDecision(base({ confidence: 0.7, risk: 1, availableCapacity: 100 }));

  assert.ok(controlled.size > moderate.size);
  assert.ok(moderate.size > high.size);
  assert.equal(maximum.size, 0);
  assert.ok(controlled.reasons.includes("Risk 20% is controlled."));
  assert.ok(moderate.reasons.includes("Risk 55% is moderate; sizing is controlled."));
  assert.ok(high.reasons.includes("Risk 85% is high; sizing is reduced."));
  assert.ok(maximum.reasons.includes("Risk is at maximum; sizing starts at zero."));
});

test("utility and fully passed constraints can adjust size upward or downward", () => {
  const lowUtility = sizeDecision(base({
    confidence: 0.8,
    risk: 0.2,
    utility: 0.2,
    availableCapacity: 100,
  }));
  const highUtility = sizeDecision(base({
    confidence: 0.8,
    risk: 0.2,
    utility: 0.8,
    availableCapacity: 100,
    constraints: [{ id: "all-clear", type: "soft", passed: true, severity: "low" }],
  }));

  assert.ok(highUtility.size > lowUtility.size);
  assert.ok(lowUtility.reasons.includes("Utility 20% reduces sizing."));
  assert.ok(highUtility.reasons.includes("Utility 80% supports sizing."));
  assert.ok(highUtility.reasons.includes("All sizing constraints passed."));
  assert.ok(highUtility.reasons.includes("Strong confidence and controlled risk support increased sizing."));
});

test("capacity caps respect requested, maximum, and available capacity", () => {
  const requestedAndMax = sizeDecision(base({
    confidence: 1,
    risk: 0,
    availableCapacity: 60,
    requestedCapacity: 50,
    maxCapacity: 40,
  }));
  const available = sizeDecision(base({
    confidence: 1,
    risk: 0,
    availableCapacity: 30,
    requestedCapacity: 100,
    maxCapacity: 80,
  }));

  assert.equal(requestedAndMax.size, 40);
  assert.deepEqual(requestedAndMax.audit.cappedBy, ["requestedCapacity", "maxCapacity"]);
  assert.equal(available.size, 30);
  assert.deepEqual(available.audit.cappedBy, ["maxCapacity", "availableCapacity"]);
  assert.equal(available.audit.availableCapacity, 30);
  assert.equal(available.audit.requestedCapacity, 100);
  assert.equal(available.audit.maxCapacity, 80);
});

test("minimum capacity is applied only when caps can satisfy it", () => {
  const raised = sizeDecision(base({
    confidence: 0.1,
    risk: 0,
    availableCapacity: 100,
    requestedCapacity: 100,
    minCapacity: 15,
  }));
  const notRaised = sizeDecision(base({
    confidence: 0.7,
    risk: 0,
    availableCapacity: 10,
    requestedCapacity: 100,
    minCapacity: 15,
  }));
  const raisedWithoutCaps = sizeDecision(base({
    confidence: 0.1,
    risk: 0,
    minCapacity: 0.2,
  }));

  assert.equal(raised.size, 15);
  assert.ok(raised.reasons.includes("Raised to minimum capacity 15."));
  assert.equal(notRaised.size, 10);
  assert.ok(notRaised.reasons.includes("Minimum capacity 15 could not be met within caps."));
  assert.equal(raisedWithoutCaps.size, 0.2);
});

test("normalized size stays in bounds and classifies modes deterministically", () => {
  const cases: Array<[number, string]> = [
    [0, "none"],
    [0.05, "micro"],
    [0.1, "small"],
    [0.3, "normal"],
    [0.6, "large"],
    [0.71, "maxSafe"],
  ];

  for (const [confidence, mode] of cases) {
    const result = sizeDecision(base({ confidence, risk: 0 }));
    assert.equal(result.mode, mode);
    assert.ok(result.normalizedSize >= 0);
    assert.ok(result.normalizedSize <= 1);
  }

  const clamped = sizeDecision(base({ confidence: 150, risk: -10 }));
  assert.equal(clamped.normalizedSize, 1);
  assert.equal(clamped.mode, "maxSafe");
  assert.ok(clamped.reasons.includes("Confidence was outside 0-100%; clamped to 100%."));
  assert.ok(clamped.reasons.includes("Risk was outside 0-100%; clamped to 0%."));
});

test("reason generation is deterministic", () => {
  const input = base({
    actionRef: "action",
    decisionRef: "decision",
    confidence: 0.56,
    risk: 0.49,
    requestedCapacity: 20,
    availableCapacity: 15,
    constraints: [
      { id: "soft", label: "Soft check", type: "soft", passed: false, severity: "low" },
      { id: "pass", type: "hard", passed: true, severity: "critical" },
    ],
    context: { ignored: true },
  });

  const first = sizeDecision(input);
  const second = sizeDecision(input);

  assert.deepEqual(first.reasons, second.reasons);
  assert.deepEqual(first, second);
});

test("invalid and missing values use conservative deterministic defaults", () => {
  const result = sizeDecision({
    targetRef: "invalid",
    confidence: Number.NaN,
    risk: undefined as any,
    requestedCapacity: "bad" as any,
    maxCapacity: -5,
    constraints: [
      { id: "", type: "unknown" as any, passed: 0 as any, severity: "bad" as any },
    ],
  });

  assert.equal(result.decision, "deferred");
  assert.equal(result.mode, "none");
  assert.equal(result.size, 0);
  assert.equal(result.confidence, 0);
  assert.equal(result.risk, 1);
  assert.equal(result.constraints[0].id, "constraint-1");
  assert.equal(result.constraints[0].type, "soft");
  assert.equal(result.constraints[0].severity, "medium");
  assert.ok(result.reasons.includes("Confidence was missing or invalid; using 0%."));
  assert.ok(result.reasons.includes("Risk was missing or invalid; using 100%."));
  assert.ok(result.reasons.includes("Requested capacity was invalid and ignored."));
  assert.ok(result.reasons.includes("Maximum capacity was below zero; using 0."));
  assert.ok(result.reasons.includes("Available sizing capacity is zero."));
});
