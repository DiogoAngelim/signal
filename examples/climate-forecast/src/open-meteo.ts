import type {
  ForecastHour,
  ForecastProvider,
  ForecastProviderContext,
  ForecastRequest,
  NormalizedForecast,
  ProviderHealth,
} from "./types";
import { asNumber, clamp, freshnessFrom, nowIso, summarizeHours } from "./utils";

export type OpenMeteoProviderOptions = {
  endpoint?: string;
  source?: string;
  forecastDays?: number;
};

type OpenMeteoResponse = {
  generationtime_ms?: number;
  timezone?: string;
  current?: {
    time?: string;
  };
  hourly?: Record<string, unknown>;
};

const DEFAULT_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export function createOpenMeteoProvider(options: OpenMeteoProviderOptions = {}): ForecastProvider {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const source = options.source ?? "Open-Meteo";

  return {
    name: "open-meteo",
    source,
    async getForecast(request: ForecastRequest, context: ForecastProviderContext = {}): Promise<NormalizedForecast> {
      const fetchedAt = nowIso(context.now);
      const url = new URL(endpoint);
      const hours = request.hours ?? 48;
      url.searchParams.set("latitude", String(request.latitude));
      url.searchParams.set("longitude", String(request.longitude));
      url.searchParams.set("timezone", request.timezone ?? "auto");
      url.searchParams.set("forecast_days", String(options.forecastDays ?? Math.max(1, Math.ceil(hours / 24))));
      url.searchParams.set("current", "temperature_2m,precipitation,weather_code,wind_speed_10m");
      url.searchParams.set(
        "hourly",
        [
          "temperature_2m",
          "relative_humidity_2m",
          "precipitation",
          "precipitation_probability",
          "wind_speed_10m",
          "weather_code"
        ].join(",")
      );

      const response = await fetchWithTimeout(url, context);
      if (!response.ok) {
        throw new Error(`Open-Meteo returned ${response.status}`);
      }
      const body = await response.json() as OpenMeteoResponse;
      const hourly = normalizeOpenMeteoHourly(body.hourly, hours);
      const missingInformation = missingFields(hourly);
      const warnings = missingInformation.length ? ["Some forecast details are missing from the provider response."] : [];
      const freshness = freshnessFrom(fetchedAt, (context.now ?? (() => new Date()))());
      const confidence = clamp(88 - missingInformation.length * 9);

      return {
        latitude: request.latitude,
        longitude: request.longitude,
        timezone: body.timezone ?? request.timezone ?? "auto",
        hours,
        correlationId: request.correlationId ?? `forecast:${request.latitude}:${request.longitude}:${fetchedAt}`,
        provider: "open-meteo",
        source,
        sourceUpdatedAt: body.current?.time,
        hourly,
        summary: summarizeHours(hourly, Math.min(24, hours)),
        confidence,
        freshness,
        warnings,
        missingInformation,
        stale: false,
        fromCache: false,
        degraded: false
      };
    },
    async health(context: ForecastProviderContext = {}): Promise<ProviderHealth> {
      const checkedAt = nowIso(context.now);
      const started = Date.now();
      try {
        const url = new URL(endpoint);
        url.searchParams.set("latitude", "0");
        url.searchParams.set("longitude", "0");
        url.searchParams.set("hourly", "temperature_2m");
        url.searchParams.set("forecast_days", "1");
        const response = await fetchWithTimeout(url, { ...context, timeoutMs: Math.min(context.timeoutMs ?? 5000, 5000) });
        return {
          provider: "open-meteo",
          healthy: response.ok,
          status: response.ok ? "ok" : "degraded",
          checkedAt,
          latencyMs: Date.now() - started,
          failureCount: response.ok ? 0 : 1,
          ...(response.ok ? {} : { message: `Health check returned ${response.status}.` })
        };
      } catch (error) {
        return {
          provider: "open-meteo",
          healthy: false,
          status: "failing",
          checkedAt,
          latencyMs: Date.now() - started,
          failureCount: 1,
          message: error instanceof Error ? error.message : "Health check failed."
        };
      }
    }
  };
}

function normalizeOpenMeteoHourly(hourly: Record<string, unknown> | undefined, hours: number): ForecastHour[] {
  const times = arrayOf(hourly?.["time"]);
  return times.slice(0, hours).map((time, index) => ({
    time: String(time),
    temperatureC: at(hourly?.["temperature_2m"], index),
    relativeHumidityPercent: at(hourly?.["relative_humidity_2m"], index),
    precipitationMm: at(hourly?.["precipitation"], index),
    precipitationProbabilityPercent: at(hourly?.["precipitation_probability"], index),
    windSpeedKph: at(hourly?.["wind_speed_10m"], index),
    weatherCode: at(hourly?.["weather_code"], index)
  }));
}

function missingFields(hourly: readonly ForecastHour[]): string[] {
  if (hourly.length === 0) return ["hourly forecast"];
  const fields: Array<[keyof ForecastHour, string]> = [
    ["precipitationMm", "precipitation"],
    ["precipitationProbabilityPercent", "chance of precipitation"],
    ["windSpeedKph", "wind speed"],
    ["weatherCode", "weather condition"],
  ];
  return fields
    .filter(([key]) => hourly.every((hour) => hour[key] == null))
    .map(([, label]) => label);
}

async function fetchWithTimeout(url: URL, context: ForecastProviderContext): Promise<Response> {
  const fetcher = context.fetch ?? fetch;
  const timeoutMs = context.timeoutMs ?? 7000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function at(value: unknown, index: number): number | undefined {
  return asNumber(arrayOf(value)[index]);
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
