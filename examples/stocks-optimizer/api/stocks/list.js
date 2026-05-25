const { readAllStocks, marketKey } = require("../_stock-files.js");

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

    const matches = readAllStocks().filter((stock) => stock.market === selectedMarket);
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
