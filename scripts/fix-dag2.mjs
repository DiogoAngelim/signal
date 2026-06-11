#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/compaction.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/contracts.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/memory-store.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/operations.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/postgres.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/retention.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/summary.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/src/types.ts",
  "examples/stocks-optimizer/src/artifacts/signal-decision-memory/test/decision-memory.test.ts",
  "examples/stocks-optimizer/src/artifacts/api-server/src/lib/decision-intelligence.ts",
  "server/reference-server/test/high-risk-flow.test.ts",
];

for (const f of files) {
  try {
    let content = readFileSync(f, "utf8");
    content = content.replace(/@signal\/decision/g, "@signal/sdk-node");
    content = content.replace(/@signal\/runtime/g, "@signal/sdk-node");
    writeFileSync(f, content);
    console.log(`Fixed: ${f}`);
  } catch (e) {
    console.log(`Skip: ${f} (${e.message})`);
  }
}
console.log("Done");
