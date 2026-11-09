import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const connectionString = process.env.SIGNAL_TEST_DATABASE_URL;
const proxyUrl = process.env.SIGNAL_TOXIPROXY_URL;
const integration = describe.skipIf(!connectionString || !proxyUrl);

async function toxicRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, proxyUrl), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Toxiproxy API ${response.status}: ${body}`);
  return body ? JSON.parse(body) as unknown : undefined;
}

integration("PostgreSQL network fault and recovery simulation", () => {
  const direct = new Pool({ connectionString });
  const proxiedUrl = new URL(connectionString ?? "postgresql://postgres:postgres@localhost:5432/skip");
  proxiedUrl.hostname = "127.0.0.1";
  proxiedUrl.port = "8666";
  const proxied = new Pool({ connectionString: proxiedUrl.toString(), max: 2 });

  beforeAll(async () => {
    try { await toxicRequest("proxies/signal-postgres", { method: "DELETE" }); } catch { /* First run has no proxy to remove. */ }
    await direct.query(`
      CREATE TABLE IF NOT EXISTS signal_network_fault_probe (
        id text PRIMARY KEY,
        value text NOT NULL
      )
    `);
    await toxicRequest("proxies/signal-postgres", {
      method: "POST",
      body: JSON.stringify({
        name: "signal-postgres",
        listen: "0.0.0.0:8666",
        upstream: "postgres:5432",
        enabled: true,
      }),
    });
  });

  afterAll(async () => {
    await proxied.end();
    await direct.end();
  });

  it("rolls back an interrupted transaction and reconnects after network restoration", async () => {
    const id = randomUUID();
    const client = await proxied.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO signal_network_fault_probe (id, value) VALUES ($1, 'must-rollback')",
        [id],
      );

      await toxicRequest("proxies/signal-postgres/toxics", {
        method: "POST",
        body: JSON.stringify({
          name: "interrupt-downstream",
          type: "timeout",
          stream: "downstream",
          toxicity: 1,
          attributes: { timeout: 1 },
        }),
      });

      await expect(client.query("SELECT pg_sleep(0.2)")).rejects.toThrow();
    } finally {
      client.release(true);
    }

    await toxicRequest("proxies/signal-postgres/toxics/interrupt-downstream", { method: "DELETE" });
    await expect(proxied.query("SELECT 1 AS recovered")).resolves.toMatchObject({
      rows: [{ recovered: 1 }],
    });
    const persisted = await direct.query(
      "SELECT count(*)::int AS count FROM signal_network_fault_probe WHERE id = $1",
      [id],
    );
    expect(persisted.rows[0].count).toBe(0);
  });
});
