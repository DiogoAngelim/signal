import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const root = path.resolve(new URL("..", import.meta.url).pathname);
const migrationsDir = path.join(root, "migrations");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run signal API migrations.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const migrations = await loadMigrations();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signal_schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const migration of migrations) {
    const existing = await pool.query(
      "SELECT checksum FROM signal_schema_migrations WHERE version = $1",
      [migration.version],
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== migration.checksum) {
        throw new Error(`Migration checksum drift detected for ${migration.version}.`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO signal_schema_migrations (version, checksum) VALUES ($1, $2)",
        [migration.version, migration.checksum],
      );
      await client.query("COMMIT");
      console.log(`applied ${migration.version}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}

async function loadMigrations() {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  return Promise.all(files.map(async (file) => {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    return {
      version: file.replace(/\.sql$/, ""),
      sql,
      checksum: crypto.createHash("sha256").update(sql).digest("hex"),
    };
  }));
}
