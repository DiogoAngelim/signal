import { describe, expect, it } from "vitest";
import {
  fitBinaryIsotonicCalibrator,
  applyBinaryIsotonicCalibrator,
  type BinaryCalibrationObservation,
} from "./binary-calibration";
import { evaluateBinaryForecasts } from "./scientific-evaluation";

const calibration = Array.from({ length: 1200 }, (_, i): BinaryCalibrationObservation => {
  const p = [0.1, 0.3, 0.5, 0.7][i % 4];
  const observedRate = [0.2, 0.3, 0.6, 0.7][i % 4];
  return {
    id: `cal-${i}`,
    rawProbability: p,
    observedOutcome: ((i / 4 | 0) % 10) / 10 < observedRate ? 1 : 0,
  };
});
const options = {
  modelVersion: "unchanged-frozen-model-v1",
  calibrationDatasetVersion: "separately-authored-calibration-source",
  split: "calibration_only" as const,
  targetBins: 10,
  priorEffectiveCount: 10,
};

describe("split-isolated binary forecast calibration", () => {
  it("uses monotone pooled bins and refuses self-certification of causal improvement", () => {
    const fitted = fitBinaryIsotonicCalibrator(calibration, options);
    expect(fitted.trainingSplit).toBe("calibration_only");
    expect(fitted.calibrationRecordCount).toBe(1200);
    expect(fitted.calibrationEvents).toBeGreaterThan(20);
    expect(fitted.knots.reduce((x, k) => x + k.recordCount, 0)).toBe(1200);
    expect(fitted.independentDataProvenanceVerifiedByLibrary).toBe(false);
    expect(fitted.causalProfitEffectProven).toBe(false);
    const probs = Array.from({ length: 1001 }, (_, i) =>
      applyBinaryIsotonicCalibrator(fitted, i / 1000));
    expect(probs.every((p, i) => i === 0 || p >= probs[i - 1])).toBe(true);
    expect(probs.every((p) => p >= 0 && p <= 1)).toBe(true);
    expect(fitBinaryIsotonicCalibrator(calibration, options)).toEqual(fitted);
  });

  it("can improve a separate labeled fixture but makes no blanket guarantee", () => {
    const fitted = fitBinaryIsotonicCalibrator(calibration, options);
    const holdout = Array.from({ length: 1000 }, (_, i) => {
      const group = i % 4;
      const p = [0.1, 0.3, 0.5, 0.7][group];
      const rate = [0.2, 0.3, 0.6, 0.7][group];
      return {
        id: `test-${i}`, rawProbability: p,
        observedOutcome: (((i / 4 | 0) % 10) / 10 < rate ? 1 : 0) as 0 | 1,
      };
    });
    const score = (calibrated: boolean) => evaluateBinaryForecasts({
      datasetVersion: "independent-fixture",
      modelVersion: calibrated ? "postprocessed" : "original",
      eventDefinition: "independent binary outcome",
      samplingFrame: "synthetic independent fixture",
      split: "random_holdout",
      independentLabels: true,
      records: holdout.map((r) => ({
        id: r.id,
        probability: calibrated
          ? applyBinaryIsotonicCalibrator(fitted, r.rawProbability)
          : r.rawProbability,
        outcome: r.observedOutcome,
      })),
    });
    const raw = score(false);
    const post = score(true);
    expect(post.brierScore).not.toBeNull();
    expect(raw.brierScore).not.toBeNull();
    expect(post.brierScore!).toBeLessThan(raw.brierScore!);
    // Each model may require separate calibration and external label integrity;
    // this is a synthetic regression test, not a real-world endorsement.
    expect(post.status).toBe("eligible_for_independent_review");
  });

  it("fails closed on leakage-prone or insufficient calibration datasets", () => {
    expect(() => fitBinaryIsotonicCalibrator(calibration, {
      ...options, split: "test" as "calibration_only",
    })).toThrow(/calibration_only/);
    expect(() => fitBinaryIsotonicCalibrator(calibration.slice(0, 100), options))
      .toThrow(/calibration count/);
    expect(() => fitBinaryIsotonicCalibrator(calibration.map((r) => ({
      ...r, observedOutcome: 0 as const,
    })), options)).toThrow(/20 positive/);
    expect(() => fitBinaryIsotonicCalibrator([
      { ...calibration[0], rawProbability: NaN }, ...calibration.slice(1),
    ], options)).toThrow(/finite probability/);
    expect(() => fitBinaryIsotonicCalibrator([
      calibration[0], { ...calibration[0] }, ...calibration.slice(2),
    ], options)).toThrow(/unique/);
    expect(() => applyBinaryIsotonicCalibrator(
      fitBinaryIsotonicCalibrator(calibration, options), 1.1))
      .toThrow(/finite probability/);
  });

  it("refuses manipulated calibrator knots and preserves native decision permissions", () => {
    const fitted = fitBinaryIsotonicCalibrator(calibration, options);
    expect(() => applyBinaryIsotonicCalibrator({
      ...fitted,
      knots: fitted.knots.map((k, i) => ({
        ...k, calibratedProbability: i === 1 ? 0 : k.calibratedProbability,
      })),
    }, 1)).toThrow(/monotone/);
    expect(Object.keys(fitted)).not.toContain("actionAllowed");
    expect(Object.keys(fitted)).not.toContain("actionScale");
    expect(Object.keys(fitted)).not.toContain("governance");
  });
});
