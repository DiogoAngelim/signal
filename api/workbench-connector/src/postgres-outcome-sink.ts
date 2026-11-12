import { Pool, type PoolClient } from "pg";
import type {
  WorkbenchOutcomeCursor,
  WorkbenchOutcomeSink,
} from "./index";

export interface CreatePostgresWorkbenchOutcomeSinkOptions {
  connectionString: string;
  maxConnections?: number;
  applicationName?: string;
}

type CursorRow = {
  after_at: string | null;
  outcome_id: string | null;
  cash_change_id: string | null;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) =>
      JSON.stringify(key) + ":" + stableJson(record[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

function rowCursor(row: CursorRow | undefined): WorkbenchOutcomeCursor | null {
  if (!row?.after_at || !row.outcome_id || !row.cash_change_id) return null;
  return { after: row.after_at, afterId: row.outcome_id, afterChangeId: row.cash_change_id };
}

function sameCursor(a: WorkbenchOutcomeCursor | null, b: WorkbenchOutcomeCursor | null): boolean {
  return a === null ? b === null : b !== null &&
    a.after === b.after && a.afterId === b.afterId && a.afterChangeId === b.afterChangeId;
}

function compareCursor(a: WorkbenchOutcomeCursor, b: WorkbenchOutcomeCursor): number {
  const left = [a.after, a.afterId, a.afterChangeId];
  const right = [b.after, b.afterId, b.afterChangeId];
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

async function setTenant(client: PoolClient, ownerId: string): Promise<void> {
  await client.query("SELECT set_config('signal.tenant_id', $1, true)", [ownerId]);
}

/**
 * Durable Workbench feedback inbox. Apply migrations/0001 before use.
 * Outcome rows and the pagination cursor commit atomically; duplicate event IDs
 * are accepted only when the complete immutable payload matches.
 */
export function createPostgresWorkbenchOutcomeSink(
  options: CreatePostgresWorkbenchOutcomeSinkOptions,
): WorkbenchOutcomeSink & { close(): Promise<void> } {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 5,
    application_name: options.applicationName ?? "signal-workbench-outcomes",
  });

  return {
    async getCursor(ownerId) {
      if (!ownerId.trim() || ownerId.length > 160) throw new RangeError("ownerId is invalid.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenant(client, ownerId);
        const result = await client.query<CursorRow>(
          "SELECT after_at,outcome_id,cash_change_id FROM signal_workbench_outcome_cursors WHERE tenant_id=$1",
          [ownerId],
        );
        await client.query("COMMIT");
        return rowCursor(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async persistPage(input) {
      if (!input.ownerId.trim() || input.ownerId.length > 160) throw new RangeError("ownerId is invalid.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setTenant(client, input.ownerId);
        await client.query(
          "INSERT INTO signal_workbench_outcome_cursors(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO NOTHING",
          [input.ownerId],
        );
        const currentResult = await client.query<CursorRow>(
          "SELECT after_at,outcome_id,cash_change_id FROM signal_workbench_outcome_cursors WHERE tenant_id=$1 FOR UPDATE",
          [input.ownerId],
        );
        const current = rowCursor(currentResult.rows[0]);
        if (!sameCursor(current, input.previousCursor)) {
          throw new Error("Outcome cursor changed concurrently; reload the durable cursor before retrying.");
        }
        const next = input.nextCursor ?? current;
        if (current && next && compareCursor(next, current) < 0) {
          throw new Error("Outcome cursor cannot move backwards.");
        }

        let accepted = 0;
        let duplicates = 0;
        for (const event of input.events) {
          if (event.currency !== "USD") throw new Error("Only USD outcome events are accepted.");
          const inserted = await client.query(
            "INSERT INTO signal_workbench_outcome_events " +
            "(tenant_id,event_id,outcome_id,opportunity_id,occurred_at,collected_usd,currency,payload) " +
            "VALUES($1,$2,$3,$4,$5,$6::numeric,$7,$8::jsonb) " +
            "ON CONFLICT(tenant_id,event_id) DO NOTHING RETURNING event_id",
            [input.ownerId,event.eventId,event.outcomeId,event.opportunityId,event.occurredAt,event.collectedUsd,event.currency,JSON.stringify(event)],
          );
          if (inserted.rowCount === 1) {
            accepted += 1;
            continue;
          }
          const existing = await client.query<{ payload: unknown }>(
            "SELECT payload FROM signal_workbench_outcome_events WHERE tenant_id=$1 AND event_id=$2",
            [input.ownerId,event.eventId],
          );
          if (!existing.rows[0] || stableJson(existing.rows[0].payload) !== stableJson(event)) {
            throw new Error("A Workbench outcome event ID was reused with a different payload.");
          }
          duplicates += 1;
        }

        await client.query(
          "UPDATE signal_workbench_outcome_cursors " +
          "SET after_at=$2, outcome_id=$3, cash_change_id=$4, updated_at=now() WHERE tenant_id=$1",
          [input.ownerId,next?.after ?? null,next?.afterId ?? null,next?.afterChangeId ?? null],
        );
        await client.query("COMMIT");
        return { accepted, duplicates };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}
