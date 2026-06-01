import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const workspaceList = spawnSync("pnpm", ["list", "-r", "--json", "--depth", "-1"], {
  cwd: rootDir,
  encoding: "utf8",
});

if (workspaceList.status !== 0) {
  process.stderr.write(workspaceList.stderr);
  process.exit(workspaceList.status ?? 1);
}

const workspacePackages = JSON.parse(workspaceList.stdout);
const missingTargets = [];
let checkedTargets = 0;

function isLocalTarget(value) {
  return typeof value === "string" && !value.startsWith("/") && !/^[a-z]+:/i.test(value);
}

function collectTargets(value, label, targets) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    if (isLocalTarget(value)) {
      targets.push({ label, value });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTargets(item, `${label}[${index}]`, targets));
    return;
  }

  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectTargets(item, `${label}.${key}`, targets);
    }
  }
}

for (const workspacePackage of workspacePackages) {
  const packageDir = workspacePackage.path;
  const packageJsonPath = path.join(packageDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    continue;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const targets = [];

  collectTargets(packageJson.main, "main", targets);
  collectTargets(packageJson.module, "module", targets);
  collectTargets(packageJson.types ?? packageJson.typings, "types", targets);
  collectTargets(packageJson.exports, "exports", targets);
  collectTargets(packageJson.bin, "bin", targets);

  for (const target of targets) {
    if (target.value.includes("*")) {
      continue;
    }

    checkedTargets += 1;

    const resolvedTarget = path.resolve(packageDir, target.value);
    if (!existsSync(resolvedTarget)) {
      missingTargets.push({
        packageName: packageJson.name ?? packageDir,
        packageDir,
        label: target.label,
        value: target.value,
      });
    }
  }
}

if (missingTargets.length > 0) {
  for (const target of missingTargets) {
    console.error(
      `${target.packageName}: missing package target ${target.label} -> ${target.value} (${target.packageDir})`,
    );
  }
  process.exit(1);
}

console.log(`Checked ${checkedTargets} package entrypoint/export target(s).`);
