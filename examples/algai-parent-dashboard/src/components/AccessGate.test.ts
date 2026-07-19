import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("AccessGate login handoff", () => {
  it("waits for the parent to click the AlgAI login link", () => {
    const testPath = fileURLToPath(import.meta.url);
    const accessGateSource = readFileSync(
      testPath.replace("AccessGate.test.ts", "AccessGate.tsx"),
      "utf8",
    );

    expect(accessGateSource).toContain("Open AlgAI login");
    expect(accessGateSource).toContain("Open AlgAI when");
    expect(accessGateSource).not.toContain("window.location.replace");
    expect(accessGateSource).not.toContain("split(\"@\")");
  });
});
