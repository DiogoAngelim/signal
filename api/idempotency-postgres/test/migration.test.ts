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
});
