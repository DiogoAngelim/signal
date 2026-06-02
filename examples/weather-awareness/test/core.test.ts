import { createInMemoryDecisionMemoryStore } from "@signal/decision-memory";
import { describe, expect, it } from "vitest";
import {
  createDemoPlaceAdapter,
  createEmergencyAwarenessOperations,
  createPlaceService,
  createRiskMapLayer,
  createSignalDecisionMemoryGateway,
  evaluateRiskZones,
  generateGuidance,
  resolvePlace
} from "../src";
import type { MemoryGateway, PlaceSearchResult } from "../src";
import type { NormalizedForecast, ProviderHealth } from "@signal/climate-forecast";

describe("emergency awareness core", () => {
  it("resolves approximate grids without implying precise boundaries", () => {
    const place = resolvePlace({
      id: "test:place",
      provider: "demo",
      label: "Test City",
      coordinates: { latitude: 10, longitude: 20 },
      metadata: {}
    });

    expect(place.precisionLabel).toBe("Approximate area");
    expect(place.grid).toHaveLength(9);
    expect(place.missingInformation).toContain("known boundary");
  });

  it("does not report normal conditions when forecast information is missing", async () => {
    const place = resolvePlace(demoCandidate());
    const evaluation = await evaluateRiskZones({ place, forecast: missingForecast() });

    expect(evaluation.primaryConcern).toBe("Unknown");
    expect(evaluation.missingInformation).toContain("forecast");
    expect(evaluation.zones.every((zone) => zone.recommendedAction.includes("Information is missing"))).toBe(true);
  });

  it("keeps approximate areas and missing calibration as uncertainty, not automatic unknown", async () => {
    const place = resolvePlace({
      id: "test:approximate",
      provider: "demo",
      label: "Approximate Test City",
      coordinates: { latitude: 10, longitude: 20 },
      metadata: {}
    });
    const evaluation = await evaluateRiskZones({ place, forecast: watchForecast() });
    const guidance = await generateGuidance({ evaluation, forecast: watchForecast() });

    expect(evaluation.primaryConcern).toBe("Pay attention");
    expect(evaluation.missingInformation).toContain("known boundary");
    expect(evaluation.missingInformation).toContain("historical calibration");
    expect(guidance.whatIsHappening).toBe("This area is worth watching.");
    expect(guidance.reasonableNextSteps.join(" ")).not.toContain("Information is missing");
  });

  it("records concern decisions through existing Signal Memory scope", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const memory = createSignalDecisionMemoryGateway(store);
    const place = resolvePlace(demoCandidate());
    await evaluateRiskZones({ place, forecast: rainyForecast(), memory });

    const records = await store.listDecisionRecords({
      appId: "emergency-awareness",
      domain: "climate-risk",
      source: "emergency-awareness",
      limit: 50
    });

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.appId === "emergency-awareness")).toBe(true);
    expect(records.every((record) => record.domain === "climate-risk")).toBe(true);
  });

  it("uses Signal similarity context in guidance without exposing scores", async () => {
    const place = resolvePlace(demoCandidate());
    const memory = fakeMemory();
    const evaluation = await evaluateRiskZones({ place, forecast: rainyForecast(), memory });
    const guidance = await generateGuidance({ evaluation, forecast: rainyForecast(), memory });

    expect(guidance.memoryContext.join(" ")).toContain("similar situations");
    expect(guidance.memoryContext.join(" ")).not.toMatch(/\b0\.\d+\b/);
    expect(guidance.confidence.value).toBeLessThanOrEqual(100);
  });

  it("returns area features, not marker features, for the map layer", async () => {
    const place = resolvePlace(demoCandidate());
    const evaluation = await evaluateRiskZones({ place, forecast: rainyForecast() });
    const layer = createRiskMapLayer(evaluation);

    expect(layer.type).toBe("FeatureCollection");
    expect(layer.features.length).toBeGreaterThan(0);
    expect(layer.features.every((feature) => feature.geometry.type === "Polygon")).toBe(true);
    expect(layer.features.every((feature) => feature.properties.recommendedAction)).toBe(true);
  });

  it("exposes required API operations with common response metadata", async () => {
    const places = createPlaceService([createDemoPlaceAdapter()]);
    const operations = createEmergencyAwarenessOperations({
      places,
      forecast: fakeForecastClient(),
      memory: fakeMemory()
    });
    const search = operations.find((operation) => operation.name === "place.search.v1");
    const health = operations.find((operation) => operation.name === "provider.health.v1");

    expect(operations.map((operation) => operation.name)).toEqual([
      "place.search.v1",
      "place.resolve.v1",
      "forecast.get.v1",
      "risk.zones.evaluate.v1",
      "risk.map.layer.v1",
      "risk.guidance.generate.v1",
      "provider.health.v1"
    ]);

    const searchResult = await search?.handler({ query: "Miami" }) as Record<string, unknown>;
    const healthResult = await health?.handler({}) as Record<string, unknown>;

    for (const result of [searchResult, healthResult]) {
      expect(result["confidence"]).toEqual(expect.any(Number));
      expect(result["freshness"]).toEqual(expect.any(Number));
      expect(result["warnings"]).toEqual(expect.any(Array));
      expect(result["missingInformation"]).toEqual(expect.any(Array));
      expect(result["source"]).toEqual(expect.any(String));
      expect(result["correlationId"]).toEqual(expect.any(String));
    }
  });
});

