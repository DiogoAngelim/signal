import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { build } from "esbuild";

const routes = [
  ["api-src/regions/search.ts", "api/regions/search.js"],
  [
    "api-src/regions/[regionId]/briefing.ts",
    "api/regions/[regionId]/briefing.js",
  ],
  ["api-src/briefings/[briefingId].ts", "api/briefings/[briefingId].js"],
  [
    "api-src/briefings/[briefingId]/sources.ts",
    "api/briefings/[briefingId]/sources.js",
  ],
  ["api-src/feedback.ts", "api/feedback.js"],
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
      js: "import { createRequire as __awareCreateRequire } from 'node:module'; const require = __awareCreateRequire(import.meta.url);",
    },
  });
}

console.log(`Built ${routes.length} Vercel API functions.`);
