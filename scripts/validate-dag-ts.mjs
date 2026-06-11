#!/usr/bin/env node
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Project, SyntaxKind } from "ts-morph";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const TSCONFIG_PATH = join(ROOT, "tsconfig.base.json");

const FORBIDDEN_RULES = [
  {
    sourcePattern: /^examples\//,
    targetPattern: /^@signal\/runtime$/,
    reason: "examples must access runtime via @signal/sdk-node",
  },
  {
    sourcePattern: /^examples\//,
    targetPattern: /^@signal\/ports$/,
    reason: "examples must access ports via @signal/sdk-node",
  },
  {
    sourcePattern: /^examples\//,
    targetPattern: /^@signal\/decision$/,
    reason: "examples must access decision via @signal/sdk-node",
  },
  {
    sourcePattern: /^server\//,
    targetPattern: /^@signal\/runtime$/,
    reason: "server must access runtime via @signal/sdk-node",
  },
  {
    sourcePattern: /^server\//,
    targetPattern: /^@signal\/decision$/,
    reason: "server must access decision via @signal/sdk-node",
  },
  {
    sourcePattern: /^api\/binding-http\//,
    targetPattern: /^@signal\/runtime$/,
    reason: "binding-http must access runtime via @signal/sdk-node",
  },
];

console.log(
  "🔍 Building dependency graph with TypeScript AST analysis (ts-morph)...\n",
);

const project = new Project({
  tsConfigFilePath: TSCONFIG_PATH,
  skipAddingFilesFromTsConfig: false,
  skipFileDependencyResolution: true,
});

const sourceFiles = project.getSourceFiles();
console.log(`   Loaded ${sourceFiles.length} source files from tsconfig\n`);

const edges = [];
const adjacency = new Map();

function getRelativePath(fullPath) {
  return fullPath.replace(`${ROOT}/`, "").replace(`${ROOT}\\`, "");
}

for (const sourceFile of sourceFiles) {
  const sourcePath = getRelativePath(sourceFile.getFilePath());

  // Skip build artifacts and declaration files
  if (sourcePath.includes("/dist/") || sourcePath.endsWith(".d.ts")) continue;

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const mod = importDecl.getModuleSpecifierValue();
    if (mod.startsWith("@signal/")) {
      edges.push({ source: sourcePath, target: mod });
      if (!adjacency.has(sourcePath)) adjacency.set(sourcePath, new Set());
      adjacency.get(sourcePath).add(mod);
    }
  }

  for (const callExpr of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const exprText = callExpr.getExpression().getText();
    if (exprText === "import" || exprText === "require") {
      for (const arg of callExpr.getArguments()) {
        if (arg.getKind() === SyntaxKind.StringLiteral) {
          const mod = arg.getText().replace(/['"]/g, "");
          if (mod.startsWith("@signal/")) {
            edges.push({ source: sourcePath, target: mod });
            if (!adjacency.has(sourcePath))
              adjacency.set(sourcePath, new Set());
            adjacency.get(sourcePath).add(mod);
          }
        }
      }
    }
  }
}

console.log(`   Found ${edges.length} @signal/* import edges\n`);

const violations = [];

for (const edge of edges) {
  for (const rule of FORBIDDEN_RULES) {
    if (
      rule.sourcePattern.test(edge.source) &&
      rule.targetPattern.test(edge.target)
    ) {
      violations.push({
        type: "FORBIDDEN_EDGE",
        source: edge.source,
        target: edge.target,
        reason: rule.reason,
      });
    }
  }
}

const visited = new Set();
const recursionStack = new Set();

function dfsCycle(node) {
  visited.add(node);
  recursionStack.add(node);
  const neighbors = adjacency.get(node) || new Set();
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      if (dfsCycle(neighbor)) return true;
    } else if (recursionStack.has(neighbor)) {
      violations.push({
        type: "CYCLE",
        source: node,
        target: neighbor,
        reason: "circular dependency detected",
      });
      return true;
    }
  }
  recursionStack.delete(node);
  return false;
}

for (const node of adjacency.keys()) {
  if (!visited.has(node)) {
    dfsCycle(node);
  }
}

if (violations.length > 0) {
  console.log("❌ DAG VIOLATIONS DETECTED\n");
  for (const v of violations) {
    console.log(`- [${v.type}] ${v.source} → ${v.target} (${v.reason})`);
  }
  console.log("\nCI FAILED");
  process.exit(1);
} else {
  console.log("✅ DAG CLEAN — STRICT SIGNAL KERNEL ENFORCED");
  console.log(
    `   ${edges.length} edges validated, ${violations.length} violations, 0 cycles`,
  );
  process.exit(0);
}
