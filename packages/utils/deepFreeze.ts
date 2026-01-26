/**
 * Utility: Deep Freeze
 * 
 * Recursively freeze objects for immutability guarantees.
 * Used to lock down configuration and context after Signal starts.
 */

/**
 * Recursively freeze an object (shallow freeze is Object.freeze)
 * This makes the object and all nested objects immutable
 */
export function deepFreeze<T>(obj: T, maxDepth = 10, currentDepth = 0): T {
  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return obj;
  }

  // Only freeze objects and arrays
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) {
    return obj;
  }

  // Already frozen
  if (Object.isFrozen(obj)) {
    return obj;
  }

  // Freeze current level
  Object.freeze(obj);

  // Recursively freeze properties
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key as keyof T];
      if (typeof value === "object" && value !== null) {
        deepFreeze(value, maxDepth, currentDepth + 1);
      }
    }
  }

  return obj;
}

/**
 * Check if an object is frozen (shallow)
 */
export function isFrozen(obj: any): boolean {
  return Object.isFrozen(obj);
}

/**
 * Check if an object is deeply frozen (all properties frozen)
 * Note: this is a best-effort check and may not be 100% accurate for circular refs
 */
export function isDeepFrozen(obj: any, visited = new WeakSet()): boolean {
  if (!Object.isFrozen(obj)) {
    return false;
  }

  // Avoid infinite loops
  if (visited.has(obj)) {
    return true;
  }
  visited.add(obj);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === "object" && value !== null) {
        if (!isDeepFrozen(value, visited)) {
          return false;
        }
      }
    }
  }

  return true;
}
