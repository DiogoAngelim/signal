import type {
  SignalErrorEnvelope,
  SignalIdempotencyRecord,
  SignalIdempotencyReservation,
  SignalIdempotencyStore,
} from "./types";

export function createMemoryIdempotencyStore(): SignalIdempotencyStore {
  const records = new Map<string, SignalIdempotencyRecord>();

  const keyFor = (operationName: string, idempotencyKey: string) =>
    `${operationName}:${idempotencyKey}`;

  return {
    async reserve(input): Promise<SignalIdempotencyReservation> {
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

      const record: SignalIdempotencyRecord = {
        operationName: input.operationName,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      records.set(key, record);
      return { state: "reserved", record };
    },
    async complete(input): Promise<void> {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.payloadFingerprint !== input.payloadFingerprint) {
        return;
      }

      record.status = "completed";
      record.result = input.result;
      record.messageId = input.messageId;
      record.updatedAt = new Date().toISOString();
    },
    async fail(input): Promise<void> {
      const record = records.get(keyFor(input.operationName, input.idempotencyKey));
      if (!record || record.payloadFingerprint !== input.payloadFingerprint) {
        return;
      }

      record.status = "failed";
      record.error = input.error as SignalErrorEnvelope;
      record.updatedAt = new Date().toISOString();
    },
  };
}