function demoCandidate(): PlaceSearchResult {
  return {
    id: "demo:miami",
    provider: "demo",
    label: "Miami, Florida, United States",
    coordinates: { latitude: 25.7617, longitude: -80.1918 },
    region: "Miami-Dade County, Florida",
    boundingBox: {
      minLatitude: 25.64,
      minLongitude: -80.31,
      maxLatitude: 25.88,
      maxLongitude: -80.07
    },
    metadata: { category: "place", osm_value: "city" }
  };
}

function rainyForecast(): NormalizedForecast {
  return {
    latitude: 25.7617,
    longitude: -80.1918,
    hours: 48,
    provider: "open-meteo",
    source: "Open-Meteo",
    hourly: [],
    summary: {
      nextHours: 24,
      totalPrecipitationMm: 38,
      maxHourlyPrecipitationMm: 9,
      maxPrecipitationProbabilityPercent: 92,
      maxWindSpeedKph: 42,
      minTemperatureC: 24,
      maxTemperatureC: 30,
      weatherCodes: [63]
    },
    confidence: 82,
    freshness: {
      fetchedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-01T12:30:00.000Z",
      ageMs: 0,
      state: "fresh",
      score: 100
    },
    warnings: [],
    missingInformation: [],
    stale: false,
    fromCache: false,
    degraded: false,
    correlationId: "forecast:rainy"
  };
}

function missingForecast(): NormalizedForecast {
  return {
    ...rainyForecast(),
    provider: "fallback",
    source: "Signal climate forecast fallback",
    summary: {
      nextHours: 0,
      totalPrecipitationMm: 0,
      maxHourlyPrecipitationMm: 0,
      maxPrecipitationProbabilityPercent: 0,
      maxWindSpeedKph: 0,
      weatherCodes: []
    },
    confidence: 0,
    freshness: {
      fetchedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-01T12:00:00.000Z",
      ageMs: 0,
      state: "missing",
      score: 0
    },
    missingInformation: ["forecast"],
    warnings: ["Information is missing."],
    stale: true,
    degraded: true
  };
}

function watchForecast(): NormalizedForecast {
  return {
    ...rainyForecast(),
    summary: {
      nextHours: 24,
      totalPrecipitationMm: 2,
      maxHourlyPrecipitationMm: 1,
      maxPrecipitationProbabilityPercent: 35,
      maxWindSpeedKph: 16,
      minTemperatureC: 20,
      maxTemperatureC: 27,
      weatherCodes: [3]
    },
    confidence: 82,
    missingInformation: [],
    warnings: []
  };
}

function fakeMemory(): MemoryGateway {
  return {
    async recordDecision() {
      return undefined;
    },
    async querySimilarity() {
      return {
        similarCases: [
          {
            decisionId: "past:1",
            outcomeSummary: "road closures happened after heavy rain",
            lessonReferences: ["lesson:1"]
          }
        ],
        outcomeDistribution: { disruption: 1 },
        lessonReferences: ["lesson:1"]
      };
    },
    async queryCalibration() {
      return {
        confidenceAccuracy: 72,
        overconfidence: false,
        underconfidence: false,
        historicalCalibration: {
          sampleSize: 4,
          averageCalibrationScore: 76,
          reliabilityTrend: "aligned"
        }
      };
    }
  };
}

function fakeForecastClient() {
  return {
    async getForecast() {
      return rainyForecast();
    },
    async providerHealth(): Promise<ProviderHealth[]> {
      return [{
        provider: "open-meteo",
        healthy: true,
        status: "ok",
        checkedAt: "2026-06-01T12:00:00.000Z",
        failureCount: 0
      }];
    }
  } as never;
}
