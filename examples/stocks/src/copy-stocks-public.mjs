import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(rootDir, "../lib/stocks-optimizer/public");
const targetDir = path.resolve(rootDir, "stocks-public");

if (existsSync(sourceDir)) {
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
} else if (!existsSync(targetDir)) {
  throw new Error(
    `Unable to prepare stocks-public: neither ${sourceDir} nor ${targetDir} exists.`
  );
}
