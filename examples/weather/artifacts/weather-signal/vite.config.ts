import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const basePath = process.env.BASE_PATH ?? "/";
const artifactDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePort(): number {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    return 3000;
  }

  return port;
}

export default defineConfig(async () => {
  const port = resolvePort();

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
        process.env.REPL_ID !== undefined
        ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(artifactDir, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(artifactDir, "src"),
        "@assets": path.resolve(artifactDir, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(artifactDir),
    build: {
      outDir: path.resolve(artifactDir, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      proxy: {
        "/api": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          changeOrigin: true,
        },
        "/ws": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
          ws: true,
        },
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
