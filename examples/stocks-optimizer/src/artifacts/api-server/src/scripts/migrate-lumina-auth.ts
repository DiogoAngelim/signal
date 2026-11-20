import { getMigrations } from "better-auth/db/migration";
import { getLuminaAuth } from "../lib/lumina-auth.js";

/**
 * Operator-only migration. Run from a controlled release job with DATABASE_URL,
 * BETTER_AUTH_SECRET, and email delivery configured for production. Never
 * perform schema mutations inside a public request handler.
 */
const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(getLuminaAuth().options);
console.info("Lúmina authentication migration:", {
  tables: toBeCreated.map((entry) => entry.table),
  columns: toBeAdded.length,
});
await runMigrations();
console.info("Lúmina authentication schema is ready.");
