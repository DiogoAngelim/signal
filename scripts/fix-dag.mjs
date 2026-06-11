#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

let m = readFileSync("examples/aware/src/signal/memory.ts", "utf-8");
m = m
  .replace(/@signal\/decision-memory/g, "@signal/sdk-node")
  .replace(/@signal\/decision/g, "@signal/sdk-node");
writeFileSync("examples/aware/src/signal/memory.ts", m);
console.log("fixed memory");

let i = readFileSync("api/sdk-node/src/index.ts", "utf-8");
if (!i.includes("@signal/runtime")) {
  i +=
    '\nexport * from "@signal/runtime";\nexport * from "@signal/decision";\nexport * from "@signal/decision-memory";\n';
  writeFileSync("api/sdk-node/src/index.ts", i);
  console.log("added re-exports");
} else {
  console.log("already has re-exports");
}

const p = JSON.parse(readFileSync("api/sdk-node/package.json", "utf-8"));
if (!p.dependencies) p.dependencies = {};
let c = false;
if (!p.dependencies["@signal/decision"]) {
  p.dependencies["@signal/decision"] = "workspace:*";
  c = true;
}
if (!p.dependencies["@signal/decision-memory"]) {
  p.dependencies["@signal/decision-memory"] = "workspace:*";
  c = true;
}
if (c) {
  writeFileSync("api/sdk-node/package.json", `${JSON.stringify(p, null, 2)}\n`);
  console.log("updated pkg");
} else {
  console.log("pkg ok");
}
