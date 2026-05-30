import { describe, expect, it } from "vitest";
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

describe("evaluateViability", () => {
  it("approves a generic action when benefit clears cost, risk, uncertainty, and constraints", () => {
    const result = evaluateViability(base({
      constraints: [
        { id: "capacity", type: "hard", passed: true, severity: "high" },
        { id: "quality", value: 88, operator: ">=", limit: 70, severity: "medium" },
      ],
    }));

    expect(result.verdict).toBe("viable");
    expect(result.finalVerdict).toBe("viable");
    expect(result.marginOfSafety).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(69);
    expect(result.blockers).toEqual([]);
    expect(result.constraints.every((constraint) => constraint.passed)).toBe(true);
    expect(createViabilityReason(result)).toContain("Viable");
  });

  it("blocks when a failed hard constraint is high severity", () => {
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

    expect(result.verdict).toBe("blocked");
    expect(result.score).toBeLessThanOrEqual(20);
    expect(result.blockers).toEqual(["Legal limit (legal-limit)"]);
    expect(result.reasons).toContain("Required approval is missing.");
  });

  it("marks negative safety margin as not viable without a blocker", () => {
    const result = evaluateViability(base({
      expectedBenefit: 30,
      expectedCost: 45,
      expectedRisk: 65,
      uncertainty: 55,
      confidence: 45,
    }));

    expect(result.verdict).toBe("not-viable");
    expect(result.marginOfSafety).toBeLessThan(0);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("Margin of safety"))).toBe(true);
  });

  it("surfaces marginal verdicts for thin positive margins", () => {
    const result = evaluateViability(base({
      expectedBenefit: 55,
      expectedCost: 28,
      expectedRisk: 40,
      uncertainty: 28,
      confidence: 70,
      minMarginOfSafety: 20,
    }));

    expect(result.verdict).toBe("marginal");
    expect(result.marginOfSafety).toBeGreaterThan(0);
    expect(result.marginOfSafety).toBeLessThan(result.requiredMarginOfSafety);
  });

  it("evaluates constraints independently with operators and ranges", () => {
    expect(evaluateViabilityConstraint({
      id: "min-edge",
      value: 7,
      operator: ">=",
      limit: 5,
    }).passed).toBe(true);
    expect(evaluateViabilityConstraint({
      id: "range",
      value: 11,
      min: 2,
      max: 10,
      severity: "low",
    })).toMatchObject({
      passed: false,
      blocker: false,
      score: 72,
    });
    expect(evaluateViabilityConstraint({
      id: "invalid",
      type: "hard",
      value: "x",
      operator: "<",
      limit: "y",
      severity: "high",
    })).toMatchObject({
      passed: false,
      blocker: true,
    });
  });

  it("keeps margin calculation deterministic and normalized", () => {
    const input = base({ expectedBenefit: 0.9, expectedCost: 0.2, expectedRisk: 0.3 });
    const first = calculateMarginOfSafety(input);
    const second = calculateMarginOfSafety(input);

    expect(first).toBe(second);
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(1);
    expect(evaluateViability(input).marginOfSafety).toBe(first);
  });
});
