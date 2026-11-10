import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPostgresCircuitBreakerPort } from "../src/circuit-breaker";

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
    expect((await portA.tryAcquire(key, config)).allowed).toBe(true);
    expect((await portB.tryAcquire(key, config)).allowed).toBe(true);
    expect(await portA.recordFailure(key, config)).toBe(true);
    expect(await portB.recordFailure(key, config)).toBe(true);
    expect((await portA.snapshot(key))?.state).toBe("open");

    const eligibleAt = new Date(Date.now() + config.resetTimeoutMs + 25);
    const permits = await Promise.all([
      portA.tryAcquire(key, config, eligibleAt),
      portB.tryAcquire(key, config, eligibleAt),
      portA.tryAcquire(key, config, eligibleAt),
      portB.tryAcquire(key, config, eligibleAt),
    ]);
    expect(permits.filter((permit) => permit.allowed)).toHaveLength(1);
    expect((await portA.snapshot(key))?.state).toBe("half-open");
  });

  it("reclaims expired probe leases and rejects stale probe completions", async () => {
    const key = "fenced-" + randomUUID();
    await portA.tryAcquire(key, config);
    await portA.recordFailure(key, config);
    await portA.tryAcquire(key, config);
    await portA.recordFailure(key, config);

    const eligibleAt = new Date(Date.now() + config.resetTimeoutMs + 25);
    const firstProbe = await portA.tryAcquire(key, config, eligibleAt);
    expect(firstProbe.allowed).toBe(true);
    await setupPool.query(
      "UPDATE signal_circuit_breakers SET probe_expires_at = now() - interval '1 second' WHERE breaker_key = $1",
      [key],
    );

    const secondProbe = await portB.tryAcquire(key, config);
    expect(secondProbe.allowed).toBe(true);
    expect(await portA.recordSuccess(key, firstProbe.probeToken)).toBe(false);
    expect(await portB.recordSuccess(key, secondProbe.probeToken)).toBe(true);
    expect((await portB.snapshot(key))?.state).toBe("closed");
  });

  it("rejects configuration drift between runtime instances", async () => {
    const key = "config-" + randomUUID();
    await portA.tryAcquire(key, config);
    await expect(portB.tryAcquire(key, {
      ...config,
      threshold: config.threshold + 1,
    })).rejects.toThrow(/configuration differs/);
  });
});
