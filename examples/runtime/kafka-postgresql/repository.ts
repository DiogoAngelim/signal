import { createProtocolError } from "@signal/protocol";
import type { Pool } from "pg";
import type {
  PaymentCaptureInput,
  PaymentCaptureLogEntry,
  PaymentCaptureLogResult,
  PaymentCapturedEvent,
  PaymentStatusResult,
} from "./schemas";

export interface PaymentRecord {
  paymentId: string;
  amount: number;
  currency: string;
  status: "authorized" | "captured";
  capturedAt: string | null;
  captureAttempts: number;
}

export interface PaymentCaptureRepository {
  ensureSchema(): Promise<void>;
  seedPayment(input: {
    paymentId: string;
    amount: number;
    currency: string;
  }): Promise<void>;
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  capturePayment(input: PaymentCaptureInput): Promise<PaymentStatusResult>;
  recordCaptureLog(event: PaymentCapturedEvent, messageId: string): Promise<boolean>;
  listCaptureLog(paymentId: string): Promise<PaymentCaptureLogResult>;
}

interface SqlClient {
  query(text: string, values?: readonly unknown[]): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount: number;
  }>;
  release(): void;
}

interface SqlPool {
  connect(): Promise<SqlClient>;
}

function toPaymentRecord(row: Record<string, unknown>): PaymentRecord {
  return {
    paymentId: String(row["payment_id"] ?? row["paymentId"]),
    amount: Number(row["amount"]),
    currency: String(row["currency"]),
    status: row["status"] === "captured" ? "captured" : "authorized",
    capturedAt:
      row["captured_at"] instanceof Date
        ? row["captured_at"].toISOString()
        : row["capturedAt"]
          ? String(row["capturedAt"])
          : null,
    captureAttempts: Number(row["capture_attempts"] ?? row["captureAttempts"] ?? 0),
  };
}

function toLogEntry(row: Record<string, unknown>): PaymentCaptureLogEntry {
  return {
    messageId: String(row["message_id"] ?? row["messageId"]),
    paymentId: String(row["payment_id"] ?? row["paymentId"]),
    amount: Number(row["amount"]),
    currency: String(row["currency"]),
    capturedAt:
      row["captured_at"] instanceof Date
        ? row["captured_at"].toISOString()
        : String(row["capturedAt"]),
  };
}

