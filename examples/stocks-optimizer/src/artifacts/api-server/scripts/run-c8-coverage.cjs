#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { mkdirSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");
const { outputReport } = require("c8/lib/commands/report");

async function main() {
  const tempDirectory = resolve(".coverage/tmp");
  const sourceFiles = [
    resolve("src/lib/model-lifecycle.ts"),
    resolve("src/lib/belief-adapter.ts"),
    resolve("src/lib/agency-diagnostics.ts"),
    resolve("src/lib/stock-judgement.ts"),
    resolve("src/lib/stock-recognition.ts"),
    resolve("src/lib/survival-memory-adapter.ts"),
    resolve("src/lib/opportunity-discovery.ts"),
    resolve("src/lib/strategy-readiness.ts"),
    resolve("src/lib/resolve-adapter.ts"),
    resolve("../signal-framework/judgement/engine.ts"),
    resolve("../signal-framework/discovery/engine.ts"),
    resolve("../signal-framework/recognition/engine.ts"),
    resolve("../signal-framework/need-detection/engine.ts"),
    resolve("../signal-framework/opportunity-discovery/engine.ts"),
    resolve("../signal-framework/opportunity-discovery/density.ts"),
    resolve("../signal-framework/opportunity-explorer/engine.ts"),
    resolve("../signal-framework/readiness-remediation/engine.ts"),
    resolve("../signal-framework/recovery/engine.ts"),
    resolve("../signal-framework/sizing/adaptive.ts"),
    resolve("../signal-framework/sizing/engine.ts"),
    resolve("../signal-framework/robustness/engine.ts"),
    resolve("../signal-framework/survival-memory/engine.ts"),
  ];
  rmSync(tempDirectory, { recursive: true, force: true });
  mkdirSync(tempDirectory, { recursive: true });

  const child = spawnSync("pnpm", ["test"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_V8_COVERAGE: tempDirectory,
    },
    stdio: "inherit",
  });

  if (child.status !== 0) {
    process.exitCode = child.status ?? 1;
    return;
  }

  await outputReport({
    100: true,
    all: true,
    allowExternal: true,
    exclude: [],
    excludeAfterRemap: false,
    excludeNodeModules: true,
    extension: [".js", ".cjs", ".mjs", ".ts", ".tsx"],
    include: sourceFiles,
    mergeAsync: false,
    omitRelative: true,
    reporter: ["text"],
    "reports-dir": "coverage",
    reporterOptions: {},
    resolve: "",
    skipFull: false,
    src: resolve(".."),
    tempDirectory,
    watermarks: undefined,
    wrapperLength: undefined,
  });
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
