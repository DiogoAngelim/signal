import type {
  IdempotencyRecord,
  IdempotencyReservation,
  StoragePort,
} from "@signal/ports";
import type { SignalErrorEnvelope, SignalResultMeta } from "@signal/protocol";

export function createMemoryIdempotencyStore(): StoragePort {
  const records = new Map<string, IdempotencyRecord>();

  // Encode the tuple rather than concatenating delimiters: both components
  // are caller-controlled strings and must retain unambiguous boundaries.
  const keyFor = (operationName: string, idempotencyKey: string) =>
    JSON.stringify([operationName, idempotencyKey]);

  return {
    async reserve(input): Promise<IdempotencyReservation> {
      const key = keyFor(input.operationName, input.idempotencyKey);
      const existing = records.get(key);

      if (existing) {
        if (existing.payloadFingerprint !== input.payloadFingerprint) {
          return { state: "conflict", record: existing };
        }

        if (existing.status === "pending") {
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
      };
      records.set(key, record);
      return { state: "reserved", record };
    },
    async complete(input): Promise<void> {
      const record = records.get(
        keyFor(input.operationName, input.idempotencyKey),
      );
      if (!record || record.payloadFingerprint !== input.payloadFingerprint) {
        return;
      }

      record.status = "completed";
      record.result = input.result;
      record.resultMeta = input.resultMeta;
      record.messageId = input.messageId;
      record.updatedAt = new Date().toISOString();
    },
    async fail(input): Promise<void> {
      const record = records.get(
        keyFor(input.operationName, input.idempotencyKey),
      );
      if (!record || record.payloadFingerprint !== input.payloadFingerprint) {
        return;
      }

      record.status = "failed";
      record.error = input.error as SignalErrorEnvelope;
      record.updatedAt = new Date().toISOString();
    },
  };
}
