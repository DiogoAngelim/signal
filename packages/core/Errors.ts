/**
 * Signal Error Model
 * 
 * Production-safe error handling with:
 * - Deterministic error codes
 * - No stack traces in responses
 * - Safe serialization
 */

/**
 * Base Signal error
 */
export class SignalError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly cause?: Error;

  constructor(code: string, message: string, statusCode = 500, cause?: Error) {
    super(message);
    this.name = "SignalError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, SignalError.prototype);
  }

  /**
   * Safe serialization for HTTP responses (no stack traces in production)
   */
  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }

  /**
   * Safe response format
   */
  toResponse() {
    return {
      ok: false as const,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

/**
 * Authentication error
 */
export class SignalAuthError extends SignalError {
  constructor(message = "Authentication required", cause?: Error) {
    super("AUTH_REQUIRED", message, 401, cause);
    this.name = "SignalAuthError";
    Object.setPrototypeOf(this, SignalAuthError.prototype);
  }
}

/**
 * Authorization/access control error
 */
export class SignalForbiddenError extends SignalError {
  constructor(message = "Access denied", cause?: Error) {
    super("FORBIDDEN", message, 403, cause);
    this.name = "SignalForbiddenError";
    Object.setPrototypeOf(this, SignalForbiddenError.prototype);
  }
}

/**
 * Validation error
 */
export class SignalValidationError extends SignalError {
  readonly details: Record<string, string[]>;

  constructor(message = "Validation failed", details: Record<string, string[]> = {}, cause?: Error) {
    super("VALIDATION_ERROR", message, 400, cause);
    this.name = "SignalValidationError";
    this.details = details;
    Object.setPrototypeOf(this, SignalValidationError.prototype);
  }

  override toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Not found error
 */
export class SignalNotFoundError extends SignalError {
  constructor(message = "Resource not found", cause?: Error) {
    super("NOT_FOUND", message, 404, cause);
    this.name = "SignalNotFoundError";
    Object.setPrototypeOf(this, SignalNotFoundError.prototype);
  }
}

/**
 * Conflict error (e.g., duplicate key)
 */
export class SignalConflictError extends SignalError {
  constructor(message = "Resource conflict", cause?: Error) {
    super("CONFLICT", message, 409, cause);
    this.name = "SignalConflictError";
    Object.setPrototypeOf(this, SignalConflictError.prototype);
  }
}

/**
 * Internal error (not exposed to clients in production)
 */
export class SignalInternalError extends SignalError {
  private readonly originalMessage: string;

  constructor(message: string, cause?: Error) {
    // Log the real message internally, expose generic message to client
    super("INTERNAL_ERROR", "An internal error occurred", 500, cause);
    this.name = "SignalInternalError";
    this.originalMessage = message;
    Object.setPrototypeOf(this, SignalInternalError.prototype);
  }

  /**
   * Get the real message (for logging only)
   */
  getRealMessage(): string {
    return this.originalMessage;
  }
}

/**
 * Lifecycle error (framework state error)
 */
export class SignalLifecycleError extends SignalError {
  constructor(message: string, cause?: Error) {
    super("LIFECYCLE_ERROR", message, 500, cause);
    this.name = "SignalLifecycleError";
    Object.setPrototypeOf(this, SignalLifecycleError.prototype);
  }
}

/**
 * Registry error (collection/query/mutation not found)
 */
export class SignalRegistryError extends SignalError {
  constructor(message: string, cause?: Error) {
    super("REGISTRY_ERROR", message, 500, cause);
    this.name = "SignalRegistryError";
    Object.setPrototypeOf(this, SignalRegistryError.prototype);
  }
}

/**
 * Type guard to check if error is a SignalError
 */
export function isSignalError(error: unknown): error is SignalError {
  return error instanceof SignalError;
}

/**
 * Safe error response builder
 */
export function buildErrorResponse(error: unknown, isProduction = true) {
  if (isSignalError(error)) {
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  if (error instanceof Error) {
    return {
      ok: false as const,
      error: {
        code: "INTERNAL_ERROR",
        message: isProduction ? "An internal error occurred" : error.message,
      },
    };
  }

  return {
    ok: false as const,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unknown error occurred",
    },
  };
}
