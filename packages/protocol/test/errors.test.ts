import { describe, it, expect } from "vitest";
import {
  signalErrorCodes,
  signalErrorCategories,
  getSignalErrorDefaults,
  createSignalError,
  createProtocolError,
  signalErrorHttpStatus,
  SignalErrorCode,
  SignalErrorCategory,
  SignalErrorEnvelope,
} from "../src/errors";

describe("errors module full coverage", () => {
  it("getSignalErrorDefaults returns correct defaults for all codes", () => {
    for (const code of signalErrorCodes) {
      const defaults = getSignalErrorDefaults(code);
      expect(defaults).toHaveProperty("category");
      expect(defaults).toHaveProperty("retryable");
      expect(signalErrorCategories).toContain(defaults.category);
      expect(typeof defaults.retryable).toBe("boolean");
    }
  });

  it("createSignalError covers all codes and options", () => {
    for (const code of signalErrorCodes) {
      const err = createSignalError(code, `msg for ${code}`);
      expect(err.code).toBe(code);
      expect(signalErrorCategories).toContain(err.category);
      expect(typeof err.message).toBe("string");
      // With all options
      const custom = createSignalError(code, "custom", {
        category: signalErrorCategories[0],
        retryable: true,
        details: { foo: 1 },
      });
      expect(custom.category).toBe(signalErrorCategories[0]);
      expect(custom.retryable).toBe(true);
      expect(custom.details).toEqual({ foo: 1 });
    }
  });

  it("createProtocolError covers all codes and options", () => {
    for (const code of signalErrorCodes) {
      const err = createProtocolError(code, `msg for ${code}`);
      expect(err.code).toBe(code);
      expect(signalErrorCategories).toContain(err.category);
      expect(typeof err.message).toBe("string");
      // With all options
      const custom = createProtocolError(code, "custom", {
        category: signalErrorCategories[0],
        retryable: true,
        details: { foo: 1 },
      });
      expect(custom.category).toBe(signalErrorCategories[0]);
      expect(custom.retryable).toBe(true);
      expect(custom.details).toEqual({ foo: 1 });
    }
  });

  it("signalErrorHttpStatus covers all branches and default", () => {
    const codeToStatus: Record<SignalErrorCode, number> = {
      BAD_REQUEST: 400,
      VALIDATION_ERROR: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      BUSINESS_REJECTION: 409,
      IDEMPOTENCY_CONFLICT: 409,
      DEADLINE_EXCEEDED: 408,
      CANCELLED: 499,
      TRANSPORT_ERROR: 503,
      INTERNAL_ERROR: 500,
      RETRYABLE_ERROR: 503,
      UNSUPPORTED_OPERATION: 404,
    };
    for (const code of signalErrorCodes) {
      const env: Pick<SignalErrorEnvelope, "code" | "category"> = {
        code,
        category: getSignalErrorDefaults(code).category,
      };
      expect(signalErrorHttpStatus(env)).toBe(codeToStatus[code]);
    }
    // Default branch: unknown code/category
    // @ts-expect-error purposely wrong
    expect(signalErrorHttpStatus({ code: "UNKNOWN", category: "capability" })).toBe(404);
    // @ts-expect-error purposely wrong
    expect(signalErrorHttpStatus({ code: "UNKNOWN", category: "runtime" })).toBe(500);
  });
});
