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
    expect(await controller.renewProbe()).toBe(true);
    expect(calls.at(-1)).toEqual(["renewProbe", "provider-a", "probe-generation-1", 15000]);
    failNextSuccess = true;
    await expect(controller.recordSuccess()).rejects.toThrow("temporary database failure");
    expect(await controller.recordSuccess()).toBe(true);
    expect(calls.at(-1)).toEqual(["recordSuccess", "provider-a", "probe-generation-1"]);

    permit = { allowed: false };
    expect(await controller.tryAcquire()).toBe(false);
    expect(await controller.renewProbe()).toBe(false);

    permit = { allowed: true, probeToken: "probe-generation-2" };
    expect(await controller.tryAcquire()).toBe(true);
    expect(await controller.recordFailure(new Date(1234))).toBe(false);
    expect(calls.at(-1)?.[2]).toEqual(expect.objectContaining({ threshold: 5 }));
    expect(calls.at(-1)?.[3]).toBe("probe-generation-2");
  });

  it("preserves the active probe token when a concurrent acquisition is denied", async () => {
    let attempts = 0;
    const renewedTokens: Array<string | undefined> = [];
    const successTokens: Array<string | undefined> = [];
    const port: DistributedCircuitBreakerPort = {
      async snapshot() { return null; },
      async tryAcquire() {
        attempts += 1;
        return attempts === 1
          ? { allowed: true, probeToken: "active-generation" }
          : { allowed: false };
      },
      async renewProbe(_key, token) {
        renewedTokens.push(token);
        return token === "active-generation";
      },
      async recordSuccess(_key, token) {
        successTokens.push(token);
        return token === "active-generation";
      },
      async recordFailure(_key, _config, token) { return token === "active-generation"; },
    };

    const controller = createDistributedCircuitBreakerController(port, "provider-c");
    expect(await controller.tryAcquire()).toBe(true);
    expect(await controller.tryAcquire()).toBe(false);
    expect(await controller.renewProbe()).toBe(true);
    expect(await controller.recordSuccess()).toBe(true);
    expect(renewedTokens).toEqual(["active-generation"]);
    expect(successTokens).toEqual(["active-generation"]);
  });

  it("rejects invalid circuit breaker configuration", () => {
    const port: DistributedCircuitBreakerPort = {
      async snapshot() { return null; },
      async tryAcquire() { return { allowed: false }; },
      async renewProbe() { return false; },
      async recordSuccess() { return false; },
      async recordFailure() { return false; },
    };
    expect(() => createDistributedCircuitBreakerController(port, "provider", {
      threshold: 0,
      resetTimeoutMs: 1000,
      probeLeaseMs: 1000,
    })).toThrow("threshold must be a positive integer");
  });
});

describe("executeWithDistributedCircuitBreaker", () => {
  it("records success and returns the dependency result", async () => {
    const controller = {
      snapshot: vi.fn().mockResolvedValue(null),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renewProbe: vi.fn().mockResolvedValue(true),
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
      snapshot: vi.fn().mockResolvedValue(null),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renewProbe: vi.fn().mockResolvedValue(true),
      recordSuccess: vi.fn().mockResolvedValue(true),
      recordFailure: vi.fn().mockResolvedValue(true),
    };
    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => { throw failure; },
    )).rejects.toBe(failure);
    expect(controller.recordFailure).toHaveBeenCalledOnce();
  });

  it("reports unrecorded outcomes without masking dependency results or observer failures", async () => {
    const reported: unknown[] = [];
    const controller = {
      snapshot: vi.fn().mockResolvedValue(null),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renewProbe: vi.fn().mockResolvedValue(false),
      recordSuccess: vi.fn().mockResolvedValue(false),
      recordFailure: vi.fn().mockResolvedValue(false),
    };

    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => "dependency-result",
      { onCoordinationError: (error) => { reported.push(error); } },
    )).resolves.toBe("dependency-result");
    expect(reported[0]).toMatchObject({
      code: "CIRCUIT_BREAKER_OUTCOME_NOT_RECORDED",
    });

    const dependencyFailure = new Error("dependency failed");
    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => { throw dependencyFailure; },
      { onCoordinationError: () => { throw new Error("telemetry failed"); } },
    )).rejects.toBe(dependencyFailure);
  });

  it("rejects when the shared breaker denies a permit", async () => {
    const controller = {
      snapshot: vi.fn().mockResolvedValue(null),
      tryAcquire: vi.fn().mockResolvedValue(false),
      renewProbe: vi.fn().mockResolvedValue(false),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    };
    await expect(executeWithDistributedCircuitBreaker(
      controller,
      async () => "never",
    )).rejects.toMatchObject({ code: "CIRCUIT_BREAKER_OPEN" });
  });
});
