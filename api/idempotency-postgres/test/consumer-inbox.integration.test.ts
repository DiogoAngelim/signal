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
  const tenantId = "tenant-inbox-" + randomUUID();
  const consumerName = "inbox-test-" + randomUUID();
  let roleName: string;
  let scopedConnectionString: string;

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
    const suffix = randomUUID().replaceAll("-", "");
    roleName = "signal_inbox_test_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    await admin.query(`CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}'`);
    const databaseName = decodeURIComponent(new URL(connectionString!).pathname.slice(1));
    const quotedDatabaseName = '"' + databaseName.replaceAll('"', '""') + '"';
    await admin.query(`GRANT CONNECT ON DATABASE ${quotedDatabaseName} TO "${roleName}"`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
    await admin.query(`GRANT SELECT, INSERT ON signal_consumer_inbox TO "${roleName}"`);
    await admin.query(`GRANT INSERT ON signal_inbox_test_side_effects TO "${roleName}"`);
    const scopedUrl = new URL(connectionString!);
    scopedUrl.username = roleName;
    scopedUrl.password = password;
    scopedConnectionString = scopedUrl.toString();
    first = createPostgresConsumerInbox({
      connectionString: scopedConnectionString,
      applicationName: "signal-consumer-inbox-integration-a",
    });
    second = createPostgresConsumerInbox({
      connectionString: scopedConnectionString,
      applicationName: "signal-consumer-inbox-integration-b",
    });
  });

  afterAll(async () => {
    if (first) await first.close();
    if (second) await second.close();
    await admin.query("DELETE FROM signal_consumer_inbox WHERE consumer_name = $1", [consumerName]);
    await admin.query("DELETE FROM signal_inbox_test_side_effects WHERE effect_key LIKE $1", ["%:" + consumerName + ":%"]);
    if (roleName) {
      await admin.query(`DROP OWNED BY "${roleName}"`);
      await admin.query(`DROP ROLE "${roleName}"`);
    }
    await admin.end();
  });

  it("commits inbox identity with database side effects and suppresses redelivery", async () => {
    const messageId = "message-" + randomUUID();
    const effectKey = tenantId + ":" + consumerName + ":" + messageId;
    const handler = vi.fn(async (transaction: PoolClient) => {
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
      return { persisted: true };
    });

    await expect(first.processOnce({ tenantId, consumerName, messageId }, handler))
      .resolves.toEqual({ status: "processed", result: { persisted: true } });
    await expect(second.processOnce({ tenantId, consumerName, messageId }, handler))
      .resolves.toEqual({ status: "duplicate" });
    expect(handler).toHaveBeenCalledOnce();

    const count = await admin.query(
      "SELECT count(*)::int AS count FROM signal_inbox_test_side_effects WHERE effect_key = $1",
      [effectKey],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("isolates identical consumer/message identities across tenants", async () => {
    const messageId = "same-message-" + randomUUID();
    const otherTenantId = tenantId + "-other";
    const firstEffect = tenantId + ":" + consumerName + ":" + messageId;
    const secondEffect = otherTenantId + ":" + consumerName + ":" + messageId;
    const firstResult = await first.processOnce(
      { tenantId, consumerName, messageId },
      async (transaction) => {
        await transaction.query(
          "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
          [firstEffect],
        );
      },
    );
    const secondResult = await second.processOnce(
      { tenantId: otherTenantId, consumerName, messageId },
      async (transaction) => {
        await transaction.query(
          "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
          [secondEffect],
        );
      },
    );
    expect(firstResult.status).toBe("processed");
    expect(secondResult.status).toBe("processed");
  });

  it("rolls back the inbox claim when the consumer transaction fails", async () => {
    const messageId = "rollback-" + randomUUID();
    const effectKey = tenantId + ":" + consumerName + ":" + messageId;
    await expect(first.processOnce({ tenantId, consumerName, messageId }, async (transaction) => {
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
      throw new Error("consumer transaction failed");
    })).rejects.toThrow("consumer transaction failed");

    const recovered = await second.processOnce({ tenantId, consumerName, messageId }, async (transaction) => {
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
    const handler = vi.fn(async (transaction: PoolClient) => {
      await transaction.query("SELECT pg_sleep(0.05)");
      await transaction.query(
        "INSERT INTO signal_inbox_test_side_effects (effect_key) VALUES ($1)",
        [effectKey],
      );
    });
    const outcomes = await Promise.all([
      first.processOnce({ tenantId, consumerName, messageId }, handler),
      second.processOnce({ tenantId, consumerName, messageId }, handler),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "processed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "duplicate")).toHaveLength(1);
    expect(handler).toHaveBeenCalledOnce();
  });
});
