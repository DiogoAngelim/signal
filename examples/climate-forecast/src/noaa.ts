import type {
  ForecastHour,
  ForecastProvider,
  ForecastProviderContext,
  ForecastRequest,
  NormalizedForecast,
  ProviderHealth,
} from "./types";
import { asNumber, clamp, freshnessFrom, nowIso, summarizeHours } from "./utils";

export type NoaaProviderOptions = {
  endpoint?: string;
  source?: string;
  userAgent?: string;
};

type NoaaPointsResponse = {
  properties?: {
    forecastGridData?: string;
  };
};

type NoaaGridValue = {
  validTime?: string;
  value?: unknown;
};

type NoaaGridLayer = {
  uom?: string;
  values?: NoaaGridValue[];
};

type NoaaGridResponse = {
  properties?: {
    updateTime?: string;
    temperature?: NoaaGridLayer;
    relativeHumidity?: NoaaGridLayer;
    quantitativePrecipitation?: NoaaGridLayer;
    probabilityOfPrecipitation?: NoaaGridLayer;
    windSpeed?: NoaaGridLayer;
    weather?: NoaaGridLayer;
  };
};

const DEFAULT_ENDPOINT = "https://api.weather.gov";
const DEFAULT_USER_AGENT = "SignalEmergencyAwareness/0.1";

export function createNoaaProvider(options: NoaaProviderOptions = {}): ForecastProvider {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const source = options.source ?? "NOAA National Weather Service";
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  return {
    name: "noaa",
    source,
    async getForecast(request: ForecastRequest, context: ForecastProviderContext = {}): Promise<NormalizedForecast> {
      const fetchedAt = nowIso(context.now);
      const hours = request.hours ?? 48;
      const pointsUrl = new URL(`/points/${request.latitude},${request.longitude}`, endpoint);
      const pointsResponse = await fetchNoaa(pointsUrl, context, userAgent);
      if (!pointsResponse.ok) {
        throw new Error(`NOAA points returned ${pointsResponse.status}`);
      }
      const points = await pointsResponse.json() as NoaaPointsResponse;
      const gridUrl = points.properties?.forecastGridData;
      if (!gridUrl) {
        throw new Error("NOAA grid forecast is unavailable for this location.");
      }

      const gridResponse = await fetchNoaa(new URL(gridUrl), context, userAgent);
      if (!gridResponse.ok) {
        throw new Error(`NOAA grid forecast returned ${gridResponse.status}`);
      }
      const grid = await gridResponse.json() as NoaaGridResponse;
      const hourly = normalizeNoaaGrid(grid, hours, context.now ?? (() => new Date()));
      const missingInformation = missingFields(hourly);
      const warnings = missingInformation.length ? ["Some forecast details are missing from the NOAA response."] : [];
      const freshness = freshnessFrom(fetchedAt, (context.now ?? (() => new Date()))());

      return {
        latitude: request.latitude,
        longitude: request.longitude,
        timezone: request.timezone ?? "auto",
        hours,
        correlationId: request.correlationId ?? `forecast:noaa:${request.latitude}:${request.longitude}:${fetchedAt}`,
        provider: "noaa",
        source,
        sourceUpdatedAt: grid.properties?.updateTime,
        hourly,
        summary: summarizeHours(hourly, Math.min(24, hours)),
        confidence: clamp(82 - missingInformation.length * 8),
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
        const response = await fetchNoaa(new URL("/points/38.8894,-77.0352", endpoint), {
          ...context,
          timeoutMs: Math.min(context.timeoutMs ?? 5000, 5000)
        }, userAgent);
        return {
          provider: "noaa",
          healthy: response.ok,
          status: response.ok ? "ok" : "degraded",
          checkedAt,
          latencyMs: Date.now() - started,
          failureCount: response.ok ? 0 : 1,
          ...(response.ok ? {} : { message: `NOAA health check returned ${response.status}.` })
        };
      } catch (error) {
        return {
          provider: "noaa",
          healthy: false,
          status: "failing",
          checkedAt,
          latencyMs: Date.now() - started,
          failureCount: 1,
          message: error instanceof Error ? error.message : "NOAA health check failed."
        };
      }
    }
  };
}

