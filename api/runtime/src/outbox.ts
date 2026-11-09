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

  for (const record of records) {
    try {
      await eventPort.dispatch(record.envelope);
      const acknowledged = await outbox.acknowledge({
        id: record.id,
        workerId,
      });
      if (acknowledged) result.delivered += 1;
      else result.leaseLost += 1;
    } catch (error) {
      const attempts = Math.max(1, record.attempts);
      const delayMs = Math.min(300_000, 1000 * 2 ** Math.min(attempts - 1, 8));
      const retry = await outbox.retry({
        id: record.id,
        workerId,
        availableAt: new Date(now() + delayMs).toISOString(),
        error: error instanceof Error ? error.message : String(error),
        maxAttempts,
      });
      if (retry === "scheduled") result.scheduled += 1;
      else if (retry === "dead-lettered") result.deadLettered += 1;
      else result.leaseLost += 1;
    }
  }

  return result;
}

export function isOutboxPort(value: unknown): value is OutboxPort {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OutboxPort>;
  return (
    typeof candidate.getStats === "function" &&
    typeof candidate.claimBatch === "function" &&
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
    !!candidate.envelope &&
    typeof candidate.envelope.messageId === "string"
  );
}
