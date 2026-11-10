import type { ReplayEvidencePort, ReplayEvidenceRecord } from "@signal/ports";
import { Pool } from "pg";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Replay evidence must contain JSON values only.");
    return encoded;
  }
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
}

export interface CreatePostgresReplayEvidenceStoreOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly applicationName?: string;
}

/**
 * Immutable PostgreSQL persistence for content-addressed replay evidence.
 * Apply migration 0006 after audit-ledger migration 0005. The application
 * database role should have INSERT/SELECT only; this store never updates rows.
 */
export function createPostgresReplayEvidenceStore(
  options: CreatePostgresReplayEvidenceStoreOptions,
): ReplayEvidencePort & { close(): Promise<void> } {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 5,
    application_name: options.applicationName ?? "signal-replay-evidence",
  });

  return {
    async save(record: ReplayEvidenceRecord): Promise<void> {
      if (
        record.schemaVersion !== 1 ||
        !record.executionId.trim() ||
        !record.operationName.trim() ||
        !record.operationVersion.trim() ||
        !/^[a-f0-9]{64}$/.test(record.handlerArtifactDigest) ||
        !record.policyVersion.trim() ||
        !/^[a-f0-9]{64}$/.test(record.inputFingerprint) ||
        !/^[a-f0-9]{64}$/.test(record.resultFingerprint) ||
        !Number.isFinite(Date.parse(record.capturedAt))
      ) {
        throw new Error("Invalid replay evidence record.");
      }
      const inserted = await pool.query(
        `INSERT INTO signal_replay_evidence
          (execution_id, operation_name, operation_version, handler_artifact_digest,
           policy_version, record, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (execution_id) DO NOTHING`,
        [
          record.executionId,
          record.operationName,
          record.operationVersion,
          record.handlerArtifactDigest,
          record.policyVersion,
          JSON.stringify(record),
          record.capturedAt,
        ],
      );
      if (inserted.rowCount === 1) return;

      const existing = await pool.query<{ record: ReplayEvidenceRecord }>(
        "SELECT record FROM signal_replay_evidence WHERE execution_id = $1",
        [record.executionId],
      );
      if (!existing.rows[0] || stableJson(existing.rows[0].record) !== stableJson(record)) {
        throw new Error("Replay evidence execution ID already exists with different content.");
      }
    },

    async get(executionId: string): Promise<ReplayEvidenceRecord | null> {
      if (!executionId.trim()) throw new Error("executionId is required.");
      const result = await pool.query<{ record: ReplayEvidenceRecord }>(
        "SELECT record FROM signal_replay_evidence WHERE execution_id = $1",
        [executionId],
      );
      return result.rows[0]?.record ?? null;
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
