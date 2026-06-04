import type { AdapterCollectionResult, FixtureScenarioId, MaritimeArea } from "../contracts.js";
import { clusterVessels, normalizeVesselTracks } from "../map/vessels.js";
import { createIncidentAdapter } from "./incidents.js";
import { createOceanAdapter } from "./ocean.js";
import { createPortAdapter } from "./ports.js";
import { createMaritimeAreaService, type MaritimeAreaService } from "./regions.js";
import {
  normalizeAdapterOptions,
  type AdapterOptions,
  type MaritimeDataAdapter
} from "./shared.js";
import { createVesselAdapter } from "./vessels.js";
import { createWeatherAdapter } from "./weather.js";

export { createCustomMaritimeArea, createMaritimeAreaService, parseCoordinateQuery, type MaritimeAreaService } from "./regions.js";
export type { AdapterMode, AdapterOptions, MaritimeDataAdapter, MaritimeAdapterResult } from "./shared.js";

export function createDefaultMaritimeAdapters(options: AdapterOptions = {}): MaritimeDataAdapter[] {
  const context = normalizeAdapterOptions(options);
  return [
    createWeatherAdapter(context),
    createOceanAdapter(context),
    createVesselAdapter(context),
    createPortAdapter(context),
    createIncidentAdapter(context)
  ];
}

export function createFixtureMaritimeAdapters(fixtureId?: FixtureScenarioId): MaritimeDataAdapter[] {
  return createDefaultMaritimeAdapters({
    mode: "fixture",
    fixtureId,
    now: () => new Date("2026-06-03T12:04:00.000Z")
  });
}

export async function collectMaritimeContext(input: {
  area: MaritimeArea;
  adapters?: MaritimeDataAdapter[];
  now?: () => Date;
}): Promise<AdapterCollectionResult> {
  const adapters = input.adapters ?? createDefaultMaritimeAdapters({ now: input.now });
  const results = await Promise.all(adapters.map((adapter) => adapter.collect(input.area)));
  const observations = results.flatMap((result) => result.observations);
  const sources = dedupeSources(results.flatMap((result) => result.sources));
  const vessels = normalizeVesselTracks(results.flatMap((result) => result.vessels ?? []), input.now?.() ?? new Date());
  const clusters = clusterVessels(vessels, input.area.bounds);
  return {
    area: input.area,
    observations,
    sources,
    vessels,
    clusters,
    degraded: sources.some((source) => source.status !== "available") || observations.some((observation) => observation.degraded)
  };
}

export function createMaritimeAdapterEnvironment(options: {
  areas?: MaritimeAreaService;
  adapters?: MaritimeDataAdapter[];
} = {}) {
  return {
    areas: options.areas ?? createMaritimeAreaService(),
    adapters: options.adapters ?? createDefaultMaritimeAdapters()
  };
}

function dedupeSources(sources: readonly AdapterCollectionResult["sources"][number][]) {
  const seen = new Map<string, AdapterCollectionResult["sources"][number]>();
  for (const source of sources) {
    seen.set(source.id, source);
  }
  return [...seen.values()];
}
