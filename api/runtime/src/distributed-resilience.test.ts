import { describe, expect, it } from "vitest";
import type { DistributedCircuitBreakerPort } from "@signal/ports";
import { createDistributedCircuitBreakerController } from "./distributed-resilience";

describe("distributed runtime circuit breaker controller", () => {
  it("delegates state and forwards the exact probe generation token", async () => {
    const calls: unknown[][] = [];
    let permit = { allowed: true, probeToken: "probe-generation-1" };
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
