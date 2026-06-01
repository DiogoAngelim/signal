import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..", "..");
const frontendRoot = path.join(repoRoot, "frontend");
const clientBuildDir = path.join(
  frontendRoot,
  "artifacts",
  "signal-client",
  "dist",
  "public",
);
const destDir = path.join(packageDir, "client");

const result = spawnSync(
  "pnpm",
  ["-C", frontendRoot, "--filter", "@workspace/signal-client", "run", "build"],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(clientBuildDir)) {
  console.error(`Client build output not found at ${clientBuildDir}`);
  process.exit(1);
}

await rm(destDir, { recursive: true, force: true });
await cp(clientBuildDir, destDir, { recursive: true });

console.log(`Copied client assets to ${destDir}`);
