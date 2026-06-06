const { readAllStocks, marketKey } = require("../_stock-files.js");

const MARKET_GROUPS = {
  US: new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "IEX"]),
  CRYPTO: new Set(["BINANCE"]),
  COMMODITIES: new Set(["CME", "CBOT", "COMEX", "NYMEX", "ICE", "FUTURES"]),
  INDEXES: new Set(["INDEX", "INDEXES", "SP", "DJ", "NASDAQ_INDEX"])
};

function matchesSelectedMarket(stock, selectedMarket) {
  if (stock.market === selectedMarket) return true;

  const group = MARKET_GROUPS[selectedMarket];
  if (!group) return false;

  return group.has(stock.market);
}

module.exports = function handler(req, res) {
  try {
    const url = new URL(req.url, "https://stocks-optimizer.vercel.app");

    const selectedMarket = marketKey(url.searchParams.get("market") || "");
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 50)));

    if (!selectedMarket) {
      res.status(400).json({
        error: "MARKET_REQUIRED",
        message: "Query parameter market is required."
      });
      return;
    }

    const matches = readAllStocks().filter((stock) => matchesSelectedMarket(stock, selectedMarket));
    const items = matches.slice(offset, offset + limit);

    res.status(200).json({
      data: items,
      items,
      total: matches.length,
      offset,
      limit,
      market: selectedMarket
    });
  } catch (error) {
    res.status(500).json({
      error: "STOCK_LIST_LOAD_FAILED",
      message: error.message
    });
  }
};
