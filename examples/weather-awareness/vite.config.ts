import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@signal/climate-forecast": fileURLToPath(new URL("../climate-forecast/src/index.ts", import.meta.url))
    }
  },
  build: {
    outDir: "dist/web",
    sourcemap: true
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"]
  }
});
