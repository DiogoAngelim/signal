#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const artifactDir = process.argv[2];
if (!artifactDir) {
  throw new Error("Usage: node scripts/verify-packed-decision-package.mjs <tarball-directory>");
}

const tarball = readdirSync(artifactDir)
  .filter((name) => name.startsWith("signal-decision-") && name.endsWith(".tgz"))
  .map((name) => join(artifactDir, name))[0];
if (!tarball) throw new Error("Packed @signal/decision tarball not found");

const metadata = JSON.parse(
  execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
);
if (metadata.name !== "@signal/decision") {
  throw new Error(`Unexpected package name: ${metadata.name}`);
}
if (!metadata.version) throw new Error("Package version is missing");

const archiveEntries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
for (const target of ["package/dist/index.js", "package/dist/index.d.ts", "package/dist/core.js", "package/dist/core.d.ts"]) {
  if (!archiveEntries.includes(target)) throw new Error(`Tarball is missing export target: ${target}`);
}
const dependencySets = [metadata.dependencies, metadata.optionalDependencies, metadata.peerDependencies];
for (const dependencies of dependencySets) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (String(version).startsWith("workspace:")) {
      throw new Error(`Workspace-only dependency found: ${name}@${version}`);
    }
  }
}

const extractionDir = mkdtempSync(join(tmpdir(), "signal-decision-package-"));
try {
  execFileSync("tar", ["-xzf", tarball, "-C", extractionDir]);
  const distDir = join(extractionDir, "package", "dist");
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:js|cjs|mjs|d\.ts)$/.test(entry.name)) files.push(path);
    }
  };
  visit(distDir);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (/from\s+["']@signal\/[^"']+["']|import\(["']@signal\/[^"']+["']\)/.test(source)) {
      throw new Error(`Packed output has an unresolved internal @signal import: ${basename(file)}`);
    }
  }
} finally {
  rmSync(extractionDir, { recursive: true, force: true });
}

const sha256 = createHash("sha256").update(readFileSync(tarball)).digest("hex");
const record = [
  "Signal decision package artifact",
  `Package: ${metadata.name}`,
  `Version: ${metadata.version}`,
  `SHA-256: ${sha256}`,
  `Validated with Node.js: ${process.version}`,
  `Declared Node.js engine: ${metadata.engines?.node ?? "not declared"}`,
  `Install in an isolated npm consumer: npm install ./${basename(tarball)}`,
  "Validated: package export targets, no workspace:* dependencies, no unresolved internal @signal imports.",
  "",
].join("\n");
writeFileSync(join(artifactDir, "ARTIFACT-METADATA.txt"), record);
console.log(record);
