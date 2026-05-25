const fs = require("node:fs");
const path = require("node:path");

module.exports = function handler(_req, res) {
  const cwd = process.cwd();

  const candidates = [
    process.env.STOCKS_PUBLIC_DIR,
    "src/artifacts/signal-markets/public",
    "src/artifacts/signal-markets/dist/public",
    "src/artifacts/api-server/dist/public",
    "src/public",
    "public"
  ].filter(Boolean);

  res.status(200).json({
    cwd,
    env: {
      STOCKS_PUBLIC_DIR: process.env.STOCKS_PUBLIC_DIR || null,
      NODE_ENV: process.env.NODE_ENV || null,
      VERCEL: process.env.VERCEL || null,
      SERVE_FRONTEND: process.env.SERVE_FRONTEND || null
    },
    files: candidates.map((candidate) => {
      const absolute = path.isAbsolute(candidate)
        ? candidate
        : path.join(cwd, candidate);

      return {
        candidate,
        absolute,
        exists: fs.existsSync(absolute),
        sample: fs.existsSync(absolute)
          ? fs.readdirSync(absolute).filter((name) => name.startsWith("stocks_list_")).slice(0, 10)
          : []
      };
    })
  });
};
