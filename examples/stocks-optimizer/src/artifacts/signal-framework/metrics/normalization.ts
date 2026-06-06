import { clamp, mean, percentileRank, stdev } from "../math/statistics";
import type { NormalizationState } from "../types";

export type NormalizationMemory = Map<string, number[]>;

export function normalizeMetric(
  key: string,
  score: number,
  memory: NormalizationMemory,
  maxHistory: number,
  regimeVolatilityScale = 1,
): NormalizationState {
  const history = memory.get(key) ?? [];
  const nextHistory = [...history, clamp(score)].slice(-maxHistory);
  memory.set(key, nextHistory);

  const average = mean(nextHistory);
  const sigma = stdev(nextHistory);
  const zScore = sigma > 0 ? (score - average) / sigma : 0;
  const percentileScore = nextHistory.length > 1 ? percentileRank(nextHistory, score) : clamp(score);
  const zScoreNormalized = clamp(50 + zScore * 14);
  const volatilityAdjustedScore = clamp(score - sigma * 0.16 * regimeVolatilityScale + Math.abs(score - average) * 0.08);
  const boundedScore = clamp(
    score * 0.46 +
      percentileScore * 0.24 +
      zScoreNormalized * 0.18 +
      volatilityAdjustedScore * 0.12,
  );

  return {
    zScore,
    zScoreNormalized,
    percentileScore,
    volatilityAdjustedScore,
    boundedScore,
  };
}
