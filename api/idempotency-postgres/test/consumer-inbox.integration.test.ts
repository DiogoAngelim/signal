import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { createPostgresConsumerInbox } from "../src/consumer-inbox";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("PostgreSQL transactional consumer inbox", () => {
  const admin = new Pool({ connectionString, max: 2 });
  let first: ReturnType<typeof createPostgresConsumerInbox>;
  let second: ReturnType<typeof createPostgresConsumerInbox>;
  const consumerName = "inbox-test-" + randomUUID();

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../src/drizzle/migrations/0008_transactional_consumer_inbox.sql", import.meta.url),
      "utf8",
    );
    await admin.query(migration);
    await admin.query(`
      CREATE TABLE IF NOT EXISTS signal_inbox_test_side_effects (
        effect_key text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    first = createPostgresConsumerInbox({
      connectionString: connectionString!,
      applicationName: "signal-consumer-inbox-integration-a",
    });
    second = createPostgresConsumerInbox({
      connectionString: connectionString!,
      applicationName: "signal-consumer-inbox-integration-b",
    });
  });

  afterAll(async () => {
    if (first) await first.close();
    if (second) await second.close();
    await admin.query("DELETE FROM signal_consumer_inbox WHERE consumer_name = $1", [consumerName]);
    await admin.query("DELETE FROM signal_inbox_test_side_effects WHERE effect_key LIKE $1", [consumerName + ":%"]);
    await admin.end();
  });

  it("commits inbox identity with database side effects and suppresses redelivery", async () => {
    const messageId = "message-" + randomUUID();
    const effectKey = consumerName + ":" + messageId;
    const handler = vi.fn(async (transaction: PoolClient) => {
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
      return { persisted: true };
    });

    await expect(first.processOnce({ consumerName, messageId }, handler))
      .resolves.toEqual({ status: "processed", result: { persisted: true } });
    await expect(second.processOnce({ consumerName, messageId }, handler))
      .resolves.toEqual({ status: "duplicate" });
    expect(handler).toHaveBeenCalledOnce();

    const count = await admin.query(
      "SELECT count(*)::int AS count FROM signal_inbox_test_side_effects WHERE effect_key = $1",
      [effectKey],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("rolls back the inbox claim when the consumer transaction fails", async () => {
    const messageId = "rollback-" + randomUUID();
    const effectKey = consumerName + ":" + messageId;
    await expect(first.processOnce({ consumerName, messageId }, async (transaction) => {
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
      throw new Error("consumer transaction failed");
    })).rejects.toThrow("consumer transaction failed");

    const recovered = await second.processOnce({ consumerName, messageId }, async (transaction) => {
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
      return "recovered";
    });
    expect(recovered).toEqual({ status: "processed", result: "recovered" });
  });

  it("admits exactly one handler across concurrent independent adapters", async () => {
    const messageId = "concurrent-" + randomUUID();
    const effectKey = consumerName + ":" + messageId;
    const handler = vi.fn(async (transaction) => {
      await transaction.query("SELECT pg_sleep(0.05)");
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
    });
    const outcomes = await Promise.all([
      first.processOnce({ consumerName, messageId }, handler),
      second.processOnce({ consumerName, messageId }, handler),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "processed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "duplicate")).toHaveLength(1);
    expect(handler).toHaveBeenCalledOnce();
  });
});
