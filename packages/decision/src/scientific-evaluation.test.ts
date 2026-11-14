import { describe, expect, it } from "vitest";
import {
  evaluateBinaryForecasts,
  compareFullFeedbackPolicies,
} from "./scientific-evaluation";

describe("scientific forecast evaluation", () => {
  const perfect = Array.from({ length: 100 }, (_, i) => ({
    id: `f${i}`,
    probability: i < 50 ? 0 : 1,
    outcome: (i < 50 ? 0 : 1) as 0 | 1,
  }));
  const metadata = {
    datasetVersion: "frozen-fixture-v1",
    modelVersion: "m1",
    eventDefinition: "Success within 30 days",
    samplingFrame: "Independent precommitted holdout",
    split: "temporal_holdout" as const,
    independentLabels: true,
  };

  it("reports calibrated perfect predictions and a tie-aware AUC", () => {
    const result = evaluateBinaryForecasts({
      ...metadata, records: perfect, precommittedBaselineProbability: 0.5,
    });
    expect(result.status).toBe("eligible_for_independent_review");
    expect(result.brierScore).toBe(0);
    expect(result.aucRoc).toBe(1);
    expect(result.expectedCalibrationError).toBe(0);
    expect(result.brierImprovementVsBaseline).toBe(0.25);
    expect(result.logLoss).toBeCloseTo(0, 12);
  });

  it("reports AUC=0.5 for a constant forecast, with calibration error", () => {
    const result = evaluateBinaryForecasts({
      ...metadata,
      records: perfect.map((record) => ({ ...record, probability: 0.7 })),
    });
    expect(result.aucRoc).toBe(0.5);
    expect(result.expectedCalibrationError).toBeCloseTo(0.2);
  });

  it("does not convert in-sample records into validated evidence", () => {
    const result = evaluateBinaryForecasts({
      ...metadata, split: "in_sample", independentLabels: false,
      records: perfect,
    });
    expect(result.status).toBe("descriptive_only");
  });

  it("is insufficient with sparse data or only one label class", () => {
    const result = evaluateBinaryForecasts({
      ...metadata, records: perfect.slice(50, 53),
    });
    expect(result.status).toBe("insufficient_data");
    expect(result.aucRoc).toBeNull();
  });

  it("rejects duplicate IDs, labels outside binary set and unbounded probabilities", () => {
    expect(() => evaluateBinaryForecasts({
      ...metadata, records: [...perfect, perfect[0]],
    })).toThrow(/unique/);
    expect(() => evaluateBinaryForecasts({
      ...metadata, records: [{ id: "x", probability: 1.1, outcome: 1 }],
    })).toThrow(/\[0,1\]/);
    expect(() => evaluateBinaryForecasts({
      ...metadata, records: [{ id: "x", probability: 0.8, outcome: 2 as 0 | 1 }],
    })).toThrow(/0 or 1/);
  });
});

describe("paired full-feedback decision policy evaluation", () => {
  const records = Array.from({ length: 40 }, (_, i) => ({
    id: `d${i}`,
    baselineActionId: "manual",
    signalActionId: "signal",
    actionUtilities: [
      { actionId: "manual", utility: 10 + (i % 2) },
      { actionId: "signal", utility: 12 + (i % 2) },
    ],
  }));
  const metadata = {
    datasetVersion: "full-feedback-fixture-v1",
    commonUtilityUnit: "USD",
    provenance: "independently_verified_full_feedback" as const,
    split: "temporal_holdout" as const,
  };

  it("computes paired improvement and reproducible bootstrap interval", () => {
    const a = compareFullFeedbackPolicies({ ...metadata, records });
    const b = compareFullFeedbackPolicies({ ...metadata, records });
    expect(a).toEqual(b);
    expect(a.sampleSize).toBe(40);
    expect(a.meanPairedDifference).toBe(2);
    expect(a.pairedDifferenceInterval95?.lower).toBeCloseTo(2);
    expect(a.pairedDifferenceInterval95?.upper).toBeCloseTo(2);
    expect(a.status).toBe("eligible_for_independent_review");
    expect(a.improvedCount).toBe(40);
  });

  it("refuses missing counterfactual utilities instead of inventing them", () => {
    expect(() => compareFullFeedbackPolicies({
      ...metadata,
      records: [{ id: "x", baselineActionId: "manual", signalActionId: "signal",
        actionUtilities: [{ actionId: "manual", utility: 5 }] }],
    })).toThrow(/Full feedback/);
  });

  it("does not promote synthetic wins into claims of business improvement", () => {
    const result = compareFullFeedbackPolicies({ ...metadata, provenance: "synthetic", records });
    expect(result.status).toBe("descriptive_only");
    expect(result.limitations.join(" ")).toMatch(/cannot support claims/);
  });
});