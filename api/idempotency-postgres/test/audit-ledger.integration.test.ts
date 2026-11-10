import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createAuditChainEntry, verifyAuditChainEntry } from "../../runtime/src/audit-chain";
import { signAuditCheckpoint, verifyAuditCheckpoint } from "../../runtime/src/audit-checkpoint";
import { createPostgresAuditLedger } from "../src/audit-ledger";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("PostgreSQL append-only audit ledger", () => {
  const admin = new Pool({ connectionString, max: 3 });
  const signingKeys = generateKeyPairSync("ed25519");
  const privateKey = signingKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = signingKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const keyId = "signal-audit-ledger-integration-test";
  const ledger = createPostgresAuditLedger({
    connectionString: connectionString!,
    applicationName: "signal-audit-ledger-integration-test",
    verifyEntry: verifyAuditChainEntry,
    verifyCheckpoint: (checkpoint) => verifyAuditCheckpoint(checkpoint, publicKey, keyId),
  });

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../src/drizzle/migrations/0005_append_only_audit_ledger.sql", import.meta.url),
      "utf8",
    );
    await admin.query(migration);
  });

  afterAll(async () => {
    await ledger.close();
    await admin.end();
  });

  it("persists a contiguous chain and a checkpoint bound to its stored head", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const entry = createAuditChainEntry(null, {
      operationName: "audit.integration.v1",
      operationKind: "mutation",
      messageId: "audit-" + suffix,
      outcome: "completed",
    });
    await ledger.appendEntry(entry);
    await expect(ledger.appendEntry({ ...entry, messageId: "duplicate-" + suffix }))
      .rejects.toThrow();
    await expect(ledger.appendEntry({
      ...entry,
      sequence: 2,
      previousHash: entry.hash,
      messageId: "gap-" + suffix,
    })).rejects.toThrow("next contiguous entry");

    const rows = await ledger.readEntries({ afterSequence: -1, limit: 10 });
    expect(rows).toContainEqual(entry);

    const checkpoint = signAuditCheckpoint(
      [entry],
      { keyId, privateKey },
      "2026-11-10T10:00:02.000Z",
    );
    await ledger.appendCheckpoint(checkpoint);
    expect(await ledger.latestCheckpoint()).toMatchObject(checkpoint);
    await expect(ledger.appendCheckpoint({
      ...checkpoint,
      sequence: 1,
      chainHeadHash: "f".repeat(64),
    })).rejects.toThrow("Invalid signed audit checkpoint.");

    const update = await admin.query(
      "UPDATE signal_audit_entries SET entry = entry WHERE sequence = 0",
    ).catch((error: unknown) => error);
    expect(update).toBeInstanceOf(Error);
    const deletion = await admin.query(
      "DELETE FROM signal_audit_checkpoints WHERE key_id = $1",
      [checkpoint.keyId],
    ).catch((error: unknown) => error);
    expect(deletion).toBeInstanceOf(Error);
  });
});
