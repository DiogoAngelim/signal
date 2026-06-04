import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { awareApiPlugin } from "./src/api/vite-plugin.js";

export default defineConfig({
  plugins: [awareApiPlugin(), react()],
  build: {
    outDir: "dist/web",
    sourcemap: true
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/ui/**",
        "src/main.tsx",
        "api/**",
        "api-src/**",
        "dist/**",
        ".vercel/**",
        "test/**",
        "vite.config.ts"
      ],
      reporter: ["text", "lcov"]
    }
  }
});
