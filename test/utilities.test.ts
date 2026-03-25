/**
 * Comprehensive tests for utility functions and helper modules
 * Covers validation, logging, hashing, freezing, and error handling
 */

import { validateInput, validateBody, validateQueryKey, validateMutationKey, validateInputOrThrow } from "../packages/http/validation";
import { deepFreeze, isFrozen } from "../packages/utils/deepFreeze";
import { invariant } from "../packages/utils/invariant";
import { generateId, stableHash } from "../packages/utils/stableHash";
import { ConsoleLogger, NoOpLogger, LogLevel } from "../packages/utils/logger";
import { AuthProvider } from "../packages/security/AuthProvider";
import { AccessControl } from "../packages/security/AccessControl";
import { EventBus } from "../packages/transport/EventBus";
import { SignalEvent } from "../packages/core/Types";

describe("HTTP Validation", () => {
  describe("validateInput", () => {
    it("should accept valid objects", () => {
      const result = validateInput({ name: "test", count: 42 });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should reject non-objects", () => {
      const result = validateInput("string");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Input must be an object");
    });

    it("should reject null", () => {
      const result = validateInput(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Input must be an object");
    });

    it("should reject arrays", () => {
      const result = validateInput([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Input must be an object, not an array");
    });

    it("should reject reserved fields", () => {
      const result = validateInput({ _internal: "value" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Reserved field: _internal");
    });

    it("should accept multiple valid fields", () => {
      const result = validateInput({ a: 1, b: "test", c: null });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateBody", () => {
    it("should accept valid bodies", () => {
      const result = validateBody({ data: "test" });
      expect(result.valid).toBe(true);
      expect(result.params).toEqual({ data: "test" });
    });

    it("should accept empty body", () => {
      const result = validateBody(null);
      expect(result.valid).toBe(true);
      expect(result.params).toEqual({});
    });

    it("should reject non-objects", () => {
      const result = validateBody("string");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Request body must be a JSON object");
    });

    it("should reject arrays", () => {
      const result = validateBody([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Request body must be a JSON object");
    });
  });

  describe("validateQueryKey", () => {
    it("should accept valid query keys", () => {
      expect(validateQueryKey("posts.list")).toBe(true);
      expect(validateQueryKey("users.mine")).toBe(true);
      expect(validateQueryKey("a.b")).toBe(true);
    });

    it("should reject invalid keys", () => {
      expect(validateQueryKey("invalid")).toBe(false);
      expect(validateQueryKey("a..b")).toBe(false);
      expect(validateQueryKey("")).toBe(false);
      expect(validateQueryKey("a.")).toBe(false);
      expect(validateQueryKey(".b")).toBe(false);
    });

    it("should reject long keys", () => {
      const longKey = "a." + "b".repeat(300);
      expect(validateQueryKey(longKey)).toBe(false);
    });

    it("should reject non-strings", () => {
      expect(validateQueryKey(123 as any)).toBe(false);
      expect(validateQueryKey(null as any)).toBe(false);
    });
  });

  describe("validateMutationKey", () => {
    it("should accept valid mutation keys", () => {
      expect(validateMutationKey("posts.create")).toBe(true);
      expect(validateMutationKey("users.delete")).toBe(true);
    });

    it("should reject invalid mutation keys", () => {
      expect(validateMutationKey("invalid")).toBe(false);
      expect(validateMutationKey("a..b")).toBe(false);
    });
  });

  describe("validateInputOrThrow", () => {
    it("should not throw for valid input", () => {
      expect(() => {
        validateInputOrThrow({ name: "test" });
      }).not.toThrow();
    });

    it("should throw for invalid input", () => {
      expect(() => {
        validateInputOrThrow("invalid");
      }).toThrow("Invalid input");
    });

    it("should include field name in error", () => {
      expect(() => {
        validateInputOrThrow("invalid", "params");
      }).toThrow("Invalid params");
    });

    it("should include error details", () => {
      try {
        validateInputOrThrow("invalid", "data");
        fail("Should have thrown");
      } catch (error: any) {
        expect(error.details).toBeDefined();
        expect(error.details.data).toBeDefined();
      }
    });
  });
});

describe("Deep Freeze Utility", () => {
  it("should freeze objects", () => {
    const obj = { a: 1 };
    const frozen = deepFreeze(obj);
    expect(isFrozen(frozen)).toBe(true);
  });

  it("should prevent modifications", () => {
    const obj = { a: 1 };
    deepFreeze(obj);
    expect(() => {
      (obj as any).a = 2;
    }).toThrow();
  });

  it("should recursively freeze nested objects", () => {
    const obj = { a: { b: { c: 1 } } };
    const frozen = deepFreeze(obj);
    expect(isFrozen(frozen)).toBe(true);
    expect(isFrozen(frozen.a)).toBe(true);
  });

  it("should freeze arrays", () => {
    const arr: any[] = [1, 2, { a: 3 }];
    const frozen = deepFreeze(arr);
    expect(isFrozen(frozen)).toBe(true);
  });

  it("should handle already frozen objects", () => {
    const obj = { a: 1 };
    deepFreeze(obj);
    const frozen2 = deepFreeze(obj);
    expect(frozen2).toBe(obj);
  });

  it("should handle null and primitives", () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(123)).toBe(123);
    expect(deepFreeze("string")).toBe("string");
  });

  it("should respect max depth", () => {
    const obj = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    deepFreeze(obj, 2); // Max depth of 2
    // Shallow properties should be frozen
    expect(isFrozen(obj)).toBe(true);
  });
});

describe("Invariant Utility", () => {
  it("should not throw for truthy values", () => {
    expect(() => {
      invariant(true, "Should not throw");
      invariant(1, "Should not throw");
      invariant("string", "Should not throw");
    }).not.toThrow();
  });

  it("should throw for falsy values", () => {
    expect(() => {
      invariant(false, "Error message");
    }).toThrow("Error message");
  });

  it("should throw for null and undefined", () => {
    expect(() => {
      invariant(null, "null");
    }).toThrow("null");

    expect(() => {
      invariant(undefined, "undefined");
    }).toThrow("undefined");
  });

  it("should include custom message", () => {
    expect(() => {
      invariant(false, "Custom error");
    }).toThrow("Custom error");
  });
});

describe("Stable Hash Utility", () => {
  it("should generate unique IDs", () => {
    const id1 = generateId("test");
    const id2 = generateId("test");
    expect(id1).not.toBe(id2);
  });

  it("should include prefix in ID", () => {
    const id = generateId("evt");
    expect(id).toMatch(/^evt_/);
  });

  it("should generate stable hash for objects", () => {
    const obj = { a: 1, b: 2 };
    const hash1 = stableHash(obj);
    const hash2 = stableHash(obj);
    expect(hash1).toBe(hash2);
  });

  it("should differentiate different objects", () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };
    expect(stableHash(obj1)).not.toBe(stableHash(obj2));
  });

  it("should handle nested objects", () => {
    const obj = { a: { b: { c: 1 } } };
    const hash = stableHash(obj);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });
});

describe("Logger Utility", () => {
  describe("ConsoleLogger", () => {
    it("should log at different levels", () => {
      const logger = new ConsoleLogger();
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => { });

      logger.info("test");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should respect log level", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => { });

      logger.debug("debug"); // Should not log
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should set log level", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      logger.setLevel(LogLevel.DEBUG);
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => { });

      logger.debug("debug");
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("NoOpLogger", () => {
    it("should do nothing", () => {
      const logger = new NoOpLogger();
      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => { });

      logger.info("test");
      logger.error("error");
      logger.warn("warn");
      logger.debug("debug");

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe("Auth Provider", () => {
  it("should create authenticated user", () => {
    const auth = AuthProvider.authenticated("user1", ["admin"]);
    expect(auth.user).toBeDefined();
    expect(auth.user?.id).toBe("user1");
    expect(auth.user?.roles).toEqual(["admin"]);
  });

  it("should create anonymous auth", () => {
    const auth = AuthProvider.anonymous();
    expect(auth.user).toBeUndefined();
  });

  it("should handle empty roles", () => {
    const auth = AuthProvider.authenticated("user1", []);
    expect(auth.user?.roles).toEqual([]);
  });

  it("should check if authenticated", () => {
    const authAuth = AuthProvider.authenticated("user1");
    const authAnon = AuthProvider.anonymous();
    expect(AuthProvider.isAuthenticated(authAuth)).toBe(true);
    expect(AuthProvider.isAuthenticated(authAnon)).toBe(false);
  });

  it("should check roles", () => {
    const auth = AuthProvider.authenticated("user1", ["admin", "editor"]);
    expect(AuthProvider.hasRole(auth, "admin")).toBe(true);
    expect(AuthProvider.hasRole(auth, "user")).toBe(false);
  });

  it("should extract auth from headers", () => {
    const headers = {
      authorization: "Bearer token123",
      "x-user-id": "user1",
      "x-user-roles": "admin,editor",
    };
    const auth = AuthProvider.fromHeaders(headers);
    expect(auth.token).toBe("token123");
    expect(auth.user?.id).toBe("user1");
    expect(auth.user?.roles).toContain("admin");
  });

  it("should merge auth sources", () => {
    const auth1 = { token: "token1" };
    const auth2 = { user: { id: "user1" } };
    const merged = AuthProvider.merge(auth1, auth2);
    expect(merged.token).toBe("token1");
    expect(merged.user?.id).toBe("user1");
  });

  it("should clean params", () => {
    const params = { name: "test", _auth: "secret", _token: "token" };
    const result = AuthProvider.fromParams(params);
    expect(result.cleanParams._auth).toBeUndefined();
    expect(result.cleanParams._token).toBeUndefined();
    expect(result.cleanParams.name).toBe("test");
  });
});

describe("Access Control", () => {
  let ac: AccessControl;

  beforeEach(() => {
    ac = new AccessControl("posts", {
      query: { list: "public", mine: "auth" },
      mutation: { create: "auth", delete: (ctx) => ctx.auth?.user?.roles?.includes("admin") || false },
    });
  });

  it("should check query access", async () => {
    const ctx: any = { auth: {} };
    expect(await ac.checkQueryAccess("list", ctx)).toBe(true); // public
    expect(await ac.checkQueryAccess("mine", ctx)).toBe(false); // requires auth
  });

  it("should check mutation access", async () => {
    const ctxAuth: any = { auth: { user: { id: "user1" } } };
    const ctxGuest: any = { auth: {} };
    expect(await ac.checkMutationAccess("create", ctxAuth)).toBe(true);
    expect(await ac.checkMutationAccess("create", ctxGuest)).toBe(false);
  });

  it("should check function-based rules", async () => {
    const ctxAdmin: any = { auth: { user: { id: "user1", roles: ["admin"] } } };
    const ctxUser: any = { auth: { user: { id: "user1", roles: ["user"] } } };
    expect(await ac.checkMutationAccess("delete", ctxAdmin)).toBe(true);
    expect(await ac.checkMutationAccess("delete", ctxUser)).toBe(false);
  });
});

describe("Event Bus", () => {
  let bus: EventBus;
  let mockEvent: SignalEvent;

  beforeEach(() => {
    bus = new EventBus();
    mockEvent = {
      id: "evt_123",
      name: "posts.create",
      payload: { data: "test" },
      timestamp: Date.now(),
    };
  });

  it("should publish events", async () => {
    const handler = jest.fn();
    bus.subscribe("posts.create", handler);

    await bus.publish(mockEvent);

    expect(handler).toHaveBeenCalledWith(mockEvent);
  });

  it("should support wildcard patterns", async () => {
    const handler = jest.fn();
    bus.subscribe("posts.*", handler);

    const event: SignalEvent = { ...mockEvent, name: "posts.delete" };
    await bus.publish(event);

    expect(handler).toHaveBeenCalled();
  });

  it("should support global wildcard", async () => {
    const handler = jest.fn();
    bus.subscribe("*", handler);

    await bus.publish(mockEvent);

    expect(handler).toHaveBeenCalled();
  });

  it("should maintain event history", async () => {
    await bus.publish(mockEvent);
    const history = bus.getHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual(mockEvent);
  });

  it("should return unsubscribe function", async () => {
    const handler = jest.fn();
    const unsubscribe = bus.subscribe("posts.create", handler);

    await bus.publish(mockEvent);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    await bus.publish(mockEvent);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, no new call
  });

  it("should filter history by pattern", async () => {
    const event1 = { ...mockEvent, name: "posts.create" };
    const event2 = { ...mockEvent, name: "users.create" };

    await bus.publish(event1);
    await bus.publish(event2);

    const history = bus.getHistoryByPattern("posts.*");
    expect(history.length).toBe(1);
    expect(history[0].name).toBe("posts.create");
  });

  it("should get subscriber count", () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();

    bus.subscribe("posts.*", handler1);
    bus.subscribe("posts.*", handler2);
    bus.subscribe("users.*", handler3);

    expect(bus.getSubscriberCount("posts.*")).toBe(2);
    expect(bus.getSubscriberCount("users.*")).toBe(1);
    expect(bus.getSubscriberCount()).toBe(3);
  });

  it("should clear history", async () => {
    await bus.publish(mockEvent);
    expect(bus.getHistory().length).toBe(1);

    bus.clearHistory();
    expect(bus.getHistory().length).toBe(0);
  });

  it("should handle multiple handlers for same pattern", async () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    bus.subscribe("posts.create", handler1);
    bus.subscribe("posts.create", handler2);

    await bus.publish(mockEvent);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it("should handle handler errors gracefully", async () => {
    const goodHandler = jest.fn();
    const badHandler = jest.fn().mockRejectedValue(new Error("Handler failed"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => { });

    bus.subscribe("posts.create", goodHandler);
    bus.subscribe("posts.create", badHandler);

    await bus.publish(mockEvent);

    expect(goodHandler).toHaveBeenCalled();
    expect(badHandler).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
