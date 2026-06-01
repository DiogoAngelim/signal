import type { ForecastFreshness } from "@signal/climate-forecast";

export function correlationId(prefix: string, seed = new Date().toISOString()): string {
  return `${prefix}:${seed.replace(/[^a-zA-Z0-9:.=-]/g, "_")}`;
}

export function commonWarnings(...groups: Array<readonly string[] | undefined>): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function freshnessScore(freshness: Pick<ForecastFreshness, "score"> | undefined): number {
  return Math.max(0, Math.min(100, freshness?.score ?? 0));
}

export function confidenceLabel(value: number): "Low" | "Medium" | "High" | "Unknown" {
  if (value <= 0) return "Unknown";
  if (value < 45) return "Low";
  if (value < 75) return "Medium";
  return "High";
}

export function clamp(value: number, min = 0, max = 100): number {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
