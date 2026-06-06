import { clamp, numeric } from "../math/statistics";
import type { SynchronizationInput, SynchronizationState, VenueState } from "../types";

export function evaluateSynchronization(input: SynchronizationInput = {}): SynchronizationState {
  const quoteAgeMs = Math.max(0, numeric(input.quoteAgeMs, 0));
  const websocketLatencyMs = Math.max(0, numeric(input.websocketLatencyMs, 0));
  const candleIntegrity = clamp(numeric(input.candleIntegrity, 100));
  const missingIntervals = Math.max(0, numeric(input.missingIntervals, 0));
  const staleTimestamps = Math.max(0, numeric(input.staleTimestamps, 0));
  const liquidityScore = clamp(numeric(input.liquidityScore, 100));
  const spreadBps = Math.max(0, numeric(input.spreadBps, 0));

  const dataFreshness = clamp(100 - quoteAgeMs / 900 - staleTimestamps * 8);
  const latencyPenalty = clamp(websocketLatencyMs / 25);
  const intervalPenalty = clamp(missingIntervals * 7 + (100 - candleIntegrity) * 0.6);
  const spreadIrregularity = clamp(spreadBps * 4);
  const liquidityDegradation = clamp(100 - liquidityScore);
  const reliabilityPenalty = clamp(
    latencyPenalty * 0.2 + intervalPenalty * 0.32 + spreadIrregularity * 0.18 + liquidityDegradation * 0.2 + (100 - dataFreshness) * 0.1,
  );

  const inferredState = inferVenueState(input.venueState, dataFreshness, reliabilityPenalty);
  const venuePenalty = inferredState === "CLOSED" ? 10 : inferredState === "PREMARKET" ? 8 : inferredState === "DEGRADED" ? 18 : inferredState === "STALE" ? 32 : 0;

  return {
    venueState: inferredState,
    score: clamp(100 - reliabilityPenalty - venuePenalty),
    dataFreshness,
    reliabilityPenalty: clamp(reliabilityPenalty + venuePenalty),
    quoteAgeMs,
    websocketLatencyMs,
    candleIntegrity,
    missingIntervals,
    staleTimestamps,
    spreadIrregularity,
    liquidityDegradation,
  };
}

function inferVenueState(explicit: VenueState | undefined, freshness: number, penalty: number): VenueState {
  if (explicit === "CLOSED" || explicit === "PREMARKET") return explicit;
  if (explicit === "STALE" || freshness < 35) return "STALE";
  if (explicit === "DEGRADED" || penalty > 35) return "DEGRADED";
  if (explicit === "OPEN" && freshness > 80 && penalty < 18) return "LIVE_SYNCED";
  return explicit ?? "OPEN";
}
