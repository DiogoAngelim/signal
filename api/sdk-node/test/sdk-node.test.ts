import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createSignalRuntime,
  defineEvent,
  defineMutation,
  defineQuery,
} from "../src";

describe("sdk-node", () => {
  it("creates runtimes with sensible defaults and overrides", () => {
    const defaultRuntime = createSignalRuntime();
    const customRuntime = createSignalRuntime({
      runtimeName: "custom-runtime",
    });

    expect(defaultRuntime.runtimeName).toBe("signal-node");
    expect(customRuntime.runtimeName).toBe("custom-runtime");
  });

  it("returns definitions unchanged", () => {
    const query = defineQuery({
      name: "user.get.v1",
      kind: "query",
      inputSchema: z.object({ id: z.string() }),
      resultSchema: z.object({ id: z.string() }),
      handler: async (input) => input,
    });
    const mutation = defineMutation({
      name: "user.update.v1",
      kind: "mutation",
      idempotency: "required",
      inputSchema: z.object({ id: z.string() }),
      resultSchema: z.object({ id: z.string() }),
      handler: async (input) => input,
    });
    const event = defineEvent({
      name: "user.updated.v1",
      kind: "event",
      inputSchema: z.object({ id: z.string() }),
      resultSchema: z.object({ id: z.string() }),
      handler: async (input) => input,
    });

    expect(query.name).toBe("user.get.v1");
    expect(mutation.idempotency).toBe("required");
    expect(event.kind).toBe("event");
  });
});
