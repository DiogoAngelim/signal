/**
 * Comprehensive tests for HTTP router and handler
 * Covers query, mutation, introspection endpoints and error handling
 */

import { Signal } from "../packages/core/Signal";
import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { InMemoryTransport } from "../packages/transport/adapters/InMemoryTransport";
import { SignalRouter } from "../packages/http/router";
import { createHandler } from "../packages/http/handler";

describe("SignalRouter", () => {
  let signal: Signal;
  let router: SignalRouter;
  let db: MemoryAdapter;

  beforeEach(async () => {
    Signal.reset();
    signal = new Signal();
    db = new MemoryAdapter();
    const transport = new InMemoryTransport();

    signal.configure({ db, transport });

    signal
      .collection("posts")
      .access({
        query: { list: "public", mine: (ctx) => ctx.auth.user != null },
        mutation: { create: "auth" },
      })
      .query("list", async (params, ctx) => {
        return await ctx.db.find("posts", {});
      })
      .query("mine", async (params, ctx) => {
        const userId = ctx.auth.user?.id;
        return userId ? await ctx.db.find("posts", { authorId: userId }) : [];
      })
      .mutation("create", async (params: any, ctx) => {
        const id = await ctx.db.insert("posts", { title: params.title });
        return { postId: id };
      });

    await signal.start();

    router = new SignalRouter(signal, "/signal");
  });

  describe("route method", () => {
    it("should route to query handler", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("should route to mutation handler", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/mutation",
        headers: { "Authorization": "Bearer test-token", "x-user-id": "user1" },
        body: {
          key: "posts.create",
          params: { title: "Test" },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data?.postId).toBeDefined();
    });

    it("should route to introspect handler", async () => {
      const response = await router.route({
        method: "GET",
        path: "/signal/introspect",
        headers: {},
      });

      expect(response.ok).toBe(true);
      expect(response.data.collections).toContain("posts");
    });

    it("should return 404 for unknown route", async () => {
      const response = await router.route({
        method: "POST",
        path: "/unknown",
        headers: {},
        body: {},
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("NOT_FOUND");
    });

    it("should return 404 for wrong method", async () => {
      const response = await router.route({
        method: "GET",
        path: "/signal/mutation",
        headers: {},
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("query handler", () => {
    it("should execute public query without auth", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(true);
      expect(response.data).toBeDefined();
    });

    it("should execute authenticated query with auth header", async () => {
      await db.insert("posts", { title: "Test", authorId: "user1" });

      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: { "authorization": "Bearer token123", "x-user-id": "user1" },
        body: { key: "posts.mine", params: {} },
      });

      expect(response.ok).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("should deny access without required auth", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.mine", params: {} },
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("FORBIDDEN");
    });

    it("should validate query key format", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "invalid", params: {} },
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should pass params to handler", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: { limit: 10 } },
      });

      expect(response.ok).toBe(true);
    });

    it("should handle missing params", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list" },
      });

      expect(response.ok).toBe(true);
    });

    it("should handle handler errors gracefully", async () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport: new InMemoryTransport() });

      signal2.collection("test").query("fail", async () => {
        throw new Error("Query failed");
      });

      await signal2.start();

      const router2 = new SignalRouter(signal2, "/signal");

      const response = await router2.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "test.fail", params: {} },
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("mutation handler", () => {
    it("should execute authenticated mutation", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/mutation",
        headers: { "authorization": "Bearer user123", "x-user-id": "user1" },
        body: { key: "posts.create", params: { title: "Test" } },
      });

      expect(response.ok).toBe(true);
      expect(response.data?.postId).toBeDefined();
    });

    it("should deny access without auth", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/mutation",
        headers: {},
        body: { key: "posts.create", params: { title: "Test" } },
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("FORBIDDEN");
    });

    it("should validate mutation key format", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/mutation",
        headers: { authorization: "Bearer user123" },
        body: { key: "invalid", params: {} },
      });

      expect(response.ok).toBe(false);
      expect(response.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should pass params to handler", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/mutation",
        headers: { "authorization": "Bearer user123", "x-user-id": "user1" },
        body: { key: "posts.create", params: { title: "New Post" } },
      });

      expect(response.ok).toBe(true);
    });

    it("should handle missing params", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/mutation",
        headers: { "authorization": "Bearer user123", "x-user-id": "user1" },
        body: { key: "posts.create", params: {} },
      });

      // Router passes empty params to handler
      expect(response).toBeDefined();
    });

    it("should handle handler errors gracefully", async () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport: new InMemoryTransport() });

      signal2.collection("test").mutation("fail", async () => {
        throw new Error("Mutation failed");
      });

      await signal2.start();

      const router2 = new SignalRouter(signal2, "/signal");

      const response = await router2.route({
        method: "POST",
        path: "/signal/mutation",
        headers: { authorization: "Bearer user1" },
        body: { key: "test.fail", params: {} },
      });

      expect(response.ok).toBe(false);
    });
  });

  describe("introspect handler", () => {
    it("should return registry introspection", async () => {
      const response = await router.route({
        method: "GET",
        path: "/signal/introspect",
        headers: {},
      });

      expect(response.ok).toBe(true);
      expect(response.data.collections).toContain("posts");
      expect(response.data.queries).toContain("posts.list");
      expect(response.data.mutations).toContain("posts.create");
    });

    it("should not require authentication", async () => {
      const response = await router.route({
        method: "GET",
        path: "/signal/introspect",
        headers: {},
      });

      expect(response.ok).toBe(true);
    });
  });

  describe("basePath configuration", () => {
    it("should support custom basePath", async () => {
      const customRouter = new SignalRouter(signal, "/api/signal");

      const response = await customRouter.route({
        method: "POST",
        path: "/api/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(true);
    });

    it("should reject requests with wrong basePath", async () => {
      const customRouter = new SignalRouter(signal, "/api/signal");

      const response = await customRouter.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(false);
    });
  });

  describe("auth header parsing", () => {
    it("should extract bearer token from authorization header", async () => {
      await db.insert("posts", { title: "Test", authorId: "token123" });

      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: { "authorization": "Bearer token123", "x-user-id": "token123" },
        body: { key: "posts.mine", params: {} },
      });

      expect(response.ok).toBe(true);
    });

    it("should handle missing authorization header", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(true); // public query
    });

    it("should handle malformed authorization header", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: { authorization: "InvalidFormat" },
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(true); // Still works for public queries
    });
  });

  describe("request context building", () => {
    it("should include request metadata in context", async () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport: new InMemoryTransport() });

      signal2
        .collection("test")
        .query("checkContext", async (params, ctx) => {
          return {
            method: ctx.request?.method,
            url: ctx.request?.url,
          };
        });

      await signal2.start();

      const router2 = new SignalRouter(signal2, "/signal");

      const response = await router2.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "test.checkContext", params: {} },
      });

      expect(response.ok).toBe(true);
      expect(response.data.method).toBe("POST");
    });

    it("should include auth in context", async () => {
      Signal.reset();
      const signal2 = new Signal();
      signal2.configure({ db, transport: new InMemoryTransport() });

      signal2
        .collection("test")
        .query("checkAuth", async (params, ctx) => {
          return {
            userId: ctx.auth?.user?.id,
            roles: ctx.auth?.user?.roles,
          };
        });

      await signal2.start();

      const router2 = new SignalRouter(signal2, "/signal");

      const response = await router2.route({
        method: "POST",
        path: "/signal/query",
        headers: { authorization: "Bearer mytoken" },
        body: { key: "test.checkAuth", params: {} },
      });

      expect(response.ok).toBe(true);
    });
  });

  describe("response format", () => {
    it("should return standard response format", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response).toHaveProperty("ok");
      expect(response).toHaveProperty("data");
    });

    it("should include data in success response", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.list", params: {} },
      });

      expect(response.ok).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it("should include error in failure response", async () => {
      const response = await router.route({
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "posts.mine", params: {} },
      });

      expect(response.ok).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBeDefined();
      expect(response.error?.message).toBeDefined();
      expect(response.data).toBeUndefined();
    });
  });
});

