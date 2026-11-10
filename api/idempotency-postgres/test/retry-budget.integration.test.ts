import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPostgresRetryBudget } from "../src/retry-budget-store";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("PostgreSQL shared retry budget", () => {
  const admin = new Pool({ connectionString, max: 2 });
  let first: ReturnType<typeof createPostgresRetryBudget>;
  let second: ReturnType<typeof createPostgresRetryBudget>;
  let budgetKey: string;

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../src/drizzle/migrations/0007_shared_retry_budgets.sql", import.meta.url),
      "utf8",
    );
    await admin.query(migration);
    budgetKey = "integration-" + randomUUID();
    first = createPostgresRetryBudget({
      connectionString: connectionString!,
      budgetKey,
      capacity: 5,
      refillRatePerSecond: 0,
      applicationName: "signal-retry-budget-integration-a",
    });
    second = createPostgresRetryBudget({
      connectionString: connectionString!,
      budgetKey,
      capacity: 5,
      refillRatePerSecond: 0,
      applicationName: "signal-retry-budget-integration-b",
    });
  });

  afterAll(async () => {
    if (first) await first.close();
    if (second) await second.close();
    if (budgetKey) await admin.query("DELETE FROM signal_retry_budgets WHERE budget_key = $1", [budgetKey]);
    await admin.end();
  });

  it("atomically enforces one shared allowance across independent adapters and restarts", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        (index % 2 === 0 ? first : second).tryConsume(),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(5);
    expect((await first.snapshot()).available).toBe(0);

    const restarted = createPostgresRetryBudget({
      connectionString: connectionString!,
      budgetKey,
      capacity: 5,
      refillRatePerSecond: 0,
      applicationName: "signal-retry-budget-restart",
    });
    expect(await restarted.tryConsume()).toBe(false);
    await restarted.close();
  });

  it("rejects inconsistent configuration for an existing shared budget", async () => {
    const conflicting = createPostgresRetryBudget({
      connectionString: connectionString!,
      budgetKey,
      capacity: 6,
      refillRatePerSecond: 0,
    });
    await expect(conflicting.snapshot()).rejects.toThrow("configuration conflicts");
    await conflicting.close();
  });
});
