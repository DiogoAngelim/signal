import { build } from "esbuild";

const commonNode = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: true
};

// Local long-running server build
await build({
  ...commonNode,
  format: "esm",
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs"
});

// Vercel serverless app build
await build({
  ...commonNode,
  format: "cjs",
  entryPoints: ["src/app.ts"],
vercel logs https://stocks-optimizer.vercel.app --since 2m  outfile: "dist/app.cjs"
});
