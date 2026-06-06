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

    if (!fs.existsSync(absolute)) continue;

    const hasStockLists = fs
      .readdirSync(absolute)
      .some((file) => file.startsWith("stocks_list_") && file.endsWith(".json"));

    if (hasStockLists) return absolute;
  }

  throw new Error(`No stocks_list_*.json found. Checked: ${candidates.join(", ")}`);
}

function readList(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.stocks)) return raw.stocks;
  if (Array.isArray(raw.symbols)) return raw.symbols;

  return [];
}

function marketKey(value) {
  return String(value || "").trim().toUpperCase();
}

function getMarket(item) {
  return marketKey(item?.market || "");
}

function normalizeItem(item, sourceFile) {
  const symbol = String(
    item?.symbol ||
    item?.ticker ||
    item?.code ||
    item?.tvSymbol ||
    item?.tradingViewSymbol ||
    item?.s ||
    ""
  ).trim();

  const market = getMarket(item);

  return {
    ...item,
    symbol,
    ticker: item?.ticker || symbol,
    name: item?.name || item?.description || symbol,
    description: item?.description || item?.name || symbol,
    market,
    exchange: market,
    sourceFile,
    image: item?.image || item?.logo || null,
    sector: item?.sector || null,
    industry: item?.industry || null,
    price: item?.price ?? null,
    last: item?.last ?? item?.price ?? null,
    change: item?.change ?? null,
    changePercent: item?.changePercent ?? item?.change_percent ?? null,
    volume: item?.volume ?? null,
    currency: item?.currency ?? null
  };
}

function getStockFiles() {
  const publicDir = findPublicDir();

  const files = fs
    .readdirSync(publicDir)
    .filter((file) => file.startsWith("stocks_list_") && file.endsWith(".json"))
    .sort();

  return { publicDir, files };
}

function readAllStocks() {
  const { publicDir, files } = getStockFiles();
  const stocks = [];

  for (const file of files) {
    const list = readList(path.join(publicDir, file));

    for (const item of list) {
      const normalized = normalizeItem(item, file);
      if (normalized.symbol) stocks.push(normalized);
    }
  }

  return stocks;
}

module.exports = {
  findPublicDir,
  readList,
  marketKey,
  getMarket,
  normalizeItem,
  getStockFiles,
  readAllStocks
};
