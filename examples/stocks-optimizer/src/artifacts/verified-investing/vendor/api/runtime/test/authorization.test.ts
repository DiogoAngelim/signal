import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  SignalRuntime,
  createInProcessDispatcher,
  createMemoryIdempotencyStore,
} from "../src";
import { defineMutation, defineQuery } from "../../sdk-node/src";

describe("authorization enforcement", () => {
  it("requires a trusted auth context and an explicit mutation policy in strict mode", async () => {
    const runtime = new SignalRuntime({
      eventPort: createInProcessDispatcher(),
      storagePort: createMemoryIdempotencyStore(),
      requireMutationAuthorization: true,
    });
    const handler = vi.fn((input: { value: string }) => input);

    runtime.registerMutation(
      defineMutation({
        name: "secure.unprotected.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        handler,
      }),
    );
    runtime.registerMutation(
      defineMutation({
        name: "secure.protected.v1",
        kind: "mutation",
        idempotency: "required",
        inputSchema: z.object({ value: z.string() }),
        resultSchema: z.object({ value: z.string() }),
        authorize: (_input, context) => {
          if (!context.request.auth?.scopes?.includes("secure:write")) {
            throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
          }
        },
        handler,
      }),
    );

    const noPolicy = await runtime.mutation(
      "secure.unprotected.v1",
      { value: "x" },
      { idempotencyKey: "no-policy", auth: { actor: { id: "user-1" } } },
    );
    const noIdentity = await runtime.mutation(
      "secure.protected.v1",
      { value: "x" },
      { idempotencyKey: "no-identity" },
    );
    const denied = await runtime.mutation(
      "secure.protected.v1",
      { value: "x" },
      {
        idempotencyKey: "denied",
        auth: { actor: { id: "user-1" }, scopes: ["secure:read"] },
      },
    );
    const allowed = await runtime.mutation(
      "secure.protected.v1",
      { value: "x" },
      {
        idempotencyKey: "allowed",
        auth: { actor: { id: "user-1" }, scopes: ["secure:write"] },
      },
    );

    expect(noPolicy).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(noIdentity).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(allowed.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("runs query authorization before the query handler", async () => {
    const runtime = new SignalRuntime({ eventPort: createInProcessDispatcher() });
    const handler = vi.fn(() => ({ value: "secret" }));
    runtime.registerQuery(
      defineQuery({
        name: "secure.read.v1",
        kind: "query",
        inputSchema: z.object({}),
        resultSchema: z.object({ value: z.string() }),
        authorize: (_input, context) => {
          if (!context.request.auth?.scopes?.includes("secure:read")) {
            throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
          }
        },
        handler,
      }),
    );

    const denied = await runtime.query("secure.read.v1", {}, {
      auth: { actor: { id: "user-1" }, scopes: ["secure:write"] },
    });
    const allowed = await runtime.query("secure.read.v1", {}, {
      auth: { actor: { id: "user-1" }, scopes: ["secure:read"] },
    });

    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(allowed.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});


it("keeps query and mutation results independent of telemetry exporter exceptions", async () => {
  const runtime = new SignalRuntime({
    eventPort: createInProcessDispatcher(),
    storagePort: createMemoryIdempotencyStore(),
    observabilityPort: {
      emit() {
        throw new Error("telemetry backend unavailable");
      },
    },
  });
  runtime.registerQuery(
    defineQuery({
      name: "resilient.read.v1",
      kind: "query",
      inputSchema: z.object({}),
      resultSchema: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
  );
  runtime.registerMutation(
    defineMutation({
      name: "resilient.write.v1",
      kind: "mutation",
      idempotency: "required",
      inputSchema: z.object({}),
      resultSchema: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
  );

  expect((await runtime.query("resilient.read.v1", {})).ok).toBe(true);
  expect((await runtime.mutation(
    "resilient.write.v1",
    {},
    { idempotencyKey: "resilient-write" },
  )).ok).toBe(true);
});
