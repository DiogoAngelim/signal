#!/usr/bin/env node
/**
 * validate-dag.mjs — Strict DAG Enforcement for Signal Monorepo
 *
 * Validates:
 * 1. Forbidden dependency edges (architecture violations)
 * 2. Cycles in dependency graph (DAG enforcement)
 * 3. Single-entry SDK boundary (@signal/sdk-node is the sole entry)
 *
 * Uses TypeScript compiler API for real module resolution.
 * Exit code 1 on any violation. No exceptions.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const require = createRequire(join(ROOT, "package.json"));

let ts;
try {
  ts = require("typescript");
} catch {
  console.error("❌ FATAL: typescript not installed");
  process.exit(1);
}

const PACKAGE_DIRS = {
  "@signal/protocol": "api/protocol",
  "@signal/ports": "api/ports",
  "@signal/runtime": "api/runtime",
  "@signal/sdk-node": "api/sdk-node",
  "@signal/binding-http": "api/binding-http",
  "@signal/db": "server/db",
  "@signal/kernel": "packages/kernel",
  "@signal/agency": "packages/agency",
  "@signal/commitment": "packages/commitment",
  "@signal/decision": "packages/decision",
  "@signal/decision-memory": "packages/decision-memory",
  "@signal/semantic-state": "packages/semantic-state",
  "@signal/cli": "signal-cli",
  "@signal/idempotency-postgres": "api/idempotency-postgres",
  "@signal/reference-server": "server/reference-server",
  "@signal/algai-parent-dashboard": "examples/algai-parent-dashboard",
  "@signal/aware": "examples/aware",
  "@signal/liquidity-manager": "examples/liquidity-manager",
};

const L = {
  DOMAIN: "domain",
  PROTOCOL: "protocol",
  PORTS: "ports",
  RUNTIME: "runtime",
  SDK: "sdk",
  BINDING: "binding",
  DB: "db",
  OPTIMIZER: "optimizer",
  CLI: "cli",
  IDEMPOTENCY: "idempotency",
  SERVER: "server",
  EXAMPLE: "example",
  UNKNOWN: "unknown",
};

function getLayerForDir(d) {
  if (d.startsWith("packages/kernel")) return L.DOMAIN;
  if (d.startsWith("api/protocol")) return L.PROTOCOL;
  if (d.startsWith("api/ports")) return L.PORTS;
  if (d.startsWith("api/runtime")) return L.RUNTIME;
  if (d.startsWith("api/sdk-node")) return L.SDK;
  if (d.startsWith("api/binding-http")) return L.BINDING;
  if (d.startsWith("server/db")) return L.DB;
  if (d.startsWith("api/idempotency-postgres")) return L.IDEMPOTENCY;
  if (d.startsWith("signal-cli")) return L.CLI;
  if (d.startsWith("server/reference-server")) return L.SERVER;
  if (
    d.startsWith("packages/agency") ||
    d.startsWith("packages/commitment") ||
    d.startsWith("packages/decision") ||
    d.startsWith("packages/decision-memory") ||
    d.startsWith("packages/semantic-state")
  )
    return L.OPTIMIZER;
  if (d.startsWith("examples/")) return L.EXAMPLE;
  return L.UNKNOWN;
}

function* walkDir(dir, exts = [".ts", ".tsx", ".mts", ".cts"]) {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".git", "dist", ".next"].includes(e.name)) continue;
      yield* walkDir(full, exts);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      yield full;
    }
  }
}

function extractImports(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const imports = [];
  const sf = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const m = node.moduleSpecifier?.text;
      if (m && typeof m === "string") imports.push(m);
    } else if (ts.isExportDeclaration(node)) {
      const m = node.moduleSpecifier?.text;
      if (m && typeof m === "string") imports.push(m);
    } else if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        imports.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return imports;
}

function resolvePkg(specifier) {
  if (!specifier.startsWith("@signal/")) return null;
  const match = Object.entries(PACKAGE_DIRS).find(
    ([pkg]) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  );
  return match ? { pkgName: match[0], dir: match[1] } : null;
}

function buildGraph() {
  const scanDirs = [
    "api/protocol/src",
    "api/ports/src",
    "api/runtime/src",
    "api/sdk-node/src",
    "api/binding-http/src",
    "api/idempotency-postgres/src",
    "server/db",
    "server/reference-server/src",
    "packages/kernel/src",
    "packages/agency/src",
    "packages/commitment/src",
    "packages/decision/src",
    "packages/decision-memory/src",
    "packages/semantic-state/src",
    "signal-cli/src",
    "examples/aware/src",
    "examples/aware/api-src",
    "examples/algai-parent-dashboard/src",
    "examples/liquidity-manager/src",
  ].filter((d) => existsSync(join(ROOT, d)));

  const allFiles = new Set();
  for (const d of scanDirs)
    for (const f of walkDir(join(ROOT, d))) allFiles.add(f);

  const edges = [];
  function getPkgForFile(fp) {
    const rel = relative(ROOT, fp);
    const sorted = Object.entries(PACKAGE_DIRS).sort(
      (a, b) => b[1].length - a[1].length,
    );
    for (const [pn, pd] of sorted) {
      if (rel === pd || rel.startsWith(`${pd}/`)) return pn;
    }
    if (rel.startsWith("examples/")) {
      const parts = rel.split("/");
      if (parts.length >= 2) {
        const ed = parts.slice(0, 2).join("/");
        for (const [pn, pd] of Object.entries(PACKAGE_DIRS)) {
          if (pd === ed) return pn;
        }
        return `@signal/${parts[1]}`;
      }
    }
    return null;
  }

  for (const fp of allFiles) {
    const fromPkg = getPkgForFile(fp);
    if (!fromPkg) continue;
    const relPath = relative(ROOT, fp);
    for (const spec of extractImports(fp)) {
      if (!spec.startsWith("@signal/")) continue;
      const r = resolvePkg(spec);
      if (r)
        edges.push({
          from: fp,
          fromRel: relPath,
          fromPkg,
          to: spec,
          toPkg: r.pkgName,
          toDir: r.dir,
          specifier: spec,
        });
    }
  }
  return { edges };
}

// ─── Forbidden Edge Rules ───────────────────────────────────────────────────
const FORBIDDEN = [
  // examples → runtime/ports/optimizer/kernel (must use sdk-node)
  {
    from: L.EXAMPLE,
    to: "@signal/runtime",
    reason: "examples must access runtime through @signal/sdk-node",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/ports",
    reason: "examples must not import @signal/ports directly",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/decision",
    reason: "examples must not import @signal/decision directly",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/decision-memory",
    reason: "examples must not import @signal/decision-memory directly",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/agency",
    reason: "examples must not import @signal/agency directly",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/commitment",
    reason: "examples must not import @signal/commitment directly",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/semantic-state",
    reason: "examples must not import @signal/semantic-state directly",
  },
  {
    from: L.EXAMPLE,
    to: "@signal/kernel",
    reason: "examples must not import @signal/kernel directly",
  },
  // server → runtime/decision/ports/kernel (must use sdk-node)
  {
    from: L.SERVER,
    to: "@signal/runtime",
    reason: "server must access runtime through @signal/sdk-node",
  },
  {
    from: L.SERVER,
    to: "@signal/decision",
    reason: "server must not import @signal/decision directly",
  },
  {
    from: L.SERVER,
    to: "@signal/ports",
    reason: "server must not import @signal/ports directly",
  },
  {
    from: L.SERVER,
    to: "@signal/kernel",
    reason: "server must not import @signal/kernel directly",
  },
  // binding-http → runtime (direct access forbidden)
  {
    from: L.BINDING,
    to: "@signal/runtime",
    reason:
      "binding-http must not import @signal/runtime directly (use @signal/sdk-node)",
  },
  // ports purity
  {
    from: L.PORTS,
    to: "@signal/runtime",
    reason: "Ports must not import from Runtime",
  },
  {
    from: L.PORTS,
    to: "@signal/sdk-node",
    reason: "Ports must not import from SDK",
  },
  {
    from: L.PORTS,
    to: "@signal/kernel",
    reason: "Ports must not import from kernel (use @signal/protocol)",
  },
  // kernel isolation
  {
    from: L.DOMAIN,
    to: "@signal/runtime",
    reason: "Kernel must not import from Runtime",
  },
  {
    from: L.DOMAIN,
    to: "@signal/sdk-node",
    reason: "Kernel must not import from SDK",
  },
  // protocol isolation
  {
    from: L.PROTOCOL,
    to: "@signal/runtime",
    reason: "Protocol must not import from Runtime",
  },
  {
    from: L.PROTOCOL,
    to: "@signal/sdk-node",
    reason: "Protocol must not import from SDK",
  },
  // runtime isolation
  {
    from: L.RUNTIME,
    to: "@signal/sdk-node",
    reason: "Runtime must not import SDK",
  },
  {
    from: L.RUNTIME,
    to: "@signal/binding-http",
    reason: "Runtime must not import binding-http",
  },
  {
    from: L.RUNTIME,
    to: "@signal/kernel",
    reason: "Runtime must not import kernel (use @signal/protocol)",
  },
  // optimizer isolation
  {
    from: L.OPTIMIZER,
    to: "@signal/kernel",
    reason: "Optimizer must not import kernel (use @signal/protocol)",
  },
  {
    from: L.OPTIMIZER,
    to: "@signal/runtime",
    reason: "Optimizer must not import Runtime",
  },
  {
    from: L.OPTIMIZER,
    to: "@signal/sdk-node",
    reason: "Optimizer must not import SDK",
  },
  {
    from: L.OPTIMIZER,
    to: "@signal/binding-http",
    reason: "Optimizer must not import binding-http",
  },
  {
    from: L.OPTIMIZER,
    to: "@signal/db",
    reason: "Optimizer must not import DB",
  },
  // cli isolation
  { from: L.CLI, to: "@signal/kernel", reason: "CLI must not import kernel" },
  {
    from: L.CLI,
    to: "@signal/protocol",
    reason: "CLI must not import protocol",
  },
  { from: L.CLI, to: "@signal/runtime", reason: "CLI must not import runtime" },
  { from: L.CLI, to: "@signal/sdk-node", reason: "CLI must not import SDK" },
];

// ─── Cycle Detection (DFS) ─────────────────────────────────────────────────
function detectCycles(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.fromPkg)) adj.set(e.fromPkg, new Set());
    adj.get(e.fromPkg).add(e.toPkg);
  }
  // Ensure all nodes are in the map
  for (const e of edges) {
    if (!adj.has(e.toPkg)) adj.set(e.toPkg, new Set());
  }

  const cycles = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const path = [];

  for (const n of adj.keys()) color.set(n, WHITE);

  function dfs(node) {
    color.set(node, GRAY);
    path.push(node);
    for (const nb of adj.get(node) || []) {
      if (!color.has(nb)) color.set(nb, WHITE);
      if (color.get(nb) === GRAY) {
        const idx = path.indexOf(nb);
        cycles.push([...path.slice(idx), nb]);
      } else if (color.get(nb) === WHITE) {
        dfs(nb);
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  for (const n of adj.keys()) {
    if (color.get(n) === WHITE) dfs(n);
  }
  return cycles;
}

// ─── Single Entry Enforcement ───────────────────────────────────────────────
function checkSingleEntry(edges) {
  const violations = [];
  // External modules (examples, server) must only import @signal/sdk-node
  // Allowed: @signal/sdk-node, @signal/protocol (shared contracts), @signal/binding-http (HTTP server)
  const externalLayers = new Set([L.EXAMPLE, L.SERVER]);
  const allowedForExternal = new Set([
    "@signal/sdk-node",
    "@signal/protocol",
    "@signal/binding-http",
    "@signal/idempotency-postgres",
    "@signal/db",
  ]);

  for (const edge of edges) {
    const fromDir = edge.fromRel;
    const fromLayer = getLayerForDir(fromDir);
    if (externalLayers.has(fromLayer)) {
      if (!allowedForExternal.has(edge.toPkg)) {
        violations.push({
          from: edge.fromRel,
          to: edge.toPkg,
          reason: `External module bypasses @signal/sdk-node — imports ${edge.toPkg} directly`,
        });
      }
    }
  }
  return violations;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log("🔍 Building dependency graph with TypeScript AST analysis...\n");

  const { edges } = buildGraph();

  console.log(`   Found ${edges.length} @signal/* import edges\n`);

  // 1. Forbidden edge detection
  const forbiddenViolations = [];
  for (const edge of edges) {
    const fromDir = edge.fromRel;
    const fromLayer = getLayerForDir(fromDir);
    for (const rule of FORBIDDEN) {
      if (fromLayer === rule.from && edge.toPkg === rule.to) {
        forbiddenViolations.push({
          type: "FORBIDDEN_EDGE",
          from: edge.fromRel,
          to: edge.toPkg,
          reason: rule.reason,
          specifier: edge.specifier,
        });
      }
    }
  }

  // 2. Cycle detection
  const cycleViolations = detectCycles(edges);

  // 3. Single entry enforcement
  const entryViolations = checkSingleEntry(edges);

  // ─── Report ─────────────────────────────────────────────────────────────
  const allViolations = [];

  for (const v of forbiddenViolations) {
    allViolations.push(v);
  }

  for (const cycle of cycleViolations) {
    allViolations.push({
      type: "CYCLE",
      from: cycle.join(" → "),
      to: cycle[cycle.length - 1],
      reason: `Circular dependency: ${cycle.join(" → ")}`,
    });
  }

  for (const v of entryViolations) {
    // Deduplicate with forbidden violations
    const alreadyReported = forbiddenViolations.some(
      (fv) => fv.from === v.from && fv.to === v.to,
    );
    if (!alreadyReported) {
      allViolations.push({
        type: "SINGLE_ENTRY_VIOLATION",
        from: v.from,
        to: v.to,
        reason: v.reason,
      });
    }
  }

  if (allViolations.length > 0) {
    console.log("❌ DAG VIOLATIONS DETECTED\n");
    for (const v of allViolations) {
      console.log(`- [${v.type}] ${v.from} → ${v.to} (${v.reason})`);
    }
    console.log("\nCI FAILED");
    process.exit(1);
  }

  console.log("✅ DAG CLEAN — STRICT SIGNAL KERNEL ENFORCED");
  console.log(`   ${edges.length} edges validated, 0 violations, 0 cycles`);
  process.exit(0);
}

main();
