import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SignalRuntime, createMemoryIdempotencyStore } from "../../runtime/src";
import { defineMutation, defineQuery } from "../../sdk-node/src";
import { createSignalHttpServer } from "../src";

describe("http binding", () => {
  it("executes queries and mutations", async () => {
    const runtime = new SignalRuntime({
      idempotencyStore: createMemoryIdempotencyStore(),
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
          auth: { actor: "tester" },
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
          auth: { actor: "tester" },
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

  it("returns structured failures for malformed request bodies", async () => {
    const runtime = new SignalRuntime();

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
        context: {
          correlationId: "corr-invalid",
        },
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
    expect(queryParseResponse.statusCode).toBe(400);
    expect(JSON.parse(queryParseResponse.body).error.code).toBe("BAD_REQUEST");
    expect(mutationParseResponse.statusCode).toBe(400);
    expect(JSON.parse(mutationParseResponse.body).error.code).toBe(
      "BAD_REQUEST",
    );
    expect(thrownQueryResponse.statusCode).toBe(400);
    expect(JSON.parse(thrownQueryResponse.body).error.message).toBe(
      "Invalid Signal HTTP request body",
    );
    expect(thrownMutationResponse.statusCode).toBe(400);
    expect(JSON.parse(thrownMutationResponse.body).error.message).toBe(
      "Invalid Signal HTTP request body",
    );
  });
});
