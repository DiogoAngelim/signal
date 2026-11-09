import { describe, expect, it } from "vitest";
import { calibrateConfidence, evaluateCalibrationMetrics } from ".";
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
      calibrateConfidence(
        [trace(0.9, false), trace(0.8, false), trace(0.7, true)],
        { minimumSamples: 3 },
      ),
    ).toMatchObject({
      calibratedConfidence: 0.566667,
      calibrationError: 0.466667,
      reliability: "overconfident",
      sampleSize: 3,
    });

    expect(
      calibrateConfidence(
        [trace(0.2, true), trace(0.3, true), trace(0.4, false)],
        { minimumSamples: 3 },
      ),
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
        { alignmentTolerance: 0.15, minimumSamples: 3 },
      ),
    ).toMatchObject({
      calibrationError: -0.1,
      reliability: "aligned",
    });
  });


  it("reports Brier score and calibration error across confidence buckets", () => {
    const perfectlyCalibrated = [
      ...Array.from({ length: 3 }, () => trace(0.2, true)),
      ...Array.from({ length: 12 }, () => trace(0.2, false)),
      ...Array.from({ length: 12 }, () => trace(0.8, true)),
      ...Array.from({ length: 3 }, () => trace(0.8, false)),
    ];
    const metrics = evaluateCalibrationMetrics(perfectlyCalibrated);

    expect(metrics).toMatchObject({
      sampleSize: 30,
      brierScore: 0.16,
      expectedCalibrationError: 0,
      maximumCalibrationError: 0,
      calibrationBias: 0,
      status: "calibrated",
    });
    expect(metrics.reliabilityBuckets).toHaveLength(2);
  });

  it("detects bin-level miscalibration that a global bias can conceal", () => {
    const overconfident = Array.from({ length: 30 }, (_, index) =>
      trace(0.9, index < 15),
    );
    const metrics = evaluateCalibrationMetrics(overconfident);

    expect(metrics).toMatchObject({
      sampleSize: 30,
      brierScore: 0.41,
      expectedCalibrationError: 0.4,
      maximumCalibrationError: 0.4,
      calibrationBias: 0.4,
      status: "miscalibrated",
    });
  });

  it("keeps evaluation status insufficient until the minimum sample size is met", () => {
    const metrics = evaluateCalibrationMetrics([
      trace(0.9, true),
      trace(0.8, false),
      trace(0.7, true),
    ]);

    expect(metrics.status).toBe("insufficient_data");
    expect(metrics.sampleSize).toBe(3);
    expect(metrics.brierScore).not.toBeNull();
  });

  it("returns null metrics when there are no completed outcomes", () => {
    expect(evaluateCalibrationMetrics([trace(0.9, null)])).toMatchObject({
      sampleSize: 0,
      brierScore: null,
      expectedCalibrationError: null,
      maximumCalibrationError: null,
      calibrationBias: null,
      status: "insufficient_data",
      reliabilityBuckets: [],
    });
  });

  it("places confidence 1 in the final bucket and bounds bucket count", () => {
    const metrics = evaluateCalibrationMetrics(
      Array.from({ length: 30 }, () => trace(1, true)),
    );

    expect(metrics.reliabilityBuckets).toHaveLength(1);
    expect(metrics.reliabilityBuckets[0]).toMatchObject({
      lowerBound: 0.9,
      upperBound: 1,
      meanConfidence: 1,
      observedRate: 1,
    });
    expect(() =>
      evaluateCalibrationMetrics([trace(0.5, true)], { bucketCount: 101 }),
    ).toThrow("bucketCount must not exceed 100.");
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
