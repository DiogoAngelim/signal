/**
 * canonicalize.ts — Deterministic JSON canonicalization
 *
 * Deep-sorts objects by key, normalizes floats to 10 decimal places,
 * and returns a stable JSON string suitable for hashing.
 * No randomness, no time usage — purely deterministic.
 */

const FLOAT_PRECISION = 10;

function normalizeFloat(value: number): number {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) throw new Error("Cannot canonicalize NaN");
    return value > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return Number.parseFloat(value.toFixed(FLOAT_PRECISION));
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return normalizeFloat(value);
  }

  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = canonicalizeValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return String(value);
}

/**
 * Canonicalize any value into a deterministic JSON string.
 * - Objects are deep-sorted by key
 * - Arrays preserve order (order is semantic)
 * - Floats are normalized to 10 decimal places
 * - null and undefined both become null
 */
export function canonicalize(obj: unknown): string {
  const normalized = canonicalizeValue(obj);
  return JSON.stringify(normalized);
}
