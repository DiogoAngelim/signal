import type { Region } from "../contracts.js";
import {
  createObservation,
  createSource,
  maxSeverity,
  numberOrZero,
  scenarioFor,
  severityFromThresholds,
  type AdapterContext,
  type AdapterRunResult,
  type SafetyDataAdapter
} from "./shared.js";

type OpenMeteoWeatherResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    precipitation?: number;
    rain?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    precipitation_sum?: number[];
    uv_index_max?: number[];
  };
};

export function createWeatherAdapter(context: AdapterContext): SafetyDataAdapter {
  return {
    id: "weather-open-meteo",
    category: "weather",
    async collect(region: Region): Promise<AdapterRunResult> {
      if (context.mode === "live-first" && context.fetcher) {
        try {
          const live = await collectLiveWeather(region, context);
          if (live) return live;
        } catch {
          
        }
      }
      return collectFixtureWeather(region, context);
    }
  };
}

async function collectLiveWeather(region: Region, context: AdapterContext): Promise<AdapterRunResult | undefined> {
  if (!context.fetcher) return undefined;
  const params = new URLSearchParams({
    latitude: String(region.latitude),
    longitude: String(region.longitude),
    current: "temperature_2m,precipitation,rain",
    daily: "temperature_2m_max,precipitation_sum,uv_index_max",
    timezone: region.timezone
  });
  const response = await context.fetcher(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as OpenMeteoWeatherResponse;
  const today = payload.daily?.time?.[0] ?? payload.current?.time ?? context.now().toISOString();
  const updatedAt = payload.current?.time ? new Date(payload.current.time).toISOString() : context.now().toISOString();
  const maxTemperatureC = numberOrZero(payload.daily?.temperature_2m_max?.[0] ?? payload.current?.temperature_2m);
  const precipitationMm = numberOrZero(payload.daily?.precipitation_sum?.[0] ?? payload.current?.precipitation ?? payload.current?.rain);
  const uvIndex = numberOrZero(payload.daily?.uv_index_max?.[0]);
  const heatSeverity = severityFromThresholds(maxTemperatureC, { notice: 30, warning: 35, urgency: 40, emergency: 45 });
  const rainSeverity = severityFromThresholds(precipitationMm, { notice: 10, warning: 35, urgency: 70, emergency: 125 });
  const uvSeverity = severityFromThresholds(uvIndex, { notice: 6, warning: 8, urgency: 11 });
  const source = createSource({
    id: "open-meteo-weather",
    name: "Open-Meteo forecast",
    url: "https://open-meteo.com/",
    provider: "live",
    updatedAt,
    reliability: "medium",
    note: "Live no-key weather forecast. If it cannot be reached, Aware uses fixtures."
  }, context.now());
  return {
    sources: [source],
    observations: createWeatherObservations({
      region,
      source,
      observedAt: updatedAt,
      validUntil: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      heatSeverity,
      rainSeverity,
      uvSeverity,
      maxTemperatureC,
      precipitationMm,
      uvIndex,
      provider: "live"
    })
  };
}

function collectFixtureWeather(region: Region, context: AdapterContext): AdapterRunResult {
  const scenario = scenarioFor(region, context);
  const source = createSource({
    id: "fixture-weather",
    name: "Aware fixture weather",
    provider: "fixture",
    updatedAt: scenario.updatedAt,
    reliability: "medium",
    note: "Fixture weather keeps tests and demos usable without API keys."
  }, context.now());
  return {
    sources: [source],
    observations: createWeatherObservations({
      region,
      source,
      observedAt: scenario.updatedAt,
      validUntil: new Date(new Date(scenario.updatedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      heatSeverity: scenario.weather.heatSeverity,
      rainSeverity: scenario.weather.rainSeverity,
      uvSeverity: scenario.weather.uvSeverity,
      maxTemperatureC: scenario.weather.maxTemperatureC,
      precipitationMm: scenario.weather.precipitationMm,
      uvIndex: scenario.weather.uvIndex,
      provider: "fixture"
    })
  };
}

function createWeatherObservations(input: {
  region: Region;
  source: ReturnType<typeof createSource>;
  observedAt: string;
  validUntil: string;
  heatSeverity: 0 | 1 | 2 | 3 | 4;
  rainSeverity: 0 | 1 | 2 | 3 | 4;
  uvSeverity: 0 | 1 | 2 | 3 | 4;
  maxTemperatureC: number;
  precipitationMm: number;
  uvIndex: number;
  provider: "fixture" | "live";
}) {
  const observations = [
    createObservation({
      id: `${input.region.id}:weather:heat`,
      region: input.region,
      category: "weather",
      signal: "weather.heat",
      observedAt: input.observedAt,
      validUntil: input.validUntil,
      severity: input.heatSeverity,
      source: input.source,
      plainLanguage: input.heatSeverity > 0
        ? "Heat may affect outdoor plans today."
        : "Heat does not stand out in the available weather evidence.",
      details: {
        maxTemperatureC: input.maxTemperatureC,
        provider: input.provider
      }
    }),
    createObservation({
      id: `${input.region.id}:weather:rain`,
      region: input.region,
      category: "weather",
      signal: "weather.heavy_rain",
      observedAt: input.observedAt,
      validUntil: input.validUntil,
      severity: input.rainSeverity,
      source: input.source,
      plainLanguage: input.rainSeverity > 0
        ? "Rain may affect low-lying routes or outdoor plans."
        : "Rain does not stand out in the available weather evidence.",
      details: {
        precipitationMm: input.precipitationMm,
        provider: input.provider
      }
    }),
    createObservation({
      id: `${input.region.id}:weather:uv`,
      region: input.region,
      category: "weather",
      signal: "weather.uv",
      observedAt: input.observedAt,
      validUntil: input.validUntil,
      severity: input.uvSeverity,
      source: input.source,
      plainLanguage: input.uvSeverity > 0
        ? "Sun exposure may be stronger than usual today."
        : "Sun exposure does not stand out in the available weather evidence.",
      details: {
        uvIndex: input.uvIndex,
        provider: input.provider
      }
    })
  ];

  const overallSeverity = maxSeverity(input.heatSeverity, input.rainSeverity, input.uvSeverity);
  if (overallSeverity === 0) return observations;
  return observations;
}
