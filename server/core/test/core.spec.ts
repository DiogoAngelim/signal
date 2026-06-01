import { describe, expect, it } from "vitest";
import { CoreEngine } from "../src";

describe("core decisions", () => {
  it("uses deterministic policy ordering", () => {
    const engine = new CoreEngine([
      {
        policyId: "policy-high",
        policyVersion: "v1",
        decision: "approve",
        minScore: 0.7,
        minConfidence: 0.6,
        reasonCodes: ["HIGH_SCORE"],
      },
      {
        policyId: "policy-low",
        policyVersion: "v1",
        decision: "reject",
        minScore: 0.2,
        minConfidence: 0.2,
        reasonCodes: ["LOW_SCORE"],
      },
    ]);

    const decision = engine.decide({
      score: 0.8,
      confidence: 0.7,
      features: {},
    });

    expect(decision.decision).toBe("approve");
    expect(decision.policyId).toBe("policy-high");
  });
});
