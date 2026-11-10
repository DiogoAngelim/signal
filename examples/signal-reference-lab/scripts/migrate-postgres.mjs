import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required. Start the local PostgreSQL service and set DATABASE_URL before migrating.");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const migrationDirectory = resolve(root, "api/idempotency-postgres/src/drizzle/migrations");
const pool = new Pool({ connectionString, application_name: "signal-reference-lab-migrations" });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS signal_reference_lab_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\\d+_.*\\.sql$/.test(name))
    .sort();

  for (const name of migrations) {
    const existing = await pool.query(
      "SELECT 1 FROM signal_reference_lab_migrations WHERE name = $1",
      [name],
    );
    if (existing.rowCount) {
      console.log(`skip ${name} (already applied)`);
      continue;
    }

    const sql = await readFile(resolve(migrationDirectory, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO signal_reference_lab_migrations (name) VALUES ($1)",
        [name],
      );
      await client.query("COMMIT");
      console.log(`applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(`Applied ${migrations.length} Signal PostgreSQL migration files.`);
} finally {
  await pool.end();
}
