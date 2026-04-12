import { describe, expect, it } from "vitest";
import { ActionExecutor } from "../src";

describe("action result shape", () => {
  it("returns required fields", async () => {
    const executor = new ActionExecutor();
    const result = await executor.execute(
      {
        name: "action.execute.v1",
        idempotency: "none",
        handler: async () => ({ result: true, effects: ["effect"] }),
      },
      { input: true },
    );

    expect(result.status).toBe("completed");
    expect(result.result).toBe(true);
    expect(Array.isArray(result.effects)).toBe(true);
    expect(typeof result.latency).toBe("number");
  });
});
