import { clamp } from "@digelim/12.signal";
import type { Profile } from "../domain";

export class ScoreEngine {
  score(
    profile: Profile,
    features: Record<string, number>,
  ): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const rule of profile.scoring) {
      if (rule.method !== "weighted_sum") {
        continue;
      }
      let totalWeight = 0;
      let sum = 0;

      for (const [key, weight] of Object.entries(rule.featureWeights)) {
        totalWeight += weight;
        const value = features[key] ?? 0;
        sum += value * weight;
      }

      const normalized = totalWeight === 0 ? 0 : sum / totalWeight;
      scores[rule.scoreKey] = clamp(normalized, 0, 1);
    }

    return scores;
  }
}
