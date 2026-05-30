import { describe, expect, it } from "vitest";
import { loadBundledSemanticLexicon } from "../../../signal-framework";
import { buildDashboardSemanticMetrics } from "./semantic-metrics";

describe("dashboard semantic metrics", () => {
  it("maps dashboard metrics into words from the generic Signal semantic lexicon", () => {
    const words = new Set(loadBundledSemanticLexicon().entries.map((entry) => entry.word));
    const result = buildDashboardSemanticMetrics({
      marketHealthPct: 72,
      opportunityDensityPct: 18,
      confidencePct: 64,
      riskPct: 28,
      avgQualityPct: 66,
      suggestedMaximumExposurePct: 5,
      strategyCapPct: 65,
      sizingMode: "small",
    });

    for (const metric of Object.values(result)) {
      expect(words.has(metric.word)).toBe(true);
      expect(metric.lexiconVersion).toBe("generic-state.v1");
      expect(metric.secondary.every((word) => words.has(word))).toBe(true);
    }
  });

  it("keeps zero exposure semantically limited without adding finance terms to Signal", () => {
    const result = buildDashboardSemanticMetrics({
      marketHealthPct: 80,
      opportunityDensityPct: 0,
      confidencePct: 78,
      riskPct: 18,
      avgQualityPct: 70,
      suggestedMaximumExposurePct: 0,
      strategyCapPct: 65,
      sizingMode: "none",
    });

    expect(result.maximumExposure.word).toBe("Limited");
    expect(result.sizing.word).toBe("Limited");
    expect(result.opportunityDensity.word).not.toBe("");
  });
});
