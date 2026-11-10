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

  it("creates immutable replay evidence storage", () => {
    const sql = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0006_immutable_replay_evidence.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS signal_replay_evidence");
    expect(sql).toContain("handler_artifact_digest");
    expect(sql).toContain("operation_version");
    expect(sql).toContain("signal_replay_evidence_no_update_delete");
    expect(sql).toContain("signal_replay_evidence_no_truncate");
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE");
  });

  it("creates append-only audit entries and signed checkpoint storage", () => {
    const sql = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0005_append_only_audit_ledger.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS signal_audit_entries");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS signal_audit_checkpoints");
    expect(sql).toContain("signal_audit_entries_no_update_delete");
    expect(sql).toContain("signal_audit_entries_no_truncate");
    expect(sql).toContain("signal_audit_checkpoints_no_update_delete");
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE");
  });

  it("creates durable cross-process circuit breaker state with fenced probe leases", () => {
    const sql = readFileSync(
      join(__dirname, "../src/drizzle/migrations/0004_distributed_circuit_breakers.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS signal_circuit_breakers");
    expect(sql).toContain("probe_token uuid");
    expect(sql).toContain("probe_expires_at timestamptz");
    expect(sql).toContain("probe_lease_ms integer NOT NULL");
    expect(sql).toContain("signal_circuit_breaker_probe_consistency");
    expect(sql).toContain("signal_circuit_breakers_open_due");
  });

});

