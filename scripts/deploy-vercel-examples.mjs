#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const vercelTeam = "diogos-projects-c462ac73";

const targets = [
  { name: "forex", cwd: path.join(repoRoot, "examples/forex"), project: "forex" },
  { name: "stocks", cwd: path.join(repoRoot, "examples/stocks"), project: "stocks-optimizer" },
  // cleanBeforeBuild: wipe node_modules before vercel build to avoid stale native binaries
  // (esbuild / rollup host/binary version mismatch when reusing a cached install).
  { name: "weather", cwd: path.join(repoRoot, "examples/weather"), project: "weather-signal", cleanBeforeBuild: true },
];

const extraArgs = process.argv.slice(2);
const hasYesFlag = extraArgs.includes("--yes");
const isProd = extraArgs.includes("--prod");
const skipPull = extraArgs.includes("--skip-pull");

const deployArgs = extraArgs.filter((arg, index, args) => {
  if (arg === "--archive" || arg.startsWith("--archive=")) {
    return false;
  }

  if (arg === "--build-env" || arg.startsWith("--build-env=")) {
    return false;
  }

  if (index > 0 && args[index - 1] === "--build-env") {
    return false;
  }

  if (arg === "--skip-pull") {
    return false;
  }

  return true;
});

function readLinkedProject(cwd) {
  const projectFile = path.join(cwd, ".vercel", "project.json");

  if (!fs.existsSync(projectFile)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(projectFile, "utf8"));
  } catch {
    return null;
  }
}

function runOrExit(name, cwd, args) {
  const result = spawnSync("pnpm", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\nDeployment failed for ${name}.`);
    process.exit(result.status ?? 1);
  }
}

function runResult(cwd, args) {
  return spawnSync("pnpm", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

for (const target of targets) {
  console.log(`\n==> Deploying ${target.name} from ${target.cwd}`);

  const inspectResult = runResult(target.cwd, [
    "dlx",
    "vercel",
    "project",
    "inspect",
    target.project,
    "--scope",
    vercelTeam,
  ]);

  if (inspectResult.status !== 0) {
    runOrExit(target.name, target.cwd, [
      "dlx",
      "vercel",
      "project",
      "add",
      target.project,
      "--scope",
      vercelTeam,
    ]);
  }

  const linkedProject = readLinkedProject(target.cwd);

  if (linkedProject?.projectName !== target.project) {
    runOrExit(target.name, target.cwd, [
      "dlx",
      "vercel",
      "link",
      "--yes",
      "--scope",
      vercelTeam,
      "--project",
      target.project,
    ]);
  } else {
    console.log(`Linked project already matches ${target.project}; skipping relink.`);
  }

  // Ensure local project metadata and env are present for non-interactive builds.
  if (skipPull) {
    console.log("Skipping vercel pull because --skip-pull was provided.");
  } else {
    runOrExit(target.name, target.cwd, [
      "dlx",
      "vercel",
      "pull",
      "--yes",
      ...(isProd ? ["--environment=production"] : ["--environment=preview"]),
    ]);
  }

  // Build locally to avoid Vercel remote install instability in this monorepo.
  // Some examples (weather) need a clean node_modules to avoid stale native binary mismatches.
  if (target.cleanBeforeBuild) {
    const nodeModulesPath = path.join(target.cwd, "node_modules");
    console.log(`Removing ${nodeModulesPath} before build to ensure fresh native binaries...`);
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  }
  runOrExit(target.name, target.cwd, ["dlx", "vercel", "build", ...(isProd ? ["--prod"] : [])]);

  // Deploy prebuilt output.
  runOrExit(target.name, target.cwd, [
    "dlx",
    "vercel",
    "deploy",
    "--prebuilt",
    ...(hasYesFlag ? [] : ["--yes"]),
    ...deployArgs,
  ]);
}

console.log("\nAll Vercel example deployments completed successfully.");
