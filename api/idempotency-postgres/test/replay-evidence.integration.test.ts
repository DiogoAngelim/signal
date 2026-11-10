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
  const store = createPostgresReplayEvidenceStore({
    connectionString: connectionString!,
    applicationName: "signal-replay-evidence-integration-test",
  });

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../src/drizzle/migrations/0006_immutable_replay_evidence.sql", import.meta.url),
      "utf8",
    );
    await admin.query(migration);
  });

  afterAll(async () => {
    await store.close();
    await admin.end();
  });

  it("persists evidence idempotently and rejects mutation or conflicting reuse", async () => {
    const executionId = "replay-" + randomUUID();
    const record = createReplayEvidenceRecord({
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
    expect(await store.get(executionId)).toEqual(record);

    const conflicting = {
      ...record,
      result: { accepted: false },
      resultFingerprint: fingerprint({ accepted: false }),
    };
    await expect(store.save(conflicting)).rejects.toThrow("different content");

    const mutation = await admin.query(
      "UPDATE signal_replay_evidence SET record = record WHERE execution_id = $1",
      [executionId],
    ).catch((error: unknown) => error);
    expect(mutation).toBeInstanceOf(Error);
  });
});
