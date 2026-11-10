import type { EventPort, OutboxPort, OutboxRecord } from "@signal/ports";
import { randomUUID } from "node:crypto";

export interface DispatchOutboxOptions {
  workerId?: string;
  limit?: number;
  leaseMs?: number;
  maxAttempts?: number;
  now?: () => number;
}

/**
 * Dispatch one bounded outbox batch. Delivery is at-least-once: a process can
 * crash after a subscriber side effect but before acknowledgement. Consumers
 * must deduplicate by envelope.messageId before performing non-idempotent work.
 */
export async function dispatchOutboxBatch(
  outbox: OutboxPort,
  eventPort: EventPort,
  options: DispatchOutboxOptions = {},
): Promise<{
  claimed: number;
  delivered: number;
  scheduled: number;
  deadLettered: number;
  leaseLost: number;
}> {
  const workerId = options.workerId ?? randomUUID();
  const limit = options.limit ?? 50;
  const leaseMs = options.leaseMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 12;
  const now = options.now ?? Date.now;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("limit must be an integer between 1 and 1000.");
  }
  if (!Number.isFinite(leaseMs) || leaseMs < 1000) {
    throw new RangeError("leaseMs must be at least 1000 milliseconds.");
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive safe integer.");
  }

  const records = await outbox.claimBatch({ workerId, limit, leaseMs });
  const result = {
    claimed: records.length,
    delivered: 0,
    scheduled: 0,
    deadLettered: 0,
    leaseLost: 0,
  };

  const active = new Map(records.map((record) => [record.id, record]));
  const lost = new Set<string>();
  let renewalInFlight: Promise<void> | undefined;
  const renewActiveLeases = async () => {
    if (renewalInFlight) return renewalInFlight;
    renewalInFlight = Promise.all([...active.entries()].map(async ([id, record]) => {
      if (!active.has(id)) return;
      try {
        const renewed = await outbox.renewLease({
          id, workerId, leaseToken: record.leaseToken, leaseMs,
        });
        if (!renewed && active.has(id)) {
          lost.add(id);
          active.delete(id);
        }
      } catch {
        // Ownership is uncertain after a renewal error; do not finalize it.
        if (active.has(id)) {
          lost.add(id);
          active.delete(id);
        }
      }
    })).then(() => undefined);
    await renewalInFlight;
    renewalInFlight = undefined;
  };
  // Keep every unprocessed claim alive, not only the record currently dispatched.
  const heartbeat = setInterval(() => { void renewActiveLeases(); }, Math.max(250, Math.floor(leaseMs / 3)));

  try {
    for (const record of records) {
      if (lost.has(record.id) || !active.has(record.id)) {
        result.leaseLost += 1;
        continue;
      }
      try {
        await eventPort.dispatch(record.envelope);
        if (renewalInFlight) await renewalInFlight;
        if (lost.has(record.id) || !active.has(record.id)) {
          result.leaseLost += 1;
          continue;
        }
        const acknowledged = await outbox.acknowledge({
          id: record.id,
          workerId,
          leaseToken: record.leaseToken,
        });
        active.delete(record.id);
        if (acknowledged) result.delivered += 1;
        else result.leaseLost += 1;
      } catch (error) {
        if (renewalInFlight) await renewalInFlight;
        if (lost.has(record.id) || !active.has(record.id)) {
          result.leaseLost += 1;
          continue;
        }
        const attempts = Math.max(1, record.attempts);
        const delayMs = Math.min(300_000, 1000 * 2 ** Math.min(attempts - 1, 8));
        const retry = await outbox.retry({
          id: record.id,
          workerId,
          leaseToken: record.leaseToken,
          availableAt: new Date(now() + delayMs).toISOString(),
          error: error instanceof Error ? error.message : String(error),
          maxAttempts,
        });
        active.delete(record.id);
        if (retry === "scheduled") result.scheduled += 1;
        else if (retry === "dead-lettered") result.deadLettered += 1;
        else result.leaseLost += 1;
      }
    }
  } finally {
    clearInterval(heartbeat);
    if (renewalInFlight) await renewalInFlight;
  }

  return result;
}

export function isOutboxPort(value: unknown): value is OutboxPort {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OutboxPort>;
  return (
    typeof candidate.getStats === "function" &&
    typeof candidate.claimBatch === "function" &&
    typeof candidate.renewLease === "function" &&
    typeof candidate.acknowledge === "function" &&
    typeof candidate.retry === "function"
  );
}

export function isOutboxRecord(value: unknown): value is OutboxRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OutboxRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.attempts === "number" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.leaseToken === "string" &&
    !!candidate.envelope &&
    typeof candidate.envelope.messageId === "string"
  );
}
