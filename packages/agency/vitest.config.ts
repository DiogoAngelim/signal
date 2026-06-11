import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["dist/**", "src/**/*.test.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 98,
        functions: 100,
        branches: 92,
        statements: 98,
      },
    },
  },
});
