/**
 * Reliability and replay-safety tests.
 *
 * Covers idempotent mutations, optimistic concurrency, replay-safe event
 * execution, transport deduplication, and append-only audit hooks.
 */

import { Signal } from "../packages/core/Signal";
import { ReactiveCore } from "../packages/core/ReactiveCore";
import { MemoryAdapter } from "../packages/db/adapters/MemoryAdapter";
import { InMemoryTransport } from "../packages/transport/adapters/InMemoryTransport";
import { createContext, AuthProvider, SignalIdempotencyConflictError, SignalVersionMismatchError } from "../index";
import { SignalEvent } from "../packages/core/Types";

describe("Signal reliability", () => {
  let signal: Signal;
  let db: MemoryAdapter;
  let transport: InMemoryTransport;
  let createCalls: number;

  beforeEach(() => {
    Signal.reset();
    signal = new Signal();
    db = new MemoryAdapter();
    transport = new InMemoryTransport();
    createCalls = 0;

    signal.configure({ db, transport });
    signal
      .collection("posts")
      .mutation("create", async (params: { title: string }, ctx) => {
        createCalls += 1;
        const postId = await ctx.db.insert("posts", {
          title: params.title,
          authorId: ctx.auth.user?.id || "system",
        });
        return { postId, title: params.title };
      });
  });

  afterEach(async () => {
    Signal.reset();
    await db.disconnect();
  });

  it("replays an idempotent mutation and keeps the audit trail append-only", async () => {
    await signal.start();

    const auditTypes: string[] = [];
    const stopAudit = signal.registerAuditHook((entry) => {
      auditTypes.push(entry.type);
    });

    const ctx = createContext()
      .withDB(db)
      .withAuth(AuthProvider.authenticated("user-1", ["writer"]))
      .withEmit(signal.getEmitFn())
      .withRequest({
        idempotencyKey: "create-post-1",
      })
      .build();

    const first = await signal.mutation("posts.create", { title: "Signal in motion" }, ctx);
    const trailAfterFirst = signal.getAuditTrail();

    expect(first.title).toBe("Signal in motion");
    expect(createCalls).toBe(1);
    expect(trailAfterFirst.length).toBeGreaterThanOrEqual(3);
    expect(Object.isFrozen(trailAfterFirst[0])).toBe(true);

    const outbox = await db.find("__signal_outbox__", {});
    const mutationLedger = await db.find("__signal_mutations__", {});
    expect(outbox).toHaveLength(1);
    expect(mutationLedger).toHaveLength(1);
    expect(mutationLedger[0].status).toBe("completed");

    const replay = await signal.mutation("posts.create", { title: "Signal in motion" }, ctx);
    const trailAfterReplay = signal.getAuditTrail();

    expect(replay).toEqual(first);
    expect(createCalls).toBe(1);
    expect(signal.getEventBuffer()).toHaveLength(1);
    expect(trailAfterReplay.length).toBeGreaterThan(trailAfterFirst.length);
    expect(trailAfterReplay[trailAfterReplay.length - 1].type).toBe("mutation.replayed");

    stopAudit();
  });

  it("rejects a repeated idempotency key when the payload fingerprint changes", async () => {
    await signal.start();

    const ctx = createContext()
      .withDB(db)
      .withAuth(AuthProvider.authenticated("user-1", ["writer"]))
      .withEmit(signal.getEmitFn())
      .withRequest({
        idempotencyKey: "create-post-2",
      })
      .build();

    await signal.mutation("posts.create", { title: "Original" }, ctx);

    await expect(
      signal.mutation("posts.create", { title: "Mutated" }, ctx)
    ).rejects.toBeInstanceOf(SignalIdempotencyConflictError);
  });

  it("throws an explicit version mismatch error for stale optimistic writes", async () => {
    await signal.start();

    const postId = await db.insert("posts", { title: "Versioned", counter: 0 });

    await db.update("posts", postId, { counter: 1 }, { expectedVersion: 1 });

    const updated = await db.findById("posts", postId);
    expect(updated?._version).toBe(2);

    await expect(
      db.update("posts", postId, { counter: 2 }, { expectedVersion: 1 })
    ).rejects.toBeInstanceOf(SignalVersionMismatchError);
  });
});

describe("Replay-safe events", () => {
  it("ignores duplicate event ids and stale out-of-order deliveries", async () => {
    const core = new ReactiveCore();
    const handler = jest.fn();

    core.registerSubscription("posts.list", {}, handler);

    const newer: SignalEvent = {
      id: "evt-new",
      name: "posts.created",
      payload: { id: "post-1" },
      timestamp: Date.now(),
      version: 2,
      _metadata: {
        resourceKey: "posts:post-1",
        resourceVersion: 2,
      },
    };

    const duplicate: SignalEvent = {
      ...newer,
    };

    const older: SignalEvent = {
      id: "evt-old",
      name: "posts.created",
      payload: { id: "post-1" },
      timestamp: Date.now() - 1000,
      version: 1,
      _metadata: {
        resourceKey: "posts:post-1",
        resourceVersion: 1,
      },
    };

    await core.emitSignal(newer);
    await core.emitSignal(duplicate);
    await core.emitSignal(older);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(core.getResourceVersion("posts:post-1")?._version).toBe(2);
    expect(core.getEventHistory()).toHaveLength(2);
    expect(core.getEventHistory()[1]._metadata?.stale).toBe(true);
  });
});

describe("Transport inbox", () => {
  it("deduplicates events per consumer across overlapping subscriptions", async () => {
    const transport = new InMemoryTransport();
    const received: string[] = [];
    const consumerId = "consumer-posts";

    await transport.subscribe(
      "posts.created",
      async (event) => {
        received.push(`exact:${event.id}`);
      },
      { consumerId }
    );

    await transport.subscribe(
      "posts.*",
      async (event) => {
        received.push(`wild:${event.id}`);
      },
      { consumerId }
    );

    const event: SignalEvent = {
      id: "evt-transport",
      name: "posts.created",
      payload: { id: "post-1" },
      timestamp: Date.now(),
      version: 1,
      _metadata: {
        resourceKey: "posts:post-1",
        resourceVersion: 1,
      },
    };

    await transport.emit(event);
    await transport.emit(event);

    expect(received).toHaveLength(1);
    expect(transport.getEvents()).toHaveLength(2);

    const inbox = transport.getEventBus().getInboxLedger(consumerId);
    expect(inbox?.seenEvents).toContain("evt-transport");
    expect(inbox?.latestVersionByResource["posts:post-1"]).toBe(1);
  });
});
