import { Pool, type PoolClient } from "pg";

export interface SignalAuditLedgerEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly operationName: string;
  readonly operationKind: string;
  readonly messageId: string;
  readonly outcome: "completed" | "replayed" | "failed";
  readonly idempotencyKey?: string;
  readonly payloadFingerprint?: string;
  readonly previousHash: string;
  readonly hash: string;
}

export interface SignalSignedAuditCheckpoint {
  readonly version: 1;
  readonly keyId: string;
  readonly sequence: number;
  readonly chainHeadHash: string;
  readonly createdAt: string;
  readonly signature: string;
}

export interface CreatePostgresAuditLedgerOptions {
  readonly connectionString: string;
  /** Verify each entry's schema and content hash using the Signal audit-chain verifier. */
  readonly verifyEntry: (entry: SignalAuditLedgerEntry) => boolean;
  /** Verify checkpoint signatures against the deployment's trusted public-key registry. */
  readonly verifyCheckpoint: (checkpoint: SignalSignedAuditCheckpoint) => boolean;
  readonly maxConnections?: number;
  readonly applicationName?: string;
}

export interface PostgresAuditLedger {
  appendEntry(entry: SignalAuditLedgerEntry): Promise<void>;
  readEntries(input?: { afterSequence?: number; limit?: number }): Promise<SignalAuditLedgerEntry[]>;
  appendCheckpoint(checkpoint: SignalSignedAuditCheckpoint): Promise<void>;
  latestCheckpoint(): Promise<SignalSignedAuditCheckpoint | null>;
  close(): Promise<void>;
}

const GENESIS_HASH = "0".repeat(64);
const HASH_PATTERN = /^[a-f0-9]{64}$/;

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
}

/**
 * Append-only PostgreSQL persistence for Signal audit entries and signed
 * checkpoints. Apply migration 0005 before use. Use a non-owner application
 * role with INSERT/SELECT only; the trigger is defense in depth, not protection
 * against a database owner or superuser. Independently anchor checkpoints.
 */
export function createPostgresAuditLedger(
  options: CreatePostgresAuditLedgerOptions,
): PostgresAuditLedger {
  if (typeof options.verifyEntry !== "function" || typeof options.verifyCheckpoint !== "function") {
    throw new Error("Audit entry and checkpoint verification callbacks are required.");
  }
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 5,
    application_name: options.applicationName ?? "signal-audit-ledger",
  });

  return {
    async appendEntry(entry) {
      if (
        !Number.isSafeInteger(entry.sequence) || entry.sequence < 0 ||
        !HASH_PATTERN.test(entry.hash) || !HASH_PATTERN.test(entry.previousHash) ||
        !Number.isFinite(Date.parse(entry.timestamp)) ||
        !entry.operationName || !entry.operationKind || !entry.messageId ||
        !["completed", "replayed", "failed"].includes(entry.outcome) ||
        !options.verifyEntry(entry)
      ) {
        throw new Error("Invalid Signal audit entry.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize appends even when the ledger is empty (there is no row to lock).
        await client.query("SELECT pg_advisory_xact_lock(731946201)");
        const previous = await client.query<{ sequence: string; entry_hash: string }>(
          "SELECT sequence::text, entry_hash FROM signal_audit_entries ORDER BY sequence DESC LIMIT 1",
        );
        const last = previous.rows[0];
        const expectedSequence = last ? Number(last.sequence) + 1 : 0;
        const expectedPreviousHash = last ? last.entry_hash.trim() : GENESIS_HASH;
        if (entry.sequence !== expectedSequence || entry.previousHash !== expectedPreviousHash) {
          throw new Error("Audit entry is not the next contiguous entry in the persisted chain.");
        }
        await client.query(
          "INSERT INTO signal_audit_entries (sequence, entry, previous_hash, entry_hash) VALUES ($1, $2::jsonb, $3, $4)",
          [entry.sequence, JSON.stringify(entry), entry.previousHash, entry.hash],
        );
        await client.query("COMMIT");
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },

    async readEntries(input = {}) {
      const afterSequence = input.afterSequence ?? -1;
      const limit = input.limit ?? 1000;
      if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) {
        throw new RangeError("afterSequence must be an integer >= -1.");
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
        throw new RangeError("limit must be an integer between 1 and 10000.");
      }
      const result = await pool.query<{ entry: SignalAuditLedgerEntry }>(
        "SELECT entry FROM signal_audit_entries WHERE sequence > $1 ORDER BY sequence ASC LIMIT $2",
        [afterSequence, limit],
      );
      return result.rows.map((row) => row.entry);
    },

    async appendCheckpoint(checkpoint) {
      if (
        checkpoint.version !== 1 || !checkpoint.keyId.trim() ||
        !Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < -1 ||
        !HASH_PATTERN.test(checkpoint.chainHeadHash) ||
        !Number.isFinite(Date.parse(checkpoint.createdAt)) ||
        !checkpoint.signature ||
        !options.verifyCheckpoint(checkpoint)
      ) {
        throw new Error("Invalid signed audit checkpoint.");
      }
      const latest = await pool.query<{ sequence: string; entry_hash: string }>(
        "SELECT sequence::text, entry_hash FROM signal_audit_entries ORDER BY sequence DESC LIMIT 1",
      );
      if (checkpoint.sequence === -1) {
        if (latest.rows.length > 0 || checkpoint.chainHeadHash !== GENESIS_HASH) {
          throw new Error("Empty-chain checkpoint does not match the persisted audit ledger.");
        }
      } else {
        const anchor = await pool.query<{ entry_hash: string }>(
          "SELECT entry_hash FROM signal_audit_entries WHERE sequence = $1",
          [checkpoint.sequence],
        );
        if (anchor.rows[0]?.entry_hash.trim() !== checkpoint.chainHeadHash) {
          throw new Error("Checkpoint does not match a persisted audit chain head.");
        }
      }
      await pool.query(
        `INSERT INTO signal_audit_checkpoints
          (version, key_id, sequence, chain_head_hash, created_at, signature)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [checkpoint.version, checkpoint.keyId, checkpoint.sequence,
          checkpoint.chainHeadHash, checkpoint.createdAt, checkpoint.signature],
      );
    },

    async latestCheckpoint() {
      const result = await pool.query<{
        version: number; key_id: string; sequence: string;
        chain_head_hash: string; created_at: Date; signature: string;
      }>(
        `SELECT version, key_id, sequence::text, chain_head_hash, created_at, signature
         FROM signal_audit_checkpoints
         ORDER BY sequence DESC, stored_at DESC LIMIT 1`,
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        version: 1,
        keyId: row.key_id,
        sequence: Number(row.sequence),
        chainHeadHash: row.chain_head_hash.trim(),
        createdAt: new Date(row.created_at).toISOString(),
        signature: row.signature,
      };
    },

    async close() { await pool.end(); },
  };
}
