import { readdir, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(".");
const sourceRoot = join(root, "src");
const testRoot = join(root, "test");
const outputRoot = join(root, "dist");
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  esModuleInterop: true,
  sourceMap: true,
  inlineSources: true,
};

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

await rm(outputRoot, { recursive: true, force: true });
for (const input of [...await collect(sourceRoot), ...await collect(testRoot)]) {
  const source = await readFile(input, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: options,
    fileName: input,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const message = ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    });
    throw new Error(message);
  }
  const output = join(outputRoot, relative(root, input)).replace(/\.ts$/, ".js");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.outputText);
  if (result.sourceMapText) await writeFile(output + ".map", result.sourceMapText);
}
console.log("Transpiled reference lab source and tests independently.");
