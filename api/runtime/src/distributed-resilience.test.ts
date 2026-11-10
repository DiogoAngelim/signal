import { describe, expect, it, vi } from "vitest";
import type { DistributedCircuitBreakerPermit, DistributedCircuitBreakerPort } from "@signal/ports";
import {
  createDistributedCircuitBreakerController,
  executeWithDistributedCircuitBreaker,
} from "./distributed-resilience";

describe("distributed runtime circuit breaker controller", () => {
  it("delegates state and forwards the exact probe generation token", async () => {
    const calls: unknown[][] = [];
    let permit: DistributedCircuitBreakerPermit = { allowed: true, probeToken: "probe-generation-1" };
    let failNextSuccess = false;
    const port: DistributedCircuitBreakerPort = {
      async snapshot(key) {
        calls.push(["snapshot", key]);
        return {
          key,
          failureCount: 3,
          lastFailureAt: null,
          state: "half-open",
          threshold: 3,
          resetTimeoutMs: 1000,
          probeLeaseMs: 15000,
        };
      },
      async tryAcquire(key, config, now) {
        calls.push(["tryAcquire", key, config, now]);
        return permit;
      },
      async renewProbe(key, token, leaseMs) {
        calls.push(["renewProbe", key, token, leaseMs]);
        return token === "probe-generation-1";
      },
      async recordSuccess(key, token) {
        calls.push(["recordSuccess", key, token]);
        if (failNextSuccess) {
          failNextSuccess = false;
          throw new Error("temporary database failure");
        }
        return token === "probe-generation-1";
      },
      async recordFailure(key, config, token, now) {
        calls.push(["recordFailure", key, config, token, now]);
        return token === "probe-generation-1";
      },
    };

    const controller = createDistributedCircuitBreakerController(port, "provider-a");
    expect((await controller.snapshot())?.state).toBe("half-open");
    expect(await controller.tryAcquire()).toBe(true);
    permit = { allowed: false };
    expect(await controller.tryAcquire()).toBe(false);
    expect(await controller.renewProbe()).toBe(true);
    expect(calls.at(-1)).toEqual(["renewProbe", "provider-a", "probe-generation-1", 15000]);
    failNextSuccess = true;
    await expect(controller.recordSuccess()).rejects.toThrow("temporary database failure");
    expect(await controller.recordSuccess()).toBe(true);
    expect(calls.at(-1)).toEqual(["recordSuccess", "provider-a", "probe-generation-1"]);

    permit = { allowed: true, probeToken: "probe-generation-2" };
    expect(await controller.tryAcquire()).toBe(true);
    expect(await controller.recordFailure(new Date(1234))).toBe(false);
    expect(calls.at(-1)?.[2]).toEqual(expect.objectContaining({ threshold: 5 }));
    expect(calls.at(-1)?.[3]).toBe("probe-generation-2");
  });

  it("does not retain a token when acquisition is denied", async () => {
    const tokens: Array<string | undefined> = [];
    const port: DistributedCircuitBreakerPort = {
      async snapshot() { return null; },
      async tryAcquire() { return { allowed: false }; },
      async renewProbe(_key, token) { tokens.push(token); return false; },
      async recordSuccess(_key, token) { tokens.push(token); return false; },
      async recordFailure(_key, _config, token) { tokens.push(token); return false; },
    };
    const controller = createDistributedCircuitBreakerController(port, "provider-b");
    expect(await controller.tryAcquire()).toBe(false);
    expect(await controller.recordSuccess()).toBe(false);
    expect(tokens).toEqual([undefined]);
  });
});


describe("executeWithDistributedCircuitBreaker", () => {
  it("records success and returns the dependency result", async () => {
    const controller = {
      tryAcquire: vi.fn().mockResolvedValue(true),
      recordSuccess: vi.fn().mockResolvedValue(true),
      recordFailure: vi.fn().mockResolvedValue(true),
    };
    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => "ok",
    )).resolves.toBe("ok");
    expect(controller.tryAcquire).toHaveBeenCalledOnce();
    expect(controller.recordSuccess).toHaveBeenCalledOnce();
    expect(controller.recordFailure).not.toHaveBeenCalled();
  });

  it("records dependency failures and preserves the original error", async () => {
    const failure = new Error("dependency unavailable");
    const controller = {
      tryAcquire: vi.fn().mockResolvedValue(true),
      recordSuccess: vi.fn().mockResolvedValue(true),
      recordFailure: vi.fn().mockResolvedValue(true),
    };
    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => { throw failure; },
    )).rejects.toBe(failure);
    expect(controller.recordFailure).toHaveBeenCalledOnce();
  });

  it("rejects when the shared breaker denies a permit", async () => {
    const controller = {
      tryAcquire: vi.fn().mockResolvedValue(false),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    };
    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => "never",
    )).rejects.toMatchObject({ code: "CIRCUIT_BREAKER_OPEN" });
  });
});
