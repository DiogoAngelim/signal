import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { liquidityManagerApiPlugin } from "./src/api/vite-plugin.js";

export default defineConfig({
  plugins: [liquidityManagerApiPlugin(), react()],
  build: {
    outDir: "dist/web",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/frontend/main.tsx",
        "dist/**",
        "test/**",
        "vite.config.ts",
      ],
      reporter: ["text", "lcov"],
    },
  },
});
