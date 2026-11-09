import type { SignalErrorEnvelope, SignalResultMeta } from "@signal/protocol";
import type {
  IdempotencyRecord,
  IdempotencyReservation,
  StoragePort,
} from "@signal/ports";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { signalIdempotencyRecords } from "./drizzle/schema";

export interface CreateSignalPostgresIdempotencyStoreOptions {
  connectionString: string;
}

function toRecord(
  row: typeof signalIdempotencyRecords.$inferSelect,
): IdempotencyRecord {
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
    reservationToken: row.reservationToken ?? undefined,
    reservationExpiresAt: row.reservationExpiresAt?.toISOString(),
  };
}

export function createPostgresIdempotencyStore(
  options: CreateSignalPostgresIdempotencyStoreOptions,
): StoragePort {
  const pool = new Pool({ connectionString: options.connectionString });
  const db = drizzle(pool);

  return {
    async reserve(input): Promise<IdempotencyReservation> {
      const leaseMs = input.leaseMs ?? 300_000;
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 86_400_000) {
        throw new RangeError("Idempotency reservation lease must be between 1000 and 86400000 milliseconds.");
      }
      const now = new Date();
      const reservationToken = randomUUID();
      const reservationExpiresAt = new Date(now.getTime() + leaseMs);
      const inserted = await db
        .insert(signalIdempotencyRecords)
        .values({
          operationName: input.operationName,
          idempotencyKey: input.idempotencyKey,
          payloadFingerprint: input.payloadFingerprint,
          status: "pending",
          reservationToken,
          reservationExpiresAt,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { state: "reserved", record: toRecord(inserted[0]) };

      const reclaimed = await db
        .update(signalIdempotencyRecords)
        .set({
          reservationToken,
          reservationExpiresAt,
          updatedAt: now,
        })
        .where(and(
          eq(signalIdempotencyRecords.operationName, input.operationName),
          eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
          eq(signalIdempotencyRecords.payloadFingerprint, input.payloadFingerprint),
          eq(signalIdempotencyRecords.status, "pending"),
          lte(signalIdempotencyRecords.reservationExpiresAt, now),
        ))
        .returning();
      if (reclaimed[0]) return { state: "reserved", record: toRecord(reclaimed[0]) };

      const existing = await db
        .select()
        .from(signalIdempotencyRecords)
        .where(and(
          eq(signalIdempotencyRecords.operationName, input.operationName),
          eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
        ))
        .limit(1);
      if (!existing[0]) return { state: "inflight" };
      const record = toRecord(existing[0]);
      if (record.payloadFingerprint !== input.payloadFingerprint) return { state: "conflict", record };
      return record.status === "pending" ? { state: "inflight", record } : { state: "replayed", record };
    },
    async renewReservation(input): Promise<boolean> {
      if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 86_400_000) {
        throw new RangeError("Idempotency reservation lease must be between 1000 and 86400000 milliseconds.");
      }
      const now = new Date();
      const renewed = await db
        .update(signalIdempotencyRecords)
        .set({ reservationExpiresAt: new Date(now.getTime() + input.leaseMs), updatedAt: now })
        .where(and(
          eq(signalIdempotencyRecords.operationName, input.operationName),
          eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
          eq(signalIdempotencyRecords.payloadFingerprint, input.payloadFingerprint),
          eq(signalIdempotencyRecords.reservationToken, input.reservationToken),
          eq(signalIdempotencyRecords.status, "pending"),
          gt(signalIdempotencyRecords.reservationExpiresAt, now),
        ))
        .returning({ operationName: signalIdempotencyRecords.operationName });
      return renewed.length === 1;
    },
    async complete(input): Promise<void> {
      const updated = await db
        .update(signalIdempotencyRecords)
        .set({
          status: "completed",
          result: input.result as unknown,
          resultMeta: input.resultMeta as unknown,
          messageId: input.messageId ?? null,
          updatedAt: new Date(),
          reservationToken: null,
          reservationExpiresAt: null,
        })
        .where(and(
          eq(signalIdempotencyRecords.operationName, input.operationName),
          eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
          eq(signalIdempotencyRecords.payloadFingerprint, input.payloadFingerprint),
          eq(signalIdempotencyRecords.reservationToken, input.reservationToken),
          eq(signalIdempotencyRecords.status, "pending"),
          gt(signalIdempotencyRecords.reservationExpiresAt, new Date()),
        ))
        .returning({ operationName: signalIdempotencyRecords.operationName });
      if (updated.length !== 1) throw new Error("Idempotency reservation is missing, expired, or fenced.");
    },
    async fail(input): Promise<void> {
      const updated = await db
        .update(signalIdempotencyRecords)
        .set({
          status: "failed",
          error: input.error as unknown,
          updatedAt: new Date(),
          reservationToken: null,
          reservationExpiresAt: null,
        })
        .where(and(
          eq(signalIdempotencyRecords.operationName, input.operationName),
          eq(signalIdempotencyRecords.idempotencyKey, input.idempotencyKey),
          eq(signalIdempotencyRecords.payloadFingerprint, input.payloadFingerprint),
          eq(signalIdempotencyRecords.reservationToken, input.reservationToken),
          eq(signalIdempotencyRecords.status, "pending"),
          gt(signalIdempotencyRecords.reservationExpiresAt, new Date()),
        ))
        .returning({ operationName: signalIdempotencyRecords.operationName });
      if (updated.length !== 1) throw new Error("Cannot fail an expired or fenced idempotency reservation.");
    },
  };
}
