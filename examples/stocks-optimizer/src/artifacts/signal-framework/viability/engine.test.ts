import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMarginOfSafety,
  createViabilityReason,
  evaluateViability,
  evaluateViabilityConstraint,
  type ViabilityInput,
} from "./engine";

function base(overrides: Partial<ViabilityInput> = {}): ViabilityInput {
  return {
    targetRef: "target",
    actionRef: "act",
    expectedBenefit: 82,
    expectedCost: 18,
    expectedRisk: 24,
    confidence: 86,
    uncertainty: 14,
    ...overrides,
  };
}

test("approves a generic action when benefit clears costs and constraints", () => {
  const result = evaluateViability(base({
    constraints: [
      { id: "capacity", type: "hard", passed: true, severity: "high" },
      { id: "quality", value: 88, operator: ">=", limit: 70, severity: "medium" },
    ],
  }));

  assert.equal(result.verdict, "viable");
  assert.equal(result.finalVerdict, "viable");
  assert.equal(result.marginOfSafety > 0, true);
  assert.equal(result.score > 69, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.constraints.every((constraint) => constraint.passed), true);
  assert.equal(createViabilityReason(result).includes("Viable"), true);
});

test("blocks when a failed hard constraint is high severity", () => {
  const result = evaluateViability(base({
    constraints: [
      {
        id: "legal-limit",
        label: "Legal limit",
        type: "hard",
        passed: false,
        severity: "critical",
        reason: "Required approval is missing.",
      },
    ],
  }));

  assert.equal(result.verdict, "blocked");
  assert.equal(result.score <= 20, true);
  assert.deepEqual(result.blockers, ["Legal limit (legal-limit)"]);
  assert.equal(result.reasons.includes("Required approval is missing."), true);
});

test("marks negative safety margin as not viable without a blocker", () => {
  const result = evaluateViability(base({
    expectedBenefit: 30,
    expectedCost: 45,
    expectedRisk: 65,
    uncertainty: 55,
    confidence: 45,
  }));

  assert.equal(result.verdict, "not-viable");
  assert.equal(result.marginOfSafety < 0, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.warnings.some((warning) => warning.includes("Margin of safety")), true);
});

test("surfaces marginal verdicts for thin positive margins", () => {
  const result = evaluateViability(base({
    expectedBenefit: 55,
    expectedCost: 28,
    expectedRisk: 40,
    uncertainty: 28,
    confidence: 70,
    minMarginOfSafety: 20,
  }));

  assert.equal(result.verdict, "marginal");
  assert.equal(result.marginOfSafety > 0, true);
  assert.equal(result.marginOfSafety < result.requiredMarginOfSafety, true);
});

test("evaluates constraints independently with operators and ranges", () => {
  assert.equal(evaluateViabilityConstraint({
    id: "min-edge",
    value: 7,
    operator: ">=",
    limit: 5,
  }).passed, true);
  assert.deepEqual(
    {
      passed: evaluateViabilityConstraint({
        id: "range",
        value: 11,
        min: 2,
        max: 10,
        severity: "low",
      }).passed,
      blocker: evaluateViabilityConstraint({
        id: "range",
        value: 11,
        min: 2,
        max: 10,
        severity: "low",
      }).blocker,
    },
    { passed: false, blocker: false },
  );
  assert.equal(evaluateViabilityConstraint({
    id: "invalid",
    type: "hard",
    value: "x",
    operator: "<",
    limit: "y",
    severity: "high",
  }).blocker, true);
});

test("keeps margin calculation deterministic and normalized", () => {
  const input = base({ expectedBenefit: 0.9, expectedCost: 0.2, expectedRisk: 0.3 });
  const first = calculateMarginOfSafety(input);
  const second = calculateMarginOfSafety(input);

  assert.equal(first, second);
  assert.equal(first > -1, true);
  assert.equal(first < 1, true);
  assert.equal(evaluateViability(input).marginOfSafety, first);
});
