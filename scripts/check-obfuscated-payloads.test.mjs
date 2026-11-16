import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./check-obfuscated-payloads.mjs", import.meta.url));

function withGitlessTree(check) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "signal-scan-"));
  try {
    mkdirSync(path.join(directory, "nested"));
    writeFileSync(path.join(directory, "nested", "safe.js"), "export const ok = true;\n");
    check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("gitless deployment tree has active security scanning", () => {
  withGitlessTree((cwd) => {
    const result = execFileSync(process.execPath, [script], { cwd, encoding: "utf8" });
    assert.match(result, /Obfuscated-payload scan passed/);
    assert.match(result, /gitless deployment tree/);
  });
});

test("gitless scan rejects suspicious markers even in nested files", () => {
  withGitlessTree((cwd) => {
    const marker = ["KAUi", "TqPiXdWs"].join("");
    writeFileSync(path.join(cwd, "nested", "injected.js"), "const payload = " + JSON.stringify(marker) + ";");
    const result = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /injected\.js/);
  });
});

test("gitless scan rejects an empty source upload", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "signal-empty-"));
  try {
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no files found/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Vercel's empty .git stub still triggers source-tree scanning", () => {
  withGitlessTree((cwd) => {
    mkdirSync(path.join(cwd, ".git"));
    const clean = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /gitless deployment tree/);

    const marker = ["HjHs", "Hac$ObTDDGcJ"].join("");
    writeFileSync(path.join(cwd, "nested", "obfuscated.js"), "const injected = " + JSON.stringify(marker));
    const unsafe = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /obfuscated\\.js/);
  });
});
