const fs = require("fs");
const path = require("path");

const root = process.cwd();

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".next", ".vite", "coverage"].includes(entry)) continue;

    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) walk(full, files);
    else if (entry === "package.json") files.push(full);
  }

  return files;
}

const packageFiles = walk(path.join(root, "examples"))
  .filter((file) => {
    const rel = path.relative(root, file);
    return (
      rel.includes("stocks-3") ||
      rel.includes("stocks-optimizer")
    );
  });

const packageDirs = packageFiles
  .map((file) => path.dirname(file))
  .map((dir) => path.relative(root, dir))
  .sort();

console.log("Detected package dirs:");
for (const dir of packageDirs) console.log(" -", dir);

const catalog = {
  "@replit/vite-plugin-cartographer": "latest",
  "@replit/vite-plugin-dev-banner": "latest",
  "@replit/vite-plugin-runtime-error-modal": "latest",
  "@tailwindcss/vite": "latest",
  "@tanstack/react-query": "latest",
  "@types/node": "latest",
  "@types/pg": "latest",
  "@types/react": "latest",
  "@types/react-dom": "latest",
  "@vitejs/plugin-react": "latest",
  "class-variance-authority": "latest",
  "clsx": "latest",
  "dotenv-cli": "latest",
  "drizzle-kit": "latest",
  "drizzle-orm": "latest",
  "esbuild": "latest",
  "framer-motion": "latest",
  "lucide-react": "latest",
  "pg": "latest",
  "react": "latest",
  "react-dom": "latest",
  "recharts": "latest",
  "tailwind-merge": "latest",
  "tailwindcss": "latest",
  "tsx": "latest",
  "typescript": "latest",
  "vite": "latest",
  "wouter": "latest",
  "zod": "latest"
};

for (const file of packageFiles) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));

  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = pkg[section] || {};

    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string" && version.startsWith("catalog:")) {
        catalog[name] = catalog[name] || "latest";
      }
    }
  }
}

const yaml = [
  "packages:",
  ...packageDirs.map((dir) => `  - "${dir}"`),
  "",
  "catalog:",
  ...Object.entries(catalog)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `  "${name}": "${version}"`),
  ""
].join("\n");

fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), yaml);

console.log("\nWrote pnpm-workspace.yaml");
