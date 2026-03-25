/**
 * HTTP Handler and Adapter Tests
 * Covers HTTP request handling and input/output validation
 */

import { Signal } from "../packages/core/Signal";
import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { InMemoryTransport } from "../packages/transport/adapters/InMemoryTransport";
import { createContext, AuthProvider, SignalRouter, createHandler } from "../index";

describe("HTTP Handler Integration", () => {
  let signal: Signal;
  let db: MemoryAdapter;
  let transport: InMemoryTransport;

  beforeEach(async () => {
    Signal.reset();
    signal = new Signal();
    db = new MemoryAdapter();
    transport = new InMemoryTransport();

    signal.configure({ db, transport });

    signal
      .collection("items")
      .access({
        query: { list: "public", get: "public" },
        mutation: { create: "auth" },
      })
      .query("list", async (params, ctx) => {
        return await ctx.db.find("items", {});
      })
      .query("get", async (params, ctx) => {
        return await ctx.db.findById("items", params.id);
      })
      .mutation("create", async (params: any, ctx) => {
        const id = await ctx.db.insert("items", {
          name: params.name,
          createdBy: ctx.auth.user?.id,
        });
        return { id };
      });

    await signal.start();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it("should create a handler function", () => {
    const handler = createHandler(signal);
    expect(typeof handler).toBe("function");
  });

  it("should handle query requests via router", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "POST",
      path: "/signal/query",
      headers: {},
      body: {
        key: "items.list",
        params: {},
      },
    });

    expect(response.ok).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it("should handle mutation requests via router", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "POST",
      path: "/signal/mutation",
      headers: { "x-user-id": "user1" },
      body: {
        key: "items.create",
        params: { name: "Test Item" },
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toBeDefined();
  });

  it("should handle introspection", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "GET",
      path: "/signal/introspect",
      headers: {},
    });

    expect(response.ok).toBe(true);
    expect(response.data).toBeDefined();
  });

  it("should return 404 for invalid routes", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "GET",
      path: "/invalid",
      headers: {},
    });

    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("NOT_FOUND");
  });

  it("should handle access control errors", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "POST",
      path: "/signal/mutation",
      headers: {}, // No user = not authenticated
      body: {
        key: "items.create",
        params: { name: "Test" },
      },
    });

    expect(response.ok).toBe(false);
    expect(response.error?.code).toContain("FORBIDDEN");
  });

  it("should handle validation errors", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "POST",
      path: "/signal/query",
      headers: {},
      body: {
        key: "invalid", // Invalid key format
        params: {},
      },
    });

    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should handle missing parameters", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "POST",
      path: "/signal/query",
      headers: {},
      body: {
        key: "items.list",
        // params missing
      },
    });

    expect(response.ok).toBe(true); // Should work with defaults
  });

  it("should handle unknown query/mutation", async () => {
    const router = new SignalRouter(signal);
    const response = await router.route({
      method: "POST",
      path: "/signal/query",
      headers: {},
      body: {
        key: "items.nonexistent",
        params: {},
      },
    });

    expect(response.ok).toBe(false);
  });
});

