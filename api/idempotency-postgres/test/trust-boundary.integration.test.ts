import { randomUUID, createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!connectionString);

integration("distributed coordination and audit trust-boundary simulations", () => {
  const pool = new Pool({ connectionString, max: 8 });

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signal_simulation_breakers (
        breaker_key text PRIMARY KEY,
        state text NOT NULL CHECK (state IN ('closed', 'open', 'half-open')),
        open_until timestamptz,
        probe_token text,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("serializes a distributed half-open probe and fences stale probe owners", async () => {
    const key = "breaker-" + randomUUID();
    await pool.query(
      "INSERT INTO signal_simulation_breakers (breaker_key, state, open_until) VALUES ($1, 'open', now() - interval '1 second')",
      [key],
    );

    const acquire = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          "SELECT state, open_until, probe_token FROM signal_simulation_breakers WHERE breaker_key = $1 FOR UPDATE",
          [key],
        );
        const row = current.rows[0];
        if (!row || row.state !== "open" || new Date(row.open_until).getTime() > Date.now()) {
          await client.query("ROLLBACK");
          return null;
        }
        const token = randomUUID();
        await client.query(
          "UPDATE signal_simulation_breakers SET state = 'half-open', probe_token = $2, updated_at = now() WHERE breaker_key = $1",
          [key, token],
        );
        await client.query("COMMIT");
        return token;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };

    const probes = await Promise.all([acquire(), acquire(), acquire(), acquire()]);
    const acquired = probes.filter((token): token is string => token !== null);
    expect(acquired).toHaveLength(1);

    const staleToken = randomUUID();
    const staleCompletion = await pool.query(
      "UPDATE signal_simulation_breakers SET state = 'closed', probe_token = NULL WHERE breaker_key = $1 AND state = 'half-open' AND probe_token = $2",
      [key, staleToken],
    );
    expect(staleCompletion.rowCount).toBe(0);

    const validCompletion = await pool.query(
      "UPDATE signal_simulation_breakers SET state = 'closed', probe_token = NULL WHERE breaker_key = $1 AND state = 'half-open' AND probe_token = $2",
      [key, acquired[0]],
    );
    expect(validCompletion.rowCount).toBe(1);
  });

  it("detects checkpoint tampering and verifies a controlled signing-key rotation", () => {
    const oldKeys = generateKeyPairSync("ed25519");
    const newKeys = generateKeyPairSync("ed25519");
    const checkpoint = {
      sequence: 42,
      previousHash: "a".repeat(64),
      auditRoot: createHash("sha256").update("immutable-audit-prefix").digest("hex"),
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const canonical = Buffer.from(JSON.stringify(checkpoint));
    const oldSignature = sign(null, canonical, oldKeys.privateKey);
    const newSignature = sign(null, canonical, newKeys.privateKey);

    // Rotation window: trust both old and new public keys, then retire the old key.
    const rotationTrustSet = [oldKeys.publicKey, newKeys.publicKey];
    expect(rotationTrustSet.some((key) => verify(null, canonical, key, oldSignature))).toBe(true);
    expect(rotationTrustSet.some((key) => verify(null, canonical, key, newSignature))).toBe(true);

    const tampered = Buffer.from(JSON.stringify({ ...checkpoint, auditRoot: "0".repeat(64) }));
    expect(rotationTrustSet.some((key) => verify(null, tampered, key, oldSignature))).toBe(false);
    expect(verify(null, canonical, newKeys.publicKey, oldSignature)).toBe(false);
    expect(verify(null, canonical, newKeys.publicKey, newSignature)).toBe(true);
  });
});
