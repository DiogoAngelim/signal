import type {
  AdapterCollectionResult,
  FixtureScenarioId,
  Region,
} from "../contracts.js";
import { createAirQualityAdapter } from "./air-quality.js";
import { createOfficialAlertsAdapter } from "./alerts.js";
import { createMosquitoRiskAdapter } from "./mosquito.js";
import { createPollenAdapter } from "./pollen.js";
import { type RegionService, createRegionService } from "./regions.js";
import {
  type AdapterOptions,
  type SafetyDataAdapter,
  normalizeAdapterOptions,
} from "./shared.js";
import { createWeatherAdapter } from "./weather.js";

export { createRegionService, type RegionService } from "./regions.js";
export type {
  AdapterMode,
  AdapterOptions,
  SafetyDataAdapter,
} from "./shared.js";

export function createDefaultAwareAdapters(
  options: AdapterOptions = {},
): SafetyDataAdapter[] {
  const context = normalizeAdapterOptions(options);
  return [
    createWeatherAdapter(context),
    createAirQualityAdapter(context),
    createPollenAdapter(context),
    createOfficialAlertsAdapter(context),
    createMosquitoRiskAdapter(context),
  ];
}

export function createFixtureAwareAdapters(
  fixtureId?: FixtureScenarioId,
): SafetyDataAdapter[] {
  return createDefaultAwareAdapters({
    mode: "fixture",
    fixtureId,
    now: () => new Date("2026-06-01T12:10:00.000Z"),
  });
}

export async function collectSafetyObservations(input: {
  region: Region;
  adapters?: SafetyDataAdapter[];
}): Promise<AdapterCollectionResult> {
  const adapters = input.adapters ?? createDefaultAwareAdapters();
  const results = await Promise.all(
    adapters.map((adapter) => adapter.collect(input.region)),
  );
  const observations = results.flatMap((result) => result.observations);
  const sources = dedupeSources(results.flatMap((result) => result.sources));
  return {
    region: input.region,
    observations,
    sources,
    degraded:
      sources.some((source) => source.status !== "available") ||
      observations.some((observation) => observation.degraded),
  };
}

export function createAwareAdapterEnvironment(
  options: {
    regions?: RegionService;
    adapters?: SafetyDataAdapter[];
  } = {},
) {
  return {
    regions: options.regions ?? createRegionService(),
    adapters: options.adapters ?? createDefaultAwareAdapters(),
  };
}

function dedupeSources(
  sources: readonly AdapterCollectionResult["sources"][number][],
) {
  const seen = new Map<string, AdapterCollectionResult["sources"][number]>();
  for (const source of sources) {
    seen.set(source.id, source);
  }
  return [...seen.values()];
}
