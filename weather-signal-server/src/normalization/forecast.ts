import type { ForecastSnapshot, Region, WeatherMetrics } from "../types/index.js";
import { nowIso, parseIso, toIso } from "../utils/time.js";

export interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    precipitation: number[];
    windgusts_10m: number[];
    temperature_2m: number[];
    weathercode?: number[];
  };
  daily?: {
    time: string[];
    precipitation_sum: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

export function buildForecastSnapshot(
  region: Region,
  provider: string,
  response: OpenMeteoResponse,
  fetchedAt = nowIso()
): ForecastSnapshot {
  const hourly = response.hourly;
  const daily = response.daily;
  const validFrom = hourly?.time?.[0] ?? fetchedAt;
  const validTo = hourly?.time?.[hourly.time.length - 1] ?? fetchedAt;

  const metrics = computeMetrics(hourly, daily);

  return {
    regionId: region.id,
    provider,
    fetchedAt,
    validFrom,
    validTo,
    metrics,
    raw: response
  };
}

export function computeMetrics(
  hourly?: OpenMeteoResponse["hourly"],
  daily?: OpenMeteoResponse["daily"]
): WeatherMetrics {
  const now = Date.now();
  const defaultMetrics: WeatherMetrics = {
    precipitationMmNext6h: 0,
    precipitationMmNext24h: 0,
    windGustKphMax: 0,
    temperatureCMax: 0,
    temperatureCMin: 0,
    weatherCodeMax: undefined
  };

  if (!hourly || !hourly.time?.length) {
    if (daily?.temperature_2m_max?.length) {
      defaultMetrics.temperatureCMax = Math.max(...daily.temperature_2m_max);
    }
    if (daily?.temperature_2m_min?.length) {
      defaultMetrics.temperatureCMin = Math.min(...daily.temperature_2m_min);
    }
    return defaultMetrics;
  }

  const startIndex = findClosestIndex(hourly.time, now) ?? 0;
  const window6h = sliceWindow(hourly, startIndex, 6);
  const window24h = sliceWindow(hourly, startIndex, 24);

  const precipitation6h = sum(window6h.precipitation);
  const precipitation24h = sum(window24h.precipitation);
  const windGustMax = max(window24h.windgusts_10m);
  const temperatureMax = max(window24h.temperature_2m);
  const temperatureMin = min(window24h.temperature_2m);
  const weatherCodeMax = max(window24h.weathercode ?? []);

  return {
    precipitationMmNext6h: precipitation6h,
    precipitationMmNext24h: precipitation24h,
    windGustKphMax: windGustMax,
    temperatureCMax: temperatureMax,
    temperatureCMin: temperatureMin,
    weatherCodeMax
  };
}

function findClosestIndex(times: string[], targetMs: number): number | undefined {
  let closestIndex = 0;
  let closestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i += 1) {
    const value = parseIso(times[i]);
    if (value === undefined) {
      continue;
    }
    const diff = Math.abs(value - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }
  return closestIndex;
}

function sliceWindow(
  hourly: OpenMeteoResponse["hourly"],
  startIndex: number,
  hours: number
) {
  const endIndex = Math.min(startIndex + hours, hourly.time.length);
  return {
    time: hourly.time.slice(startIndex, endIndex).map((time) => toIso(time) ?? time),
    precipitation: hourly.precipitation.slice(startIndex, endIndex) ?? [],
    windgusts_10m: hourly.windgusts_10m.slice(startIndex, endIndex) ?? [],
    temperature_2m: hourly.temperature_2m.slice(startIndex, endIndex) ?? [],
    weathercode: hourly.weathercode?.slice(startIndex, endIndex)
  };
}

function sum(values: number[] | undefined): number {
  if (!values || values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0);
}

function max(values: number[] | undefined): number {
  if (!values || values.length === 0) {
    return 0;
  }
  return Math.max(...values);
}

function min(values: number[] | undefined): number {
  if (!values || values.length === 0) {
    return 0;
  }
  return Math.min(...values);
}
