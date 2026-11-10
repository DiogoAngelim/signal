import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPostgresCircuitBreakerPort } from "../src/circuit-breaker";
import { createDistributedCircuitBreakerController } from "../../runtime/src/distributed-resilience";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("PostgreSQL distributed circuit breaker", () => {
  const setupPool = new Pool({ connectionString });
  const portA = createPostgresCircuitBreakerPort({ connectionString: connectionString! });
  const portB = createPostgresCircuitBreakerPort({ connectionString: connectionString! });
  const config = { threshold: 2, resetTimeoutMs: 100, probeLeaseMs: 5000 };

  beforeAll(async () => {
    const migration = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0004_distributed_circuit_breakers.sql"),
      "utf8",
    );
    await setupPool.query(migration);
  });

  afterAll(async () => {
    await Promise.all([portA.close(), portB.close(), setupPool.end()]);
  });

  it("coordinates concurrent processes and grants exactly one half-open probe", async () => {
    const key = "distributed-" + randomUUID();
    const first = createDistributedCircuitBreakerController(portA, key, config);
    const second = createDistributedCircuitBreakerController(portB, key, config);

    expect(await first.tryAcquire()).toBe(true);
    expect(await second.tryAcquire()).toBe(true);
    expect(await first.recordFailure()).toBe(true);
    expect(await second.recordFailure()).toBe(true);
    expect((await first.snapshot())?.state).toBe("open");

    const eligibleAt = new Date(Date.now() + config.resetTimeoutMs + 25);
    const permits = await Promise.all([
      first.tryAcquire(eligibleAt),
      second.tryAcquire(eligibleAt),
      createDistributedCircuitBreakerController(portA, key, config).tryAcquire(eligibleAt),
      createDistributedCircuitBreakerController(portB, key, config).tryAcquire(eligibleAt),
    ]);
    expect(permits.filter(Boolean)).toHaveLength(1);
    expect((await first.snapshot())?.state).toBe("half-open");
  });

  it("reclaims expired probe leases and rejects stale probe completions", async () => {
    const key = "fenced-" + randomUUID();
    const first = createDistributedCircuitBreakerController(portA, key, config);
    const second = createDistributedCircuitBreakerController(portB, key, config);

    await first.tryAcquire();
    await first.recordFailure();
    await first.tryAcquire();
    await first.recordFailure();

    const eligibleAt = new Date(Date.now() + config.resetTimeoutMs + 25);
    expect(await first.tryAcquire(eligibleAt)).toBe(true);
    await setupPool.query(
      "UPDATE signal_circuit_breakers SET probe_expires_at = now() - interval '1 second' WHERE breaker_key = $1",
      [key],
    );

    expect(await second.tryAcquire()).toBe(true);
    expect(await first.recordSuccess()).toBe(false);
    expect(await second.recordSuccess()).toBe(true);
    expect((await second.snapshot())?.state).toBe("closed");
  });

  it("rejects configuration drift between runtime instances", async () => {
    const key = "config-" + randomUUID();
    const first = createDistributedCircuitBreakerController(portA, key, config);
    await first.tryAcquire();
    const incompatible = createDistributedCircuitBreakerController(portB, key, {
      ...config,
      threshold: config.threshold + 1,
    });
    await expect(incompatible.tryAcquire()).rejects.toThrow(/configuration differs/);
  });
});
