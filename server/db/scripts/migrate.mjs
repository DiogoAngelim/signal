import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  "../migrations/0001_signal_decision_memory.sql",
);

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required to run Signal decision-memory migrations.",
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false }
    : undefined,
  max: 1,
  allowExitOnIdle: true,
});

try {
  const sql = await fs.readFile(migrationPath, "utf8");
  await pool.query(sql);
  console.log("Signal decision-memory migrations applied.");
} finally {
  await pool.end();
}

/**
 * @param {string} connectionString
 * @returns {boolean}
 */
function shouldUseSsl(connectionString) {
  return (
    /sslmode=require/i.test(connectionString) ||
    /\.neon\.tech/i.test(connectionString)
  );
}
