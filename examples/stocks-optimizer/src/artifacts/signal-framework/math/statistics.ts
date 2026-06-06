export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function numeric(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function mean(values: number[]) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

export function stdev(values: number[]) {
  const usable = values.filter(Number.isFinite);
  if (usable.length < 2) return 0;
  const average = mean(usable);
  return Math.sqrt(mean(usable.map((value) => (value - average) ** 2)));
}

export function percentileRank(values: number[], value: number) {
  const usable = values.filter(Number.isFinite);
  if (!usable.length) return clamp(value);
  return clamp((usable.filter((item) => item <= value).length / usable.length) * 100);
}

export function signRatio(values: number[], direction: "positive" | "negative") {
  const usable = values.filter(Number.isFinite);
  if (!usable.length) return 0;
  return usable.filter((value) => (direction === "positive" ? value >= 0 : value < 0)).length / usable.length;
}

export function immutable<T>(value: T): Readonly<T> {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value as Readonly<T>;
}
