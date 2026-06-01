import type { NormalizedForecast } from "@signal/climate-forecast";
import { clamp, commonWarnings, correlationId, freshnessScore, round } from "./metadata";
import { EMPTY_CALIBRATION, EMPTY_SIMILARITY } from "./memory-gateway";
import type {
  AreaPolygon,
  CalibrationInsight,
  ConcernState,
  MemoryGateway,
  MemoryScope,
  ResolvedPlace,
  RiskEvaluationInput,
  RiskEvaluationResult,
  RiskZone,
  SimilarityInsight
} from "./types";
import { CLIMATE_RISK_DOMAIN, EMERGENCY_AWARENESS_APP_ID } from "./types";

type InternalConcernFactors = {
  hazard: number;
  exposure: number;
  vulnerability: number;
  weatherPressure: number;
  placeSensitivity: number;
  nearbyInfrastructure: number;
};

export async function evaluateRiskZones(input: RiskEvaluationInput): Promise<RiskEvaluationResult> {
  const memory = input.memory;
  const warnings: string[] = [];
  const missingInformation: string[] = [];
  const zones: RiskZone[] = [];

  for (const area of input.place.grid) {
    const scope = memoryScope(input.place, area, input.forecast, input.now);
    const calibration = memory ? await safeCalibration(memory, scope, warnings) : EMPTY_CALIBRATION;
    const zone = buildRiskZone({
      area,
      place: input.place,
      forecast: input.forecast,
      calibration,
      correlationId: input.correlationId ?? scope.decisionId
    });
    zones.push(zone);
    if (memory) {
      await safeRecordDecision(memory, { scope, zone, place: input.place, forecast: input.forecast }, warnings);
    }
  }

  const primary = highestConcern(zones);
  missingInformation.push(...input.place.missingInformation, ...input.forecast.missingInformation, ...zones.flatMap((zone) => zone.missingInformation));
  warnings.push(...input.place.warnings, ...input.forecast.warnings, ...zones.flatMap((zone) => zone.warnings));

  return {
    place: input.place,
    zones,
    primaryConcern: primary?.riskState ?? "Unknown",
    confidence: round(average(zones.map((zone) => zone.confidence), input.forecast.confidence)),
    freshness: round(Math.min(freshnessScore(input.forecast.freshness), ...zones.map((zone) => zone.freshness))),
    warnings: commonWarnings(warnings),
    missingInformation: commonWarnings(missingInformation),
    source: "Signal Emergency Awareness",
    correlationId: input.correlationId ?? input.forecast.correlationId
  };
}

export async function buildMemoryContext(input: {
  memory?: MemoryGateway;
  place: ResolvedPlace;
  forecast: NormalizedForecast;
  zone: RiskZone;
}): Promise<{
  scope: MemoryScope;
  similarity: SimilarityInsight;
  calibration: CalibrationInsight;
  warnings: string[];
}> {
  const scope = memoryScope(input.place, input.zone, input.forecast);
  if (!input.memory) {
    return { scope, similarity: EMPTY_SIMILARITY, calibration: EMPTY_CALIBRATION, warnings: [] };
  }
  const warnings: string[] = [];
  const [similarity, calibration] = await Promise.all([
    input.memory.querySimilarity({ scope, zone: input.zone, place: input.place, forecast: input.forecast }).catch((error) => {
      warnings.push(memoryWarning("similarity", error));
      return EMPTY_SIMILARITY;
    }),
    input.memory.queryCalibration({ scope }).catch((error) => {
      warnings.push(memoryWarning("calibration", error));
      return EMPTY_CALIBRATION;
    })
  ]);
  return { scope, similarity, calibration, warnings };
}

export function memoryScope(place: ResolvedPlace, area: Pick<AreaPolygon, "id">, forecast: NormalizedForecast, timestamp?: string): MemoryScope {
  const forecastTime = forecast.freshness.fetchedAt || new Date().toISOString();
  return {
    appId: EMERGENCY_AWARENESS_APP_ID,
    domain: CLIMATE_RISK_DOMAIN,
    decisionId: [
      "concern",
      slug(place.id),
      slug(area.id),
      slug(forecastTime)
    ].join(":"),
    timestamp: timestamp ?? forecastTime
  };
}

