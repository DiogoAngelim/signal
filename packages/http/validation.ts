/**
 * HTTP Validation
 * 
 * Lightweight input validation for HTTP requests.
 * No heavy dependencies - just basic shape validation.
 */

import { ValidationResult } from "../core/Types";

/**
 * Validate request shape
 */
export function validateInput(value: any): ValidationResult {
  const errors: string[] = [];

  // Check for required object type
  if (typeof value !== "object" || value === null) {
    errors.push("Input must be an object");
    return { valid: false, errors };
  }

  // Check for arrays
  if (Array.isArray(value)) {
    errors.push("Input must be an object, not an array");
    return { valid: false, errors };
  }

  // Check all keys are strings
  for (const key of Object.keys(value)) {
    if (typeof key !== "string") {
      errors.push(`Invalid key type: ${typeof key}`);
    }

    // Reject sensitive internal fields
    if (key.startsWith("_")) {
      errors.push(`Reserved field: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate request body
 */
export function validateBody(body: any): { valid: boolean; params?: any; error?: string } {
  if (!body) {
    return { valid: true, params: {} };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  // Basic validation passed
  return { valid: true, params: body };
}

/**
 * Validate query key format
 */
export function validateQueryKey(key: string): boolean {
  if (typeof key !== "string") {
    return false;
  }

  const [collection, name] = key.split(".");
  return !!collection && !!name && !key.includes("..") && key.length < 256;
}

/**
 * Validate mutation key format
 */
export function validateMutationKey(key: string): boolean {
  return validateQueryKey(key);
}

/**
 * Validate and throw if invalid
 */
export function validateInputOrThrow(value: any, fieldName = "input"): void {
  const result = validateInput(value);
  if (!result.valid) {
    const error = new Error(`Invalid ${fieldName}`);
    (error as any).details = { [fieldName]: result.errors || [] };
    throw error;
  }
}
