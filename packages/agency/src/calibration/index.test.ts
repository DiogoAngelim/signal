import { describe, expect, it } from "vitest";
import { calibrateConfidence } from ".";
import type { AgencyTrace } from "../types";

function trace(confidence: number, success: boolean | null): AgencyTrace {
  return {
    traceId: `${confidence}-${success}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    decision: { kind: "prepare_response", confidence },
    policy: {
      allowed: true,
      requiresApproval: false,
      reason: "Policy allowed action.",
      violations: [],
    },
    outcome: {
      success,
      outcomeLabel:
        success === true
          ? "positive"
          : success === false
            ? "negative"
            : "unknown",
    },
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

describe("calibration", () => {
  it("reports insufficient data when no completed outcomes exist", () => {
    expect(calibrateConfidence([trace(0.9, null)])).toEqual({
      calibratedConfidence: 0.5,
      calibrationError: 0,
      reliability: "insufficient_data",
      sampleSize: 0,
    });
  });

  it("reports insufficient data below the configured sample floor", () => {
    expect(calibrateConfidence([trace(0.9, true), trace(0.7, false)])).toEqual({
      calibratedConfidence: 0.65,
      calibrationError: 0.3,
      reliability: "insufficient_data",
      sampleSize: 2,
    });
  });

  it("detects overconfidence, underconfidence, and aligned confidence", () => {
    expect(
      calibrateConfidence([
        trace(0.9, false),
        trace(0.8, false),
        trace(0.7, true),
      ]),
    ).toMatchObject({
      calibratedConfidence: 0.566667,
      calibrationError: 0.466667,
      reliability: "overconfident",
      sampleSize: 3,
    });

    expect(
      calibrateConfidence([
        trace(0.2, true),
        trace(0.3, true),
        trace(0.4, false),
      ]),
    ).toMatchObject({
      calibrationError: -0.366667,
      reliability: "underconfident",
    });

    expect(
      calibrateConfidence(
        [
          trace(0.7, true),
          trace(0.6, true),
          trace(0.2, false),
          trace(0.1, false),
        ],
        { alignmentTolerance: 0.15 },
      ),
    ).toMatchObject({
      calibrationError: -0.1,
      reliability: "aligned",
    });
  });

  it("honors calibration configuration and validates invalid values", () => {
    expect(
      calibrateConfidence([trace(0.9, false), trace(0.9, false)], {
        minimumSamples: 2,
        adjustmentRate: 1,
      }),
    ).toMatchObject({
      calibratedConfidence: 0,
      calibrationError: 0.9,
      reliability: "overconfident",
    });

    expect(() =>
      calibrateConfidence([trace(0.5, true)], { minimumSamples: 0 }),
    ).toThrow("minimumSamples must be a positive integer.");
    expect(() =>
      calibrateConfidence([trace(0.5, true)], { alignmentTolerance: 2 }),
    ).toThrow("confidence values must be numbers between 0 and 1.");
    expect(() => calibrateConfidence([trace(1.5, true)])).toThrow(
      "confidence values must be numbers between 0 and 1.",
    );
  });
});
