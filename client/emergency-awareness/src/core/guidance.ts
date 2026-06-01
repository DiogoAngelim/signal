import { confidenceLabel, round } from "./metadata";
import { buildMemoryContext } from "./risk";
import type { GuidanceResult, MemoryGateway, ResolvedPlace, RiskEvaluationResult, RiskZone } from "./types";
import type { NormalizedForecast } from "@signal/climate-forecast";

export async function generateGuidance(input: {
  evaluation: RiskEvaluationResult;
  forecast: NormalizedForecast;
  memory?: MemoryGateway;
  zone?: RiskZone;
}): Promise<GuidanceResult> {
  const zone = input.zone ?? primaryZone(input.evaluation);
  if (!zone) {
    return {
      state: "Unknown",
      whatIsHappening: "Information is missing.",
      why: ["There is not enough place or forecast information to explain concern."],
      confidence: {
        label: "Unknown",
        value: 0,
        explanation: "No confidence is shown because the required information is missing."
      },
      reasonableNextSteps: ["Check official local information before making plans."],
      uncertainty: ["No area could be evaluated."],
      memoryContext: [],
      warnings: input.evaluation.warnings,
      missingInformation: input.evaluation.missingInformation,
      source: "Signal Emergency Awareness",
      correlationId: input.evaluation.correlationId
    };
  }

  const memory = await buildMemoryContext({
    memory: input.memory,
    place: input.evaluation.place,
    forecast: input.forecast,
    zone
  });
  const memoryContext = memoryNotes(input.evaluation.place, zone, memory.similarity);
  const confidence = confidenceWithMemory(zone.confidence, memory.calibration.historicalCalibration.sampleSize);

  return {
    state: zone.riskState,
    whatIsHappening: whatIsHappening(zone),
    why: why(zone, input.forecast, memoryContext),
    confidence: {
      label: confidenceLabel(confidence),
      value: round(confidence),
      explanation: confidenceExplanation(confidence, memory.calibration.historicalCalibration.sampleSize)
    },
    reasonableNextSteps: nextSteps(zone),
    uncertainty: uncertainty(zone, input.forecast, memory.calibration.historicalCalibration.sampleSize),
    memoryContext,
    warnings: [...new Set([...input.evaluation.warnings, ...memory.warnings])],
    missingInformation: [...new Set(input.evaluation.missingInformation)],
    source: "Signal Emergency Awareness",
    correlationId: zone.correlationId
  };
}

function primaryZone(evaluation: RiskEvaluationResult): RiskZone | undefined {
  return [...evaluation.zones].sort((left, right) => right.riskScore - left.riskScore)[0];
}

function whatIsHappening(zone: RiskZone): string {
  if (zone.riskState === "Unknown") return "The app cannot make a clear call with the information available.";
  if (zone.riskState === "Act carefully") return "This area deserves immediate attention.";
  if (zone.riskState === "Prepare") return "This area may need preparation soon.";
  if (zone.riskState === "Pay attention") return "This area is worth watching.";
  return "No clear concern is visible from the available information.";
}

function why(zone: RiskZone, forecast: NormalizedForecast, memoryContext: readonly string[]): string[] {
  const reasons = [zone.reason];
  if (forecast.stale) reasons.push("The latest update is not fresh enough to treat as settled.");
  if (memoryContext.length) reasons.push(memoryContext[0] ?? "Signal Memory added historical context.");
  return reasons;
}

function nextSteps(zone: RiskZone): string[] {
  if (zone.riskState === "Act carefully") {
    return [
      "Avoid optional trips through the highlighted areas.",
      "Check official local instructions.",
      "Keep phones charged and routes flexible."
    ];
  }
  if (zone.riskState === "Prepare") {
    return [
      "Review travel plans and low-lying routes.",
      "Move important items away from spots that often get wet.",
      "Check again soon."
    ];
  }
  if (zone.riskState === "Pay attention") {
    return [
      "Keep watching the map.",
      "Check the next update before travel.",
      "Share the concern with people who depend on this area."
    ];
  }
  if (zone.riskState === "No clear concern") {
    return ["Keep normal awareness and check again if conditions change."];
  }
  return ["Information is missing; check official local sources before assuming the area is clear."];
}

function uncertainty(zone: RiskZone, forecast: NormalizedForecast, calibrationSamples: number): string[] {
  const notes: string[] = [];
  if (zone.approximate) notes.push("The area is approximate.");
  if (forecast.stale) notes.push("The latest weather update is old.");
  if (forecast.missingInformation.length) notes.push("Some forecast details are missing.");
  if (calibrationSamples === 0) notes.push("There is not enough reviewed Signal history for this exact scope.");
  return notes.length ? notes : ["No major uncertainty was identified in the available information."];
}

function memoryNotes(place: ResolvedPlace, zone: RiskZone, similarity: {
  similarCases: Array<{ outcomeSummary: string }>;
  outcomeDistribution: Record<string, number>;
}): string[] {
  const notes: string[] = [];
  const first = similarity.similarCases[0];
  if (first?.outcomeSummary) {
    notes.push(`Signal Memory found similar situations near ${place.label} where ${first.outcomeSummary.toLowerCase()}.`);
  }
  const closureLike = Object.entries(similarity.outcomeDistribution)
    .filter(([key]) => /closure|wrong|failure|careful|impact/i.test(key))
    .reduce((sum, [, value]) => sum + value, 0);
  if (closureLike > 0) {
    notes.push("Conditions resemble situations that previously caused disruptions.");
  }
  if (!notes.length && zone.riskState !== "No clear concern") {
    notes.push("Signal Memory did not find enough matching reviewed history to strengthen this guidance.");
  }
  return notes;
}

function confidenceWithMemory(confidence: number, calibrationSamples: number): number {
  return Math.max(0, Math.min(100, calibrationSamples > 0 ? confidence : confidence - 6));
}

function confidenceExplanation(confidence: number, calibrationSamples: number): string {
  if (confidence <= 0) return "Confidence is unknown because information is missing.";
  if (calibrationSamples === 0) return "Confidence is kept cautious because reviewed Signal history is limited for this scope.";
  return "Confidence reflects current information and reviewed Signal calibration.";
}
