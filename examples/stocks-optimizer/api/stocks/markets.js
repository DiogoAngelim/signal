const { readAllStocks } = require("../_stock-files.js");

module.exports = function handler(_req, res) {
  try {
    const stocks = readAllStocks();
    const markets = new Map();

    for (const stock of stocks) {
      const market = stock.market;
      if (!market) continue;

      if (!markets.has(market)) {
        markets.set(market, {
          code: market,
          value: market,
          id: market,
          label: market,
          name: market,
          market,
          symbolsCount: 0,
          sourceFiles: []
        });
      }

      const entry = markets.get(market);
      entry.symbolsCount += 1;

      if (stock.sourceFile && !entry.sourceFiles.includes(stock.sourceFile)) {
        entry.sourceFiles.push(stock.sourceFile);
      }
    }

    const data = Array.from(markets.values())
      .map((entry) => ({
        ...entry,
        sourceFiles: entry.sourceFiles.sort()
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    res.status(200).json({
      data,
      total: data.length
    });
  } catch (error) {
    res.status(500).json({
      error: "MARKETS_LOAD_FAILED",
      message: error.message
    });
  }
};
