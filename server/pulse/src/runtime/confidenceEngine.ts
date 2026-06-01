import { clamp } from "@digelim/12.signal";
import type { ConfidenceBreakdown, Profile } from "../domain";

export type ConfidenceResult = {
  confidence: number;
  breakdown: ConfidenceBreakdown;
  freshnessMs: number;
  freshnessQuality: number;
  featureCompleteness: number;
};

export class ConfidenceEngine {
  compute(
    profile: Profile,
    freshnessMs: number,
    missingRequiredCount: number,
    totalRequired: number,
  ): ConfidenceResult {
    const featureCompleteness =
      totalRequired === 0
        ? 1
        : (totalRequired - missingRequiredCount) / totalRequired;
    const freshnessQuality =
      profile.freshnessPolicy.maxAgeMs > 0
        ? clamp(1 - freshnessMs / profile.freshnessPolicy.maxAgeMs, 0, 1)
        : 0;
    const confidence = clamp(
      (featureCompleteness + freshnessQuality) / 2,
      0,
      1,
    );

    return {
      confidence,
      breakdown: {
        featureCompleteness: clamp(featureCompleteness, 0, 1),
        freshness: freshnessQuality,
      },
      freshnessMs,
      freshnessQuality,
      featureCompleteness: clamp(featureCompleteness, 0, 1),
    };
  }
}
