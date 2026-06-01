import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEvent, defineMutation, defineQuery } from "../../sdk-node/src";
import {
  PerceptionLayer,
  SignalRegistry,
  SignalRuntime,
  buildCapabilities,
  createInProcessDispatcher,
  createMemoryIdempotencyStore,
  createNestedExecutionContext,
  createReplaySafeSubscriber,
  dispatchEvent,
  ensureEnvelope,
  executeMutation,
  fingerprint,
  freezeRequestContext,
  normalizeRequestContext,
  stableStringify,
  throwIfExecutionBlocked,
  toSignalFailure,
} from "../src";

describe("runtime", () => {
  it("supports in-process dispatching and replay-safe subscribers", async () => {
    const dispatcher = createInProcessDispatcher();
    const seen: string[] = [];
    const unsubscribe = dispatcher.subscribe(
      "audit.event.v1",
      createReplaySafeSubscriber(async (event) => {
        seen.push(event.messageId);
      }),
    );

    const runtime = new SignalRuntime({ dispatcher });
    runtime.registerEvent(
      defineEvent({
        name: "audit.event.v1",
        kind: "event",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      }),
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
      }),
    );
    unsubscribe();

    expect(seen).toEqual([envelope.messageId]);
  });

  it("covers hash helpers, event causation fallback, and the default emit guard", async () => {
    expect(stableStringify([1, { b: 2, a: undefined }, null])).toBe(
      '[1,{"b":2},null]',
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
      }),
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
      },
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
      },
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
            context.emit("audit.event.v1", { value: "ignored" }),
          ).rejects.toThrow("emit is only available inside mutation handlers");
          return { ok: true as const };
        },
      }),
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
      }),
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
            { source: "mutation-handler" },
          );
          return input;
        },
      }),
    );

    dispatcher.subscribe("audit.emitted.v1", async (event) => {
      seen.push(event.context?.causationId ?? "missing");
    });

    const result = await runtime.mutation(
      "audit.emit.v1",
      { value: "ok" },
      { idempotencyKey: "emit-1" },
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
      }),
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
      }),
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
      }),
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
      "record-1",
    );
    const plainFailure = await runtime.mutation(
      "audit.plain.v1",
      { value: "nope" },
      { idempotencyKey: "plain-1" },
    );

    expect(recorded.ok).toBe(true);
    expect(plainFailure.ok).toBe(false);
    expect(plainFailure.ok === false && plainFailure.error.message).toBe(
      "Mutation failed",
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
      }),
    );

    const first = await runtime.mutation(
      "counter.increment.v1",
      { amount: 1 },
      { idempotencyKey: "inc-1" },
    );
    const replay = await runtime.mutation(
      "counter.increment.v1",
      { amount: 1 },
      { idempotencyKey: "inc-1" },
    );
    const conflict = await runtime.mutation(
      "counter.increment.v1",
      { amount: 2 },
      { idempotencyKey: "inc-1" },
    );

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect((replay.ok && replay.result.count) || 0).toBe(1);
    expect(conflict.ok).toBe(false);
    expect(conflict.ok === false && conflict.error.code).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
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
      }),
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
      }),
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
      }),
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
      }),
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
      }),
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
      }),
    );

    const queryValidationFailure = await runtime.query("example.lookup.v1", {});
    const queryFailure = await runtime.query("example.lookup.v1", {
      id: "one",
    });
    const queryInternalFailure = await runtime.query("example.crash.v1", {
      id: "one",
    });
    const queryRawFailure = await runtime.query("example.raw.v1", {
      id: "one",
    });
    const mutationValidationFailure = await runtime.mutation(
      "example.fail.v1",
      {},
      { idempotencyKey: "fail-0" },
    );
    const mutationFailure = await runtime.mutation(
      "example.fail.v1",
      { id: "one" },
      { idempotencyKey: "fail-1" },
    );
    const mutationInternalFailure = await runtime.mutation(
      "example.crash.v1",
      { id: "one" },
      { idempotencyKey: "crash-1" },
    );
    const mutationUnknownFailure = await runtime.mutation(
      "example.unknown.v1",
      { id: "one" },
      { idempotencyKey: "unknown-1" },
    );
    const replayFailure = await runtime.mutation(
      "example.fail.v1",
      { id: "one" },
      { idempotencyKey: "fail-1" },
    );
    const requiredMissingKey = await runtime.mutation("example.crash.v1", {
      id: "two",
    });

    expect(queryValidationFailure.ok).toBe(false);
    expect(queryFailure.ok).toBe(false);
    expect(queryFailure.ok === false && queryFailure.error.code).toBe(
      "RETRYABLE_ERROR",
    );
    expect(queryInternalFailure.ok).toBe(false);
    expect(
      queryInternalFailure.ok === false && queryInternalFailure.error.code,
    ).toBe("INTERNAL_ERROR");
    expect(queryRawFailure.ok).toBe(false);
    expect(queryRawFailure.ok === false && queryRawFailure.error.message).toBe(
      "Query failed",
    );
    expect(mutationValidationFailure.ok).toBe(false);
    expect(mutationFailure.ok).toBe(false);
    expect(mutationInternalFailure.ok).toBe(false);
    expect(mutationUnknownFailure.ok).toBe(false);
    expect(replayFailure.ok).toBe(false);
    expect(replayFailure.ok === false && replayFailure.error.code).toBe(
      "RETRYABLE_ERROR",
    );
    expect(requiredMissingKey.ok).toBe(false);
    expect(
      requiredMissingKey.ok === false && requiredMissingKey.error.code,
    ).toBe("BAD_REQUEST");
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
      }),
    );
    runtime.registerQuery(
      defineQuery({
        name: "event.example.v1",
        kind: "query",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      }),
    );

    const missingQuery = await runtime.query("missing.query.v1", {});
    const invalidQuery = await runtime.query("event.example.v1", {});
    const missingMutation = await runtime.mutation(
      "missing.mutation.v1",
      {},
      { idempotencyKey: "missing-1" },
    );
    await expect(
      runtime.publish("missing.event.v1", { value: "x" }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_OPERATION",
    });

    expect(missingQuery.ok).toBe(false);
    expect(missingQuery.ok === false && missingQuery.error.code).toBe(
      "UNSUPPORTED_OPERATION",
    );
    expect(invalidQuery.ok).toBe(false);
    expect(invalidQuery.ok === false && invalidQuery.error.code).toBe(
      "VALIDATION_ERROR",
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
      }),
    );

    const inflight = await runtime.mutation(
      "example.record.v1",
      { id: "one" },
      { idempotencyKey: "record-1" },
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
      }),
    );

    const replayed = await replayRuntime.mutation(
      "example.record.v1",
      { id: "one" },
      { idempotencyKey: "record-2" },
    );

    const registry = new SignalRegistry();
    registry.lock();

    expect(inflight.ok).toBe(false);
    expect(inflight.ok === false && inflight.error.code).toBe(
      "RETRYABLE_ERROR",
    );
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
        }),
      ),
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
      }),
    );

    const capabilities = runtime.capabilities();
    expect(
      runtime.registry.allDefinitions().map((entry) => entry.name),
    ).toContain("status.get.v1");
    expect(capabilities.queries.map((entry) => entry.name)).toContain(
      "status.get.v1",
    );
    expect(capabilities.protocol).toBe("signal.v1");
    expect(
      buildCapabilities(
        runtime.registry,
        { inProcess: true, http: { basePath: "/signal" } },
        [
          "status.changed.v1",
          {
            name: "status.replayed.v1",
            consumerId: "consumer-a",
            replaySafe: true,
            description: "Replay-safe status projection",
          },
        ],
      ).subscribedEvents,
    ).toEqual([
      {
        name: "status.changed.v1",
        kind: "event",
      },
      {
        name: "status.replayed.v1",
        kind: "event",
        consumerId: "consumer-a",
        replaySafe: true,
        description: "Replay-safe status projection",
      },
    ]);
  });

  it("covers execution metadata, replay-safe runtime subscriptions, and nested emit failures", async () => {
    const frozen = freezeRequestContext({
      meta: {
        nested: [{ value: 1 }],
      },
    });
    expect(Object.isFrozen(frozen.meta)).toBe(true);
    expect(Object.isFrozen((frozen.meta?.nested as unknown[])[0])).toBe(true);

    const normalized = normalizeRequestContext({});
    const normalizedWithMeta = normalizeRequestContext({ meta: { value: 1 } });
    const retryable = toSignalFailure(
      {
        code: "RETRYABLE_ERROR",
        category: "transport",
        retryable: true,
      },
      "INTERNAL_ERROR",
      "fallback",
    );
    const defaultRetryability = toSignalFailure(
      {
        code: "FORBIDDEN",
      },
      "INTERNAL_ERROR",
      "fallback",
    );

    expect(normalized.meta).toBeUndefined();
    expect(normalizedWithMeta.meta).toEqual({ value: 1 });
    expect(() =>
      throwIfExecutionBlocked({
        abortSignal: {
          aborted: true,
          reason: undefined,
        } as unknown as AbortSignal,
      }),
    ).toThrow("Execution cancelled");
    expect(retryable.category).toBe("transport");
    expect(retryable.retryable).toBe(true);
    expect(defaultRetryability.retryable).toBe(false);

    const runtime = new SignalRuntime();
    const seen: string[] = [];
    runtime.registerEvent(
      defineEvent({
        name: "meta.changed.v1",
        kind: "event",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (payload) => payload,
      }),
    );
    runtime.registerQuery(
      defineQuery({
        name: "meta.get.v1",
        kind: "query",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (input) => input,
      }),
    );
    runtime.subscribe(
      "meta.changed.v1",
      async (event) => {
        seen.push(event.messageId);
      },
      { replaySafe: true, consumerId: "meta-consumer" },
    );

    const deadlineAt = "2999-01-01T00:00:00.000Z";
    const query = await runtime.query(
      "meta.get.v1",
      { value: "ok" },
      {
        deadlineAt,
        delivery: {
          mode: "at-least-once",
          attempt: 2,
          consumerId: "meta-consumer",
          replayed: true,
        },
      },
    );
    const event = await runtime.publish("meta.changed.v1", { value: "one" });
    await runtime.dispatcher.dispatch(event);

    const nested = createNestedExecutionContext(
      {
        request: {},
        startedAt: Date.now(),
        emit: async () => undefined,
      },
      event,
    );

    await expect(
      nested.emit("meta.changed.v1", { value: "nope" }),
    ).rejects.toThrow("Nested emit is not supported");
    expect(query.ok && query.meta.deadline?.deadlineAt).toBe(deadlineAt);
    expect(query.ok && query.meta.delivery?.attempt).toBe(2);
    expect(seen).toEqual([event.messageId]);

    const abortController = new AbortController();
    abortController.abort();
    const cancelled = await runtime.query(
      "meta.get.v1",
      { value: "ok" },
      { abortSignal: abortController.signal },
    );
    expect(cancelled.ok).toBe(false);
    expect(cancelled.ok === false && cancelled.error.code).toBe("CANCELLED");
  });

  it("covers normalized idempotency and reserved validation failure cleanup", async () => {
    const failed: string[] = [];
    const runtime = new SignalRuntime({
      idempotencyStore: {
        reserve: async () => ({
          state: "reserved",
        }),
        complete: async () => undefined,
        fail: async (input) => {
          failed.push(input.operationName);
        },
      },
    });

    runtime.registerMutation(
      defineMutation({
        name: "normalized.save.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({
          id: z.string(),
          transient: z.string(),
        }),
        resultSchema: z.object({
          id: z.string(),
        }),
        normalizeIdempotencyInput: (input) => ({ id: input.id }),
        handler: (input) => ({ id: input.id }),
      }),
    );
    runtime.registerMutation(
      defineMutation({
        name: "invalid.result.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string() }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => ({ id: 1 }) as never,
      }),
    );

    const normalized = await runtime.mutation(
      "normalized.save.v1",
      { id: "same", transient: "first" },
      { idempotencyKey: "normalized-1" },
    );
    const invalid = await runtime.mutation(
      "invalid.result.v1",
      { id: "bad" },
      { idempotencyKey: "invalid-result-1" },
    );

    expect(normalized.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    expect(failed).toContain("invalid.result.v1");
  });

  it("accepts an existing perception layer instance", async () => {
    const perception = new PerceptionLayer();
    const runtime = new SignalRuntime({ perception });

    runtime.registerQuery(
      defineQuery({
        name: "perceived.get.v1",
        kind: "query",
        inputSchema: z.object({ value: z.number() }),
        resultSchema: z.object({ value: z.number() }),
        handler: (input) => input,
      }),
    );

    const result = await runtime.query("perceived.get.v1", { value: 1 });

    expect(result.ok).toBe(true);
    expect(runtime.perception).toBe(perception);
    expect(perception.getSnapshot("perceived.get")).toBeDefined();
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
      }),
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
      },
    );

    expect(event.kind).toBe("event");
    expect(seen).toEqual([event.context?.causationId ?? "missing"]);
  });

  it("executes explicit protocol operations with normalized data results", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: createMemoryIdempotencyStore(),
    });
    const seen: string[] = [];

    runtime.registerQuery(
      defineQuery({
        name: "layer.status.v1",
        kind: "query",
        inputSchema: z.object({ id: z.string() }),
        resultSchema: z.object({ id: z.string(), status: z.string() }),
        handler: (input) => ({ id: input.id, status: "ready" }),
      }),
    );
    runtime.registerMutation(
      defineMutation({
        name: "layer.save.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ id: z.string() }),
        resultSchema: z.object({ id: z.string(), saved: z.boolean() }),
        handler: (input) => ({ id: input.id, saved: true }),
      }),
    );
    runtime.registerMutation(
      defineMutation({
        name: "layer.inferred-save.v1",
        kind: "mutation",
        idempotency: "none",
        inputSchema: z.object({ id: z.string() }),
        resultSchema: z.object({ id: z.string(), inferred: z.boolean() }),
        handler: (input) => ({ id: input.id, inferred: true }),
      }),
    );
    runtime.registerEvent(
      defineEvent({
        name: "layer.changed.v1",
        kind: "event",
        inputSchema: z.object({ id: z.string() }),
        resultSchema: z.object({ id: z.string() }),
        handler: (payload) => payload,
      }),
    );
    runtime.registerEvent(
      defineEvent({
        name: "layer.crash.v1",
        kind: "event",
        inputSchema: z.object({ id: z.string() }),
        resultSchema: z.object({ id: z.string() }),
        handler: () => {
          throw new Error("event crashed");
        },
      }),
    );
    runtime.subscribe("layer.changed.v1", async (event) => {
      seen.push(event.name);
    });

    const query = await runtime.execute({
      kind: "query",
      name: "layer.status.v1",
      payload: { id: "one" },
      context: { correlationId: "corr-layer", meta: { request: "meta" } },
    });
    const mutation = await runtime.execute({
      kind: "mutation",
      name: "layer.save.v1",
      payload: { id: "one" },
      context: { idempotencyKey: "save-layer-1" },
    });
    const invalidMutation = await runtime.execute({
      kind: "mutation",
      name: "layer.save.v1",
      payload: {},
      context: { idempotencyKey: "save-layer-invalid", meta: "bad-meta" } as never,
    });
    const event = await runtime.execute({
      kind: "event",
      name: "layer.changed.v1",
      payload: { id: "one" },
      meta: { source: "execute" },
    });
    const invalid = await runtime.execute({
      kind: "query",
      name: "layer.status.v1",
      payload: {},
    });
    const invalidEvent = await runtime.execute({
      kind: "event",
      name: "layer.changed.v1",
      payload: {},
    });
    const missingEvent = await runtime.execute({
      kind: "event",
      name: "layer.missing.v1",
      payload: { id: "one" },
    });
    const inferredMutation = await runtime.run("layer.inferred-save.v1", {
      id: "one",
    });
    const unsupported = await runtime.execute({
      kind: "unsupported" as never,
      name: "layer.changed.v1",
      payload: { id: "one" },
    });

    expect(query).toMatchObject({
      ok: true,
      data: { id: "one", status: "ready" },
    });
    expect(mutation).toMatchObject({
      ok: true,
      data: { id: "one", saved: true },
    });
    expect(invalidMutation.ok).toBe(false);
    expect(
      invalidMutation.ok === false && invalidMutation.error.code,
    ).toBe("VALIDATION_ERROR");
    expect(event.ok && event.data).toMatchObject({
      kind: "event",
      name: "layer.changed.v1",
    });
    expect(event.ok && event.meta.context).toMatchObject({
      messageId: expect.any(String),
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.ok === false && invalid.error.code).toBe("VALIDATION_ERROR");
    expect(invalidEvent.ok).toBe(false);
    expect(
      invalidEvent.ok === false && invalidEvent.error.code,
    ).toBe("VALIDATION_ERROR");
    expect(missingEvent.ok).toBe(false);
    expect(missingEvent.ok === false && missingEvent.error.code).toBe(
      "UNSUPPORTED_OPERATION",
    );
    expect(inferredMutation).toMatchObject({
      ok: true,
      data: { id: "one", inferred: true },
    });
    expect(unsupported.ok).toBe(false);
    expect(unsupported.ok === false && unsupported.error.code).toBe(
      "UNSUPPORTED_OPERATION_KIND",
    );
    expect(seen).toEqual(["layer.changed.v1"]);
  });

  it("runs inferred operations and fails safely when inference is ambiguous", async () => {
    const runtime = new SignalRuntime({
      dispatcher: createInProcessDispatcher(),
      idempotencyStore: createMemoryIdempotencyStore(),
    });

    runtime.registerQuery(
      defineQuery({
        name: "layer.inferred.v1",
        kind: "query",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler: (input) => input,
      }),
    );
    runtime.registerMutation(
      defineMutation({
        name: "layer.explicit.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string(), mutated: z.boolean() }),
        handler: (input) => ({ value: input.value, mutated: true }),
      }),
    );
    runtime.registerQuery(
      defineQuery({
        name: "layer.ambiguous.v1",
        kind: "query",
        inputSchema: z.object({}),
        resultSchema: z.object({ kind: z.literal("query") }),
        handler: () => ({ kind: "query" as const }),
      }),
    );
    runtime.registerEvent(
      defineEvent({
        name: "layer.ambiguous.v1",
        kind: "event",
        inputSchema: z.object({}),
        resultSchema: z.object({}),
        handler: (payload) => payload,
      }),
    );

    const inferred = await runtime.run("layer.inferred.v1", { value: "ok" });
    const explicit = await runtime.run(
      "layer.explicit.v1",
      { value: "ok" },
      {
        kind: "mutation",
        context: { idempotencyKey: "explicit-run-1" },
      },
    );
    const missing = await runtime.run("layer.missing.v1", {});
    const ambiguous = await runtime.run("layer.ambiguous.v1", {});

    expect(inferred).toMatchObject({
      ok: true,
      data: { value: "ok" },
    });
    expect(explicit).toMatchObject({
      ok: true,
      data: { value: "ok", mutated: true },
    });
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error.code).toBe(
      "OPERATION_NOT_FOUND",
    );
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.ok === false && ambiguous.error.code).toBe(
      "AMBIGUOUS_OPERATION_KIND",
    );
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
        }),
      ),
    ).toThrow("Signal registry is locked");
  });
});
