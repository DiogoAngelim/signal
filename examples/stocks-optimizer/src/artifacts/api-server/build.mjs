import { build } from "esbuild";

const externalizeNpmButBundleWorkspace = {
  name: "externalize-npm-but-bundle-workspace",
  setup(build) {
    build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
      if (
        args.path.startsWith("@workspace/") ||
        args.path === "@signal/agency" ||
        args.path.startsWith("@signal/agency/") ||
        args.path === "@signal/decision" ||
        args.path.startsWith("@signal/decision/")
      ) {
        return null;
      }

      return {
        path: args.path,
        external: true
      };
    });
  }
};

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: true,
  plugins: [externalizeNpmButBundleWorkspace]
};

await build({
  ...common,
  format: "esm",
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs"
});

await build({
  ...common,
  format: "cjs",
  entryPoints: ["src/app.ts"],
  outfile: "dist/app.cjs"
});

await build({
  ...common,
  format: "esm",
  entryPoints: ["src/workers/signal-queue-worker.ts"],
  outfile: "dist/signal-queue-worker.mjs"
});
