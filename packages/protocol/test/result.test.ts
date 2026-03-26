import { describe, it, expect } from "vitest";
import { ok, fail, signalResultSchema } from "../src/result";
import { createSignalError, signalErrorSchema } from "../src/errors";

describe("result.ts uncovered branch", () => {
  it("ok() sets default outcome to 'completed' if not provided", () => {
    const result = ok({ foo: 1 }, { context: { messageId: "id" } });
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ foo: 1 });
    expect(result.meta?.outcome).toBe("completed");
    expect(result.meta?.context?.messageId).toBe("id");
  });

  it("ok() preserves explicit outcome if provided", () => {
    const result = ok({ foo: 2 }, { outcome: "replayed", context: { messageId: "id2" } });
    expect(result.meta?.outcome).toBe("replayed");
    expect(result.meta?.context?.messageId).toBe("id2");
  });

  it("fail() returns correct structure", () => {
    const error = createSignalError("CONFLICT", "fail");
    const failure = fail(error);
    expect(failure.ok).toBe(false);
    expect(failure.error).toEqual(error);
    expect(signalErrorSchema.parse(error)).toBeTruthy();
  });

  it("signalResultSchema validates ok and fail results", () => {
    const okResult = ok({ foo: 3 });
    const error = createSignalError("BAD_REQUEST", "bad");
    const failResult = fail(error);
    expect(signalResultSchema.parse(okResult)).toEqual(okResult);
    expect(signalResultSchema.parse(failResult)).toEqual(failResult);
  });
});
