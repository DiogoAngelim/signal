import type { ReplayEvidencePort, ReplayEvidenceRecord } from "@signal/ports";
import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";

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

function fingerprintJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!tenantId.trim()) throw new Error("tenantId is required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction-local GUC is consumed by PostgreSQL row-level security.
    await client.query("SELECT set_config('signal.tenant_id', $1, true)", [tenantId]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    client.release();
  }
}

export interface CreatePostgresReplayEvidenceStoreOptions {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly applicationName?: string;
}

/**
 * Immutable, tenant-scoped PostgreSQL persistence for content-addressed replay
 * evidence. Apply migration 0006. Every read/write sets a transaction-local
 * tenant identity that is enforced by PostgreSQL row-level security.
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
        !record.tenantId.trim() ||
        !record.executionId.trim() ||
        !record.operationName.trim() ||
        !record.operationVersion.trim() ||
        !/^[a-f0-9]{64}$/.test(record.handlerArtifactDigest) ||
        !record.policyVersion.trim() ||
        !/^[a-f0-9]{64}$/.test(record.inputFingerprint) ||
        !/^[a-f0-9]{64}$/.test(record.resultFingerprint) ||
        !Number.isFinite(Date.parse(record.capturedAt)) ||
        fingerprintJson(record.canonicalInput) !== record.inputFingerprint ||
        fingerprintJson(record.result) !== record.resultFingerprint ||
        record.externalReads.some((read) =>
          !/^[a-f0-9]{64}$/.test(read.valueFingerprint) ||
          fingerprintJson(read.value) !== read.valueFingerprint ||
          !Number.isFinite(Date.parse(read.observedAt)),
        )
      ) {
        throw new Error("Invalid replay evidence record or content fingerprint.");
      }

      await withTenant(pool, record.tenantId, async (client) => {
        const inserted = await client.query(
          `INSERT INTO signal_replay_evidence
            (tenant_id, execution_id, operation_name, operation_version,
             handler_artifact_digest, policy_version, record, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
           ON CONFLICT (tenant_id, execution_id) DO NOTHING`,
          [
            record.tenantId,
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

        const existing = await client.query<{ record: ReplayEvidenceRecord }>(
          "SELECT record FROM signal_replay_evidence WHERE tenant_id = $1 AND execution_id = $2",
          [record.tenantId, record.executionId],
        );
        if (!existing.rows[0] || stableJson(existing.rows[0].record) !== stableJson(record)) {
          throw new Error("Replay evidence execution ID already exists with different content.");
        }
      });
    },

    async get(input): Promise<ReplayEvidenceRecord | null> {
      if (!input.executionId.trim()) throw new Error("executionId is required.");
      return withTenant(pool, input.tenantId, async (client) => {
        const result = await client.query<{ record: ReplayEvidenceRecord }>(
          "SELECT record FROM signal_replay_evidence WHERE tenant_id = $1 AND execution_id = $2",
          [input.tenantId, input.executionId],
        );
        return result.rows[0]?.record ?? null;
      });
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
