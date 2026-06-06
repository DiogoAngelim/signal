import { describe, expect, it } from "vitest";
import { evaluatePolicy } from ".";
import type { AgencyDecision } from "../types";

const decision: AgencyDecision = {
  kind: "prepare_response",
  confidence: 0.8,
};

describe("policy", () => {
  it("allows a decision that satisfies confidence, size, and approval rules", () => {
    expect(evaluatePolicy({
      decision,
      sizing: { size: 4 },
      config: {
        minimumConfidence: 0.5,
        maximumSize: 10,
        humanApprovalRequired: true,
      },
      approvalGranted: true,
    })).toEqual({
      allowed: true,
      maxSize: 10,
      requiresApproval: true,
      reason: "Policy allowed action.",
      violations: [],
    });
  });

  it("blocks low confidence decisions", () => {
    const result = evaluatePolicy({
      decision: { ...decision, confidence: 0.4 },
      config: { minimumConfidence: 0.7 },
    });

    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(["confidence_below_minimum"]);
    expect(result.reason).toBe("Policy blocked action: confidence_below_minimum.");
  });

  it("blocks oversize requests and recommends the configured maximum", () => {
    const result = evaluatePolicy({
      decision,
      sizing: { size: 11 },
      config: { maximumSize: 6 },
    });

    expect(result.allowed).toBe(false);
    expect(result.maxSize).toBe(6);
    expect(result.recommendedSize).toBe(6);
    expect(result.violations).toEqual(["size_above_maximum"]);
  });

  it("blocks configured and input block reasons while ignoring empty reasons", () => {
    const result = evaluatePolicy({
      decision,
      config: { blockReasons: ["external_pause", ""] },
      blockReasons: ["conflicting_evidence"],
    });

    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(["blocked:external_pause", "blocked:conflicting_evidence"]);
  });

  it("blocks when human approval is required but not granted", () => {
    const result = evaluatePolicy({
      decision,
      config: { humanApprovalRequired: true },
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.violations).toContain("human_approval_required");
  });

  it("allows a decision without sizing when no size rule is configured", () => {
    expect(evaluatePolicy({ decision })).toMatchObject({
      allowed: true,
      requiresApproval: false,
      violations: [],
    });
  });

  it("rejects invalid confidence and size values", () => {
    expect(() => evaluatePolicy({ decision: { ...decision, confidence: 1.2 } })).toThrow(
      "decision.confidence must be a number between 0 and 1.",
    );
    expect(() => evaluatePolicy({ decision, config: { minimumConfidence: -0.1 } })).toThrow(
      "minimumConfidence must be a number between 0 and 1.",
    );
    expect(() => evaluatePolicy({ decision, config: { maximumSize: -1 } })).toThrow(
      "maximumSize must be a non-negative number.",
    );
    expect(() => evaluatePolicy({ decision, sizing: { size: -1 } })).toThrow(
      "sizing.size must be a non-negative number.",
    );
  });
});
