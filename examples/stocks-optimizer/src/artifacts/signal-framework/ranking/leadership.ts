import { clamp, mean, stdev } from "../math/statistics";
import type { LeadershipRank, ObservationPoint } from "../types";

export function rankLeadership(
  observations: ObservationPoint[] = [],
): LeadershipRank[] {
  const grouped = new Map<string, ObservationPoint[]>();
  for (const observation of observations) {
    grouped.set(observation.id, [
      ...(grouped.get(observation.id) ?? []),
      observation,
    ]);
  }

  return Array.from(grouped.entries())
    .map(([id, points]) => {
      const sorted = points.slice().sort((a, b) => a.timestamp - b.timestamp);
      const values = sorted.map((point) => point.value);
      const first = values[0] ?? 0;
      const last = values[values.length - 1] ?? first;
      const changes = values
        .slice(1)
        .map((value, index) => value - values[index]);
      const relativeStrength = clamp(50 + (last - first) * 2);
      const momentumPersistence = clamp(
        (changes.filter((value) => value > 0).length /
          Math.max(1, changes.length)) *
          100,
      );
      const volatility = stdev(changes);
      const volatilityAdjustedPerformance = clamp(
        50 + (last - first) / Math.max(1, volatility),
      );
      const latest = sorted[sorted.length - 1];
      const volumeExpansion = clamp(
        Number(latest?.dimensions?.volumeExpansion ?? 50),
      );
      const liquidityQuality = clamp(
        Number(latest?.dimensions?.liquidityQuality ?? 70),
      );
      const breadthParticipation = clamp(
        Number(latest?.dimensions?.breadthParticipation ?? 50),
      );
      const sectorSynchronization = clamp(
        Number(latest?.dimensions?.sectorSynchronization ?? 50),
      );
      const acceleration = clamp(50 + mean(changes.slice(-3)) * 8);
      const compressionStructure = clamp(100 - volatility * 8);
      const anomalousAccumulation = clamp(
        (volumeExpansion + compressionStructure + momentumPersistence) / 3,
      );
      const score = clamp(
        relativeStrength * 0.24 +
          momentumPersistence * 0.18 +
          volatilityAdjustedPerformance * 0.18 +
          volumeExpansion * 0.12 +
          liquidityQuality * 0.1 +
          breadthParticipation * 0.1 +
          sectorSynchronization * 0.08,
      );

      return {
        id,
        score,
        relativeStrength,
        momentumPersistence,
        volatilityAdjustedPerformance,
        volumeExpansion,
        liquidityQuality,
        breadthParticipation,
        sectorSynchronization,
        emerging: score > 68 && acceleration > 58,
        acceleration,
        compressionStructure,
        anomalousAccumulation,
      };
    })
    .sort((a, b) => b.score - a.score);
}
