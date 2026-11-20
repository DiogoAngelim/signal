import { randomUUID } from "node:crypto";
import type {
  IdempotencyRecord,
  IdempotencyReservation,
  OutboxPort,
  OutboxRecord,
  OutboxStats,
  StoragePort,
  TransactionalStoragePort,
} from "@signal/ports";
import type { SignalEnvelope, SignalErrorEnvelope } from "@signal/protocol";

interface MemoryOutboxItem extends OutboxRecord {
  status: "pending" | "processing" | "delivered" | "dead-letter";
  availableAt: number;
  lockedBy?: string;
  lockedUntil?: number;
  lastError?: string;
}

export function createMemoryIdempotencyStore(): StoragePort &
  TransactionalStoragePort &
  OutboxPort {
  const records = new Map<string, IdempotencyRecord>();
  let reservationSequence = 0;
  const nextReservationToken = () => `memory-reservation-${++reservationSequence}`;
  const outbox = new Map<string, MemoryOutboxItem>();

  const keyFor = (operationName: string, idempotencyKey: string) =>
    JSON.stringify([operationName, idempotencyKey]);

  const complete = async (input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    reservationToken: string;
    result: unknown;
    resultMeta?: import("@signal/protocol").SignalResultMeta;
    messageId?: string;
  }): Promise<void> => {
    const record = records.get(keyFor(input.operationName, input.idempotencyKey));
    if (!record || record.payloadFingerprint !== input.payloadFingerprint || record.status !== "pending" || record.reservationToken !== input.reservationToken || !record.reservationExpiresAt || Date.parse(record.reservationExpiresAt) <= Date.now()) {
      throw new Error("Idempotency reservation is missing, expired, or fenced.");
    }
    record.status = "completed";
    record.result = input.result;
    record.resultMeta = input.resultMeta;
    record.messageId = input.messageId;
    record.updatedAt = new Date().toISOString();
    record.reservationToken = undefined;
    record.reservationExpiresAt = undefined;
  };

  return {
    async getStats(): Promise<OutboxStats> {
      const items = [...outbox.values()];
      const pending = items.filter((item) => item.status === "pending");
      return {
        pending: pending.length,
        processing: items.filter((item) => item.status === "processing").length,
        delivered: items.filter((item) => item.status === "delivered").length,
        deadLettered: items.filter((item) => item.status === "dead-letter").length,
        oldestPendingAgeMs: pending.length === 0
          ? null
          : Math.max(0, Date.now() - Math.min(...pending.map((item) => Date.parse(item.createdAt)))),
      };
    },
    async reserve(input): Promise<IdempotencyReservation> {
      const leaseMs = input.leaseMs ?? 300_000;
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 86_400_000) {
        throw new RangeError("Idempotency reservation lease must be between 1000 and 86400000 milliseconds.");
      }
      const key = keyFor(input.operationName, input.idempotencyKey);
      const existing = records.get(key);
      if (existing) {
        if (existing.payloadFingerprint !== input.payloadFingerprint) return { state: "conflict", record: existing };
        if (existing.status === "pending") {
          if (!existing.reservationExpiresAt || Date.parse(existing.reservationExpiresAt) <= Date.now()) {
            existing.reservationToken = nextReservationToken();
            existing.reservationExpiresAt = new Date(Date.now() + leaseMs).toISOString();
            existing.updatedAt = new Date().toISOString();
            return { state: "reserved", record: existing };
          }
          return { state: "inflight", record: existing };
        }
        return { state: "replayed", record: existing };
      }
      const now = new Date().toISOString();
      const record: IdempotencyRecord = {
        operationName: input.operationName,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        reservationToken: nextReservationToken(),
        reservationExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
      };
      records.set(key, record);
      return { state: "reserved", record };
    },
    async renewReservation(input) {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.status !== "pending" || record.payloadFingerprint !== input.payloadFingerprint ||
          record.reservationToken !== input.reservationToken || !record.reservationExpiresAt ||
          Date.parse(record.reservationExpiresAt) <= Date.now()) return false;
      if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 86_400_000) {
        throw new RangeError("Idempotency reservation lease must be between 1000 and 86400000 milliseconds.");
      }
      record.reservationExpiresAt = new Date(Date.now() + input.leaseMs).toISOString();
      record.updatedAt = new Date().toISOString();
      return true;
    },
    async complete(input) {
      await complete(input);
    },
    async completeWithEvents(input) {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.payloadFingerprint !== input.payloadFingerprint || record.status !== "pending" || record.reservationToken !== input.reservationToken || !record.reservationExpiresAt || Date.parse(record.reservationExpiresAt) <= Date.now()) {
        throw new Error("Idempotency reservation is missing, expired, or fenced.");
      }
      // Stage all records before mutating the idempotency record: no partial
      // in-memory commit can escape if event serialization/validation fails.
      const staged = input.events.map((envelope: SignalEnvelope) => ({
        id: envelope.messageId,
        envelope: structuredClone(envelope),
        attempts: 0,
        createdAt: new Date().toISOString(),
        status: "pending" as const,
        availableAt: Date.now(),
        leaseToken: "",
      }));
      const stagedIds = new Set<string>();
      for (const item of staged) {
        if (stagedIds.has(item.id)) {
          throw new Error(`Duplicate outbox message ID "${item.id}" in one mutation.`);
        }
        stagedIds.add(item.id);
        const existing = outbox.get(item.id);
        if (existing && JSON.stringify(existing.envelope) !== JSON.stringify(item.envelope)) {
          throw new Error(`Outbox message ID "${item.id}" already exists with a different envelope.`);
        }
      }
      await complete(input);
      for (const item of staged) {
        if (!outbox.has(item.id)) outbox.set(item.id, item);
      }
    },
    async fail(input) {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.payloadFingerprint !== input.payloadFingerprint || record.status !== "pending" || record.reservationToken !== input.reservationToken || !record.reservationExpiresAt || Date.parse(record.reservationExpiresAt) <= Date.now()) {
        throw new Error("Cannot fail an expired or fenced idempotency reservation.");
      }
      record.status = "failed";
      record.error = input.error as SignalErrorEnvelope;
      record.updatedAt = new Date().toISOString();
      record.reservationToken = undefined;
      record.reservationExpiresAt = undefined;
    },
    async claimBatch(input) {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000 || !Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1000 || input.leaseMs > 86_400_000) {
        throw new RangeError("Invalid outbox claim bounds.");
      }
      const now = Date.now();
      const eligible = [...outbox.values()]
        .filter((item) => item.status === "pending" && item.availableAt <= now ||
          item.status === "processing" && (item.lockedUntil ?? 0) <= now)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, input.limit);
      for (const item of eligible) {
        item.status = "processing";
        item.lockedBy = input.workerId;
        item.lockedUntil = now + input.leaseMs;
        item.leaseToken = randomUUID();
        item.attempts += 1;
      }
      return eligible.map(({ id, envelope, attempts, createdAt }) => ({
        id, envelope: structuredClone(envelope), attempts, createdAt, leaseToken: outbox.get(id)!.leaseToken,
      }));
    },
    async renewLease(input) {
      if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 86_400_000) {
        throw new RangeError("Outbox lease must be between 1000 and 86400000 milliseconds.");
      }
      const item = outbox.get(input.id);
      if (!item || item.status !== "processing" || item.lockedBy !== input.workerId ||
          item.leaseToken !== input.leaseToken || (item.lockedUntil ?? 0) <= Date.now()) return false;
      item.lockedUntil = Date.now() + input.leaseMs;
      return true;
    },
    async acknowledge(input) {
      const item = outbox.get(input.id);
      if (!item || item.status !== "processing" || item.lockedBy !== input.workerId || item.leaseToken !== input.leaseToken || (item.lockedUntil ?? 0) <= Date.now()) return false;
      item.status = "delivered";
      item.lockedBy = undefined;
      item.lockedUntil = undefined;
      item.leaseToken = "";
      return true;
    },
    async retry(input) {
      const item = outbox.get(input.id);
      if (!item || item.status !== "processing" || item.lockedBy !== input.workerId || item.leaseToken !== input.leaseToken || (item.lockedUntil ?? 0) <= Date.now()) return "lease-lost";
      item.lastError = input.error;
      item.lockedBy = undefined;
      item.lockedUntil = undefined;
      item.leaseToken = "";
      if (item.attempts >= input.maxAttempts) {
        item.status = "dead-letter";
        return "dead-lettered";
      }
      item.status = "pending";
      item.availableAt = Date.parse(input.availableAt);
      return "scheduled";
    },
  };
}
