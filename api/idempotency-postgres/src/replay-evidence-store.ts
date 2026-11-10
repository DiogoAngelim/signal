import type { ReplayEvidencePort, ReplayEvidenceRecord } from "@signal/ports";
import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Replay evidence requires finite JSON numbers.");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Replay evidence supports plain JSON objects only.");
    }
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !("value" in descriptor) || descriptor.value === undefined) {
        throw new TypeError("Replay evidence does not support accessors or undefined values.");
      }
      return JSON.stringify(key) + ":" + stableJson(descriptor.value);
    }).join(",") + "}";
  }
  throw new TypeError("Replay evidence contains a non-JSON value.");
}

function fingerprintJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isValidRecord(value: unknown): value is ReplayEvidenceRecord {
  try {
    if (typeof value !== "object" || value === null) return false;
    const record = value as ReplayEvidenceRecord;
    if (
      record.schemaVersion !== 1 ||
      !isNonEmptyString(record.tenantId) ||
      !isNonEmptyString(record.executionId) ||
      !isNonEmptyString(record.operationName) ||
      !isNonEmptyString(record.operationVersion) ||
      !isDigest(record.handlerArtifactDigest) ||
      !isNonEmptyString(record.policyVersion) ||
      !isDigest(record.inputFingerprint) ||
      !isDigest(record.resultFingerprint) ||
      !isDigest(record.recordFingerprint) ||
      typeof record.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(record.capturedAt)) ||
      !Array.isArray(record.externalReads) ||
      fingerprintJson(record.canonicalInput) !== record.inputFingerprint ||
      fingerprintJson(record.result) !== record.resultFingerprint
    ) return false;

    const keys = new Set<string>();
    for (const read of record.externalReads) {
      if (
        typeof read !== "object" || read === null ||
        !isNonEmptyString(read.key) ||
        keys.has(read.key) ||
        !isDigest(read.valueFingerprint) ||
        typeof read.observedAt !== "string" ||
        !Number.isFinite(Date.parse(read.observedAt)) ||
        fingerprintJson(read.value) !== read.valueFingerprint
      ) return false;
      keys.add(read.key);
    }
    const { recordFingerprint, ...unsignedRecord } = record;
    return fingerprintJson(unsignedRecord) === recordFingerprint;
  } catch {
    return false;
  }
}

async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!isNonEmptyString(tenantId)) throw new Error("tenantId is required.");
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
      if (!isValidRecord(record)) {
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

        const existing = await client.query<{ record: unknown }>(
          "SELECT record FROM signal_replay_evidence WHERE tenant_id = $1 AND execution_id = $2",
          [record.tenantId, record.executionId],
        );
        if (
          !existing.rows[0] ||
          !isValidRecord(existing.rows[0].record) ||
          stableJson(existing.rows[0].record) !== stableJson(record)
        ) {
          throw new Error("Replay evidence execution ID already exists with different or invalid content.");
        }
      });
    },

    async get(input): Promise<ReplayEvidenceRecord | null> {
      if (!isNonEmptyString(input.executionId)) throw new Error("executionId is required.");
      return withTenant(pool, input.tenantId, async (client) => {
        const result = await client.query<{ record: unknown }>(
          "SELECT record FROM signal_replay_evidence WHERE tenant_id = $1 AND execution_id = $2",
          [input.tenantId, input.executionId],
        );
        const record = result.rows[0]?.record;
        if (record === undefined) return null;
        if (!isValidRecord(record) || record.tenantId !== input.tenantId || record.executionId !== input.executionId) {
          throw new Error("Persisted replay evidence failed tenant, schema, or content-integrity verification.");
        }
        return record;
      });
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
