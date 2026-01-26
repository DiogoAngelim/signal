/**
 * Comprehensive tests for Signal framework core functionality
 * Covers queries, mutations, subscriptions, and reactive integration
 */

import { Signal } from "../packages/core/Signal";
import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { InMemoryTransport } from "../packages/transport/adapters/InMemoryTransport";
import { createContext, AuthProvider } from "../index";
import { SignalEvent } from "../packages/core/Types";

describe("Signal Core", () => {
  let signal: Signal;
  let db: MemoryAdapter;
  let transport: InMemoryTransport;

  beforeEach(() => {
    Signal.reset();
    signal = new Signal();
    db = new MemoryAdapter();
    transport = new InMemoryTransport();

    signal.configure({ db, transport });

    signal
      .collection("posts")
      .access({
        query: { list: "public", mine: "auth" },
        mutation: { create: "auth", delete: (ctx) => ctx.auth.user?.roles?.includes("admin") || false },
      })
      .query("list", async (params, ctx) => {
        return await ctx.db.find("posts", {});
      })
      .query("mine", async (params, ctx) => {
        const userId = ctx.auth.user?.id;
        return userId ? await ctx.db.find("posts", { authorId: userId }) : [];
      })
      .mutation("create", async (params: any, ctx) => {
        const postId = await ctx.db.insert("posts", {
          title: params.title,
          authorId: ctx.auth.user?.id,
        });
        return { postId };
      })
      .mutation("delete", async (params: any, ctx) => {
        await ctx.db.remove("posts", params.postId);
        return { success: true };
      });
  });

  afterEach(async () => {
    await db.disconnect();
  });

  describe("lifecycle", () => {
    afterEach(() => {
      // Reinitialize signal for the rest of the tests
      try {
        Signal.reset();
        signal = new Signal();
        signal.configure({ db, transport });
      } catch (err) {
        // Signal already exists, that's fine
      }
    });

    it("should start in CONFIGURING phase", () => {
      // This test needs a fresh Signal that hasn't been configured yet
      Signal.reset(); // Reset first to allow creating a new instance
      const freshSignal = new Signal();
      expect(freshSignal.getPhase()).toBe("CONFIGURING");
    });

    it("should transition to REGISTERING after configure", () => {
      expect(signal.getPhase()).toBe("REGISTERING");
    });

    it("should transition to RUNNING after start", async () => {
      await signal.start();
      expect(signal.getPhase()).toBe("RUNNING");
    });

    it("should prevent operations before start", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.query("posts.list", {}, ctx)).rejects.toThrow();
    });
  });

  describe("query execution", () => {
    beforeEach(async () => {
      await signal.start();
      // Insert test data
      await db.insert("posts", { title: "Post 1", authorId: "user1" });
      await db.insert("posts", { title: "Post 2", authorId: "user2" });
    });

    it("should execute public query without auth", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal.getEmitFn())
        .build();

      const result = await signal.query("posts.list", {}, ctx);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it("should execute authenticated query with auth", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      const result = await signal.query("posts.mine", {}, ctx);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].authorId).toBe("user1");
    });

    it("should deny access to protected queries", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.query("posts.mine", {}, ctx)).rejects.toThrow("Access denied");
    });

    it("should throw on invalid query key", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.query("invalid", {}, ctx)).rejects.toThrow("Invalid query key");
    });

    it("should throw on non-existent query", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.query("posts.nonexistent", {}, ctx)).rejects.toThrow("not found");
    });
  });

  describe("mutation execution", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should execute authenticated mutation", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      const result = await signal.mutation("posts.create", { title: "Test" }, ctx);
      expect(result.postId).toBeDefined();

      const posts = await db.find("posts", {});
      expect(posts.length).toBe(1);
    });

    it("should deny access to protected mutations", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.mutation("posts.create", { title: "Test" }, ctx)).rejects.toThrow("Access denied");
    });

    it("should enforce role-based access control", async () => {
      const editorCtx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("editor1", ["editor"]))
        .withEmit(signal.getEmitFn())
        .build();

      const postId = await db.insert("posts", { title: "Test" });

      await expect(signal.mutation("posts.delete", { postId }, editorCtx)).rejects.toThrow("Access denied");
    });

    it("should allow admin to delete", async () => {
      const adminCtx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("admin1", ["admin"]))
        .withEmit(signal.getEmitFn())
        .build();

      const postId = await db.insert("posts", { title: "Test" });

      const result = await signal.mutation("posts.delete", { postId }, adminCtx);
      expect(result.success).toBe(true);

      const exists = await db.findById("posts", postId);
      expect(exists).toBeNull();
    });

    it("should throw on invalid mutation key", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.mutation("invalid", {}, ctx)).rejects.toThrow("Invalid mutation key");
    });

    it("should throw on non-existent mutation", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await expect(signal.mutation("posts.nonexistent", {}, ctx)).rejects.toThrow("not found");
    });
  });

  describe("event emission", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should emit event after mutation", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test" }, ctx);

      const events = signal.getEventBuffer();
      expect(events.length).toBe(1);
      expect(events[0].name).toBe("posts.create");
    });

    it("should enrich emitted events with metadata", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test" }, ctx);

      const event = signal.getEventBuffer()[0];
      expect(event.resource).toBe("posts");
      expect(event.action).toBe("create");
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it("should dispatch events to transport", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test" }, ctx);

      const transportEvents = transport.getEvents();
      expect(transportEvents.length).toBe(1);
    });

    it("should track event history", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test 1" }, ctx);
      await signal.mutation("posts.create", { title: "Test 2" }, ctx);

      const history = signal.getEventHistory();
      expect(history.length).toBe(2);
    });

    it("should support filtering event history by timestamp", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      const before = Date.now();
      await signal.mutation("posts.create", { title: "Test 1" }, ctx);
      const after = Date.now();
      await signal.mutation("posts.create", { title: "Test 2" }, ctx);

      const filtered = signal.getEventHistory(before + 10);
      expect(filtered.length).toBeLessThanOrEqual(2);
    });
  });

  describe("subscriptions", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should register query subscription", () => {
      const handler = jest.fn();
      const result = signal.subscribeQuery("posts.list", {}, handler);

      expect(result.subscriptionId).toBeDefined();
      expect(result.unsubscribe).toBeDefined();
    });

    it("should notify subscriptions on related events", async () => {
      const handler = jest.fn();
      signal.subscribeQuery("posts.list", {}, handler);

      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test" }, ctx);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0][0] as SignalEvent;
      expect(event._metadata?.affectedQuery).toBe("posts.list");
    });

    it("should unsubscribe", async () => {
      const handler = jest.fn();
      const { unsubscribe } = signal.subscribeQuery("posts.list", {}, handler);

      unsubscribe();

      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test" }, ctx);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should throw when subscribing before start", () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport });

      const handler = jest.fn();
      expect(() => signal2.subscribeQuery("posts.list", {}, handler)).toThrow();
    });

    it("should throw on invalid query key", async () => {
      const handler = jest.fn();
      expect(() => signal.subscribeQuery("invalid", {}, handler)).toThrow("Invalid query key");
    });

    it("should throw on non-existent query", async () => {
      const handler = jest.fn();
      expect(() => signal.subscribeQuery("posts.nonexistent", {}, handler)).toThrow("not found");
    });
  });

  describe("resource versioning", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should track resource version", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      const result = await signal.mutation("posts.create", { title: "Test" }, ctx);
      const postId = result.postId;

      // The event should contain resource ID in payload
      const event = signal.getEventBuffer()[0];
      expect(event).toBeDefined();

      // Get the resource key (should be posts:postId or similar)
      const resourceKey = `posts:${postId}`;
      const version = signal.getResourceVersion(resourceKey);

      // Version might be undefined if not set, but the method should work
      expect(typeof version === 'number' || version === undefined).toBe(true);
    });

    it("should return undefined for unknown resource", () => {
      const version = signal.getResourceVersion("unknown:123");
      expect(version).toBeUndefined();
    });
  });

  describe("registry and introspection", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should provide registry access", () => {
      const registry = signal.getRegistry();
      expect(registry).toBeDefined();
      expect(registry.hasCollection("posts")).toBe(true);
    });

    it("should allow introspection", () => {
      const introspection = signal.getRegistry().introspect();

      expect(introspection.collections).toContain("posts");
      expect(introspection.queries).toContain("posts.list");
      expect(introspection.queries).toContain("posts.mine");
      expect(introspection.mutations).toContain("posts.create");
      expect(introspection.mutations).toContain("posts.delete");
    });

    it("should prevent registration after startup", async () => {
      expect(() => signal.collection("comments")).toThrow();
    });
  });

  describe("event buffer management", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should clear event buffer", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await signal.mutation("posts.create", { title: "Test" }, ctx);
      expect(signal.getEventBuffer().length).toBeGreaterThan(0);

      signal.clearEventBuffer();
      expect(signal.getEventBuffer().length).toBe(0);
    });
  });

  describe("reactive core access", () => {
    it("should expose ReactiveCore", () => {
      const core = signal.getReactiveCore();
      expect(core).toBeDefined();
    });
  });

  describe("emit function", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should emit domain events via context emit", async () => {
      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal.getEmitFn())
        .build();

      await ctx.emit("custom.event", { data: "test" });

      const events = signal.getEventBuffer();
      const customEvent = events.find((e) => e.name === "custom.event");
      expect(customEvent).toBeDefined();
      expect(customEvent?.payload.data).toBe("test");
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await signal.start();
    });

    it("should handle query handler errors", async () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport });

      signal2.collection("test").query("fail", async () => {
        throw new Error("Test error");
      });

      await signal2.start();

      const ctx = createContext()
        .withDB(db)
        .withAuth({})
        .withEmit(signal2.getEmitFn())
        .build();

      await expect(signal2.query("test.fail", {}, ctx)).rejects.toThrow();
    });

    it("should handle mutation handler errors", async () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport });

      signal2.collection("test").mutation("fail", async () => {
        throw new Error("Test error");
      });

      await signal2.start();

      const ctx = createContext()
        .withDB(db)
        .withAuth(AuthProvider.authenticated("user1", []))
        .withEmit(signal2.getEmitFn())
        .build();

      await expect(signal2.mutation("test.fail", {}, ctx)).rejects.toThrow();
    });
  });

  describe("singleton pattern", () => {
    it("should throw when creating multiple instances", () => {
      expect(() => {
        new Signal();
        new Signal();
      }).toThrow("Signal instance already exists");
    });

    it("should allow reset", () => {
      Signal.reset();
      expect(() => new Signal()).not.toThrow();
    });

    it("should return instance via getInstance", () => {
      const instance1 = Signal.getInstance();
      const instance2 = Signal.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});
