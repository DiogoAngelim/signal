const fs = require("node:fs");
const path = require("node:path");

function findPublicDir() {
  const candidates = [
    process.env.STOCKS_PUBLIC_DIR,
    path.join(process.cwd(), "src/artifacts/signal-markets/public"),
    path.join(process.cwd(), "src/artifacts/signal-markets/dist/public"),
    path.join(process.cwd(), "src/public"),
    path.join(process.cwd(), "public")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);

    if (fs.existsSync(absolute)) return absolute;
  }

  return null;
}

module.exports = function handler(_req, res) {
  const publicDir = findPublicDir();

  if (!publicDir) {
    res.status(500).json({ error: "NO_PUBLIC_DIR" });
    return;
  }

  const counts = {};

  for (const file of fs.readdirSync(publicDir).filter((f) => f.startsWith("stocks_list_"))) {
    const raw = JSON.parse(fs.readFileSync(path.join(publicDir, file), "utf8"));
    const list = Array.isArray(raw) ? raw : raw.data || raw.items || raw.stocks || raw.symbols || [];

    for (const item of list) {
      const market = String(item?.market || "").trim();
      if (!market) continue;
      const key = market.toUpperCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  res.status(200).json({
    publicDir,
    markets: Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([market, count]) => ({ market, count }))
  });
};
