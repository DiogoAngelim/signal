import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, rm } from "node:fs/promises";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(rootDir, "../lib/stocks-optimizer/public");
const targetDir = path.resolve(rootDir, "stocks-public");

await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });

