/**
 * Utility: Invariant
 * 
 * Runtime assertion utility for development and production
 * Helps catch impossible states early
 */

/**
 * Assert a condition is true; throw if false
 * 
 * Usage:
 *   invariant(user !== null, "User must be loaded");
 */
export function invariant(
  condition: any,
  message?: string | (() => string)
): asserts condition {
  if (!condition) {
    const finalMessage =
      message instanceof Function
        ? message()
        : message || "Invariant violation";

    throw new Error(finalMessage);
  }
}

/**
 * Type-safe invariant that narrows types
 * 
 * Usage:
 *   invariant(maybeId !== null);
 *   // maybeId is now narrowed to string
 */
export function assertNonNull<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  invariant(value !== null && value !== undefined, message || "Value must not be null or undefined");
}

/**
 * Assert that a code path should never be reached
 */
export function unreachable(message = "This code should never be reached"): never {
  throw new Error(message);
}

/**
 * Assert that a value is of a certain type
 */
export function assertType<T>(
  value: any,
  type: string,
  message?: string
): asserts value is T {
  invariant(
    typeof value === type,
    message || `Expected type ${type}, got ${typeof value}`
  );
}
