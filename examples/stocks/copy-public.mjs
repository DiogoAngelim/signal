import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(rootDir, "src", "artifacts", "signal-markets", "dist", "public");
const targetDir = path.resolve(rootDir, "public");

if (!existsSync(sourceDir)) {
  throw new Error(`Unable to prepare public output: ${sourceDir} does not exist.`);
}

await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });
