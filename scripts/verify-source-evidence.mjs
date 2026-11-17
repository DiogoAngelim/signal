import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Track the actual inputs to policy, application and browser acceptance checks.
// This is a source-integrity guard, not a substitute for any test or release gate.
const SOURCE_PATHS = [
  "package.json", "pnpm-lock.yaml", "biome.json", "init",
  "packages/decision/package.json", "packages/decision/init",
  "packages/decision/src/core.ts",
  "packages/decision/src/human-support.ts",
  "packages/decision/src/human-support.test.ts",
  "examples/stocks-optimizer/package.json",
  "examples/stocks-optimizer/src/artifacts/signal-decision/src/core.ts",
  "examples/stocks-optimizer/src/artifacts/signal-framework/adapters/lumina-human-support.ts",
  "examples/stocks-optimizer/src/artifacts/api-server/src/lib/lumina-human-support.ts",
  "examples/stocks-optimizer/src/artifacts/api-server/src/tests/lumina-human-support.test.ts",
  "examples/stocks-optimizer/src/artifacts/api-server/src/lib/lumina-store.ts",
  "examples/stocks-optimizer/src/artifacts/api-server/src/tests/lumina-http.integration.ts",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/lib/lumina-human-support.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision/src/human-support.ts",
  "examples/stocks-optimizer/src/artifacts/signal-markets/package.json",
  "examples/stocks-optimizer/src/artifacts/signal-markets/playwright.config.ts",
  "examples/stocks-optimizer/src/artifacts/signal-markets/vite.config.ts",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/pages/lumina-app.tsx",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/pages/lumina-account.tsx",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/pages/lumina-support.tsx",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/e2e/lumina.e2e.spec.ts",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/e2e/lumina-support.e2e.spec.ts",
  "examples/stocks-optimizer/src/artifacts/signal-markets/src/e2e/lumina-startup.e2e.spec.ts",
  ".github/workflows/human-support-contract.yml",
  ".github/workflows/lumina-app.yml",
  ".github/workflows/signal-library-release.yml",
  "scripts/verify-source-evidence.mjs",
  "scripts/verify-source-evidence.test.mjs",
];

export function collectSourceEvidence({ root, expectedSha, paths = SOURCE_PATHS, snapshotDir }) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD");
  const expected = expectedSha || head;
  const changed = git("diff", "--name-only", "HEAD", "--").split("\n").filter(Boolean);
  const files = paths.map(path => {
    try {
      const expectedBlob = git("rev-parse", `HEAD:${path}`);
      if (!lstatSync(resolve(root, path)).isFile()) throw new Error("Expected a regular tracked source file");
      const bytes = readFileSync(resolve(root, path));
      const actualBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      if (snapshotDir) {
        const destination = resolve(snapshotDir, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
      return { path, expectedBlob, actualBlob, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, matches: actualBlob === expectedBlob };
    } catch (error) {
      return { path, matches: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return {
    head, expectedSha: expected, tree: git("rev-parse", "HEAD^{tree}"),
    node: process.version, runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    event: process.env.GITHUB_EVENT_NAME || null,
    changedTrackedFiles: changed, files,
    passed: head === expected && changed.length === 0 && files.every(file => file.matches),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stage, directory] = process.argv.slice(2);
  if (!stage || !/^[a-z0-9-]+$/.test(stage) || !directory) {
    throw new Error("Usage: node scripts/verify-source-evidence.mjs <stage> <evidence-directory>");
  }
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const evidence = collectSourceEvidence({ root, expectedSha: process.env.EXPECTED_SOURCE_SHA,
    snapshotDir: resolve(directory, stage, "checked-files") });
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${stage}-source-integrity.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ stage, head: evidence.head, passed: evidence.passed,
    changedTrackedFiles: evidence.changedTrackedFiles,
    mismatchedFiles: evidence.files.filter(file => !file.matches) }, null, 2));
  if (!evidence.passed) process.exitCode = 1;
}
