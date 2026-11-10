import { describe, expect, it, vi } from "vitest";
import {
  RetryBudgetExhaustedError,
  RetryDeadlineExceededError,
  createCircuitBreakerController,
  createRetryBudget,
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

  it("bounds aggregate retries with a shared token-bucket budget", async () => {
    let now = 0;
    const budget = createRetryBudget({
      capacity: 1,
      refillRatePerSecond: 1,
      clock: () => now,
    });
    const transient = () => Object.assign(new Error("temporary"), { code: "TEMPORARY" });
    const first = vi.fn()
      .mockRejectedValueOnce(transient())
      .mockResolvedValue("first");
    const second = vi.fn()
      .mockRejectedValueOnce(transient())
      .mockResolvedValue("second");

    await expect(executeWithRetry(first, {
      ...policy,
      retryBudget: budget,
      random: () => 0,
      sleep: async () => {},
    })).resolves.toBe("first");
    await expect(executeWithRetry(second, {
      ...policy,
      retryBudget: budget,
      random: () => 0,
      sleep: async () => {},
    })).rejects.toBeInstanceOf(RetryBudgetExhaustedError);
    expect(second).toHaveBeenCalledOnce();

    now = 1_000;
    const third = vi.fn()
      .mockRejectedValueOnce(transient())
      .mockResolvedValue("third");
    await expect(executeWithRetry(third, {
      ...policy,
      retryBudget: budget,
      random: () => 0,
      sleep: async () => {},
    })).resolves.toBe("third");
    expect(third).toHaveBeenCalledTimes(2);
    expect((await budget.snapshot()).available).toBe(0);
  });

  it("rejects invalid retry budget configuration and non-monotonic clocks", () => {
    expect(() => createRetryBudget({ capacity: 0 })).toThrow("capacity");
    expect(() => createRetryBudget({ capacity: 1, refillRatePerSecond: -1 })).toThrow("refillRatePerSecond");
    let now = 10;
    const budget = createRetryBudget({ capacity: 1, clock: () => now });
    now = 9;
    expect(() => budget.tryConsume()).toThrow("monotonic");
  });

  it("does not retry non-retryable errors", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("invalid input"));
    await expect(executeWithRetry(operation, {
      ...policy,
      sleep: async () => {},
    })).rejects.toThrow("invalid input");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("supports asynchronous retry budgets backed by shared infrastructure", async () => {
    const budget = {
      tryConsume: vi.fn().mockResolvedValue(false),
      snapshot: vi.fn().mockResolvedValue({
        capacity: 1,
        available: 0,
        refillRatePerSecond: 0,
      }),
    };
    const operation = vi.fn().mockRejectedValue(
      Object.assign(new Error("temporary"), { code: "TEMPORARY" }),
    );
    await expect(executeWithRetry(operation, {
      ...policy,
      retryBudget: budget,
      random: () => 0,
      sleep: async () => {},
    })).rejects.toBeInstanceOf(RetryBudgetExhaustedError);
    expect(budget.tryConsume).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledOnce();
  });

  it("does not consume retry budget when the next delay would exceed the deadline", async () => {
    let now = 0;
    const budget = createRetryBudget({ capacity: 1, clock: () => now });
    const operation = vi.fn().mockRejectedValue(
      Object.assign(new Error("temporary"), { code: "TEMPORARY" }),
    );
    await expect(executeWithRetry(operation, {
      ...policy,
      retryBudget: budget,
      deadlineAt: 5,
      clock: () => now,
      random: () => 0.5,
      sleep: async (delay) => { now += delay; },
    })).rejects.toBeInstanceOf(RetryDeadlineExceededError);
    expect((await budget.snapshot()).available).toBe(1);
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


describe("createCircuitBreakerController", () => {
  it("grants one half-open probe and requires its permit to close the breaker", () => {
    let now = 100;
    const breaker = createCircuitBreakerController(1, 50, () => now, 1_000);
    const closedPermit = breaker.acquire(now)!;

    expect(closedPermit.kind).toBe("closed");
    expect(breaker.recordFailure(closedPermit, now)).toBe(true);
    expect(breaker.snapshot().state).toBe("open");

    now = 149;
    expect(breaker.acquire(now)).toBeNull();
    now = 150;
    const probePermit = breaker.acquire(now)!;
    expect(probePermit.kind).toBe("probe");
    expect(breaker.acquire(now)).toBeNull();
    expect(breaker.recordSuccess(probePermit, now)).toBe(true);
    expect(breaker.snapshot()).toMatchObject({
      state: "closed",
      failureCount: 0,
      lastFailureAt: null,
    });
    expect(breaker.recordSuccess(probePermit, now)).toBe(false);
  });

  it("rejects late outcomes from closed-state operations after a generation transition", () => {
    let now = 100;
    const breaker = createCircuitBreakerController(1, 50, () => now, 1_000);
    const openingPermit = breaker.acquire(now)!;
    const stalePermit = breaker.acquire(now)!;

    expect(breaker.recordFailure(openingPermit, now)).toBe(true);
    expect(breaker.snapshot().state).toBe("open");

    now = 150;
    const probePermit = breaker.acquire(now)!;
    expect(breaker.recordSuccess(probePermit, now)).toBe(true);
    expect(breaker.recordFailure(stalePermit, now)).toBe(false);
    expect(breaker.snapshot().state).toBe("closed");
  });

  it("expires and fences a half-open probe whose lease is not renewed", () => {
    let now = 100;
    const breaker = createCircuitBreakerController(1, 0, () => now, 1_000);
    const closedPermit = breaker.acquire(now)!;
    expect(breaker.recordFailure(closedPermit, now)).toBe(true);
    const firstProbe = breaker.acquire(now)!;

    now = 1_100;
    expect(breaker.renewProbe(firstProbe, now)).toBe(false);
    expect(breaker.snapshot().state).toBe("open");
    const replacementProbe = breaker.acquire(now)!;
    expect(replacementProbe.id).not.toBe(firstProbe.id);
    expect(breaker.recordSuccess(firstProbe, now)).toBe(false);
    expect(breaker.recordSuccess(replacementProbe, now)).toBe(true);
    expect(breaker.snapshot().state).toBe("closed");
  });

  it("renews an active probe lease and validates the lease budget", () => {
    let now = 100;
    const breaker = createCircuitBreakerController(1, 0, () => now, 1_000);
    const closedPermit = breaker.acquire(now)!;
    breaker.recordFailure(closedPermit, now);
    const probe = breaker.acquire(now)!;

    now = 900;
    expect(breaker.renewProbe(probe, now)).toBe(true);
    now = 1_500;
    expect(breaker.recordSuccess(probe, now)).toBe(true);
    expect(() => createCircuitBreakerController(1, 0, () => now, 999)).toThrow(
      "probeLeaseMs must be between 1000 and 86400000 milliseconds",
    );
  });
});