function normalizeNoaaGrid(grid: NoaaGridResponse, hours: number, now: () => Date): ForecastHour[] {
  const start = floorToHour(now());
  return Array.from({ length: hours }, (_, index) => {
    const time = new Date(start.getTime() + index * 60 * 60 * 1000);
    return {
      time: time.toISOString(),
      temperatureC: valueAt(grid.properties?.temperature, time),
      relativeHumidityPercent: valueAt(grid.properties?.relativeHumidity, time),
      precipitationMm: precipitationAt(grid.properties?.quantitativePrecipitation, time),
      precipitationProbabilityPercent: valueAt(grid.properties?.probabilityOfPrecipitation, time),
      windSpeedKph: valueAt(grid.properties?.windSpeed, time),
      weatherCode: weatherCodeAt(grid.properties?.weather, time)
    };
  });
}

async function fetchNoaa(url: URL, context: ForecastProviderContext, userAgent: string): Promise<Response> {
  const fetcher = context.fetch ?? fetch;
  const timeoutMs = context.timeoutMs ?? 7000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      signal: controller.signal,
      headers: noaaHeaders(userAgent)
    });
  } finally {
    clearTimeout(timeout);
  }
}

function noaaHeaders(userAgent: string): Record<string, string> {
  const headers: Record<string, string> = { "accept": "application/geo+json" };
  if (typeof window === "undefined") headers["user-agent"] = userAgent;
  return headers;
}

function valueAt(layer: NoaaGridLayer | undefined, time: Date): number | undefined {
  const match = matchingEntry(layer, time);
  return asNumber(match?.value);
}

function precipitationAt(layer: NoaaGridLayer | undefined, time: Date): number | undefined {
  const match = matchingEntry(layer, time);
  const value = asNumber(match?.value);
  if (value == null) return undefined;
  const durationHours = Math.max(1, intervalHours(match?.validTime));
  return value / durationHours;
}

function weatherCodeAt(layer: NoaaGridLayer | undefined, time: Date): number | undefined {
  const match = matchingEntry(layer, time);
  const entries = Array.isArray(match?.value) ? match.value as Array<Record<string, unknown>> : [];
  const text = entries
    .map((entry) => `${String(entry["weather"] ?? "")} ${String(entry["intensity"] ?? "")}`)
    .join(" ")
    .toLowerCase();
  if (/thunder/.test(text)) return 95;
  if (/snow|sleet|ice/.test(text)) return 71;
  if (/rain|showers/.test(text)) return /heavy/.test(text) ? 65 : /moderate/.test(text) ? 63 : 61;
  if (/fog|visibility/.test(text)) return 45;
  if (/cloud|overcast/.test(text)) return 3;
  return undefined;
}

function matchingEntry(layer: NoaaGridLayer | undefined, time: Date): NoaaGridValue | undefined {
  const target = time.getTime();
  return layer?.values?.find((entry) => {
    const interval = parseInterval(entry.validTime);
    return interval ? target >= interval.start && target < interval.end : false;
  });
}

function parseInterval(validTime: string | undefined): { start: number; end: number } | undefined {
  const [startText, durationText] = String(validTime ?? "").split("/");
  const start = Date.parse(startText ?? "");
  const hours = parseDurationHours(durationText);
  if (!Number.isFinite(start) || hours <= 0) return undefined;
  return { start, end: start + hours * 60 * 60 * 1000 };
}

function intervalHours(validTime: string | undefined): number {
  const [, durationText] = String(validTime ?? "").split("/");
  return parseDurationHours(durationText);
}

function parseDurationHours(duration: string | undefined): number {
  const text = String(duration ?? "");
  const days = Number(text.match(/P(\d+(?:\.\d+)?)D/)?.[1] ?? 0);
  const hours = Number(text.match(/T(\d+(?:\.\d+)?)H/)?.[1] ?? 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)M/)?.[1] ?? 0);
  return days * 24 + hours + minutes / 60;
}

function floorToHour(date: Date): Date {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  return next;
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
