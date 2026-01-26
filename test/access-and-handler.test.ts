/**
 * Advanced Access Control and Handler Tests
 * Covers edge cases, error handling, and complex scenarios
 */

import { Signal } from "../packages/core/Signal";
import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { InMemoryTransport } from "../packages/transport/adapters/InMemoryTransport";
import { AccessControl } from "../packages/security/AccessControl";
import { createHandler } from "../packages/http/handler";
import { SignalRouter } from "../packages/http/router";
import { createContext, AuthProvider } from "../index";

describe("Access Control Advanced", () => {
  describe("query access", () => {
    it("should allow public queries without rules", async () => {
      const ac = new AccessControl("posts", {});
      const ctx: any = { auth: {} };
      const allowed = await ac.checkQueryAccess("anyQuery", ctx);
      expect(allowed).toBe(true);
    });

    it("should evaluate public rule", async () => {
      const ac = new AccessControl("posts", {
        query: { list: "public" },
      });
      const ctx: any = { auth: {} };
      expect(await ac.checkQueryAccess("list", ctx)).toBe(true);
    });

    it("should evaluate auth rule", async () => {
      const ac = new AccessControl("posts", {
        query: { mine: "auth" },
      });
      const ctxAuth: any = { auth: { user: { id: "user1" } } };
      const ctxGuest: any = { auth: {} };
      expect(await ac.checkQueryAccess("mine", ctxAuth)).toBe(true);
      expect(await ac.checkQueryAccess("mine", ctxGuest)).toBe(false);
    });

    it("should evaluate authenticated alias", async () => {
      const ac = new AccessControl("posts", {
        query: { mine: "authenticated" },
      });
      const ctxAuth: any = { auth: { user: { id: "user1" } } };
      expect(await ac.checkQueryAccess("mine", ctxAuth)).toBe(true);
    });

    it("should evaluate admin rule", async () => {
      const ac = new AccessControl("posts", {
        query: { admin: "admin" },
      });
      const ctxAdmin: any = { auth: { user: { id: "user1", roles: ["admin"] } } };
      const ctxUser: any = { auth: { user: { id: "user1", roles: ["user"] } } };
      expect(await ac.checkQueryAccess("admin", ctxAdmin)).toBe(true);
      expect(await ac.checkQueryAccess("admin", ctxUser)).toBe(false);
    });

    it("should handle owner rule (defaults to deny)", async () => {
      const ac = new AccessControl("posts", {
        query: { owner: "owner" },
      });
      const ctx: any = { auth: { user: { id: "user1" } } };
      expect(await ac.checkQueryAccess("owner", ctx)).toBe(false);
    });

    it("should deny unknown string rules", async () => {
      const ac = new AccessControl("posts", {
        query: { special: "unknown-rule" as any },
      });
      const ctx: any = { auth: { user: { id: "user1" } } };
      expect(await ac.checkQueryAccess("special", ctx)).toBe(false);
    });

    it("should handle function rules", async () => {
      const ac = new AccessControl("posts", {
        query: {
          custom: (ctx) => ctx.auth?.user?.roles?.includes("editor") || false,
        },
      });
      const ctxEditor: any = { auth: { user: { id: "user1", roles: ["editor"] } } };
      const ctxUser: any = { auth: { user: { id: "user1", roles: ["user"] } } };
      expect(await ac.checkQueryAccess("custom", ctxEditor)).toBe(true);
      expect(await ac.checkQueryAccess("custom", ctxUser)).toBe(false);
    });

    it("should handle async function rules", async () => {
      const ac = new AccessControl("posts", {
        query: {
          asyncCheck: async (ctx) => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return ctx.auth?.user != null;
          },
        },
      });
      const ctx: any = { auth: { user: { id: "user1" } } };
      expect(await ac.checkQueryAccess("asyncCheck", ctx)).toBe(true);
    });
  });

  describe("mutation access", () => {
    it("should deny mutations without rules by default", async () => {
      const ac = new AccessControl("posts", {});
      const ctx: any = { auth: { user: { id: "user1" } } };
      const allowed = await ac.checkMutationAccess("create", ctx);
      expect(allowed).toBe(false);
    });

    it("should evaluate mutation rules", async () => {
      const ac = new AccessControl("posts", {
        mutation: { create: "auth" },
      });
      const ctxAuth: any = { auth: { user: { id: "user1" } } };
      const ctxGuest: any = { auth: {} };
      expect(await ac.checkMutationAccess("create", ctxAuth)).toBe(true);
      expect(await ac.checkMutationAccess("create", ctxGuest)).toBe(false);
    });

    it("should handle complex function rules", async () => {
      const ac = new AccessControl("posts", {
        mutation: {
          delete: (ctx) => {
            const user = ctx.auth?.user;
            return user?.roles?.includes("admin") || user?.roles?.includes("moderator") || false;
          },
        },
      });
      const ctxAdmin: any = { auth: { user: { id: "user1", roles: ["admin"] } } };
      const ctxMod: any = { auth: { user: { id: "user2", roles: ["moderator"] } } };
      const ctxUser: any = { auth: { user: { id: "user3", roles: ["user"] } } };

      expect(await ac.checkMutationAccess("delete", ctxAdmin)).toBe(true);
      expect(await ac.checkMutationAccess("delete", ctxMod)).toBe(true);
      expect(await ac.checkMutationAccess("delete", ctxUser)).toBe(false);
    });
  });

  describe("requireAccess", () => {
    it("should throw for denied access", async () => {
      const ac = new AccessControl("posts", {
        mutation: { create: "auth" },
      });
      const ctx: any = { auth: {} };

      await expect(ac.requireAccess("mutation", "create", ctx)).rejects.toThrow("Access denied");
    });

    it("should not throw for allowed access", async () => {
      const ac = new AccessControl("posts", {
        query: { list: "public" },
      });
      const ctx: any = { auth: {} };

      await expect(ac.requireAccess("query", "list", ctx)).resolves.not.toThrow();
    });

    it("should include collection and action in error message", async () => {
      const ac = new AccessControl("posts", {
        mutation: { delete: "admin" },
      });
      const ctx: any = { auth: { user: { id: "user1" } } };

      await expect(ac.requireAccess("mutation", "delete", ctx)).rejects.toThrow("posts.delete");
    });
  });

  describe("case insensitivity", () => {
    it("should handle uppercase rules", async () => {
      const ac = new AccessControl("posts", {
        query: { list: "PUBLIC" as any },
      });
      const ctx: any = { auth: {} };
      expect(await ac.checkQueryAccess("list", ctx)).toBe(true);
    });

    it("should handle mixed case rules", async () => {
      const ac = new AccessControl("posts", {
        query: { mine: "Authenticated" as any },
      });
      const ctx: any = { auth: { user: { id: "user1" } } };
      expect(await ac.checkQueryAccess("mine", ctx)).toBe(true);
    });
  });
});

