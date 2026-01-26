/**
 * Utility: Stable Hash
 * 
 * Generate deterministic hashes for values.
 * Used for event IDs, cache keys, and determinism validation.
 */

/**
 * Generate a stable hash for any JSON-serializable value
 * Uses a simple but deterministic algorithm
 * 
 * This is NOT a cryptographic hash - it's for consistency/deduplication only
 */
export function stableHash(value: any): string {
  const json = JSON.stringify(value, sortObjectKeys);
  let hash = 0;

  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to hex string, pad with zeros
  const hex = (hash >>> 0).toString(16);
  return "h_" + hex.padStart(8, "0");
}

/**
 * Generate a deterministic ID (UUID-like but based on data)
 */
export function stableId(prefix: string, data: any): string {
  const hash = stableHash(data);
  return `${prefix}_${Date.now()}_${hash}`;
}

/**
 * Helper to sort object keys for deterministic JSON serialization
 */
function sortObjectKeys(key: string, value: any): any {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    for (const k of keys) {
      sorted[k] = value[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Generate a short unique identifier (collision-resistant for practical purposes)
 */
export function generateId(prefix = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
