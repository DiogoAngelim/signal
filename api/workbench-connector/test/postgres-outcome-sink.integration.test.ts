import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  createPostgresWorkbenchOutcomeSink,
  type WorkbenchOutcomeEvent,
  type WorkbenchOutcomeCursor,
} from "../src";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

function makeOutcome(overrides: Partial<WorkbenchOutcomeEvent> = {}): WorkbenchOutcomeEvent {
  return {
    eventId: "workbench-outcome:11111111-1111-4111-8111-111111111111:initial",
    schemaVersion: 1,
    eventType: "workbench.outcome.recorded",
    outcomeId: "11111111-1111-4111-8111-111111111111",
    opportunityId: "22222222-2222-4222-8222-222222222222",
    cashChangeCursorId: "33333333-3333-4333-8333-333333333333",
    channel: "agency",
    engagementType: "retainer",
    result: "won",
    actualSalesHours: 3,
    actualDeliveryHours: 24,
    actualRevenueUsd: "2500.00",
    actualCostUsd: "250.00",
    collectedUsd: "1250.00",
    currency: "USD",
    outcomeRecordedAt: "2026-11-12T12:00:00.000Z",
    occurredAt: "2026-11-12T12:00:00.000Z",
    ...overrides,
  };
}

const cursor: WorkbenchOutcomeCursor = {
  after: "2026-11-12T12:00:00.000Z",
  afterId: "11111111-1111-4111-8111-111111111111",
  afterChangeId: "33333333-3333-4333-8333-333333333333",
};

integration("PostgreSQL Workbench outcome inbox", () => {
  const admin = new Pool({ connectionString, max: 2 });
  const ownerA = "connector-test-a-" + randomUUID();
  const ownerB = "connector-test-b-" + randomUUID();
  let roleName = "";
  let roleCreated = false;
  let sink: ReturnType<typeof createPostgresWorkbenchOutcomeSink> | undefined;
  let scopedPool: Pool | undefined;
  let scopedConnectionString = "";

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../migrations/0001_workbench_outcome_feedback.sql", import.meta.url),
      "utf8",
    );
    await admin.query(migration);

    const suffix = randomUUID().replaceAll("-", "");
    roleName = "signal_workbench_test_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    await admin.query(`CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}'`);
    roleCreated = true;
    const databaseName = decodeURIComponent(new URL(connectionString!).pathname.slice(1));
    const quotedDatabaseName = '"' + databaseName.replaceAll('"', '""') + '"';
    await admin.query(`GRANT CONNECT ON DATABASE ${quotedDatabaseName} TO "${roleName}"`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE ON signal_workbench_outcome_cursors TO "${roleName}"`);
    await admin.query(`GRANT SELECT, INSERT ON signal_workbench_outcome_events TO "${roleName}"`);

    const scopedUrl = new URL(connectionString!);
    scopedUrl.username = roleName;
    scopedUrl.password = password;
    scopedConnectionString = scopedUrl.toString();
    scopedPool = new Pool({ connectionString: scopedConnectionString, max: 2 });
    sink = createPostgresWorkbenchOutcomeSink({ connectionString: scopedConnectionString });
  });

  afterAll(async () => {
    if (sink) await sink.close();
    if (scopedPool) await scopedPool.end();
    await admin.query("DELETE FROM signal_workbench_outcome_events WHERE tenant_id = ANY($1::text[])", [[ownerA, ownerB]]);
    await admin.query("DELETE FROM signal_workbench_outcome_cursors WHERE tenant_id = ANY($1::text[])", [[ownerA, ownerB]]);
    if (roleCreated) {
      await admin.query(`DROP OWNED BY "${roleName}"`);
      await admin.query(`DROP ROLE "${roleName}"`);
    }
    await admin.end();
  });

  it("persists outcomes and cursor atomically with owner isolation and immutable deduplication", async () => {
    expect(await sink!.getCursor(ownerA)).toBeNull();
    expect(await sink!.getCursor(ownerB)).toBeNull();

    await expect(sink!.persistPage({
      ownerId: ownerA,
      previousCursor: null,
      nextCursor: cursor,
      events: [makeOutcome()],
    })).resolves.toEqual({ accepted: 1, duplicates: 0 });

    expect(await sink!.getCursor(ownerA)).toEqual(cursor);
    expect(await sink!.getCursor(ownerB)).toBeNull();

    // Verify the database policy itself, not only the adapter's owner filter.
    const scopedClient = await scopedPool!.connect();
    try {
      await scopedClient.query("BEGIN");
      await scopedClient.query("SELECT set_config('signal.tenant_id', $1, true)", [ownerB]);
      const visible = await scopedClient.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM signal_workbench_outcome_events",
      );
      expect(visible.rows[0].count).toBe("0");
      await scopedClient.query("ROLLBACK");
    } catch (error) {
      await scopedClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      scopedClient.release();
    }

    await expect(sink!.persistPage({
      ownerId: ownerA,
      previousCursor: cursor,
      nextCursor: cursor,
      events: [makeOutcome()],
    })).resolves.toEqual({ accepted: 0, duplicates: 1 });

    await expect(sink!.persistPage({
      ownerId: ownerA,
      previousCursor: cursor,
      nextCursor: cursor,
      events: [makeOutcome({ collectedUsd: "1251.00" })],
    })).rejects.toThrow(/different payload/);

    // A conflicting duplicate must roll back without moving the cursor.
    expect(await sink!.getCursor(ownerA)).toEqual(cursor);

    // The same event identifier is independent in a different owner partition.
    await expect(sink!.persistPage({
      ownerId: ownerB,
      previousCursor: null,
      nextCursor: cursor,
      events: [makeOutcome()],
    })).resolves.toEqual({ accepted: 1, duplicates: 0 });
    expect(await sink!.getCursor(ownerB)).toEqual(cursor);
  });

  it("rejects a cursor race and refuses to move a cursor backwards", async () => {
    await expect(sink!.persistPage({
      ownerId: ownerA,
      previousCursor: null,
      nextCursor: null,
      events: [],
    })).rejects.toThrow(/changed concurrently/);

    const earlier = { ...cursor, after: "2026-11-11T12:00:00.000Z" };
    await expect(sink!.persistPage({
      ownerId: ownerA,
      previousCursor: cursor,
      nextCursor: earlier,
      events: [],
    })).rejects.toThrow(/cannot move backwards/);
    expect(await sink!.getCursor(ownerA)).toEqual(cursor);
  });
});
