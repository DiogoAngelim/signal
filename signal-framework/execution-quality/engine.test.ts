import { describe, expect, it } from "vitest";
import { evaluateExecutionQuality } from "./engine";

describe("execution quality", () => {
  it("scores clean execution without judging opportunity quality", () => {
    const result = evaluateExecutionQuality({
      action: "buy",
      entryQuality: 82,
      exitQuality: 78,
      liquidityQuality: 88,
      slippageRisk: 12,
      volatilityRisk: 24,
      timingUrgency: 84,
      scalingQuality: 75,
      invalidationClarity: 83,
      executionReadiness: 80,
    });

    expect(result.status).toBe("excellent");
    expect(result.recommendedExecutionMode).toBe("normal");
    expect(result.blockers).toEqual([]);
  });

  it("blocks unclear, stale, or illiquid execution", () => {
    const result = evaluateExecutionQuality({
      liquidityQuality: 12,
      slippageRisk: 91,
      staleDataRisk: 94,
      invalidationClarity: 10,
    });

    expect(result.status).toBe("blocked");
    expect(result.recommendedExecutionMode).toBe("do_not_execute");
    expect(result.blockers).toContain("Liquidity is too weak for clean execution.");
    expect(result.blockers).toContain("Execution data is too stale.");
  });

  it("recommends limit-only and probes for imperfect but usable execution", () => {
    const limitOnly = evaluateExecutionQuality({
      entryQuality: 70,
      exitQuality: 68,
      liquidityQuality: 72,
      slippageRisk: 60,
      volatilityRisk: 44,
      invalidationClarity: 70,
    });
    const probe = evaluateExecutionQuality({
      entryQuality: 65,
      exitQuality: 65,
      liquidityQuality: 46,
      slippageRisk: 25,
      volatilityRisk: 35,
      scalingQuality: 40,
      invalidationClarity: 70,
    });

    expect(limitOnly.recommendedExecutionMode).toBe("limit_only");
    expect(probe.recommendedExecutionMode).toBe("small_probe");
    expect(probe.warnings.length).toBeGreaterThan(0);
  });
});
