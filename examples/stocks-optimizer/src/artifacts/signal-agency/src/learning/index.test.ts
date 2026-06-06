import { describe, expect, it } from "vitest";
import { learnFromTraces } from ".";
import type { AgencyTrace, CalibrationResult } from "../types";

function trace(input: {
  kind?: string;
  confidence?: number;
  success?: boolean | null;
  allowed?: boolean;
}): AgencyTrace {
  const success = input.success ?? null;
  return {
    traceId: `${input.kind ?? "prepare_response"}-${input.confidence ?? 0.8}-${success}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    decision: { kind: input.kind ?? "prepare_response", confidence: input.confidence ?? 0.8 },
    policy: {
      allowed: input.allowed ?? true,
      requiresApproval: false,
      reason: input.allowed === false ? "Policy blocked action: test." : "Policy allowed action.",
      violations: input.allowed === false ? ["test"] : [],
    },
    outcome: { success, outcomeLabel: success === true ? "positive" : success === false ? "negative" : "unknown" },
    selfDiagnosis: {
      trust: 0.5,
      dataReliability: 0.5,
      calibrationHealth: 0.5,
      overfitRisk: 0.5,
      recommendation: "wait",
      reasons: [],
    },
  };
}

const overconfident: CalibrationResult = {
  calibratedConfidence: 0.4,
  calibrationError: 0.3,
  reliability: "overconfident",
  sampleSize: 4,
};

describe("learning", () => {
  it("identifies poor high-confidence, blocked, successful, and missing-outcome patterns", () => {
    const result = learnFromTraces([
      trace({ confidence: 0.9, success: false }),
      trace({ success: true, kind: "prepare_response" }),
      trace({ success: true, kind: "prepare_response" }),
      trace({ allowed: false, success: null }),
    ], overconfident);

    expect(result.learnedPatterns).toEqual([
      "1 high-confidence decision(s) had poor outcomes.",
      "1 decision(s) were blocked by policy.",
      'Decision kind "prepare_response" has repeated successful outcomes.',
      "1 trace(s) are missing outcome data.",
    ]);
    expect(result.confidenceAdjustment).toBe(-0.12);
    expect(result.policySuggestions).toEqual([
      "Review the confidence threshold for repeated poor outcomes.",
      "Inspect recurring policy violations before widening action permissions.",
      "Improve outcome capture before increasing autonomy.",
    ]);
  });

  it("adjusts confidence upward for underconfidence and supports custom thresholds", () => {
    const result = learnFromTraces([
      trace({ success: true, kind: "collect_context", confidence: 0.7 }),
    ], {
      calibratedConfidence: 0.7,
      calibrationError: -0.2,
      reliability: "underconfident",
      sampleSize: 3,
    }, {
      highConfidenceThreshold: 0.95,
      similarSuccessThreshold: 1,
    });

    expect(result.learnedPatterns).toEqual([
      'Decision kind "collect_context" has repeated successful outcomes.',
    ]);
    expect(result.confidenceAdjustment).toBe(0.08);
    expect(result.policySuggestions).toEqual([]);
  });

  it("returns an empty result when no reusable pattern is present", () => {
    expect(learnFromTraces([trace({ confidence: 0.4, success: true })])).toEqual({
      learnedPatterns: [],
      confidenceAdjustment: 0,
      policySuggestions: [],
    });
  });
});
