import { describe, expect, it } from "vitest";
import {
  evaluateCounterfactuals,
  updateCounterfactualResult,
} from "./engine";

describe("counterfactual learning", () => {
  it("detects missed upside when normal sizing would likely have helped", () => {
    const result = evaluateCounterfactuals({
      actualDecision: { decision: "watch", confidence: 62, opportunity: 72, risk: 25, maxExposure: 0 },
      normalSizeDecision: { decision: "buy", confidence: 78, opportunity: 88, risk: 36, maxExposure: 12, expectedReturn: 13 },
      alternativeCandidateDecision: { decision: "buy", confidence: 80, opportunity: 84, risk: 34, maxExposure: 8, expectedReturn: 11 },
    });

    expect(result.missedUpsideScore).toBeGreaterThan(40);
    expect(result.cautionCostScore).toBeGreaterThan(20);
    expect(result.shouldAdjustDiscoveryPolicy).toBe(true);
  });

  it("detects avoided loss when ignoring restrictions was risky", () => {
    const result = evaluateCounterfactuals({
      actualDecision: { decision: "hold", confidence: 55, opportunity: 40, risk: 20, maxExposure: 0 },
      ignoredRestrictionDecision: { decision: "buy", confidence: 70, opportunity: 78, risk: 92, maxExposure: 20 },
      restrictions: [{ reason: "Liquidity lock", avoidedLossScore: 80 }],
    });

    expect(result.avoidedLossScore).toBeGreaterThan(result.missedUpsideScore);
    expect(result.restrictionValueScore).toBeGreaterThan(40);
    expect(result.explanation).toContain("favor caution");
  });

  it("updates scenarios with later realized outcomes", () => {
    const result = evaluateCounterfactuals({
      actualDecision: { decision: "watch", confidence: 50, risk: 30 },
      unrestrictedDecision: { decision: "buy", confidence: 75, risk: 45, expectedReturn: 9, maxExposure: 10 },
    });
    const updated = updateCounterfactualResult(result, {
      "counterfactual:unrestricted": { returnPct: 8, success: true, notes: ["Recovered after delay."] },
    });

    expect(updated.scenarios.find((scenario) => scenario.kind === "unrestricted")?.realizedOutcome?.success).toBe(true);
    expect(updated.recommendedLearning).toContain("Fold realized counterfactual outcomes back into restriction and discovery calibration.");
  });

  it("explains balanced protection and opportunity cost", () => {
    const result = evaluateCounterfactuals({
      actualDecision: { decision: "hold", confidence: 50, risk: 30, opportunity: 50, maxExposure: 0 },
    });

    expect(result.avoidedLossScore).toBe(result.missedUpsideScore);
    expect(result.explanation).toContain("balanced");
  });
});
