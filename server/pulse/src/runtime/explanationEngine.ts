import type { Explanation, Frame, Profile } from "../domain";

const impactForValue = (value: number): "positive" | "negative" | "neutral" => {
  if (value >= 0.6) {
    return "positive";
  }
  if (value <= 0.4) {
    return "negative";
  }
  return "neutral";
};

export class ExplanationEngine {
  explain(profile: Profile, frame: Frame): Explanation {
    const drivers = profile.explanation.drivers.map((key) => {
      const value = frame.features[key] ?? frame.scores[key] ?? 0;
      return {
        key,
        value,
        impact: impactForValue(value),
      };
    });

    const summary =
      frame.status === "eligible"
        ? "Frame eligible"
        : frame.status === "degraded"
          ? "Frame degraded due to partial or stale inputs"
          : "Frame rejected";

    return {
      summary,
      reasonCodes: frame.reasonCodes,
      drivers,
      confidenceBreakdown: frame.confidenceBreakdown,
    };
  }
}
