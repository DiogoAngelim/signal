import { describe, expect, it } from "vitest";
import {
  calculateBackoff,
  calculateJitteredBackoff,
  createCircuitBreaker,
  createCircuitBreakerController,
  recordFailure,
  shouldAllowRequest,
} from "./resilience";

describe("retry policy", () => {
  it("caps exponential backoff and applies bounded full jitter", () => {
    expect(calculateBackoff(0)).toBe(100);
    expect(calculateBackoff(20)).toBe(5000);
    expect(calculateJitteredBackoff(2, undefined, () => 0)).toBe(0);
    expect(calculateJitteredBackoff(2, undefined, () => 0.5)).toBe(200);
  });

  it("rejects invalid attempts, policies, and random samples", () => {
    expect(() => calculateBackoff(-1)).toThrow();
    expect(() => calculateBackoff(1.5)).toThrow();
    expect(() =>
      calculateBackoff(0, {
        maxAttempts: 0,
        backoffMs: 1,
        maxBackoffMs: 1,
        retryableCodes: new Set(),
      }),
    ).toThrow();
    expect(() => calculateJitteredBackoff(0, undefined, () => 1)).toThrow();
  });
});

describe("circuit breaker", () => {
  it("validates configuration and uses an injected timestamp", () => {
    expect(() => createCircuitBreaker(0)).toThrow();
    expect(() => createCircuitBreaker(1, -1)).toThrow();
    const open = recordFailure(createCircuitBreaker(1, 50), 100);
    expect(shouldAllowRequest(open, 149)).toBe(false);
    expect(shouldAllowRequest(open, 150)).toBe(true);
  });

  it("allows only one half-open probe and closes after success", () => {
    let now = 100;
    const breaker = createCircuitBreakerController(1, 50, () => now);
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe("open");
    expect(breaker.tryAcquire()).toBe(false);
    now = 150;
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.snapshot().state).toBe("half-open");
    expect(breaker.tryAcquire()).toBe(false);
    breaker.recordSuccess();
    expect(breaker.snapshot()).toMatchObject({
      state: "closed",
      failureCount: 0,
      lastFailureAt: null,
    });
    expect(breaker.tryAcquire()).toBe(true);
  });

  it("reopens after a failed half-open probe", () => {
    let now = 0;
    const breaker = createCircuitBreakerController(1, 10, () => now);
    breaker.recordFailure();
    now = 10;
    expect(breaker.tryAcquire()).toBe(true);
    breaker.recordFailure(11);
    expect(breaker.snapshot()).toMatchObject({
      state: "open",
      failureCount: 2,
      lastFailureAt: 11,
    });
    expect(breaker.tryAcquire(20)).toBe(false);
  });
});
