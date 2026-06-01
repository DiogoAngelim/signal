import { clamp } from "@digelim/12.signal";
import type { Profile } from "../domain";

export type NormalizationResult = {
  features: Record<string, number>;
  missingRequired: string[];
  present: string[];
};

export class Normalizer {
  normalize(
    profile: Profile,
    rawInputs: Record<string, number>,
  ): NormalizationResult {
    const features: Record<string, number> = {};
    const missingRequired: string[] = [];
    const present: string[] = [];
    const ruleMap = new Map(
      profile.normalization.map((rule) => [rule.key, rule]),
    );

    for (const feature of profile.features) {
      const value = rawInputs[feature.key];
      if (typeof value !== "number") {
        if (feature.required) {
          missingRequired.push(feature.key);
        }
        continue;
      }

      present.push(feature.key);

      const rule = ruleMap.get(feature.key);
      let normalized = value;

      if (rule) {
        if (
          rule.method === "minmax" &&
          typeof rule.min === "number" &&
          typeof rule.max === "number" &&
          rule.max !== rule.min
        ) {
          normalized = (value - rule.min) / (rule.max - rule.min);
        } else if (
          rule.method === "zscore" &&
          typeof rule.mean === "number" &&
          typeof rule.stdDev === "number" &&
          rule.stdDev !== 0
        ) {
          normalized = (value - rule.mean) / rule.stdDev;
        }
      }

      features[feature.key] = clamp(normalized, 0, 1);
    }

    return { features, missingRequired, present };
  }
}
