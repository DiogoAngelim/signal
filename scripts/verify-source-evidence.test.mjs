import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectSourceEvidence } from "./verify-source-evidence.mjs";

test("evidence binds checked bytes to HEAD and rejects drift or a different source", () => {
  const root = mkdtempSync(join(tmpdir(), "source-integrity-test-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Source integrity test");
    git("config", "user.email", "source-integrity@example.invalid");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/policy.ts"), "export const permission = 'none';\n");
    git("add", "."); git("commit", "-qm", "fixture");
    const head = git("rev-parse", "HEAD");
    const options = { root, expectedSha: head, paths: ["src/policy.ts"], snapshotDir: join(root, "evidence") };
    const clean = collectSourceEvidence(options);
    assert.equal(clean.passed, true);
    assert.equal(clean.files[0].actualBlob, git("rev-parse", "HEAD:src/policy.ts"));
    assert.equal(readFileSync(join(root, "evidence/src/policy.ts"), "utf8"), readFileSync(join(root, "src/policy.ts"), "utf8"));
    assert.equal(collectSourceEvidence({ ...options, expectedSha: "0".repeat(40) }).passed, false);
    writeFileSync(join(root, "src/policy.ts"), "export const permission = 'changed';\n");
    const drift = collectSourceEvidence(options);
    assert.equal(drift.passed, false);
    assert.equal(drift.files[0].matches, false);
    assert.deepEqual(drift.changedTrackedFiles, ["src/policy.ts"]);
    rmSync(join(root, "src/policy.ts"));
    assert.equal(collectSourceEvidence(options).passed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
