import { describe, expect, it } from "vitest";
import { calibrateConfidence, evaluateCalibrationDrift, evaluateCalibrationMetrics } from ".";
import type { AgencyTrace } from "../types";

let traceSequence = 0;

function trace(confidence: number, success: boolean | null, timestamp = "2026-01-01T00:00:00.000Z"): AgencyTrace {
  return {
    traceId: `${confidence}-${success}-${traceSequence++}`,
    timestamp,
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
    expect(calibrateConfidence([trace(0.9, true), trace(0.7, false)])).toMatchObject({
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
        { minimumSamples: 3, minimumEvaluationSamples: 3, minimumBucketSamples: 1 },
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
        { minimumSamples: 3, minimumEvaluationSamples: 3, minimumBucketSamples: 1 },
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
        { alignmentTolerance: 0.15, minimumSamples: 3, minimumEvaluationSamples: 3, minimumBucketSamples: 1 },
      ),
    ).toMatchObject({
      calibrationError: -0.1,
      reliability: "aligned",
    });
  });


  it("reports Brier score and calibration error across confidence buckets", () => {
    const perfectlyCalibrated = [
      ...Array.from({ length: 10 }, () => trace(0.2, true)),
      ...Array.from({ length: 40 }, () => trace(0.2, false)),
      ...Array.from({ length: 40 }, () => trace(0.8, true)),
      ...Array.from({ length: 10 }, () => trace(0.8, false)),
    ];
    const metrics = evaluateCalibrationMetrics(perfectlyCalibrated);

    expect(metrics).toMatchObject({
      sampleSize: 100,
      brierScore: 0.16,
      expectedCalibrationError: 0,
      maximumCalibrationError: 0,
      calibrationBias: 0,
      status: "calibrated",
    });
    expect(metrics.reliabilityBuckets).toHaveLength(2);
    expect(metrics.brierScoreInterval?.lowerBound).toBeLessThanOrEqual(0.16);
    expect(metrics.brierScoreInterval?.upperBound).toBeGreaterThanOrEqual(0.16);
    expect(metrics.calibrationBiasInterval?.lowerBound).toBeLessThanOrEqual(0);
    expect(metrics.calibrationBiasInterval?.upperBound).toBeGreaterThanOrEqual(0);
    expect(metrics.calibrationBiasSignificance).toBe("not_significant");
    expect(metrics.reliabilityBuckets[0].observedRateInterval.method).toBe(
      "wilson_score",
    );
    expect(metrics.reliabilityBuckets[0].calibrationErrorInterval).toMatchObject({
      confidenceLevel: 0.95,
      method: "wilson_score",
    });
  });

  it("detects bin-level miscalibration that a global bias can conceal", () => {
    const overconfident = Array.from({ length: 100 }, (_, index) =>
      trace(0.9, index < 50),
    );
    const metrics = evaluateCalibrationMetrics(overconfident);

    expect(metrics).toMatchObject({
      sampleSize: 100,
      brierScore: 0.41,
      expectedCalibrationError: 0.4,
      maximumCalibrationError: 0.4,
      calibrationBias: 0.4,
      status: "miscalibrated",
      calibrationBiasSignificance: "positive",
    });
    expect(metrics.calibrationBiasInterval?.lowerBound).toBeGreaterThan(0);
    expect(metrics.reliabilityBuckets[0].calibrationErrorInterval.lowerBound).toBeGreaterThan(0);
  });



  it("identifies statistically supported underconfidence in a sufficiently large cohort", () => {
    const metrics = evaluateCalibrationMetrics(
      Array.from({ length: 100 }, () => trace(0.1, true)),
    );

    expect(metrics.calibrationBiasSignificance).toBe("negative");
    expect(metrics.calibrationBiasInterval?.upperBound).toBeLessThan(0);
  });

  it("does not label a cohort aligned when a populated reliability bucket is sparse", () => {
    const history = [
      ...Array.from({ length: 95 }, (_, index) =>
        trace(0.5, index < 48),
      ),
      ...Array.from({ length: 5 }, () => trace(0.9, true)),
    ];
    const result = calibrateConfidence(history);

    expect(result.sampleSize).toBe(100);
    expect(result.metrics?.status).toBe("insufficient_data");
    expect(result.reliability).toBe("insufficient_data");
  });

  it("keeps calibration status insufficient below the default 100-sample floor", () => {
    const metrics = evaluateCalibrationMetrics([
      trace(0.9, true),
      trace(0.8, false),
      trace(0.7, true),
    ]);

    expect(metrics.status).toBe("insufficient_data");
    expect(metrics.sampleSize).toBe(3);
    expect(metrics.brierScore).not.toBeNull();
    expect(metrics.brierScoreInterval).toBeNull();
    expect(metrics.calibrationBiasInterval).not.toBeNull();
    expect(metrics.calibrationBiasSignificance).toBe("insufficient_data");
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
      Array.from({ length: 100 }, () => trace(1, true)),
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
    expect(() =>
      evaluateCalibrationMetrics([trace(0.5, true)], {
        minimumBucketSamples: 0,
      }),
    ).toThrow("minimumBucketSamples must be a positive integer.");
  });


  it("detects worsening calibration across chronological windows", () => {
    const history = [
      ...Array.from({ length: 50 }, (_, index) =>
        trace(0.5, index < 25, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
      ),
      ...Array.from({ length: 50 }, (_, index) =>
        trace(0.9, false, new Date(Date.UTC(2026, 0, 2, 0, index)).toISOString()),
      ),
    ].reverse();

    const result = evaluateCalibrationDrift(history, {
      windowCount: 2,
      minimumWindowSamples: 30,
      driftTolerance: 0.1,
    });

    expect(result.status).toBe("degrading");
    expect(result.sampleSize).toBe(100);
    expect(result.errorDelta).toBe(0.9);
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].expectedCalibrationError).toBe(0);
    expect(result.windows[1].expectedCalibrationError).toBe(0.9);

    const sparse = evaluateCalibrationDrift(
      Array.from({ length: 100 }, (_, index) =>
        trace(0.5, index % 2 === 0, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
      ),
      { windowCount: 2, minimumWindowSamples: 30, minimumBucketSamples: 60 },
    );
    expect(sparse.status).toBe("insufficient_data");
    expect(sparse.errorDelta).toBeNull();
  });

  it("does not claim drift when the chronological cohort is too small", () => {
    const result = evaluateCalibrationDrift(
      Array.from({ length: 20 }, (_, index) =>
        trace(0.5, index % 2 === 0, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
      ),
      { windowCount: 2, minimumWindowSamples: 15 },
    );

    expect(result.status).toBe("insufficient_data");
    expect(result.errorDelta).toBeNull();
    expect(result.windows).toEqual([]);
  });

  it("excludes completed outcomes with invalid timestamps and validates drift configuration", () => {
    const history = [
      ...Array.from({ length: 60 }, (_, index) =>
        trace(0.5, index % 2 === 0, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
      ),
      trace(0.5, true, "not-a-date"),
    ];
    const result = evaluateCalibrationDrift(history, {
      windowCount: 2,
      minimumWindowSamples: 30,
    });

    expect(result.excludedInvalidTimestampCount).toBe(1);
    expect(() =>
      evaluateCalibrationDrift(history, { windowCount: 1 }),
    ).toThrow("windowCount must be at least 2.");
    expect(() =>
      evaluateCalibrationDrift(history, { windowCount: 101 }),
    ).toThrow("windowCount must not exceed 100.");
    expect(() =>
      evaluateCalibrationDrift(history, { driftTolerance: 2 }),
    ).toThrow("confidence values must be numbers between 0 and 1.");
  });

  it("honors calibration configuration and validates invalid values", () => {
    expect(
      calibrateConfidence([trace(0.9, false), trace(0.9, false)], {
        minimumSamples: 2,
        minimumEvaluationSamples: 2,
        minimumBucketSamples: 1,
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
