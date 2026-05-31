import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to check Signal decision-memory tables.");
  process.exit(1);
}

const expectedTables = [
  "signal_reality_snapshots",
  "signal_decision_records",
  "signal_outcomes",
  "signal_replay_snapshots",
  "signal_calibration_history",
  "signal_trust_history",
  "signal_memory_summaries",
  "signal_retention_jobs",
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  max: 1,
  allowExitOnIdle: true,
});

try {
  const result = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
    `,
    [expectedTables],
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = expectedTables.filter((table) => !found.has(table));
  if (missing.length) {
    console.error(`Missing Signal decision-memory tables: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("All Signal decision-memory tables exist.");
  }
} finally {
  await pool.end();
}

function shouldUseSsl(connectionString) {
  return /sslmode=require/i.test(connectionString) || /\.neon\.tech\//i.test(connectionString);
}
