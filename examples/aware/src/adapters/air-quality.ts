import type { Region } from "../contracts.js";
import {
  createObservation,
  createSource,
  createUnavailableObservation,
  numberOrZero,
  scenarioFor,
  severityFromThresholds,
  type AdapterContext,
  type AdapterRunResult,
  type SafetyDataAdapter
} from "./shared.js";

type OpenMeteoAirResponse = {
  current?: {
    time?: string;
    us_aqi?: number;
    pm2_5?: number;
  };
  hourly?: {
    time?: string[];
    us_aqi?: number[];
    pm2_5?: number[];
  };
};

export function createAirQualityAdapter(context: AdapterContext): SafetyDataAdapter {
  return {
    id: "air-quality-open-meteo",
    category: "air_quality",
    async collect(region: Region): Promise<AdapterRunResult> {
      const scenario = scenarioFor(region, context);
      if (scenario.unavailableSources?.includes("air_quality")) {
        return createUnavailableObservation({
          region,
          sourceId: "open-meteo-air-quality",
          sourceName: "Open-Meteo air quality",
          category: "air_quality",
          updatedAt: scenario.updatedAt,
          url: "https://open-meteo.com/",
          note: "Air quality source was intentionally unavailable in this fixture."
        }, context.now());
      }
      if (context.mode === "live-first" && context.fetcher) {
        try {
          const live = await collectLiveAirQuality(region, context);
          if (live) return live;
        } catch {
          // Fall back to fixture data.
        }
      }
      return collectFixtureAirQuality(region, context);
    }
  };
}

async function collectLiveAirQuality(region: Region, context: AdapterContext): Promise<AdapterRunResult | undefined> {
  if (!context.fetcher) return undefined;
  const params = new URLSearchParams({
    latitude: String(region.latitude),
    longitude: String(region.longitude),
    current: "us_aqi,pm2_5",
    hourly: "us_aqi,pm2_5",
    timezone: region.timezone
  });
  const response = await context.fetcher(`https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`, {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as OpenMeteoAirResponse;
  const updatedAt = payload.current?.time
    ? new Date(payload.current.time).toISOString()
    : payload.hourly?.time?.[0]
      ? new Date(payload.hourly.time[0]).toISOString()
      : context.now().toISOString();
  const usAqi = numberOrZero(payload.current?.us_aqi ?? payload.hourly?.us_aqi?.[0]);
  const pm25 = numberOrZero(payload.current?.pm2_5 ?? payload.hourly?.pm2_5?.[0]);
  return fromAirValues(region, context, {
    source: createSource({
      id: "open-meteo-air-quality",
      name: "Open-Meteo air quality",
      url: "https://open-meteo.com/",
      provider: "live",
      updatedAt,
      reliability: "medium",
      note: "Live no-key air quality evidence. If unavailable, Aware uses fixtures."
    }, context.now()),
    observedAt: updatedAt,
    usAqi,
    pm25,
    provider: "live"
  });
}

function collectFixtureAirQuality(region: Region, context: AdapterContext): AdapterRunResult {
  const scenario = scenarioFor(region, context);
  return fromAirValues(region, context, {
    source: createSource({
      id: "fixture-air-quality",
      name: "Aware fixture air quality",
      provider: "fixture",
      updatedAt: scenario.updatedAt,
      reliability: "medium",
      note: "Fixture air quality keeps tests and demos usable without API keys."
    }, context.now()),
    observedAt: scenario.updatedAt,
    usAqi: scenario.airQuality.usAqi,
    pm25: scenario.airQuality.pm25,
    severity: scenario.airQuality.severity,
    provider: "fixture"
  });
}

function fromAirValues(region: Region, context: AdapterContext, input: {
  source: ReturnType<typeof createSource>;
  observedAt: string;
  usAqi: number;
  pm25: number;
  severity?: 0 | 1 | 2 | 3 | 4;
  provider: "fixture" | "live";
}): AdapterRunResult {
  const severity = input.severity ?? severityFromThresholds(input.usAqi, {
    notice: 75,
    warning: 125,
    urgency: 175,
    emergency: 250
  });
  return {
    sources: [input.source],
    observations: [
      createObservation({
        id: `${region.id}:air-quality`,
        region,
        category: "air_quality",
        signal: "air_quality.particles",
        observedAt: input.observedAt,
        validUntil: new Date(new Date(input.observedAt).getTime() + 6 * 60 * 60 * 1000).toISOString(),
        severity,
        source: input.source,
        plainLanguage: severity > 0
          ? "Air conditions may make outdoor exposure harder for some people."
          : "Air quality does not stand out in the available evidence.",
        details: {
          usAqi: input.usAqi,
          pm25: input.pm25,
          provider: input.provider
        }
      })
    ]
  };
}
