import {
  SignalRuntime,
  createMemoryIdempotencyStore,
  defineMutation,
  defineQuery,
} from "@signal/sdk-node";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createSignalHttpServer } from "../src";

const noopEventPort = {
  dispatch: async () => {},
  subscribe: () => () => {},
};

describe("http binding", () => {
  it("executes queries and mutations", async () => {
    const runtime = new SignalRuntime({
      eventPort: noopEventPort,
      storagePort: createMemoryIdempotencyStore(),
    });

    let value = 0;

    runtime.registerQuery(
      defineQuery({
        name: "counter.get.v1",
        kind: "query",
        inputSchema: z.object({}),
        resultSchema: z.object({ value: z.number() }),
        handler: () => ({ value }),
      }),
    );

    runtime.registerMutation(
      defineMutation({
        name: "counter.increment.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ amount: z.number() }),
        resultSchema: z.object({ value: z.number() }),
        handler: (input) => {
          value += input.amount;
          return { value };
        },
      }),
    );

    const app = createSignalHttpServer(runtime);

    const capabilitiesResponse = await app.inject({
      method: "GET",
      url: "/signal/capabilities",
    });
    const queryResponse = await app.inject({
      method: "POST",
      url: "/signal/query/counter.get.v1",
      payload: { payload: {} },
    });
    const queryWithContextResponse = await app.inject({
      method: "POST",
      url: "/signal/query/counter.get.v1",
      payload: {
        payload: {},
        context: {
          correlationId: "corr-1",
          causationId: "cause-1",
          traceId: "trace-1",
          source: {
            system: "browser",
            transport: "http",
            runtime: "web",
          },
          meta: { region: "us-east-1" },
        },
      },
    });
    const missingQueryResponse = await app.inject({
      method: "POST",
      url: "/signal/query/counter.missing.v1",
      payload: { payload: {} },
    });

    const mutationResponse = await app.inject({
      method: "POST",
      url: "/signal/mutation/counter.increment.v1",
      payload: {
        payload: { amount: 2 },
        idempotencyKey: "counter-1",
      },
    });
    const mutationWithContextResponse = await app.inject({
      method: "POST",
      url: "/signal/mutation/counter.increment.v1",
      payload: {
        payload: { amount: 1 },
        idempotencyKey: "counter-2",
        context: {
          correlationId: "corr-2",
          causationId: "cause-2",
          traceId: "trace-2",
          source: {
            system: "browser",
            transport: "http",
            runtime: "web",
          },
          meta: { region: "us-east-1" },
        },
      },
    });
    const replayResponse = await app.inject({
      method: "POST",
      url: "/signal/mutation/counter.increment.v1",
      payload: {
        payload: { amount: 3 },
        idempotencyKey: "counter-1",
      },
    });
    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(capabilitiesResponse.statusCode).toBe(200);
    expect(queryResponse.statusCode).toBe(200);
    expect(queryWithContextResponse.statusCode).toBe(200);
    expect(missingQueryResponse.statusCode).toBe(404);
    expect(mutationResponse.statusCode).toBe(200);
    expect(mutationWithContextResponse.statusCode).toBe(200);
    expect(replayResponse.statusCode).toBe(409);
    expect(healthResponse.statusCode).toBe(200);
    expect(JSON.parse(mutationResponse.body).result.value).toBe(2);
    expect(JSON.parse(capabilitiesResponse.body).protocol).toBe("signal.v1");
    expect(JSON.parse(missingQueryResponse.body).error.code).toBe(
      "UNSUPPORTED_OPERATION",
    );
    expect(JSON.parse(replayResponse.body).error.code).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("enforces independent query and mutation rate limits with structured 429 responses", async () => {
    const runtime = new SignalRuntime({
      eventPort: noopEventPort,
      storagePort: createMemoryIdempotencyStore(),
    });
    runtime.registerQuery(
      defineQuery({
        name: "limited.read.v1",
        kind: "query",
        inputSchema: z.object({}),
        resultSchema: z.object({ ok: z.boolean() }),
        handler: () => ({ ok: true }),
      }),
    );
    runtime.registerMutation(
      defineMutation({
        name: "limited.write.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({}),
        resultSchema: z.object({ ok: z.boolean() }),
        handler: () => ({ ok: true }),
      }),
    );

    const app = createSignalHttpServer(runtime, {
      rateLimits: {
        query: { max: 1, timeWindow: 60_000 },
        mutation: { max: 1, timeWindow: 60_000 },
      },
    });

    const queryAllowed = await app.inject({
      method: "POST",
      url: "/signal/query/limited.read.v1",
      payload: { payload: {} },
    });
    const queryLimited = await app.inject({
      method: "POST",
      url: "/signal/query/limited.read.v1",
      payload: { payload: {} },
    });
    const mutationAllowed = await app.inject({
      method: "POST",
      url: "/signal/mutation/limited.write.v1",
      payload: { payload: {}, idempotencyKey: "limited-1" },
    });
    const mutationLimited = await app.inject({
      method: "POST",
      url: "/signal/mutation/limited.write.v1",
      payload: { payload: {}, idempotencyKey: "limited-2" },
    });
    const health = await app.inject({ method: "GET", url: "/health" });

    expect(queryAllowed.statusCode).toBe(200);
    expect(queryLimited.statusCode).toBe(429);
    expect(queryLimited.headers["retry-after"]).toBeDefined();
    expect(queryLimited.json()).toMatchObject({
      ok: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        category: "rate_limit",
        retryable: true,
      },
    });
    expect(mutationAllowed.statusCode).toBe(200);
    expect(mutationLimited.statusCode).toBe(429);
    expect(health.statusCode).toBe(200);
    await app.close();
  });

  it("rejects client authentication claims and uses only trusted server context", async () => {
    const runtime = new SignalRuntime({
      eventPort: noopEventPort,
      storagePort: createMemoryIdempotencyStore(),
    });
    let authorizedActor: unknown;

    runtime.registerMutation(
      defineMutation({
        name: "secure.update.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ ok: z.boolean() }),
        authorize: (_input, context) => {
          authorizedActor = context.request.auth?.actor;
        },
        handler: () => ({ ok: true }),
      }),
    );

    const app = createSignalHttpServer(runtime, {
      resolveAuthContext: () => ({ actor: { id: "verified-user" } }),
    });

    const spoofed = await app.inject({
      method: "POST",
      url: "/signal/mutation/secure.update.v1",
      payload: {
        payload: { value: "test" },
        idempotencyKey: "secure-1",
        context: { auth: { actor: { id: "attacker", roles: ["admin"] } } },
      },
    });
    const valid = await app.inject({
      method: "POST",
      url: "/signal/mutation/secure.update.v1",
      payload: {
        payload: { value: "test" },
        idempotencyKey: "secure-2",
      },
    });

    expect(spoofed.statusCode).toBe(400);
    expect(valid.statusCode).toBe(200);
    expect(authorizedActor).toEqual({ id: "verified-user" });
  });

  it("returns structured failures for malformed request bodies", async () => {
    const runtime = new SignalRuntime({ eventPort: noopEventPort });

    runtime.registerQuery(
      defineQuery({
        name: "note.get.v1",
        kind: "query",
        inputSchema: z.object({
          noteId: z.string().min(1),
        }),
        resultSchema: z.object({
          noteId: z.string().min(1),
        }),
        handler: (input) => input,
      }),
    );

    const app = createSignalHttpServer(runtime);

    const runtimeValidationResponse = await app.inject({
      method: "POST",
      url: "/signal/query/note.get.v1",
      payload: {
        payload: { noteId: "" },
        context: {
          correlationId: "corr-invalid",
        },
      },
    });
    const missingPayloadResponse = await app.inject({
      method: "POST",
      url: "/signal/query/note.get.v1",
      payload: {
        context: { correlationId: "corr-missing-payload" },
      },
    });
    const queryParseResponse = await app.inject({
      method: "POST",
      url: "/signal/query/note.get.v1",
      payload: null,
    });
    const mutationParseResponse = await app.inject({
      method: "POST",
      url: "/signal/mutation/note.save.v1",
      payload: null,
    });

    const throwingApp = createSignalHttpServer({
      query: async () => {
        throw 42;
      },
      mutation: async () => {
        throw 42;
      },
      capabilities: () => runtime.capabilities(),
    } as never);
    const thrownQueryResponse = await throwingApp.inject({
      method: "POST",
      url: "/signal/query/note.get.v1",
      payload: { payload: { noteId: "note_1" } },
    });
    const thrownMutationResponse = await throwingApp.inject({
      method: "POST",
      url: "/signal/mutation/note.save.v1",
      payload: { payload: { noteId: "note_1" } },
    });

    expect(runtimeValidationResponse.statusCode).toBe(400);
    expect(JSON.parse(runtimeValidationResponse.body)).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        category: "validation",
      },
    });
    expect(missingPayloadResponse.statusCode).toBe(400);
    expect(JSON.parse(missingPayloadResponse.body).error.code).toBe("BAD_REQUEST");
    expect(queryParseResponse.statusCode).toBe(400);
    expect(JSON.parse(queryParseResponse.body).error.code).toBe("BAD_REQUEST");
    expect(mutationParseResponse.statusCode).toBe(400);
    expect(JSON.parse(mutationParseResponse.body).error.code).toBe(
      "BAD_REQUEST",
    );
    expect(thrownQueryResponse.statusCode).toBe(500);
    expect(JSON.parse(thrownQueryResponse.body).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Signal query execution failed",
    });
    expect(thrownMutationResponse.statusCode).toBe(500);
    expect(JSON.parse(thrownMutationResponse.body).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Signal mutation execution failed",
    });
  });
});
