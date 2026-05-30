import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_TARGET = "http://localhost:4010";
const localNodeModules = path.resolve(process.cwd(), "node_modules");
const isVitest = process.env.VITEST === "true";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      react: path.resolve(localNodeModules, "react"),
      "react-dom": path.resolve(localNodeModules, "react-dom"),
      ...(isVitest
        ? { "lucide-react": path.resolve(process.cwd(), "src/test/lucide-react.tsx") }
        : {}),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/strategy": {
        target: API_TARGET,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (_proxyReq, req) => {
            console.log("[vite proxy] /api/strategy ->", API_TARGET, req.url);
          });
          proxy.on("error", (err, req) => {
            console.error("[vite proxy error] /api/strategy", req.url, err.message);
          });
        },
      },
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (_proxyReq, req) => {
            console.log("[vite proxy] /api ->", API_TARGET, req.url);
          });
          proxy.on("error", (err, req) => {
            console.error("[vite proxy error] /api", req.url, err.message);
          });
        },
      },
      "/stocks": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/signals": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4010",
        ws: true,
      },
    },
  },
});
