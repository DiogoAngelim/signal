import { describe, expect, it, vi } from "vitest";
import {
  RetryDeadlineExceededError,
  executeWithRetry,
} from "./resilience";

describe("executeWithRetry", () => {
  const policy = {
    maxAttempts: 3,
    backoffMs: 10,
    maxBackoffMs: 40,
    retryableCodes: new Set(["TEMPORARY"]),
  };

  it("retries transient failures within the attempt budget using bounded jitter", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("one"), { code: "TEMPORARY" }))
      .mockRejectedValueOnce(Object.assign(new Error("two"), { code: "TEMPORARY" }))
      .mockResolvedValue("done");
    const delays: number[] = [];
    const result = await executeWithRetry(operation, {
      ...policy,
      random: () => 0.5,
      sleep: async (delay) => { delays.push(delay); },
    });

    expect(result).toBe("done");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([5, 10]);
  });

  it("does not retry non-retryable errors", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("invalid input"));
    await expect(executeWithRetry(operation, {
      ...policy,
      sleep: async () => {},
    })).rejects.toThrow("invalid input");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("rejects before executing when the deadline has expired", async () => {
    const operation = vi.fn();
    await expect(executeWithRetry(operation, {
      ...policy,
      deadlineAt: 100,
      clock: () => 101,
    })).rejects.toBeInstanceOf(RetryDeadlineExceededError);
    expect(operation).not.toHaveBeenCalled();
  });

  it("aborts in-flight work when the absolute deadline expires", async () => {
    const operation = vi.fn((_attempt: number, signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );
    await expect(executeWithRetry(operation, {
      ...policy,
      deadlineAt: Date.now() + 10,
    })).rejects.toBeInstanceOf(RetryDeadlineExceededError);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("propagates caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    const operation = vi.fn();
    await expect(executeWithRetry(operation, {
      ...policy,
      signal: controller.signal,
    })).rejects.toThrow("caller cancelled");
    expect(operation).not.toHaveBeenCalled();
  });
});
