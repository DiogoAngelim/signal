"use strict";

const { spawnSync } = require("node:child_process");

const commands = [
  ["pnpm", ["--filter", "@workspace/api-server", "test:coverage"]],
  ["pnpm", ["--filter", "@workspace/signal-markets", "test:coverage"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    cwd: `${__dirname}/..`,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
