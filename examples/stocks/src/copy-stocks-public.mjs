import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sourceCandidates = [
  path.resolve(rootDir, "lib/stocks-optimizer/public"),
  path.resolve(rootDir, "../lib/stocks-optimizer/public")
];
const sourceDir = sourceCandidates.find((candidate) => existsSync(candidate));
const targetDir = path.resolve(rootDir, "stocks-public");

if (sourceDir) {
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
} else if (!existsSync(targetDir)) {
  throw new Error(
    `Unable to prepare stocks-public: none of ${sourceCandidates.join(", ")} or ${targetDir} exists.`
  );
}
