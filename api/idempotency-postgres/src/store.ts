import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { SignalErrorEnvelope, SignalResultMeta } from "@signal/protocol";
import type {
  SignalIdempotencyRecord,
  SignalIdempotencyReservation,
  SignalIdempotencyStore,
} from "@signal/runtime";
import { signalIdempotencyRecords } from "./drizzle/schema";

export interface CreateSignalPostgresIdempotencyStoreOptions {
  connectionString: string;
}

function toRecord(row: typeof signalIdempotencyRecords.$inferSelect): SignalIdempotencyRecord {
  return {
    operationName: row.operationName,
    idempotencyKey: row.idempotencyKey,
    payloadFingerprint: row.payloadFingerprint,
    status: row.status,
    result: row.result ?? undefined,
    resultMeta: row.resultMeta
      ? (row.resultMeta as SignalResultMeta)
      : undefined,
    error: row.error ? (row.error as SignalErrorEnvelope) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageId: row.messageId ?? undefined,
  };
}

export function createPostgresIdempotencyStore(
  options: CreateSignalPostgresIdempotencyStoreOptions
): SignalIdempotencyStore {
  const pool = new Pool({ connectionString: options.connectionString });
  const db = drizzle(pool);

  return {
    async reserve(input): Promise<SignalIdempotencyReservation> {
      const existing = await db
        .select()
        .from(signalIdempotencyRecords)
        .where(
          and(
            eq(signalIdempotencyRecords.operationName, input.operationName),
            eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);

      if (existing[0]) {
        const record = toRecord(existing[0]);

        if (record.payloadFingerprint !== input.payloadFingerprint) {
          return { state: "conflict", record };
        }

        if (record.status === "pending") {
          return { state: "inflight", record };
        }

        return { state: "replayed", record };
      }

      try {
        await db.insert(signalIdempotencyRecords).values({
          operationName: input.operationName,
          idempotencyKey: input.idempotencyKey,
          payloadFingerprint: input.payloadFingerprint,
          status: "pending",
        });

        return {
          state: "reserved",
          record: {
            operationName: input.operationName,
            idempotencyKey: input.idempotencyKey,
            payloadFingerprint: input.payloadFingerprint,
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      } catch {
        const retry = await db
          .select()
          .from(signalIdempotencyRecords)
          .where(
            and(
              eq(signalIdempotencyRecords.operationName, input.operationName),
              eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);

        if (!retry[0]) {
          return { state: "inflight" };
        }

        const record = toRecord(retry[0]);

        if (record.payloadFingerprint !== input.payloadFingerprint) {
          return { state: "conflict", record };
        }

        return record.status === "pending"
          ? { state: "inflight", record }
          : { state: "replayed", record };
      }
    },
    async complete(input): Promise<void> {
      await db
        .update(signalIdempotencyRecords)
        .set({
          status: "completed",
          result: input.result as unknown,
          resultMeta: input.resultMeta as unknown,
          /* c8 ignore next */
          messageId: input.messageId ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(signalIdempotencyRecords.operationName, input.operationName),
            eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
            eq(signalIdempotencyRecords.payloadFingerprint, input.payloadFingerprint)
          )
        );
    },
    async fail(input): Promise<void> {
      await db
        .update(signalIdempotencyRecords)
        .set({
          status: "failed",
          error: input.error as unknown,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(signalIdempotencyRecords.operationName, input.operationName),
            eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
            eq(signalIdempotencyRecords.payloadFingerprint, input.payloadFingerprint)
          )
        );
    },
  };
}
