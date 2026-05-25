function marketKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeTradingViewSymbol(symbol, market) {
  const raw = String(symbol || "").trim();

  if (!raw) return "";

  if (raw.includes(":")) return raw;

  const normalizedMarket = marketKey(market);

  if (normalizedMarket === "BINANCE") return `BINANCE:${raw}`;
  if (normalizedMarket === "NASDAQ") return `NASDAQ:${raw}`;
  if (normalizedMarket === "NYSE") return `NYSE:${raw}`;
  if (normalizedMarket === "AMEX") return `AMEX:${raw}`;

  return raw;
}

function parseTradingViewCsv(csv) {
  const normalized = String(csv || "")
    .trim()
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");

  const lines = normalized.split("\n").filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const values = line.split(",");
    const row = {};

    headers.forEach((header, valueIndex) => {
      row[header] = values[valueIndex];
    });

    const open = Number(row.Open);
    const high = Number(row.High);
    const low = Number(row.Low);
    const close = Number(row.Close);
    const volume = Number(row.Volume);

    return {
      index,
      date: row.Date,
      open: Number.isFinite(open) ? open : null,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      close: Number.isFinite(close) ? close : null,
      price: Number.isFinite(close) ? close : null,
      volume: Number.isFinite(volume) ? volume : null
    };
  });
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "https://stocks-optimizer.vercel.app");

    const symbol = String(url.searchParams.get("symbol") || "").trim();
    const market = marketKey(url.searchParams.get("market") || "");
    const bars = Math.min(500, Math.max(2, Number(url.searchParams.get("bars") || 80)));

    if (!symbol) {
      res.status(400).json({
        error: "SYMBOL_REQUIRED",
        message: "Query parameter symbol is required."
      });
      return;
    }

    const tradingViewSymbol = normalizeTradingViewSymbol(symbol, market);

    const baseUrl =
      process.env.TRADINGVIEW_DATA_BASE_URL ||
      "https://tradingview-data.vercel.app/api/chart-data";

    const chartUrl = new URL(baseUrl);
    chartUrl.searchParams.set("symbol", tradingViewSymbol);
    chartUrl.searchParams.set("bars", String(bars));

    const response = await fetch(chartUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 stocks-optimizer"
      }
    });

    if (!response.ok) {
      res.status(502).json({
        error: "HISTORY_LOAD_FAILED",
        message: `TradingView history request failed: ${response.status}`,
        symbol,
        tradingViewSymbol
      });
      return;
    }

    const csv = await response.text();
    const points = parseTradingViewCsv(csv).filter((point) => point.price !== null);

    res.status(200).json({
      symbol,
      market,
      tradingViewSymbol,
      data: points,
      items: points,
      total: points.length,
      source: "tradingview-data"
    });
  } catch (error) {
    res.status(500).json({
      error: "HISTORY_LOAD_FAILED",
      message: error.message
    });
  }
};
