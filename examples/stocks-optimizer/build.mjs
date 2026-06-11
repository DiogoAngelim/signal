import { build } from "esbuild";

const commonNode = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: true,
};

await build({
  ...commonNode,
  format: "esm",
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
});

await build({
  ...commonNode,
  format: "cjs",
  entryPoints: ["src/app.ts"],
  outfile: "dist/app.cjs",
});