export function concernFromScore(score: number, confidence: number, missingInformation: readonly string[]): ConcernState {
  if (hasCriticalMissingInformation(missingInformation) || confidence < 20) return "Unknown";
  if (score >= 75) return "Act carefully";
  if (score >= 50) return "Prepare";
  if (score >= 25) return "Pay attention";
  return "No clear concern";
}

export function recommendedActionFor(state: ConcernState): string {
  if (state === "Act carefully") return "Avoid unnecessary travel and follow local instructions.";
  if (state === "Prepare") return "Check routes, charge devices, and be ready to change plans.";
  if (state === "Pay attention") return "Keep watching conditions and check updates before travel.";
  if (state === "No clear concern") return "No special action is suggested from the available information.";
  return "Information is missing; do not assume conditions are normal.";
}

function buildRiskZone(input: {
  area: AreaPolygon;
  place: ResolvedPlace;
  forecast: NormalizedForecast;
  calibration: CalibrationInsight;
  correlationId: string;
}): RiskZone {
  const factors = concernFactors(input.place, input.forecast, input.area);
  const baseConfidence = calibratedConfidence(input.forecast.confidence, input.calibration, input.forecast);
  const freshness = freshnessScore(input.forecast.freshness);
  const missingInformation = commonWarnings(input.forecast.missingInformation, calibrationMissing(input.calibration));
  const riskScore = clamp(
    factors.weatherPressure * 0.42 +
    factors.placeSensitivity * 0.22 +
    factors.nearbyInfrastructure * 0.16 +
    (100 - baseConfidence) * 0.1 +
    (100 - freshness) * 0.1
  );
  const state = concernFromScore(riskScore, baseConfidence, missingInformation);
  const reason = reasonFor(state, factors, input.forecast, input.calibration);
  const warnings = commonWarnings(input.forecast.warnings, calibrationWarnings(input.calibration));

  return {
    ...input.area,
    riskState: state,
    riskScore: round(riskScore),
    confidence: round(baseConfidence),
    freshness: round(freshness),
    reason,
    recommendedAction: recommendedActionFor(state),
    warnings,
    missingInformation,
    source: "Signal Emergency Awareness",
    correlationId: correlationId("risk-zone", input.correlationId)
  };
}

function concernFactors(place: ResolvedPlace, forecast: NormalizedForecast, area: AreaPolygon): InternalConcernFactors {
  const summary = forecast.summary;
  const rainPressure = clamp(summary.totalPrecipitationMm * 2.2 + summary.maxHourlyPrecipitationMm * 7);
  const chancePressure = clamp(summary.maxPrecipitationProbabilityPercent);
  const windPressure = clamp(Math.max(0, summary.maxWindSpeedKph - 25) * 2.5);
  const temperaturePressure = temperatureConcern(summary.minTemperatureC, summary.maxTemperatureC);
  const weatherPressure = clamp(rainPressure * 0.48 + chancePressure * 0.22 + windPressure * 0.18 + temperaturePressure * 0.12);
  const placeSensitivity = clamp(35 + (place.precisionLabel === "Approximate area" ? 10 : 0) + coastalHint(place) + areaPositionHint(area));
  const nearbyInfrastructure = clamp(45 + cityHint(place) + roadHint(area));
  const hazard = weatherPressure;
  const exposure = nearbyInfrastructure;
  const vulnerability = placeSensitivity;
  return { hazard, exposure, vulnerability, weatherPressure, placeSensitivity, nearbyInfrastructure };
}

function calibratedConfidence(base: number, calibration: CalibrationInsight, forecast: NormalizedForecast): number {
  if (forecast.freshness.state === "missing") return 0;
  let confidence = base;
  if (calibration.historicalCalibration.sampleSize === 0) confidence -= 10;
  if (calibration.overconfidence) confidence -= 14;
  if (calibration.underconfidence) confidence += 5;
  if (calibration.confidenceAccuracy > 0) {
    confidence = confidence * 0.72 + calibration.confidenceAccuracy * 0.28;
  }
  return clamp(confidence);
}

