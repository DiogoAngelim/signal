import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("postgres idempotency migration", () => {
  it("creates every column used by the drizzle schema", () => {
    const sql = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0000_initial.sql"),
      "utf8",
    );

    expect(sql).toContain("signal_idempotency_records");
    expect(sql).toContain("operation_name text NOT NULL");
    expect(sql).toContain("idempotency_key text NOT NULL");
    expect(sql).toContain("payload_fingerprint text NOT NULL");
    expect(sql).toContain("status signal_idempotency_status NOT NULL");
    expect(sql).toContain("result jsonb");
    expect(sql).toContain("result_meta jsonb");
    expect(sql).toContain("error jsonb");
    expect(sql).toContain("message_id text");
  });

  it("creates a durable leased outbox with bounded retry state", () => {
    const sql = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0001_transactional_outbox.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS signal_outbox");
    expect(sql).toContain("locked_until");
    expect(sql).toContain("dead-letter");
    expect(sql).toContain("signal_outbox_pending_available");
  });
  it("adds expiring fenced idempotency reservations", () => {
    const sql = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0003_idempotency_reservation_leases.sql"),
      "utf8",
    );
    expect(sql).toContain("reservation_token");
    expect(sql).toContain("reservation_expires_at");
    expect(sql).toContain("signal_idempotency_reservation_lease_consistency");
    expect(sql).toContain("signal_idempotency_expired_reservations");
  });

});