describe("HTTP Handler Edge Cases", () => {
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
        });
        return { id };
      });

    await signal.start();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  describe("createHandler with different response styles", () => {
    it("should handle Express-style responses", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it("should handle Node.js http style responses", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
      expect(res.end).toHaveBeenCalled();
    });

    it("should handle serverless style (no res methods)", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {};

      const response = await handler(req, res);

      expect(response).toBeDefined();
      expect(response?.statusCode).toBe(200);
      expect(response?.headers).toEqual({ "Content-Type": "application/json" });
      expect(response?.body).toBeDefined();
    });

    it("should handle errors with Express style", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "invalid", params: {} },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400); // Validation error
    });

    it("should handle errors with Node.js http style", async () => {
      const badSignal = signal as any;
      badSignal.query = () => {
        throw new Error("Query failed");
      };

      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
    });

    it("should handle errors with serverless style", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/invalid",
        headers: {},
        body: {},
      };
      const res = {};

      const response = await handler(req, res);

      expect(response).toBeDefined();
      expect(response?.statusCode).toBe(500);
    });
  });

  describe("request parsing", () => {
    it("should handle missing method", async () => {
      const handler = createHandler(signal);
      const req = {
        path: "/signal/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalled();
    });

    it("should handle missing path", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalled();
    });

    it("should normalize headers to lowercase", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        path: "/signal/mutation",
        headers: { "X-USER-ID": "user1", "AUTHORIZATION": "Bearer token" },
        body: { key: "items.create", params: { name: "Test" } },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalled();
    });

    it("should handle request with url instead of path", async () => {
      const handler = createHandler(signal);
      const req = {
        method: "POST",
        url: "/signal/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should parse Node.js stream body", async () => {
      const handler = createHandler(signal);
      const bodyData = JSON.stringify({ key: "items.list", params: {} });
      let dataCallback: any;
      let endCallback: any;

      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === "data") dataCallback = callback;
          if (event === "end") endCallback = callback;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const handlerPromise = handler(req, res);

      // Simulate stream events
      dataCallback(bodyData);
      endCallback();

      await handlerPromise;

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle stream parsing errors", async () => {
      const handler = createHandler(signal);
      let errorCallback: any;

      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === "error") errorCallback = callback;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const handlerPromise = handler(req, res);
      errorCallback(new Error("Stream error"));

      await handlerPromise;

      expect(res.status).toHaveBeenCalled();
    });

    it("should handle invalid JSON in stream", async () => {
      const handler = createHandler(signal);
      let dataCallback: any;
      let endCallback: any;

      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === "data") dataCallback = callback;
          if (event === "end") endCallback = callback;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const handlerPromise = handler(req, res);
      dataCallback("invalid json{");
      endCallback();

      await handlerPromise;

      expect(res.status).toHaveBeenCalled();
    });

    it("should handle empty stream body", async () => {
      const handler = createHandler(signal);
      let endCallback: any;

      const req = {
        method: "POST",
        path: "/signal/query",
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === "end") endCallback = callback;
        }),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const handlerPromise = handler(req, res);
      endCallback();

      await handlerPromise;

      expect(res.status).toHaveBeenCalled();
    });
  });

  describe("custom base paths", () => {
    it("should respect custom base path", async () => {
      const handler = createHandler(signal, "/api");
      const req = {
        method: "POST",
        path: "/api/query",
        headers: {},
        body: { key: "items.list", params: {} },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
