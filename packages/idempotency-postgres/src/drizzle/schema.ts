import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const signalIdempotencyStatus = pgEnum("signal_idempotency_status", [
  "pending",
  "completed",
  "failed",
]);

export const signalIdempotencyRecords = pgTable(
  "signal_idempotency_records",
  {
    operationName: text("operation_name").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadFingerprint: text("payload_fingerprint").notNull(),
    status: signalIdempotencyStatus("status").notNull().default("pending"),
    result: jsonb("result"),
    error: jsonb("error"),
    messageId: text("message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueOperationKey: uniqueIndex("signal_idempotency_operation_key").on(
      table.operationName,
      table.idempotencyKey
    ),
  })
);
