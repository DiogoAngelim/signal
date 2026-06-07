
import { clamp, mean } from "../math/statistics";
import type { OpportunityCandidate, OpportunityDensityInput, OpportunityDensityState } from "../types";








export function evaluateOpportunityDensity(input: OpportunityDensityInput): OpportunityDensityState {
  
  const candidates = input.candidates ?? [];

  if (!candidates.length) {
    return {
      density: 0,
      quality: 0,
      confidence: 0,
      trend: "flat",
      explanation: "No opportunity candidates are currently visible.",
    };
  }

  const countScore = clamp(candidates.length * 12);
  const quality = meanScore(candidates, "strength");
  const confidence = meanScore(candidates, "confidence");
  const velocity = clamp(mean(candidates.map((candidate) => (candidate.emerging ? candidate.strength : 0))));
  const persistence = clamp((candidates.filter((candidate) => candidate.persistent).length / candidates.length) * 100);
  const diversity = clamp((new Set(candidates.map((candidate) => candidate.type)).size / 8) * 100);
  const conviction = clamp(mean([quality, confidence, persistence]));
  const density = round(clamp(
    countScore * 0.18 +
      quality * 0.26 +
      velocity * 0.18 +
      persistence * 0.14 +
      diversity * 0.1 +
      conviction * 0.14,
  ));
  const previous = input.previousDensity;
  
  const trend = previous == null ? "flat" : density > previous + 3 ? "improving" : density < previous - 3 ? "weakening" : "flat";

  return {
    density,
    quality: round(quality),
    confidence: round(confidence),
    trend,
    explanation:
      `${candidates.length} candidates across ${new Set(candidates.map((candidate) => candidate.type)).size} opportunity concepts; ` +
      `quality ${round(quality)}%, persistence ${round(persistence)}%, conviction ${round(conviction)}%.`,
  };
}

function meanScore(candidates: OpportunityCandidate[], key: "strength" | "confidence") {
  return clamp(mean(candidates.map((candidate) => candidate[key])));
}


function round(value: number) {
  return Number(value.toFixed(2));
}

