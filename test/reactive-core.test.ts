/**
 * Comprehensive tests for ReactiveCore
 * Covers signal emission, subscriptions, versioning, and event history
 */

import { ReactiveCore } from "../packages/core/ReactiveCore";
import { SignalEvent } from "../packages/core/Types";

describe("ReactiveCore", () => {
  let core: ReactiveCore;

  beforeEach(() => {
    core = new ReactiveCore();
  });

  describe("registerSubscription", () => {
    it("should register a new subscription and return unsubscribe function", () => {
      const handler = jest.fn();
      const result = core.registerSubscription("posts.list", {}, handler);

      expect(result.unsubscribe).toBeDefined();
      expect(result.subscriptionId).toBeDefined();
      expect(result.subscriptionId).toMatch(/^sub_/);
    });

    it("should track multiple handlers for same query", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      core.registerSubscription("posts.list", {}, handler1);
      core.registerSubscription("posts.list", {}, handler2);

      const subs = core.getActiveSubscriptions();
      expect(subs.has("posts.list")).toBe(true);
      expect(subs.get("posts.list")?.size).toBe(2);
    });

    it("should allow unsubscribing", () => {
      const handler = jest.fn();
      const { unsubscribe, subscriptionId } = core.registerSubscription("posts.list", {}, handler);

      unsubscribe();

      const subs = core.getActiveSubscriptions();
      expect(subs.has("posts.list")).toBe(false);
    });

    it("should remove queryKey when last subscription is unsubscribed", () => {
      const handler = jest.fn();
      const { unsubscribe } = core.registerSubscription("posts.list", {}, handler);

      expect(core.getActiveSubscriptions().has("posts.list")).toBe(true);
      unsubscribe();
      expect(core.getActiveSubscriptions().has("posts.list")).toBe(false);
    });
  });

  describe("emitSignal", () => {
    it("should enrich event with resource and action metadata", async () => {
      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      const enriched = await core.emitSignal(event);

      expect(enriched.resource).toBe("posts");
      expect(enriched.action).toBe("created");
      expect(enriched.resourceId).toBe("post_1");
    });

    it("should add event to history", async () => {
      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      await core.emitSignal(event);

      const history = core.getEventHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe("evt_1");
    });

    it("should fan-out to matching subscriptions", async () => {
      const handler = jest.fn();
      core.registerSubscription("posts.list", {}, handler);

      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      await core.emitSignal(event);

      expect(handler).toHaveBeenCalled();
      const callArg = handler.mock.calls[0][0] as SignalEvent;
      expect(callArg._metadata?.affectedQuery).toBe("posts.list");
    });

    it("should not fan-out to unrelated subscriptions", async () => {
      const handler = jest.fn();
      core.registerSubscription("comments.list", {}, handler);

      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      await core.emitSignal(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should track resource versions", async () => {
      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      await core.emitSignal(event);

      const version = core.getResourceVersion("posts:post_1");
      expect(version).toBeDefined();
      expect(version?._version).toBe(1);
    });

    it("should increment resource version on subsequent updates", async () => {
      const event1: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      const event2: SignalEvent = {
        id: "evt_2",
        name: "posts.updated",
        payload: { id: "post_1" },
        timestamp: Date.now() + 1000,
      };

      await core.emitSignal(event1);
      await core.emitSignal(event2);

      const version = core.getResourceVersion("posts:post_1");
      expect(version?._version).toBe(2);
    });

    it("should include version in enriched event metadata", async () => {
      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      const enriched = await core.emitSignal(event);

      expect(enriched.version).toBe(1);
      expect(enriched._metadata?.resourceVersion).toBe(1);
      expect(enriched._metadata?.resourceKey).toBe("posts:post_1");
    });

    it("should handle events without resource ID", async () => {
      const event: SignalEvent = {
        id: "evt_1",
        name: "system.started",
        payload: {},
        timestamp: Date.now(),
      };

      const enriched = await core.emitSignal(event);

      expect(enriched.resource).toBe("system");
      expect(enriched.resourceId).toBeUndefined();
    });

    it("should handle payload.result._id for resource ID", async () => {
      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { result: { _id: "post_1" } },
        timestamp: Date.now(),
      };

      const enriched = await core.emitSignal(event);

      expect(enriched.resourceId).toBe("post_1");
    });

    it("should prevent unbounded event history growth", async () => {
      // Insert more than the max history size
      for (let i = 0; i < 10100; i++) {
        const event: SignalEvent = {
          id: `evt_${i}`,
          name: "posts.created",
          payload: { id: `post_${i}` },
          timestamp: Date.now() + i,
        };
        await core.emitSignal(event);
      }

      const history = core.getEventHistory();
      expect(history.length).toBeLessThanOrEqual(10000);
    });
  });

  describe("getEventHistory", () => {
    it("should return all events when no timestamp filter", async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const event: SignalEvent = {
          id: `evt_${i}`,
          name: "posts.created",
          payload: { id: `post_${i}` },
          timestamp: now + i * 1000,
        };
        await core.emitSignal(event);
      }

      const history = core.getEventHistory();
      expect(history.length).toBe(5);
    });

    it("should filter events by timestamp", async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const event: SignalEvent = {
          id: `evt_${i}`,
          name: "posts.created",
          payload: { id: `post_${i}` },
          timestamp: now + i * 1000,
        };
        await core.emitSignal(event);
      }

      const filtered = core.getEventHistory(now + 2500);
      expect(filtered.length).toBe(2); // Only events after 2500ms
    });
  });

  describe("getResourceVersion", () => {
    it("should return undefined for unknown resource", () => {
      const version = core.getResourceVersion("unknown:123");
      expect(version).toBeUndefined();
    });

    it("should return version info with timestamps", async () => {
      const now = Date.now();
      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: now,
      };

      await core.emitSignal(event);

      const version = core.getResourceVersion("posts:post_1");
      expect(version?._version).toBe(1);
      expect(version?._lastUpdated).toBe(now);
      expect(version?._causationId).toBe("evt_1");
    });
  });

  describe("invalidateQuery", () => {
    it("should remove query subscriptions", () => {
      const handler = jest.fn();
      core.registerSubscription("posts.list", {}, handler);

      expect(core.getActiveSubscriptions().has("posts.list")).toBe(true);

      core.invalidateQuery("posts.list");

      expect(core.getActiveSubscriptions().has("posts.list")).toBe(false);
    });
  });

  describe("getActiveSubscriptions", () => {
    it("should return all active subscriptions", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      core.registerSubscription("posts.list", {}, handler1);
      core.registerSubscription("comments.list", {}, handler2);

      const subs = core.getActiveSubscriptions();
      expect(subs.size).toBe(2);
      expect(subs.has("posts.list")).toBe(true);
      expect(subs.has("comments.list")).toBe(true);
    });

    it("should return a copy, not the internal map", () => {
      const handler = jest.fn();
      core.registerSubscription("posts.list", {}, handler);

      const subs = core.getActiveSubscriptions();
      subs.delete("posts.list");

      // Internal should still have it
      const subs2 = core.getActiveSubscriptions();
      expect(subs2.has("posts.list")).toBe(true);
    });
  });

  describe("clearSubscriptions", () => {
    it("should clear all subscriptions and versions", async () => {
      const handler = jest.fn();
      core.registerSubscription("posts.list", {}, handler);

      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };
      await core.emitSignal(event);

      core.clearSubscriptions();

      expect(core.getActiveSubscriptions().size).toBe(0);
      expect(core.getResourceVersion("posts:post_1")).toBeUndefined();
      expect(core.getEventHistory().length).toBe(0);
    });
  });

  describe("subscription versioning", () => {
    it("should increment subscription version with each event", async () => {
      const handler = jest.fn();
      core.registerSubscription("posts.list", {}, handler);

      const event1: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      const event2: SignalEvent = {
        id: "evt_2",
        name: "posts.created",
        payload: { id: "post_2" },
        timestamp: Date.now() + 1000,
      };

      await core.emitSignal(event1);
      await core.emitSignal(event2);

      expect(handler).toHaveBeenCalledTimes(2);

      const firstCall = handler.mock.calls[0][0] as SignalEvent;
      const secondCall = handler.mock.calls[1][0] as SignalEvent;

      expect(firstCall._metadata?.subscriptionVersion).toBe(1);
      expect(secondCall._metadata?.subscriptionVersion).toBe(2);
    });

    it("should handle handler errors gracefully", async () => {
      const goodHandler = jest.fn();
      const badHandler = jest.fn().mockRejectedValue(new Error("Handler failed"));
      const anotherGoodHandler = jest.fn();

      core.registerSubscription("posts.list", {}, goodHandler);
      core.registerSubscription("posts.list", {}, badHandler);
      core.registerSubscription("posts.list", {}, anotherGoodHandler);

      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.created",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      // Should not throw
      await core.emitSignal(event);

      expect(goodHandler).toHaveBeenCalled();
      expect(badHandler).toHaveBeenCalled();
      expect(anotherGoodHandler).toHaveBeenCalled();
    });
  });

  describe("isQueryAffectedByEvent", () => {
    it("should match events to subscriptions by resource", async () => {
      const postsHandler = jest.fn();
      const commentsHandler = jest.fn();

      core.registerSubscription("posts.list", {}, postsHandler);
      core.registerSubscription("comments.list", {}, commentsHandler);

      const event: SignalEvent = {
        id: "evt_1",
        name: "posts.updated",
        payload: { id: "post_1" },
        timestamp: Date.now(),
      };

      await core.emitSignal(event);

      expect(postsHandler).toHaveBeenCalled();
      expect(commentsHandler).not.toHaveBeenCalled();
    });
  });
});
