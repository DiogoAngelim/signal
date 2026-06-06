import { describe, expect, it } from "vitest";
import { diagnoseAgencyState } from ".";
import type { AgencyTrace, CalibrationResult, LearningResult } from "../types";

function calibration(reliability: CalibrationResult["reliability"]): CalibrationResult {
  return {
    calibratedConfidence: 0.7,
    calibrationError: reliability === "overconfident" ? 0.3 : reliability === "underconfident" ? -0.3 : 0,
    reliability,
    sampleSize: 4,
  };
}

function learning(patterns: string[] = ["A reusable lesson is available."]): LearningResult {
  return {
    learnedPatterns: patterns,
    confidenceAdjustment: 0,
    policySuggestions: [],
  };
}

function trace(input: {
  id: string;
  kind?: string;
  success?: boolean | null;
  allowed?: boolean;
  withContext?: boolean;
}): AgencyTrace {
  const success = input.success === undefined ? true : input.success;
  return {
    traceId: input.id,
    timestamp: "2026-01-01T00:00:00.000Z",
    perception: input.withContext === false ? undefined : { observed: true },
    intelligence: input.withContext === false ? undefined : { assessed: true },
    decision: { kind: input.kind ?? "prepare_response", confidence: 0.7 },
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

describe("self-diagnosis", () => {
  it("requires review when outcome data is mostly missing", () => {
    const result = diagnoseAgencyState({
      history: [
        trace({ id: "1", success: null, withContext: false }),
        trace({ id: "2", success: null, withContext: false }),
        trace({ id: "3", success: true, withContext: false }),
      ],
      calibration: calibration("insufficient_data"),
      learning: learning([]),
    });

    expect(result.recommendation).toBe("requires_human_review");
    expect(result.dataReliability).toBeLessThan(0.6);
    expect(result.reasons).toContain("Outcome coverage or context capture is incomplete.");
    expect(result.reasons).toContain("No reusable lessons have been learned yet.");
  });

  it("recommends action when trust inputs are healthy", () => {
    const result = diagnoseAgencyState({
      history: [
        trace({ id: "1", kind: "prepare_response", success: true }),
        trace({ id: "2", kind: "collect_context", success: true }),
        trace({ id: "3", kind: "compose_summary", success: true }),
      ],
      calibration: calibration("aligned"),
      learning: learning(),
    });

    expect(result).toMatchObject({
      trust: 1,
      dataReliability: 1,
      calibrationHealth: 1,
      overfitRisk: 0,
      recommendation: "act",
      reasons: ["Agency state is healthy."],
    });
  });

  it("recommends reduced size for middling trust", () => {
    const result = diagnoseAgencyState({
      history: [
        trace({ id: "1", kind: "prepare_response", success: true, withContext: false }),
        trace({ id: "2", kind: "prepare_response", success: true, withContext: false }),
        trace({ id: "3", kind: "prepare_response", success: false, withContext: false }),
      ],
      calibration: calibration("underconfident"),
      learning: learning(),
    });

    expect(result.recommendation).toBe("act_with_reduced_size");
    expect(result.calibrationHealth).toBe(0.75);
    expect(result.overfitRisk).toBe(0.6);
    expect(result.reasons).toContain("Observed outcomes are stronger than predicted confidence.");
  });

  it("waits when trust is low but review thresholds are not crossed", () => {
    const result = diagnoseAgencyState({
      history: [
        trace({ id: "1", kind: "prepare_response", success: false, allowed: false, withContext: false }),
        trace({ id: "2", kind: "prepare_response", success: false, withContext: false }),
        trace({ id: "3", kind: "prepare_response", success: true, withContext: false }),
      ],
      calibration: calibration("insufficient_data"),
      learning: learning(),
    });

    expect(result.recommendation).toBe("wait");
    expect(result.reasons).toEqual([
      "Recent outcomes are below target.",
      "Policy violations are frequent.",
    ]);
  });

  it("requires review for frequent policy violations and overconfident low trust", () => {
    const frequentViolations = diagnoseAgencyState({
      history: [
        trace({ id: "1", success: true, allowed: false }),
        trace({ id: "2", success: true, allowed: false }),
        trace({ id: "3", success: true }),
      ],
      calibration: calibration("aligned"),
      learning: learning(),
    });
    const lowTrustOverconfidence = diagnoseAgencyState({
      history: [
        trace({ id: "1", success: false, withContext: false }),
        trace({ id: "2", success: false, withContext: false }),
        trace({ id: "3", success: true, withContext: false }),
      ],
      calibration: calibration("overconfident"),
      learning: learning(),
    });

    expect(frequentViolations.recommendation).toBe("requires_human_review");
    expect(lowTrustOverconfidence.recommendation).toBe("requires_human_review");
    expect(lowTrustOverconfidence.reasons).toContain("Confidence is higher than observed outcomes support.");
  });

  it("handles empty history and validates configuration", () => {
    expect(diagnoseAgencyState({
      history: [],
      calibration: calibration("insufficient_data"),
    })).toMatchObject({
      trust: 0.49,
      dataReliability: 0.5,
      recommendation: "requires_human_review",
    });

    expect(() => diagnoseAgencyState({
      history: [],
      calibration: calibration("aligned"),
      config: { recentWindow: 0 },
    })).toThrow("recentWindow must be a positive integer.");

    expect(() => diagnoseAgencyState({
      history: [],
      calibration: calibration("aligned"),
      config: { minimumTraceCount: 0 },
    })).toThrow("minimumTraceCount must be a positive integer.");
  });
});
