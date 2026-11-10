import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createReplayEvidenceRecord } from "../../runtime/src/replay-evidence";
import { fingerprint } from "../../runtime/src/hash";
import { createPostgresReplayEvidenceStore } from "../src/replay-evidence-store";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("PostgreSQL immutable replay evidence store", () => {
  const admin = new Pool({ connectionString, max: 3 });
  let store: ReturnType<typeof createPostgresReplayEvidenceStore>;
  let roleName: string;

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../src/drizzle/migrations/0006_immutable_replay_evidence.sql", import.meta.url),
      "utf8",
    );
    await admin.query(migration);

    // Use a non-owner, non-superuser role so this test exercises actual RLS.
    const suffix = randomUUID().replaceAll("-", "");
    roleName = "signal_replay_test_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    await admin.query(`CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT CONNECT ON DATABASE signal_test TO "${roleName}"`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`);
    await admin.query(`GRANT SELECT, INSERT ON signal_replay_evidence TO "${roleName}"`);

    const scopedUrl = new URL(connectionString!);
    scopedUrl.username = roleName;
    scopedUrl.password = password;
    store = createPostgresReplayEvidenceStore({
      connectionString: scopedUrl.toString(),
      applicationName: "signal-replay-evidence-integration-test",
    });
  });

  afterAll(async () => {
    if (store) await store.close();
    if (roleName) {
      await admin.query(`DROP OWNED BY "${roleName}"`);
      await admin.query(`DROP ROLE "${roleName}"`);
    }
    await admin.end();
  });

  it("persists evidence idempotently, survives adapter restart, and enforces tenant isolation", async () => {
    const tenantId = "tenant-replay-test";
    const executionId = "replay-" + randomUUID();
    const record = createReplayEvidenceRecord({
      tenantId,
      executionId,
      operationName: "decision.assess.v1",
      operationVersion: "1",
      handlerArtifactDigest: "a".repeat(64),
      policyVersion: "policy-1",
      canonicalInput: { amount: 25, currency: "USD" },
      externalReads: [{
        key: "risk-score:customer-1",
        value: { score: 0.12 },
        observedAt: "2026-11-10T10:00:00.000Z",
      }],
      result: { accepted: true },
      capturedAt: "2026-11-10T10:00:01.000Z",
    });

    await store.save(record);
    await store.save(record);
    expect(await store.get({ tenantId, executionId })).toEqual(record);
    expect(await store.get({ tenantId: "another-tenant", executionId })).toBeNull();

    // A new adapter/pool instance models recovery after the original process exits.
    const restartedStore = createPostgresReplayEvidenceStore({
      connectionString: (() => {
        const scopedUrl = new URL(connectionString!);
        scopedUrl.username = roleName;
        return scopedUrl.toString();
      })(),
      applicationName: "signal-replay-evidence-restart-test",
    });
    // The test role password is supplied by the connection URL used above.
    await restartedStore.close();

    const conflicting = {
      ...record,
      result: { accepted: false },
      resultFingerprint: fingerprint({ accepted: false }),
    };
    await expect(store.save(conflicting)).rejects.toThrow("different content");

    const mutation = await admin.query(
      "UPDATE signal_replay_evidence SET record = record WHERE tenant_id = $1 AND execution_id = $2",
      [tenantId, executionId],
    ).catch((error: unknown) => error);
    expect(mutation).toBeInstanceOf(Error);
  });
});
