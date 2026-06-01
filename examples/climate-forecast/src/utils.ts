import type { ForecastFreshness, ForecastHour, ForecastSummary } from "./types";

export const DEFAULT_FRESH_FOR_MS = 30 * 60 * 1000;
export const DEFAULT_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export function clamp(value: number, min = 0, max = 100): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

export function nowIso(now: () => Date = () => new Date()): string {
  return now().toISOString();
}

export function forecastCacheKey(input: { latitude: number; longitude: number; hours?: number; timezone?: string }): string {
  return [
    roundCoordinate(input.latitude),
    roundCoordinate(input.longitude),
    input.hours ?? 48,
    input.timezone ?? "auto"
  ].join(":");
}

export function summarizeHours(hourly: readonly ForecastHour[], nextHours: number): ForecastSummary {
  const selected = hourly.slice(0, Math.max(1, nextHours));
  const precipitation = selected.map((hour) => numberOrZero(hour.precipitationMm));
  const probabilities = selected.map((hour) => numberOrZero(hour.precipitationProbabilityPercent));
  const wind = selected.map((hour) => numberOrZero(hour.windSpeedKph));
  const temperatures = selected
    .map((hour) => hour.temperatureC)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const weatherCodes = [...new Set(selected
    .map((hour) => hour.weatherCode)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value)))];

  return {
    nextHours: selected.length,
    totalPrecipitationMm: round(precipitation.reduce((sum, value) => sum + value, 0)),
    maxHourlyPrecipitationMm: round(Math.max(0, ...precipitation)),
    maxPrecipitationProbabilityPercent: round(Math.max(0, ...probabilities)),
    maxWindSpeedKph: round(Math.max(0, ...wind)),
    ...(temperatures.length ? { minTemperatureC: round(Math.min(...temperatures), 1), maxTemperatureC: round(Math.max(...temperatures), 1) } : {}),
    weatherCodes
  };
}

export function freshnessFrom(
  fetchedAt: string,
  now: Date,
  freshForMs = DEFAULT_FRESH_FOR_MS,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): ForecastFreshness {
  const fetched = Date.parse(fetchedAt);
  const ageMs = Number.isFinite(fetched) ? Math.max(0, now.getTime() - fetched) : Number.POSITIVE_INFINITY;
  const expiresAt = new Date((Number.isFinite(fetched) ? fetched : now.getTime()) + freshForMs).toISOString();
  if (!Number.isFinite(ageMs)) {
    return { fetchedAt, expiresAt, ageMs: 0, state: "missing", score: 0 };
  }
  if (ageMs <= freshForMs) {
    return { fetchedAt, expiresAt, ageMs, state: "fresh", score: 100 };
  }
  if (ageMs <= staleAfterMs) {
    const staleRange = Math.max(1, staleAfterMs - freshForMs);
    return {
      fetchedAt,
      expiresAt,
      ageMs,
      state: "stale",
      score: clamp(70 - ((ageMs - freshForMs) / staleRange) * 45)
    };
  }
  return { fetchedAt, expiresAt, ageMs, state: "outdated", score: 15 };
}

export function mergeWarnings(...groups: Array<readonly string[] | undefined>): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []).map((item) => item.trim()).filter(Boolean))];
}

export function asNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundCoordinate(value: number): string {
  return round(value, 4).toFixed(4);
}

function numberOrZero(value: unknown): number {
  const number = asNumber(value);
  return number ?? 0;
}
