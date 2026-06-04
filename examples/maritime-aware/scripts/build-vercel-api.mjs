import { build } from "esbuild";
import { rm, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const routes = [
  ["api-src/areas/search.ts", "api/areas/search.js"],
  ["api-src/areas/[areaId]/guide.ts", "api/areas/[areaId]/guide.js"],
  ["api-src/guides/[briefingId].ts", "api/guides/[briefingId].js"],
  ["api-src/guides/[briefingId]/sources.ts", "api/guides/[briefingId]/sources.js"],
  ["api-src/feedback.ts", "api/feedback.js"],
  ["api-src/reviews.ts", "api/reviews.js"]
];

await rm("api", { recursive: true, force: true });

for (const [entry, outfile] of routes) {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [entry],
    outfile,
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