function calibrationMissing(calibration: CalibrationInsight): string[] {
  return calibration.historicalCalibration.sampleSize === 0 ? ["historical calibration"] : [];
}

function calibrationWarnings(calibration: CalibrationInsight): string[] {
  if (calibration.overconfidence) return ["Past confidence ran high for similar scoped decisions."];
  if (calibration.underconfidence) return ["Past confidence ran low for similar scoped decisions."];
  if (calibration.historicalCalibration.sampleSize === 0) return ["Confidence is conservative because reviewed history is not available for this place and time."];
  return [];
}

function reasonFor(
  state: ConcernState,
  factors: InternalConcernFactors,
  forecast: NormalizedForecast,
  calibration: CalibrationInsight,
): string {
  if (state === "Unknown") {
    return hasCriticalMissingInformation(forecast.missingInformation)
      ? "Information is missing, so the app cannot say conditions are normal."
      : "Confidence is too limited to make a clear call.";
  }
  const rain = forecast.summary.totalPrecipitationMm;
  const chance = forecast.summary.maxPrecipitationProbabilityPercent;
  const pieces = [];
  if (rain >= 20 || chance >= 70) pieces.push("rain could affect low spots and routes");
  if (forecast.summary.maxWindSpeedKph >= 45) pieces.push("wind could make travel harder");
  if (factors.placeSensitivity >= 60) pieces.push("this area may need closer watching");
  if (calibration.historicalCalibration.sampleSize === 0) pieces.push("confidence is kept cautious");
  if (!pieces.length) pieces.push("available information does not point to a clear concern");
  return pieces.join("; ") + ".";
}

function highestConcern(zones: readonly RiskZone[]): RiskZone | undefined {
  return [...zones].sort((a, b) => b.riskScore - a.riskScore)[0];
}

function average(values: readonly number[], fallback: number): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function hasCriticalMissingInformation(missingInformation: readonly string[]): boolean {
  const normalized = new Set(missingInformation.map((item) => item.toLowerCase()));
  if (
    normalized.has("forecast") ||
    normalized.has("fresh forecast") ||
    normalized.has("hourly forecast") ||
    normalized.has("provider") ||
    normalized.has("place")
  ) {
    return true;
  }
  return normalized.has("precipitation") && normalized.has("chance of precipitation");
}

async function safeCalibration(memory: MemoryGateway, scope: MemoryScope, warnings: string[]): Promise<CalibrationInsight> {
  try {
    return await memory.queryCalibration({ scope });
  } catch (error) {
    warnings.push(memoryWarning("calibration", error));
    return EMPTY_CALIBRATION;
  }
}

async function safeRecordDecision(
  memory: MemoryGateway,
  input: Parameters<MemoryGateway["recordDecision"]>[0],
  warnings: string[],
): Promise<void> {
  try {
    await memory.recordDecision(input);
  } catch (error) {
    warnings.push(memoryWarning("decision memory", error));
  }
}

function memoryWarning(kind: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Signal Memory was unavailable.";
  return `Signal ${kind} was unavailable: ${message}`;
}

function temperatureConcern(min?: number, max?: number): number {
  const low = typeof min === "number" ? Math.max(0, 0 - min) * 4 : 0;
  const high = typeof max === "number" ? Math.max(0, max - 35) * 5 : 0;
  return clamp(low + high);
}

function coastalHint(place: ResolvedPlace): number {
  const text = `${place.label} ${place.region ?? ""}`.toLowerCase();
  return /(coast|bay|beach|island|delta|river|parish|miami|orleans|rio|jakarta)/.test(text) ? 18 : 0;
}

function cityHint(place: ResolvedPlace): number {
  const text = `${place.label} ${String(place.metadata["category"] ?? "")} ${String(place.metadata["osm_value"] ?? "")}`.toLowerCase();
  return /(city|town|neighbourhood|neighborhood|suburb|municipality|place)/.test(text) ? 14 : 4;
}

function areaPositionHint(area: AreaPolygon): number {
  return /3-|2-/.test(area.id) ? 8 : 0;
}

function roadHint(area: AreaPolygon): number {
  return /2-2|2-3|3-2/.test(area.id) ? 10 : 0;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "unknown";
}
