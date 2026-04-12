import type {
  OfficialAlert,
  Region,
  RiskComponent,
  RiskScore,
  RiskLevel
} from "../types/index.js";
import { clamp, toRiskLevel } from "../utils/math.js";
import { nowIso, parseIso } from "../utils/time.js";

interface RiskInput {
  region: Region;
  forecast?: {
    fetchedAt: string;
    precipitationMmNext6h: number;
    precipitationMmNext24h: number;
    windGustKphMax: number;
    temperatureCMax: number;
    temperatureCMin: number;
  };
  alerts: OfficialAlert[];
}

export function computeRiskScore(input: RiskInput): RiskScore {
  const { region, forecast } = input;
  const now = Date.now();
  const forecastAge = forecast ? ageHours(forecast.fetchedAt, now) : undefined;
  const dataConfidence = computeConfidence(forecastAge);

  const precipitationScore = forecast
    ? clamp(forecast.precipitationMmNext6h / 30) * 0.6 +
    clamp(forecast.precipitationMmNext24h / 80) * 0.4
    : 0;
  const precipitationRisk = createRiskComponent("precipitation", precipitationScore, [
    { name: "precipitation_6h_mm", weight: 0.6, value: forecast?.precipitationMmNext6h ?? 0 },
    { name: "precipitation_24h_mm", weight: 0.4, value: forecast?.precipitationMmNext24h ?? 0 }
  ]);

  const floodMultiplier = region.tags?.includes("river_basin")
    ? 1.3
    : region.tags?.includes("coastal")
      ? 1.1
      : 1;
  const floodBase = forecast ? clamp(forecast.precipitationMmNext24h / 90) : 0;
  const floodRisk = createRiskComponent("flood", clamp(floodBase * floodMultiplier), [
    { name: "precipitation_24h_mm", weight: 0.7, value: forecast?.precipitationMmNext24h ?? 0 },
    { name: "river_basin", weight: 0.3, value: region.tags?.includes("river_basin") ?? false }
  ]);

  const windScore = forecast ? clamp(forecast.windGustKphMax / 90) : 0;
  const windRisk = createRiskComponent("wind", windScore, [
    { name: "wind_gust_kph", weight: 1, value: forecast?.windGustKphMax ?? 0 }
  ]);

  const heatScore = forecast
    ? Math.max(clamp((forecast.temperatureCMax - 32) / 12), clamp((0 - forecast.temperatureCMin) / 10))
    : 0;
  const heatRisk = createRiskComponent("heat", heatScore, [
    { name: "temperature_max_c", weight: 0.6, value: forecast?.temperatureCMax ?? 0 },
    { name: "temperature_min_c", weight: 0.4, value: forecast?.temperatureCMin ?? 0 }
  ]);

  const stormScore = forecast
    ? clamp(
      (forecast.precipitationMmNext6h / 40) * 0.4 +
      (forecast.windGustKphMax / 100) * 0.6
    )
    : 0;
  const stormRisk = createRiskComponent("storm", stormScore, [
    { name: "precipitation_6h_mm", weight: 0.4, value: forecast?.precipitationMmNext6h ?? 0 },
    { name: "wind_gust_kph", weight: 0.6, value: forecast?.windGustKphMax ?? 0 }
  ]);

  const landslideMultiplier = region.tags?.includes("mountainous") ? 1.4 : 0.7;
  const landslideBase = forecast ? clamp(forecast.precipitationMmNext24h / 70) : 0;
  const landslideRisk = createRiskComponent(
    "landslide",
    clamp(landslideBase * landslideMultiplier),
    [
      { name: "precipitation_24h_mm", weight: 0.7, value: forecast?.precipitationMmNext24h ?? 0 },
      { name: "mountainous", weight: 0.3, value: region.tags?.includes("mountainous") ?? false }
    ]
  );

  const alertBoost = severityBoost(input.alerts);
  const compositeBase = clamp(
    precipitationRisk.score * 0.2 +
    floodRisk.score * 0.2 +
    windRisk.score * 0.15 +
    heatRisk.score * 0.15 +
    stormRisk.score * 0.2 +
    landslideRisk.score * 0.1 +
    alertBoost
  );
  const criticalityWeight = region.criticalityWeight ?? 1;
  const weightedComposite = clamp(compositeBase * (1 + (criticalityWeight - 1) * 0.2));
  const compositeRisk = createRiskComponent(
    "composite",
    clamp(weightedComposite * dataConfidence),
    [
      { name: "alert_boost", weight: 0.2, value: alertBoost },
      { name: "criticality_weight", weight: 0.1, value: criticalityWeight },
      { name: "data_confidence", weight: 0.1, value: dataConfidence }
    ]
  );

  return {
    regionId: region.id,
    computedAt: nowIso(),
    dataConfidence,
    precipitationRisk,
    floodRisk,
    windRisk,
    heatRisk,
    stormRisk,
    landslideRisk,
    compositeRisk
  };
}

function createRiskComponent(
  name: string,
  score: number,
  topDrivers: RiskComponent["topDrivers"]
): RiskComponent {
  return {
    score: clamp(score),
    level: toRiskLevel(score),
    topDrivers: topDrivers.map((driver) => ({
      ...driver,
      name: `${name}.${driver.name}`
    }))
  };
}

function severityBoost(alerts: OfficialAlert[]): number {
  if (alerts.length === 0) {
    return 0;
  }
  let boost = 0;
  for (const alert of alerts) {
    if (alert.severity === "extreme") {
      boost = Math.max(boost, 0.25);
    } else if (alert.severity === "severe") {
      boost = Math.max(boost, 0.2);
    } else if (alert.severity === "moderate") {
      boost = Math.max(boost, 0.1);
    }
  }
  return boost;
}

function ageHours(iso: string, now: number): number | undefined {
  const timestamp = parseIso(iso);
  if (!timestamp) {
    return undefined;
  }
  return Math.max(0, (now - timestamp) / 3_600_000);
}

function computeConfidence(ageHoursValue?: number): number {
  if (ageHoursValue === undefined) {
    return 0.6;
  }
  if (ageHoursValue <= 3) {
    return 1;
  }
  if (ageHoursValue <= 6) {
    return 0.85;
  }
  if (ageHoursValue <= 12) {
    return 0.7;
  }
  if (ageHoursValue <= 24) {
    return 0.5;
  }
  return 0.3;
}

export function pickHighestRiskLevel(levels: RiskLevel[]): RiskLevel {
  const order: RiskLevel[] = ["low", "guarded", "elevated", "high", "critical"];
  return levels.reduce((highest, level) =>
    order.indexOf(level) > order.indexOf(highest) ? level : highest
  );
}