describe("createHandler", () => {
  let signal: Signal;
  let db: MemoryAdapter;
  let handler: any;

  beforeEach(async () => {
    Signal.reset();
    signal = new Signal();
    db = new MemoryAdapter();
    const transport = new InMemoryTransport();

    signal.configure({ db, transport });

    signal
      .collection("posts")
      .query("list", async (params, ctx) => {
        return await ctx.db.find("posts", {});
      })
      .mutation("create", async (params: any, ctx) => {
        const id = await ctx.db.insert("posts", { title: params.title });
        return { postId: id };
      });

    await signal.start();

    handler = createHandler(signal);
  });

  it("should be a function", () => {
    expect(typeof handler).toBe("function");
  });

  it("should handle Express-style requests", async () => {
    const req = {
      method: "POST",
      url: "/signal/query",
      headers: {},
      body: { key: "posts.list", params: {} },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
  });

  it("should handle Node.js http-style requests", async () => {
    const req = {
      method: "POST",
      url: "/signal/query",
      headers: {},
      on: jest.fn(),
    };

    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
    };

    // Mock the data event
    setTimeout(() => {
      const dataCallback = req.on.mock.calls.find((call: any) => call[0] === "data")?.[1];
      if (dataCallback) {
        dataCallback(JSON.stringify({ key: "posts.list", params: {} }));
      }

      const endCallback = req.on.mock.calls.find((call: any) => call[0] === "end")?.[1];
      if (endCallback) {
        endCallback();
      }
    }, 0);

    await handler(req, res);
  });

  it("should handle serverless-style requests", async () => {
    const req = {
      method: "POST",
      url: "/signal/query",
      headers: {},
      body: JSON.stringify({ key: "posts.list", params: {} }),
    };

    const result = await handler(req, {});

    expect(result.statusCode).toBeDefined();
    expect(result.body).toBeDefined();
  });
});