async function withClient<T>(pool: SqlPool, run: (client: SqlClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

async function withTransaction<T>(
  pool: SqlPool,
  run: (client: SqlClient) => Promise<T>
): Promise<T> {
  return withClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function createMemoryPaymentCaptureRepository(
  seedPayment?: PaymentRecord
): PaymentCaptureRepository {
  const payments = new Map<string, PaymentRecord>();
  const captureLog = new Map<string, PaymentCaptureLogEntry>();

  if (seedPayment) {
    payments.set(seedPayment.paymentId, { ...seedPayment });
  }

  return {
    async ensureSchema(): Promise<void> {
      return;
    },
    async seedPayment(input): Promise<void> {
      if (!payments.has(input.paymentId)) {
        payments.set(input.paymentId, {
          paymentId: input.paymentId,
          amount: input.amount,
          currency: input.currency,
          status: "authorized",
          capturedAt: null,
          captureAttempts: 0,
        });
      }
    },
    async getPayment(paymentId): Promise<PaymentRecord | null> {
      const record = payments.get(paymentId);
      return record ? { ...record } : null;
    },
    async capturePayment(input): Promise<PaymentStatusResult> {
      const payment = payments.get(input.paymentId);
      if (!payment) {
        throw createProtocolError("NOT_FOUND", `Unknown payment ${input.paymentId}`);
      }

      if (payment.amount !== input.amount || payment.currency !== input.currency) {
        throw createProtocolError("CONFLICT", "Capture payload does not match the payment");
      }

      if (payment.status === "captured") {
        return { ...payment };
      }

      payment.status = "captured";
      payment.capturedAt = new Date().toISOString();
      payment.captureAttempts += 1;
      return { ...payment };
    },
    async recordCaptureLog(event, messageId): Promise<boolean> {
      if (captureLog.has(messageId)) {
        return false;
      }

      captureLog.set(messageId, {
        messageId,
        paymentId: event.paymentId,
        amount: event.amount,
        currency: event.currency,
        capturedAt: event.capturedAt,
      });
      return true;
    },
    async listCaptureLog(paymentId): Promise<PaymentCaptureLogResult> {
      return {
        paymentId,
        events: [...captureLog.values()]
          .filter((entry) => entry.paymentId === paymentId)
          .map((entry) => ({ ...entry })),
      };
    },
  };
}

export function createPostgresPaymentCaptureRepository(pool: Pool): PaymentCaptureRepository {
  return {
    async ensureSchema(): Promise<void> {
      await withClient(pool as unknown as SqlPool, async (client) => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS signal_example_payments (
            payment_id text PRIMARY KEY,
            amount numeric NOT NULL,
            currency text NOT NULL,
            status text NOT NULL DEFAULT 'authorized',
            captured_at timestamptz,
            capture_attempts integer NOT NULL DEFAULT 0
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS signal_example_payment_capture_log (
            message_id text PRIMARY KEY,
            payment_id text NOT NULL,
            amount numeric NOT NULL,
            currency text NOT NULL,
            captured_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          )
        `);
      });
    },
    async seedPayment(input): Promise<void> {
      await withClient(pool as unknown as SqlPool, async (client) => {
        await client.query(
          `
            INSERT INTO signal_example_payments (
              payment_id, amount, currency, status, captured_at, capture_attempts
            )
            VALUES ($1, $2, $3, 'authorized', NULL, 0)
            ON CONFLICT (payment_id) DO NOTHING
          `,
          [input.paymentId, input.amount, input.currency]
        );
      });
    },
    async getPayment(paymentId): Promise<PaymentRecord | null> {
      return withClient(pool as unknown as SqlPool, async (client) => {
        const result = await client.query(
          `
            SELECT payment_id, amount, currency, status, captured_at, capture_attempts
            FROM signal_example_payments
            WHERE payment_id = $1
            LIMIT 1
          `,
          [paymentId]
        );

        if (!result.rows[0]) {
          return null;
        }

        return toPaymentRecord(result.rows[0]);
      });
    },
    async capturePayment(input): Promise<PaymentStatusResult> {
      return withTransaction(pool as unknown as SqlPool, async (client) => {
        const result = await client.query(
          `
            SELECT payment_id, amount, currency, status, captured_at, capture_attempts
            FROM signal_example_payments
            WHERE payment_id = $1
            FOR UPDATE
          `,
          [input.paymentId]
        );

        const row = result.rows[0];

        if (!row) {
          throw createProtocolError("NOT_FOUND", `Unknown payment ${input.paymentId}`);
        }

        const payment = toPaymentRecord(row);

        if (payment.amount !== input.amount || payment.currency !== input.currency) {
          throw createProtocolError("CONFLICT", "Capture payload does not match the payment");
        }

        if (payment.status === "captured") {
          return payment;
        }

        const capturedAt = new Date().toISOString();
        const updated = await client.query(
          `
            UPDATE signal_example_payments
            SET status = 'captured',
                captured_at = $2,
                capture_attempts = capture_attempts + 1
            WHERE payment_id = $1
            RETURNING payment_id, amount, currency, status, captured_at, capture_attempts
          `,
          [input.paymentId, capturedAt]
        );

        return toPaymentRecord(updated.rows[0] ?? row);
      });
    },
    async recordCaptureLog(event, messageId): Promise<boolean> {
      return withClient(pool as unknown as SqlPool, async (client) => {
        const result = await client.query(
          `
            INSERT INTO signal_example_payment_capture_log (
              message_id, payment_id, amount, currency, captured_at
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (message_id) DO NOTHING
            RETURNING message_id
          `,
          [messageId, event.paymentId, event.amount, event.currency, event.capturedAt]
        );

        return result.rowCount > 0;
      });
    },
    async listCaptureLog(paymentId): Promise<PaymentCaptureLogResult> {
      return withClient(pool as unknown as SqlPool, async (client) => {
        const result = await client.query(
          `
            SELECT message_id, payment_id, amount, currency, captured_at
            FROM signal_example_payment_capture_log
            WHERE payment_id = $1
            ORDER BY created_at ASC
          `,
          [paymentId]
        );

        return {
          paymentId,
          events: result.rows.map((row) => toLogEntry(row)),
        };
      });
    },
  };
}
