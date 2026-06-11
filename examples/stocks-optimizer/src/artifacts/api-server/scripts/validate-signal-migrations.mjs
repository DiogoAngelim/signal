import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const migrationsDir = path.join(root, "migrations");
const destructivePattern =
  /\b(drop\s+table|drop\s+column|truncate|alter\s+table\s+\S+\s+drop|delete\s+from)\b/i;

const files = (await fs.readdir(migrationsDir))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

if (!files.length) {
  throw new Error("No signal API migrations were found.");
}

let previous = "";
for (const file of files) {
  if (file <= previous) {
    throw new Error(`Migration order is not deterministic near ${file}.`);
  }
  previous = file;

  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  if (
    destructivePattern.test(sql) &&
    process.env.ALLOW_DESTRUCTIVE_MIGRATIONS !== "true"
  ) {
    throw new Error(
      `${file} contains a destructive statement. Set ALLOW_DESTRUCTIVE_MIGRATIONS=true only with an approved rollback plan.`,
    );
  }
}

console.log(`validated ${files.length} signal API migration(s)`);
