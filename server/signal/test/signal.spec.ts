import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  LifecycleTracker,
  SignalRegistry,
  createInProcessDispatcher,
  createMemoryIdempotencyStore,
  createReplaySafeSubscriber,
  createSignalEnvelope,
  executeMutation,
  normalizeRequestContext,
  validateSignalEnvelope,
} from "../src";

describe("signal envelope", () => {
  it("requires traceId and validates", () => {
    const envelope = createSignalEnvelope({
      kind: "query",
      name: "core.decision.get.v1",
      payload: { test: true },
      traceId: "trace-1",
    });

    const validated = validateSignalEnvelope(envelope);
    expect(validated.traceId).toBe("trace-1");

    expect(() =>
      validateSignalEnvelope({
        ...envelope,
        traceId: undefined,
      }),
    ).toThrow();
  });
});

describe("lifecycle transitions", () => {
  it("enforces sequential stages", () => {
    const tracker = new LifecycleTracker({ traceId: "trace-2" });

    tracker.transition("received");
    tracker.transition("validated");

    expect(() => tracker.transition("executed")).toThrow();
  });
});

describe("idempotency", () => {
  it("replays completed mutations", async () => {
    const registry = new SignalRegistry();
    registry.registerMutation({
      name: "core.action.execute.v1",
      kind: "mutation",
      inputSchema: z.object({ value: z.number() }),
      resultSchema: z.object({ ok: z.boolean() }),
      idempotency: "required",
      handler: async () => ({ ok: true }),
    });

    const store = createMemoryIdempotencyStore();
    const context = {
      request: normalizeRequestContext({ traceId: "trace-3" }),
      startedAt: Date.now(),
      emit: async () => {
        throw new Error("emit not supported in test");
      },
    };

    const first = await executeMutation(
      registry,
      undefined,
      store,
      "core.action.execute.v1",
      { value: 1 },
      context,
      "idempo-1",
    );

    const second = await executeMutation(
      registry,
      undefined,
      store,
      "core.action.execute.v1",
      { value: 1 },
      context,
      "idempo-1",
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.meta?.outcome).toBe("replayed");
    }
  });
});

describe("replay safety", () => {
  it("dedupes duplicate event deliveries", async () => {
    const dispatcher = createInProcessDispatcher();
    let handled = 0;

    const handler = createReplaySafeSubscriber(async () => {
      handled += 1;
    });

    dispatcher.subscribe("sense.frame.evaluated.v1", handler);

    const envelope = createSignalEnvelope({
      kind: "event",
      name: "sense.frame.evaluated.v1",
      payload: { ok: true },
      messageId: "message-1",
      traceId: "trace-4",
    });

    await dispatcher.dispatch(envelope);
    await dispatcher.dispatch(envelope);

    expect(handled).toBe(1);
  });
});
