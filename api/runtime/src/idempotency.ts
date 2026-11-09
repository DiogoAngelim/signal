import type {
  IdempotencyRecord,
  IdempotencyReservation,
  OutboxPort,
  OutboxRecord,
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
  const outbox = new Map<string, MemoryOutboxItem>();

  const keyFor = (operationName: string, idempotencyKey: string) =>
    JSON.stringify([operationName, idempotencyKey]);

  const complete = async (input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    result: unknown;
    resultMeta?: import("@signal/protocol").SignalResultMeta;
    messageId?: string;
  }): Promise<void> => {
    const record = records.get(keyFor(input.operationName, input.idempotencyKey));
    if (!record || record.payloadFingerprint !== input.payloadFingerprint || record.status !== "pending") {
      return;
    }
    record.status = "completed";
    record.result = input.result;
    record.resultMeta = input.resultMeta;
    record.messageId = input.messageId;
    record.updatedAt = new Date().toISOString();
  };

  return {
    async reserve(input): Promise<IdempotencyReservation> {
      const key = keyFor(input.operationName, input.idempotencyKey);
      const existing = records.get(key);
      if (existing) {
        if (existing.payloadFingerprint !== input.payloadFingerprint) return { state: "conflict", record: existing };
        if (existing.status === "pending") return { state: "inflight", record: existing };
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
      };
      records.set(key, record);
      return { state: "reserved", record };
    },
    async complete(input) {
      await complete(input);
    },
    async completeWithEvents(input) {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.payloadFingerprint !== input.payloadFingerprint || record.status !== "pending") {
        throw new Error("Idempotency reservation is missing, stale, or no longer pending.");
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
      }));
      for (const item of staged) outbox.set(item.id, item);
      await complete(input);
    },
    async fail(input) {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.payloadFingerprint !== input.payloadFingerprint || record.status !== "pending") return;
      record.status = "failed";
      record.error = input.error as SignalErrorEnvelope;
      record.updatedAt = new Date().toISOString();
    },
    async claimBatch(input) {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || !Number.isFinite(input.leaseMs) || input.leaseMs < 1) {
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
        item.attempts += 1;
      }
      return eligible.map(({ id, envelope, attempts, createdAt }) => ({
        id, envelope: structuredClone(envelope), attempts, createdAt,
      }));
    },
    async acknowledge(input) {
      const item = outbox.get(input.id);
      if (!item || item.status !== "processing" || item.lockedBy !== input.workerId) return false;
      item.status = "delivered";
      item.lockedBy = undefined;
      item.lockedUntil = undefined;
      return true;
    },
    async retry(input) {
      const item = outbox.get(input.id);
      if (!item || item.status !== "processing" || item.lockedBy !== input.workerId) return "lease-lost";
      item.lastError = input.error;
      item.lockedBy = undefined;
      item.lockedUntil = undefined;
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
