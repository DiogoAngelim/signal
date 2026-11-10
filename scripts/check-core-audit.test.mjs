import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "signal-audit-parser-"));
const script = new URL("./check-core-audit.mjs", import.meta.url);
const cases = [
  {
    name: "moderate-only summary",
    output: "4 vulnerabilities found\\nSeverity: 4 moderate\\n",
    expected: 0,
  },
  {
    name: "clean audit",
    output: "No known vulnerabilities found\\n",
    expected: 0,
  },
  {
    name: "high summary without advisory detail",
    output: "1 vulnerabilities found\\nSeverity: 1 high\\n",
    expected: 1,
  },
  {
    name: "core high advisory",
    output: "┌───────────────┐\\n│ high          │\\n│ Package       │ axios │\\n│ Paths         │ api__runtime │\\n",
    expected: 1,
  },
  {
    name: "example high advisory",
    output: "┌───────────────┐\\n│ high          │\\n│ Package       │ axios │\\n│ Paths         │ examples__aware │\\n",
    expected: 0,
  },
  {
    name: "unparseable non-empty output",
    output: "audit failed unexpectedly\\n",
    expected: 1,
  },
];

try {
  for (const testCase of cases) {
    const input = join(directory, "audit.txt");
    await writeFile(input, testCase.output);
    const result = spawnSync(process.execPath, [script.pathname, input], {
      encoding: "utf8",
    });
    if (result.status !== testCase.expected) {
      throw new Error(
        testCase.name + ": expected exit " + testCase.expected +
        ", received " + result.status + "\\n" + result.stdout + result.stderr,
      );
    }
  }
  process.stdout.write("Dependency audit parser fixtures passed (" + cases.length + ").\\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
