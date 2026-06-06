import { build } from "esbuild";

const externalizeNpm = {
  name: "externalize-npm",
  setup(build) {
    build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

await build({
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: ["node:*"],
  format: "esm",
  outfile: "dist/index.mjs",
  platform: "node",
  plugins: [externalizeNpm],
  sourcemap: true,
  target: "node20",
});
