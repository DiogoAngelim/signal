const fs = require("fs");
const path = require("path");

const root = process.cwd();
const base = path.join(root, "examples/stocks-optimizer/src/artifacts");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log("Wrote", path.relative(root, file));
}

function writeJson(file, data) {
  write(file, JSON.stringify(data, null, 2) + "\n");
}

const requiredPackages = [
  "api-server",
  "signal-markets",
  "api-client-react",
  "api-zod",
  "db"
];

for (const pkg of requiredPackages) {
  const dir = path.join(base, pkg);
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(path.join(base, "api-zod/package.json"))) {
  writeJson(path.join(base, "api-zod/package.json"), {
    name: "@workspace/api-zod",
    version: "0.0.0",
    type: "module",
    main: "src/index.ts",
    types: "src/index.ts",
    dependencies: {
      zod: "catalog:"
    }
  });

  write(path.join(base, "api-zod/src/index.ts"), `import { z } from "zod";

export const HealthCheckResponse = z.object({
  status: z.string(),
  timestamp: z.string().optional(),
  uptime: z.number().optional()
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponse>;
`);
}

if (!fs.existsSync(path.join(base, "api-client-react/package.json"))) {
  writeJson(path.join(base, "api-client-react/package.json"), {
    name: "@workspace/api-client-react",
    version: "0.0.0",
    type: "module",
    main: "src/index.ts",
    types: "src/index.ts",
    dependencies: {
      "@tanstack/react-query": "catalog:",
      react: "catalog:",
      zod: "catalog:"
    }
  });

  write(path.join(base, "api-client-react/src/index.ts"), `import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || response.statusText);
  }

  return response.json() as Promise<T>;
}

export { useMutation, useQuery, useQueryClient };
`);
}

if (!fs.existsSync(path.join(base, "db/package.json"))) {
  writeJson(path.join(base, "db/package.json"), {
    name: "@workspace/db",
    version: "0.0.0",
    type: "module",
    main: "src/index.ts",
    types: "src/index.ts",
    dependencies: {
      "drizzle-orm": "catalog:",
      pg: "catalog:"
    },
    devDependencies: {
      "@types/pg": "catalog:"
    }
  });

  write(path.join(base, "db/src/index.ts"), `import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
`);
}

if (!fs.existsSync(path.join(base, "signal-markets/package.json"))) {
  writeJson(path.join(base, "signal-markets/package.json"), {
    name: "@workspace/signal-markets",
    version: "0.0.0",
    type: "module",
    private: true,
    scripts: {
      dev: "vite --config vite.config.ts --host 0.0.0.0",
      build: "vite --config vite.config.ts build",
      preview: "vite --config vite.config.ts preview --host 0.0.0.0"
    },
    dependencies: {
      "@tanstack/react-query": "catalog:",
      "@workspace/api-client-react": "workspace:*",
      "@workspace/api-zod": "workspace:*",
      "class-variance-authority": "catalog:",
      clsx: "catalog:",
      "framer-motion": "catalog:",
      "lucide-react": "catalog:",
      react: "catalog:",
      "react-dom": "catalog:",
      recharts: "catalog:",
      "tailwind-merge": "catalog:",
      wouter: "catalog:",
      zod: "catalog:"
    },
    devDependencies: {
      "@tailwindcss/vite": "catalog:",
      "@types/node": "catalog:",
      "@types/react": "catalog:",
      "@types/react-dom": "catalog:",
      "@vitejs/plugin-react": "catalog:",
      tailwindcss: "catalog:",
      typescript: "catalog:",
      vite: "catalog:"
    }
  });
}

write(path.join(root, "pnpm-workspace.yaml"), `packages:
  - "examples/stocks-optimizer"
  - "examples/stocks-optimizer/src/artifacts/*"

catalog:
  "@replit/vite-plugin-cartographer": "latest"
  "@replit/vite-plugin-dev-banner": "latest"
  "@replit/vite-plugin-runtime-error-modal": "latest"
  "@tailwindcss/vite": "latest"
  "@tanstack/react-query": "latest"
  "@types/node": "latest"
  "@types/pg": "latest"
  "@types/react": "latest"
  "@types/react-dom": "latest"
  "@vitejs/plugin-react": "latest"
  "class-variance-authority": "latest"
  "clsx": "latest"
  "dotenv-cli": "latest"
  "drizzle-kit": "latest"
  "drizzle-orm": "latest"
  "esbuild": "latest"
  "framer-motion": "latest"
  "lucide-react": "latest"
  "pg": "latest"
  "react": "latest"
  "react-dom": "latest"
  "recharts": "latest"
  "tailwind-merge": "latest"
  "tailwindcss": "latest"
  "tsx": "latest"
  "typescript": "latest"
  "vite": "latest"
  "wouter": "latest"
  "zod": "latest"
`);

console.log("\nPackage files now present:");
for (const pkg of requiredPackages) {
  const file = path.join(base, pkg, "package.json");
  if (fs.existsSync(file)) {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log("-", json.name, "=>", path.relative(root, file));
  } else {
    console.log("- MISSING", pkg);
  }
}
