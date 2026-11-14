import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scanner = resolve("scripts/check-obfuscated-payloads.mjs");
const marker = ["KAUi", "TqPiXdWs"].join("");
const root = mkdtempSync(join(tmpdir(), "signal-preinstall-scan-"));

function run(cwd, env = {}) {
  return spawnSync(process.execPath, [scanner], {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
}
function test(name, callback) {
  const directory = join(root, name);
  mkdirSync(directory);
  callback(directory);
}

try {
  test("detached-clean", (directory) => {
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src", "index.js"), "export const safe = true;\n");
    const result = run(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /available checkout files checked/);
  });
  test("detached-marker", (directory) => {
    writeFileSync(join(directory, "payload.txt"), marker);
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected obfuscated executable markers/);
  });
  test("detached-empty", (directory) => {
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no files/);
  });
  test("detached-symlink", (directory) => {
    writeFileSync(join(directory, "safe.txt"), "safe\n");
    writeFileSync(join(root, "external-marker.txt"), marker);
    symlinkSync(join(root, "external-marker.txt"), join(directory, "linked.txt"));
    const result = run(directory);
    assert.equal(result.status, 0, result.stderr);
  });
  test("tracked-marker", (directory) => {
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: directory }).status, 0);
    writeFileSync(join(directory, "payload.txt"), marker);
    assert.equal(spawnSync("git", ["add", "payload.txt"], { cwd: directory }).status, 0);
    const result = run(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /tracked files/);
  });
  console.log("Scanner regression cases passed: detached clean/marker/empty/symlink and Git tracked marker.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
