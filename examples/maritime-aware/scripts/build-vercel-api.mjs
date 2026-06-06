import { build } from "esbuild";
import { rm, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputRoot = resolve(process.cwd(), process.env.API_OUTPUT_ROOT ?? "api");
const routes = [
  ["api-src/areas/search.ts", "api/areas/search.js"],
  ["api-src/areas/[areaId]/guide.ts", "api/areas/[areaId]/guide.js"],
  ["api-src/guides/[briefingId].ts", "api/guides/[briefingId].js"],
  ["api-src/guides/[briefingId]/sources.ts", "api/guides/[briefingId]/sources.js"],
  ["api-src/feedback.ts", "api/feedback.js"],
  ["api-src/reviews.ts", "api/reviews.js"]
];

await rm(outputRoot, { recursive: true, force: true });

for (const [entry, outfile] of routes) {
  const target = resolve(outputRoot, outfile);
  await mkdir(dirname(target), { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: target,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    sourcemap: true,
    packages: "bundle",
    legalComments: "none",
    logLevel: "silent",
    banner: {
      js: "import { createRequire as __maritimeCreateRequire } from 'node:module'; const require = __maritimeCreateRequire(import.meta.url);"
    }
  });
}

console.log(`Built ${routes.length} Vercel API functions.`);
