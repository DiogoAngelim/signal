import { describe, expect, it } from "vitest";
import { defineEvent, defineMutation, defineQuery } from "../../sdk-node/src";
import {
  SignalRuntime,
  SignalRegistry,
  buildCapabilities,
  createInProcessDispatcher,
  createMemoryIdempotencyStore,
  createReplaySafeSubscriber,
  dispatchEvent,
  ensureEnvelope,
  executeMutation,
  fingerprint,
  stableStringify,
} from "../src";
import { z } from "zod";

describe("runtime", () => {
  it("supports in-process dispatching and replay-safe subscribers", async () => {
    const dispatcher = createInProcessDispatcher();
    const seen: string[] = [];
    const unsubscribe = dispatcher.subscribe(
      "audit.event.v1",
      createReplaySafeSubscriber(async (event) => {
        seen.push(event.messageId);
      })
    );

    const runtime = new SignalRuntime({ dispatcher });
    runtime.registerEvent(
      defineEvent({
        name: "audit.event.v1",
        kind: "event",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      })
    );

    const envelope = ensureEnvelope({
      kind: "event",
      name: "audit.event.v1",
      payload: { value: "one" },
    });

    await dispatcher.dispatch(envelope);
    await dispatcher.dispatch(envelope);
    await dispatcher.dispatch(
      ensureEnvelope({
        kind: "event",
        name: "audit.unhandled.v1",
        payload: { value: "two" },
      })
    );
    unsubscribe();

    expect(seen).toEqual([envelope.messageId]);
  });

  it("covers hash helpers, event causation fallback, and the default emit guard", async () => {
    expect(stableStringify([1, { b: 2, a: undefined }, null])).toBe(
      '[1,{"b":2},null]'
    );
    expect(fingerprint({ a: 1, b: [2, 3] })).toHaveLength(64);

    const dispatcher = createInProcessDispatcher();
    const registry = new SignalRegistry();
    const seen: string[] = [];

    registry.registerEvent(
      defineEvent({
        name: "audit.event.v1",
        kind: "event",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      })
    );

    dispatcher.subscribe("audit.event.v1", async (event) => {
      seen.push(event.context?.causationId ?? "missing");
    });

    const dispatched = await dispatchEvent(
      registry,
      dispatcher,
      "audit.event.v1",
      { value: "one" },
      {
        request: {},
        envelope: { messageId: "envelope-1" } as never,
        emit: async () => undefined,
      }
    );
    const undelivered = await dispatchEvent(
      registry,
      undefined,
      "audit.event.v1",
      { value: "two" },
      {
        request: {},
        envelope: { messageId: "envelope-2" } as never,
        emit: async () => undefined,
      }
    );

    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
    });

    runtime.registerQuery(
      defineQuery({
        name: "example.emit.v1",
        kind: "query",
        inputSchema: z.object({}),
        resultSchema: z.object({ ok: z.literal(true) }),
        handler: async (_input, context) => {
          await expect(
            context.emit("audit.event.v1", { value: "ignored" })
          ).rejects.toThrow("emit is only available inside mutation handlers");
          return { ok: true as const };
        },
      })
    );

    const query = await runtime.query("example.emit.v1", {});

    expect(dispatched.context?.causationId).toBe("envelope-1");
    expect(undelivered.context?.causationId).toBe("envelope-2");
    expect(seen).toEqual(["envelope-1"]);
    expect(query.ok).toBe(true);
  });

  it("dispatches events emitted from a mutation handler", async () => {
    const dispatcher = createInProcessDispatcher();
    const runtime = new SignalRuntime({
      dispatcher,
      idempotencyStore: createMemoryIdempotencyStore(),
    });
    const seen: string[] = [];

    runtime.registerEvent(
      defineEvent({
        name: "audit.emitted.v1",
        kind: "event",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      })
    );
    runtime.registerMutation(
      defineMutation({
        name: "audit.emit.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: async (input, context) => {
          await context.emit(
            "audit.emitted.v1",
            { value: input.value },
            { source: "mutation-handler" }
          );
          return input;
        },
      })
    );

    dispatcher.subscribe("audit.emitted.v1", async (event) => {
      seen.push(event.context?.causationId ?? "missing");
    });

    const result = await runtime.mutation(
      "audit.emit.v1",
      { value: "ok" },
      { idempotencyKey: "emit-1" }
    );

    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("allows mutations without idempotency tracking", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
    });

    runtime.registerMutation(
      defineMutation({
        name: "audit.once.v1",
        kind: "mutation",
        idempotency: "none",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (input) => input,
      })
    );

    const result = await runtime.mutation("audit.once.v1", { value: "ok" });

    expect(result.ok).toBe(true);
  });

  it("covers mutation result recording without a parent envelope and plain object failures", async () => {
    const store = createMemoryIdempotencyStore();
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: store,
    });

    runtime.registerMutation(
      defineMutation({
        name: "audit.record.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (input) => input,
      })
    );
    runtime.registerMutation(
      defineMutation({
        name: "audit.plain.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: () => {
          throw {
            code: "FORBIDDEN",
            retryable: false,
            details: { reason: "blocked" },
          };
        },
      })
    );

    const recorded = await executeMutation(
      runtime.registry,
      runtime.dispatcher,
      store,
      "audit.record.v1",
      { value: "ok" },
      {
        request: {
          source: { system: "test", transport: "unit", runtime: "runtime" },
        },
      } as never,
      "record-1"
    );
    const plainFailure = await runtime.mutation(
      "audit.plain.v1",
      { value: "nope" },
      { idempotencyKey: "plain-1" }
    );

    expect(recorded.ok).toBe(true);
    expect(plainFailure.ok).toBe(false);
    expect(plainFailure.ok === false && plainFailure.error.message).toBe(
      "Mutation failed"
    );
  });

  it("replays completed mutations and conflicts on payload mismatch", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: createMemoryIdempotencyStore(),
    });

    const state = { count: 0 };

    runtime.registerMutation(
      defineMutation({
        name: "counter.increment.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ amount: z.number().int() }),
        resultSchema: z.object({ count: z.number().int() }),
        handler: (input) => {
          state.count += input.amount;
          return { count: state.count };
        },
      })
    );

    const first = await runtime.mutation(
      "counter.increment.v1",
      { amount: 1 },
      { idempotencyKey: "inc-1" }
    );
    const replay = await runtime.mutation(
      "counter.increment.v1",
      { amount: 1 },
      { idempotencyKey: "inc-1" }
    );
    const conflict = await runtime.mutation(
      "counter.increment.v1",
      { amount: 2 },
      { idempotencyKey: "inc-1" }
    );

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect((replay.ok && replay.result.count) || 0).toBe(1);
    expect(conflict.ok).toBe(false);
    expect(conflict.ok === false && conflict.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("handles validation errors, custom errors, and replayed failures", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: createMemoryIdempotencyStore(),
    });

    runtime.registerQuery(
      defineQuery({
        name: "example.lookup.v1",
        kind: "query",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw Object.assign(new Error("temporary"), {
            code: "RETRYABLE_ERROR",
            retryable: true,
            details: { retryAfter: 1 },
          });
        },
      })
    );
    runtime.registerQuery(
      defineQuery({
        name: "example.crash.v1",
        kind: "query",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw new Error("query crashed");
        },
      })
    );
    runtime.registerQuery(
      defineQuery({
        name: "example.raw.v1",
        kind: "query",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw {
            code: "FORBIDDEN",
            retryable: false,
            details: { reason: "blocked" },
          };
        },
      })
    );

    runtime.registerMutation(
      defineMutation({
        name: "example.fail.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw Object.assign(new Error("boom"), {
            code: "RETRYABLE_ERROR",
            retryable: true,
            details: { retryAfter: 1 },
          });
        },
      })
    );
    runtime.registerMutation(
      defineMutation({
        name: "example.crash.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw new Error("mutation crashed");
        },
      })
    );
    runtime.registerMutation(
      defineMutation({
        name: "example.unknown.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw 42;
        },
      })
    );

    const queryValidationFailure = await runtime.query("example.lookup.v1", {});
    const queryFailure = await runtime.query("example.lookup.v1", { id: "one" });
    const queryInternalFailure = await runtime.query("example.crash.v1", {
      id: "one",
    });
    const queryRawFailure = await runtime.query("example.raw.v1", { id: "one" });
    const mutationValidationFailure = await runtime.mutation(
      "example.fail.v1",
      {},
      { idempotencyKey: "fail-0" }
    );
    const mutationFailure = await runtime.mutation(
      "example.fail.v1",
      { id: "one" },
      { idempotencyKey: "fail-1" }
    );
    const mutationInternalFailure = await runtime.mutation(
      "example.crash.v1",
      { id: "one" },
      { idempotencyKey: "crash-1" }
    );
    const mutationUnknownFailure = await runtime.mutation(
      "example.unknown.v1",
      { id: "one" },
      { idempotencyKey: "unknown-1" }
    );
    const replayFailure = await runtime.mutation(
      "example.fail.v1",
      { id: "one" },
      { idempotencyKey: "fail-1" }
    );
    const requiredMissingKey = await runtime.mutation("example.crash.v1", {
      id: "two",
    });

    expect(queryValidationFailure.ok).toBe(false);
    expect(queryFailure.ok).toBe(false);
    expect(queryFailure.ok === false && queryFailure.error.code).toBe(
      "RETRYABLE_ERROR"
    );
    expect(queryInternalFailure.ok).toBe(false);
    expect(queryInternalFailure.ok === false && queryInternalFailure.error.code).toBe(
      "INTERNAL_ERROR"
    );
    expect(queryRawFailure.ok).toBe(false);
    expect(queryRawFailure.ok === false && queryRawFailure.error.message).toBe(
      "Query failed"
    );
    expect(mutationValidationFailure.ok).toBe(false);
    expect(mutationFailure.ok).toBe(false);
    expect(mutationInternalFailure.ok).toBe(false);
    expect(mutationUnknownFailure.ok).toBe(false);
    expect(replayFailure.ok).toBe(false);
    expect(replayFailure.ok === false && replayFailure.error.code).toBe(
      "RETRYABLE_ERROR"
    );
    expect(requiredMissingKey.ok).toBe(false);
    expect(requiredMissingKey.ok === false && requiredMissingKey.error.code).toBe(
      "BAD_REQUEST"
    );
  });

  it("treats invalid inputs and missing operations as protocol errors", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: createMemoryIdempotencyStore(),
    });

    runtime.registerEvent(
      defineEvent({
        name: "event.example.v1",
        kind: "event",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      })
    );
    runtime.registerQuery(
      defineQuery({
        name: "event.example.v1",
        kind: "query",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      })
    );

    const missingQuery = await runtime.query("missing.query.v1", {});
    const invalidQuery = await runtime.query("event.example.v1", {});
    const missingMutation = await runtime.mutation(
      "missing.mutation.v1",
      {},
      { idempotencyKey: "missing-1" }
    );
    await expect(runtime.publish("missing.event.v1", { value: "x" })).rejects.toMatchObject({
      code: "UNSUPPORTED_OPERATION",
    });

    expect(missingQuery.ok).toBe(false);
    expect(missingQuery.ok === false && missingQuery.error.code).toBe(
      "UNSUPPORTED_OPERATION"
    );
    expect(invalidQuery.ok).toBe(false);
    expect(invalidQuery.ok === false && invalidQuery.error.code).toBe(
      "VALIDATION_ERROR"
    );
    expect(missingMutation.ok).toBe(false);
  });

  it("handles replayed mutation results, inflight conflicts, and lock state", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: {
        reserve: async () => ({
          state: "inflight",
          record: {
            operationName: "example.record.v1",
            idempotencyKey: "record-1",
            payloadFingerprint: "abc",
            status: "pending",
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z",
          },
        }),
        complete: async () => undefined,
        fail: async () => undefined,
      },
    });

    runtime.registerMutation(
      defineMutation({
        name: "example.record.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => ({ id: "new" }),
      })
    );

    const inflight = await runtime.mutation(
      "example.record.v1",
      { id: "one" },
      { idempotencyKey: "record-1" }
    );

    const replayRuntime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: {
        reserve: async () => ({
          state: "replayed",
          record: {
            operationName: "example.record.v1",
            idempotencyKey: "record-2",
            payloadFingerprint: "abc",
            status: "completed",
            result: { id: "ok" },
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z",
          },
        }),
        complete: async () => undefined,
        fail: async () => undefined,
      },
    });

    replayRuntime.registerMutation(
      defineMutation({
        name: "example.record.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string().min(1) }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => ({ id: "new" }),
      })
    );

    const replayed = await replayRuntime.mutation(
      "example.record.v1",
      { id: "one" },
      { idempotencyKey: "record-2" }
    );

    const registry = new SignalRegistry();
    registry.lock();

    expect(inflight.ok).toBe(false);
    expect(inflight.ok === false && inflight.error.code).toBe("RETRYABLE_ERROR");
    expect(replayed.ok).toBe(true);
    expect(replayed.ok && replayed.result).toEqual({ id: "ok" });
    expect(() =>
      registry.registerQuery(
        defineQuery({
          name: "status.get.v1",
          kind: "query",
          inputSchema: z.object({}),
          resultSchema: z.object({ ok: z.literal(true) }),
          handler: () => ({ ok: true as const }),
        })
      )
    ).toThrow("Signal registry is locked");
  });

  it("covers the memory idempotency store lifecycle", async () => {
    const store = createMemoryIdempotencyStore();

    const first = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });
    const inflight = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });
    const conflict = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-b",
    });

    await store.complete({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
      result: { count: 1 },
      messageId: "msg-1",
    });

    const replayed = await store.reserve({
      operationName: "payment.capture.v1",
      idempotencyKey: "capture-1",
      payloadFingerprint: "fingerprint-a",
    });

    await store.complete({
      operationName: "payment.capture.v1",
      idempotencyKey: "missing",
      payloadFingerprint: "fingerprint-x",
      result: { count: 0 },
    });

    await store.fail({
      operationName: "payment.capture.v1",
      idempotencyKey: "missing",
      payloadFingerprint: "fingerprint-x",
      error: {
        code: "INTERNAL_ERROR",
        message: "ignored",
      },
    });

    expect(first.state).toBe("reserved");
    expect(inflight.state).toBe("inflight");
    expect(conflict.state).toBe("conflict");
    expect(replayed.state).toBe("replayed");
  });

  it("generates capabilities from registered operations", () => {
    const runtime = new SignalRuntime();

    runtime.registerQuery(
      defineQuery({
        name: "status.get.v1",
        kind: "query",
        inputSchema: z.object({}),
        resultSchema: z.object({ ok: z.literal(true) }),
        handler: () => ({ ok: true as const }),
      })
    );

    const capabilities = runtime.capabilities();
    expect(runtime.registry.allDefinitions().map((entry) => entry.name)).toContain(
      "status.get.v1"
    );
    expect(capabilities.queries.map((entry) => entry.name)).toContain(
      "status.get.v1"
    );
    expect(capabilities.protocol).toBe("signal.v1");
    expect(
      buildCapabilities(runtime.registry, { inProcess: true, http: { basePath: "/signal" } }, [
        "status.changed.v1",
      ]).subscribedEvents
    ).toEqual([
      {
        name: "status.changed.v1",
        kind: "event",
      },
    ]);
  });

  it("publishes events with causation and custom context", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
    });

    runtime.registerEvent(
      defineEvent({
        name: "status.changed.v1",
        kind: "event",
        inputSchema: z.object({ status: z.string() }),
        resultSchema: z.object({ status: z.string() }),
        handler: (payload) => payload,
      })
    );

    const seen: string[] = [];
    runtime.subscribe("status.changed.v1", async (event) => {
      seen.push(event.context?.causationId ?? "missing");
    });

    const event = await runtime.publish(
      "status.changed.v1",
      { status: "ready" },
      {
        correlationId: "corr-2",
        causationId: "cause-2",
        traceId: "trace-2",
        source: { system: "admin", transport: "in-process", runtime: "test" },
      }
    );

    expect(event.kind).toBe("event");
    expect(seen).toEqual([event.context?.causationId ?? "missing"]);
  });

  it("locks via the runtime API", () => {
    const runtime = new SignalRuntime();
    runtime.lock();

    expect(() =>
      runtime.registerQuery(
        defineQuery({
          name: "locked.get.v1",
          kind: "query",
          inputSchema: z.object({}),
          resultSchema: z.object({ ok: z.literal(true) }),
          handler: () => ({ ok: true as const }),
        })
      )
    ).toThrow("Signal registry is locked");
  });
});
