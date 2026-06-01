import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "judgement/engine.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "reflection/engine.ts",
        "agency/engine.ts",
        "belief/engine.ts",
        "calibration/engine.ts",
        "calibration/history.ts",
        "discovery/engine.ts",
        "discovery-intelligence/engine.ts",
        "recognition/engine.ts",
        "recovery/engine.ts",
        "readiness-remediation/engine.ts",
        "resolve/engine.ts",
      ],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
