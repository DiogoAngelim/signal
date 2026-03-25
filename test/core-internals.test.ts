/**
 * Core Internals Tests
 * Covers Errors, Lifecycle, Registry, Config, and other internal modules
 */

import { Signal } from "../packages/core/Signal";
import { Lifecycle } from "../packages/core/Lifecycle";
import { Registry } from "../packages/core/Registry";
import { Config } from "../packages/core/Config";
import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { InMemoryTransport } from "../packages/transport/adapters/InMemoryTransport";
import { SignalPhase } from "../packages/core/Types";
import {
  SignalError,
  SignalAuthError,
  SignalForbiddenError,
  SignalValidationError,
  SignalNotFoundError,
  SignalRegistryError,
  SignalLifecycleError,
  SignalInternalError,
  isSignalError,
  buildErrorResponse,
} from "../packages/core/Errors";
import { invariant, assertNonNull, unreachable } from "../packages/utils/invariant";
import { deepFreeze, isFrozen, isDeepFrozen } from "../packages/utils/deepFreeze";

describe("Error Classes", () => {
  describe("SignalError", () => {
    it("should create a base error with code and status", () => {
      const error = new SignalError("TEST_ERROR", "Test message", 500);
      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test message");
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe("SignalError");
    });

    it("should support cause errors", () => {
      const cause = new Error("Original error");
      const error = new SignalError("TEST_ERROR", "Wrapped", 500, cause);
      expect(error.cause).toBe(cause);
    });

    it("should serialize to JSON safely", () => {
      const error = new SignalError("TEST_ERROR", "Test message");
      const json = error.toJSON();
      expect(json).toEqual({
        ok: false,
        error: {
          code: "TEST_ERROR",
          message: "Test message",
        },
      });
      expect(json).not.toHaveProperty("stack");
    });

    it("should provide response format", () => {
      const error = new SignalError("TEST_ERROR", "Test message");
      const response = error.toResponse();
      expect(response.ok).toBe(false);
      expect(response.error.code).toBe("TEST_ERROR");
    });
  });

  describe("SignalAuthError", () => {
    it("should create auth error with default message", () => {
      const error = new SignalAuthError();
      expect(error.code).toBe("AUTH_REQUIRED");
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("Authentication required");
    });

    it("should support custom message", () => {
      const error = new SignalAuthError("Custom auth message");
      expect(error.message).toBe("Custom auth message");
    });

    it("should support cause", () => {
      const cause = new Error("Token expired");
      const error = new SignalAuthError("Auth failed", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("SignalForbiddenError", () => {
    it("should create forbidden error", () => {
      const error = new SignalForbiddenError();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.statusCode).toBe(403);
    });

    it("should support custom message", () => {
      const error = new SignalForbiddenError("No access");
      expect(error.message).toBe("No access");
    });
  });

  describe("SignalValidationError", () => {
    it("should create validation error with details", () => {
      const details = { email: ["Invalid format"], age: ["Must be positive"] };
      const error = new SignalValidationError("Invalid input", details);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });

    it("should serialize details in JSON", () => {
      const details = { field: ["error1", "error2"] };
      const error = new SignalValidationError("Validation failed", details);
      const json = error.toJSON();
      expect(json.error.details).toEqual(details);
    });

    it("should work with empty details", () => {
      const error = new SignalValidationError();
      expect(error.details).toEqual({});
    });
  });

  describe("SignalNotFoundError", () => {
    it("should create not found error", () => {
      const error = new SignalNotFoundError();
      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
    });

    it("should support custom message", () => {
      const error = new SignalNotFoundError("User not found");
      expect(error.message).toBe("User not found");
    });
  });

  describe("SignalRegistryError", () => {
    it("should create registry error", () => {
      const error = new SignalRegistryError("Duplicate collection");
      expect(error.code).toBe("REGISTRY_ERROR");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("SignalLifecycleError", () => {
    it("should create lifecycle error", () => {
      const error = new SignalLifecycleError("Invalid phase");
      expect(error.code).toBe("LIFECYCLE_ERROR");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("SignalInternalError", () => {
    it("should create internal error", () => {
      const error = new SignalInternalError("Internal failure");
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.statusCode).toBe(500);
    });
  });

  describe("isSignalError", () => {
    it("should detect Signal errors", () => {
      const signalError = new SignalError("TEST", "Test");
      const regularError = new Error("Regular");
      expect(isSignalError(signalError)).toBe(true);
      expect(isSignalError(regularError)).toBe(false);
    });

    it("should detect derived Signal errors", () => {
      expect(isSignalError(new SignalAuthError())).toBe(true);
      expect(isSignalError(new SignalValidationError())).toBe(true);
    });
  });

  describe("buildErrorResponse", () => {
    it("should build response from SignalError", () => {
      const error = new SignalValidationError("Invalid", { field: ["error"] });
      const response = buildErrorResponse(error);
      expect(response.ok).toBe(false);
      expect(response.error.code).toBe("VALIDATION_ERROR");
    });

    it("should handle regular errors", () => {
      const error = new Error("Regular error");
      const response = buildErrorResponse(error);
      expect(response.ok).toBe(false);
      expect(response.error.code).toBe("INTERNAL_ERROR");
    });

    it("should include error information", () => {
      const error = new SignalNotFoundError();
      const response = buildErrorResponse(error);
      expect(response.ok).toBe(false);
      expect(response.error.code).toBe("NOT_FOUND");
    });
  });
});

describe("Lifecycle", () => {
  let lifecycle: Lifecycle;

  beforeEach(() => {
    lifecycle = new Lifecycle();
  });

  it("should start in CONFIGURING phase", () => {
    expect(lifecycle.getPhase()).toBe(SignalPhase.CONFIGURING);
    expect(lifecycle.is(SignalPhase.CONFIGURING)).toBe(true);
  });

  it("should transition to REGISTERING", () => {
    lifecycle.startRegistering();
    expect(lifecycle.getPhase()).toBe(SignalPhase.REGISTERING);
    expect(lifecycle.is(SignalPhase.REGISTERING)).toBe(true);
  });

  it("should transition to RUNNING", () => {
    lifecycle.startRegistering();
    lifecycle.start();
    expect(lifecycle.getPhase()).toBe(SignalPhase.RUNNING);
    expect(lifecycle.isRunning()).toBe(true);
  });

  it("should fail on invalid transition to REGISTERING", () => {
    lifecycle.startRegistering();
    expect(() => {
      lifecycle.startRegistering();
    }).toThrow();
  });

  it("should fail on invalid transition to RUNNING", () => {
    expect(() => {
      lifecycle.start();
    }).toThrow();
  });

  it("should handle failure state", () => {
    const error = new Error("Test error");
    lifecycle.fail(error);
    expect(lifecycle.getPhase()).toBe(SignalPhase.FAILED);
    expect(lifecycle.isFailed()).toBe(true);
    expect(lifecycle.getError()).toBe(error);
  });

  it("should enforce phase requirements", () => {
    expect(() => {
      lifecycle.require(SignalPhase.RUNNING, "test action");
    }).toThrow(SignalLifecycleError);

    lifecycle.startRegistering();
    lifecycle.start();
    lifecycle.require(SignalPhase.RUNNING, "test action"); // Should not throw
  });

  it("should return undefined for error when not failed", () => {
    expect(lifecycle.getError()).toBeUndefined();
  });
});

describe.skip("Registry", () => {
  let lifecycle: Lifecycle;
  let registry: Registry;

  beforeEach(() => {
    lifecycle = new Lifecycle();
    lifecycle.startRegistering();
    registry = new Registry(lifecycle);
  });

  describe("collection registration", () => {
    it("should register a collection", () => {
      const def = {
        name: "posts",
        queries: {},
        mutations: {},
      };

      registry.registerCollection(def);
      const retrieved = registry.getCollection("posts");
      expect(retrieved).toBe(def);
    });

    it("should prevent duplicate collections", () => {
      const def = { name: "posts", queries: {}, mutations: {} };
      registry.registerCollection(def);

      expect(() => {
        registry.registerCollection(def);
      }).toThrow(SignalRegistryError);
      expect(() => {
        registry.registerCollection(def);
      }).toThrow("already registered");
    });

    it("should throw when collection not found", () => {
      expect(() => {
        registry.getCollection("nonexistent");
      }).toThrow(SignalRegistryError);
    });
  });

  describe("query registration", () => {
    it("should register a query", () => {
      const def = {
        collectionName: "posts",
        name: "list",
        handler: jest.fn(),
      };

      registry.registerQuery(def);
      const retrieved = registry.getQuery("posts", "list");
      expect(retrieved).toBe(def);
    });

    it("should prevent duplicate queries", () => {
      const def = {
        collectionName: "posts",
        name: "list",
        handler: jest.fn(),
      };

      registry.registerQuery(def);

      expect(() => {
        registry.registerQuery(def);
      }).toThrow(SignalRegistryError);
    });

    it("should throw when query not found", () => {
      expect(() => {
        registry.getQuery("posts", "nonexistent");
      }).toThrow(SignalRegistryError);
    });
  });

  describe("mutation registration", () => {
    it("should register a mutation", () => {
      const def = {
        collectionName: "posts",
        name: "create",
        handler: jest.fn(),
      };

      registry.registerMutation(def);
      const retrieved = registry.getMutation("posts", "create");
      expect(retrieved).toBe(def);
    });

    it("should prevent duplicate mutations", () => {
      const def = {
        collectionName: "posts",
        name: "create",
        handler: jest.fn(),
      };

      registry.registerMutation(def);

      expect(() => {
        registry.registerMutation(def);
      }).toThrow(SignalRegistryError);
    });

    it("should throw when mutation not found", () => {
      expect(() => {
        registry.getMutation("posts", "nonexistent");
      }).toThrow(SignalRegistryError);
    });
  });

  describe("introspection", () => {
    it("should list all operations", () => {
      registry.registerCollection({ name: "posts" });
      registry.registerCollection({ name: "users" });
      registry.registerQuery({
        collectionName: "posts",
        name: "list",
        handler: jest.fn(),
      });
      registry.registerMutation({
        collectionName: "posts",
        name: "create",
        handler: jest.fn(),
      });

      const info = registry.introspect();
      expect(info.collections).toContain("posts");
      expect(info.collections).toContain("users");
      expect(info.queries).toContain("posts.list");
      expect(info.mutations).toContain("posts.create");
    });

    it("should list queries for a collection", () => {
      registry.registerQuery({
        collectionName: "posts",
        name: "list",
        handler: jest.fn(),
      });
      registry.registerQuery({
        collectionName: "posts",
        name: "get",
        handler: jest.fn(),
      });

      expect(registry.hasQuery("posts", "list")).toBe(true);
      expect(registry.hasQuery("posts", "get")).toBe(true);
      expect(registry.hasQuery("posts", "missing")).toBe(false);
    });

    it("should check if mutations exist", () => {
      registry.registerMutation({
        collectionName: "posts",
        name: "create",
        handler: jest.fn(),
      });

      expect(registry.hasMutation("posts", "create")).toBe(true);
      expect(registry.hasMutation("posts", "delete")).toBe(false);
    });
  });

  describe("key generation", () => {
    it("should generate registry keys", () => {
      const key = registry.getKey("posts", "list");
      expect(key).toBe("posts.list");
    });
  });
});

describe("Config", () => {
  it("should create config with required fields", () => {
    const db = new MemoryAdapter();
    const config = new Config({ db });
    expect(config.db).toBe(db);
  });

  it("should store transport", () => {
    const db = new MemoryAdapter();
    const transport = new InMemoryTransport();
    const config = new Config({ db, transport });
    expect(config.transport).toBe(transport);
  });

  it("should freeze the config object", () => {
    const db = new MemoryAdapter();
    const config = new Config({ db });
    expect(() => {
      (config as any).db = new MemoryAdapter();
    }).toThrow();
  });

  it("should get config values by path", () => {
    const db = new MemoryAdapter();
    const config = new Config({ db, env: { NODE_ENV: "test", API_KEY: "secret" } });
    expect(config.get("env.NODE_ENV")).toBe("test");
    expect(config.get("env.API_KEY")).toBe("secret");
  });

  it("should return undefined for missing paths", () => {
    const db = new MemoryAdapter();
    const config = new Config({ db });
    expect(config.get("nonexistent")).toBeUndefined();
    expect(config.get("env.missing")).toBeUndefined();
  });

  it("should handle nested path lookups", () => {
    const db = new MemoryAdapter();
    const env = { nested: { deep: { value: 42 } } };
    const config = new Config({ db, env });
    expect(config.get("env.nested.deep.value")).toBe(42);
  });
});

describe("Invariant Utility", () => {
  describe("invariant", () => {
    it("should not throw for truthy values", () => {
      expect(() => invariant(true, "Should not throw")).not.toThrow();
      expect(() => invariant(1, "Should not throw")).not.toThrow();
      expect(() => invariant("string", "Should not throw")).not.toThrow();
      expect(() => invariant({}, "Should not throw")).not.toThrow();
    });

    it("should throw for falsy values", () => {
      expect(() => invariant(false, "Error")).toThrow("Error");
      expect(() => invariant(0, "Error")).toThrow();
      expect(() => invariant("", "Error")).toThrow();
      expect(() => invariant(null, "Error")).toThrow();
      expect(() => invariant(undefined, "Error")).toThrow();
    });

    it("should support function messages", () => {
      expect(() => {
        invariant(false, () => "Dynamic message");
      }).toThrow("Dynamic message");
    });

    it("should use default message", () => {
      expect(() => {
        invariant(false);
      }).toThrow("Invariant violation");
    });
  });

  describe("assertNonNull", () => {
    it("should not throw for non-null values", () => {
      expect(() => assertNonNull(0, "Should not throw")).not.toThrow();
      expect(() => assertNonNull("", "Should not throw")).not.toThrow();
      expect(() => assertNonNull(false, "Should not throw")).not.toThrow();
    });

    it("should throw for null", () => {
      expect(() => assertNonNull(null, "Must not be null")).toThrow("Must not be null");
    });

    it("should throw for undefined", () => {
      expect(() => assertNonNull(undefined, "Must be defined")).toThrow("Must be defined");
    });

    it("should use default message", () => {
      expect(() => assertNonNull(null)).toThrow("Value must not be null or undefined");
    });
  });

  describe("unreachable", () => {
    it("should always throw", () => {
      expect(() => unreachable()).toThrow("This code should never be reached");
    });

    it("should support custom message", () => {
      expect(() => unreachable("Custom unreachable")).toThrow("Custom unreachable");
    });
  });
});

describe.skip("Deep Freeze Utility", () => {
  describe("isDeepFrozen", () => {
    it("should detect deeply frozen objects", () => {
      const obj = { a: { b: { c: 1 } } };
      deepFreeze(obj);
      expect(isDeepFrozen(obj)).toBe(true);
    });

    it("should detect partially frozen objects", () => {
      const obj = { a: { b: 1 } };
      Object.freeze(obj); // Only freeze top level
      expect(isDeepFrozen(obj)).toBe(false);
    });

    it("should handle circular references", () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      deepFreeze(obj);
      expect(isDeepFrozen(obj)).toBe(true);
    });

    it("should return false for non-frozen objects", () => {
      const obj = { a: 1 };
      expect(isDeepFrozen(obj)).toBe(false);
    });

    it("should handle arrays", () => {
      const arr = [1, { a: 2 }, [3]];
      deepFreeze(arr);
      expect(isDeepFrozen(arr)).toBe(true);
    });

    it("should handle primitives", () => {
      expect(isDeepFrozen(null)).toBe(true);
      expect(isDeepFrozen(123)).toBe(true);
      expect(isDeepFrozen("string")).toBe(true);
    });
  });

  describe("deepFreeze edge cases", () => {
    it("should handle objects with many levels", () => {
      const deep = { l1: { l2: { l3: { l4: { l5: 1 } } } } };
      deepFreeze(deep);
      expect(Object.isFrozen(deep.l1.l2.l3.l4)).toBe(true);
    });

    it("should respect max depth", () => {
      const deep = { l1: { l2: { l3: { l4: 1 } } } };
      deepFreeze(deep, 2);
      expect(Object.isFrozen(deep)).toBe(true);
      expect(Object.isFrozen(deep.l1)).toBe(true);
      // l2 and beyond may not be frozen due to max depth
    });

    it("should handle mixed types", () => {
      const obj = {
        num: 123,
        str: "test",
        arr: [1, 2, 3],
        nested: { a: 1 },
        nul: null,
        und: undefined,
      };
      deepFreeze(obj);
      expect(Object.isFrozen(obj)).toBe(true);
      expect(Object.isFrozen(obj.arr)).toBe(true);
      expect(Object.isFrozen(obj.nested)).toBe(true);
    });

    it("should freeze function properties", () => {
      const obj = {
        fn: () => { },
        data: { a: 1 },
      };
      deepFreeze(obj);
      expect(Object.isFrozen(obj)).toBe(true);
    });
  });
});
