const { query } = require("./_lib/db.js");
const { getCache, setCache, acquireLock } = require("./_quote-cache.js");

const STARTING_EQUITY = 1000;

function marketKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function pctReturn(previous, current) {
  const a = Number(previous);
  const b = Number(current);

  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return 0;

  return b / a - 1;
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

function parseCsv(csv) {
  const lines = String(csv || "")
    .trim()
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      return {
        date: row.Date,
        open: Number(row.Open),
        high: Number(row.High),
        low: Number(row.Low),
        close: Number(row.Close),
        adjClose: Number(row["Adj Close"]),
        volume: Number(row.Volume),
      };
    })
    .filter((row) => row.date && Number.isFinite(row.close));
}

function routeName(req) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");

  return String(url.searchParams.get("action") || "").trim();
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body;
}

async function handleBacktestMigrate(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS strategy_signal_history (
      market TEXT NOT NULL,
      symbol TEXT NOT NULL,
      date DATE NOT NULL,
      signal_action TEXT NOT NULL,
      allocation_action TEXT NOT NULL,
      suggested_exposure NUMERIC NOT NULL DEFAULT 0,
      setup_quality NUMERIC,
      risk_pressure NUMERIC,
      trend_quality NUMERIC,
      expected_move NUMERIC,
      regime TEXT,
      price NUMERIC,
      source TEXT NOT NULL DEFAULT 'reconstructed-backtest',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, symbol, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_backtest_equity_curve (
      market TEXT NOT NULL,
      date DATE NOT NULL,
      equity NUMERIC NOT NULL,
      return_pct NUMERIC NOT NULL,
      deployed_pct NUMERIC NOT NULL,
      cash_pct NUMERIC NOT NULL,
      positions_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'strategy-backtest',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_backtest_metrics (
      market TEXT PRIMARY KEY,
      total_return_pct NUMERIC,
      annualized_sharpe NUMERIC,
      average_duration_days NUMERIC,
      profit_factor NUMERIC,
      win_rate_pct NUMERIC,
      max_drawdown_pct NUMERIC,
      equity NUMERIC,
      source TEXT NOT NULL DEFAULT 'strategy-backtest',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_signal_history_market_date
      ON strategy_signal_history (market, date);

    CREATE INDEX IF NOT EXISTS idx_strategy_signal_history_symbol_date
      ON strategy_signal_history (market, symbol, date);

    CREATE INDEX IF NOT EXISTS idx_portfolio_backtest_equity_market_date
      ON portfolio_backtest_equity_curve (market, date);
  `);

  res.status(200).json({
    ok: true,
    migrated: true,
    tables: [
      "strategy_signal_history",
      "portfolio_backtest_equity_curve",
      "portfolio_backtest_metrics",
    ],
  });
}

async function handleMigrate(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS stock_price_history (
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      date DATE NOT NULL,
      open NUMERIC,
      high NUMERIC,
      low NUMERIC,
      close NUMERIC NOT NULL,
      adj_close NUMERIC,
      volume NUMERIC,
      source TEXT NOT NULL DEFAULT 'tradingview-data',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, symbol, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id BIGSERIAL PRIMARY KEY,
      market TEXT NOT NULL,
      symbol TEXT NOT NULL,
      date DATE NOT NULL,
      allocation_action TEXT NOT NULL,
      suggested_exposure NUMERIC NOT NULL DEFAULT 0,
      setup_quality NUMERIC,
      risk_pressure NUMERIC,
      expected_move NUMERIC,
      signal_action TEXT,
      signal_status TEXT,
      price NUMERIC,
      source TEXT NOT NULL DEFAULT 'signal-engine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (market, symbol, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_equity_curve (
      market TEXT NOT NULL,
      date DATE NOT NULL,
      equity NUMERIC NOT NULL,
      return_pct NUMERIC NOT NULL,
      deployed_pct NUMERIC NOT NULL,
      cash_pct NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_metrics (
      market TEXT PRIMARY KEY,
      total_return_pct NUMERIC,
      annualized_sharpe NUMERIC,
      average_duration_days NUMERIC,
      profit_factor NUMERIC,
      win_rate_pct NUMERIC,
      max_drawdown_pct NUMERIC,
      equity NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_stock_price_history_symbol_date
      ON stock_price_history (market, symbol, date);

    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_market_date
      ON portfolio_snapshots (market, date);

    CREATE INDEX IF NOT EXISTS idx_portfolio_equity_curve_market_date
      ON portfolio_equity_curve (market, date);
  `);

  res.status(200).json({
    ok: true,
    migrated: true,
    tables: [
      "stock_price_history",
      "portfolio_snapshots",
      "portfolio_equity_curve",
      "portfolio_metrics",
    ],
  });
}

async function handleDebug(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const snapshots = await query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE allocation_action = 'Buy')::int AS buy,
      COUNT(*) FILTER (WHERE suggested_exposure > 0)::int AS exposed
    FROM portfolio_snapshots
    WHERE market = $1
    `,
    [market],
  );

  const latestBuys = await query(
    `
    SELECT symbol, allocation_action, suggested_exposure, price, date
    FROM portfolio_snapshots
    WHERE market = $1
      AND allocation_action = 'Buy'
      AND suggested_exposure > 0
    ORDER BY date DESC, suggested_exposure DESC
    LIMIT 20
    `,
    [market],
  );

  const history = await query(
    `
    SELECT
      COUNT(*)::int AS rows,
      COUNT(DISTINCT symbol)::int AS symbols,
      MIN(date) AS min_date,
      MAX(date) AS max_date
    FROM stock_price_history
    WHERE market = $1
    `,
    [market],
  );

  const curve = await query(
    `
    SELECT
      COUNT(*)::int AS points,
      MIN(date) AS min_date,
      MAX(date) AS max_date,
      MIN(equity) AS min_equity,
      MAX(equity) AS max_equity
    FROM portfolio_equity_curve
    WHERE market = $1
    `,
    [market],
  );

  const metrics = await query(
    `
    SELECT *
    FROM portfolio_metrics
    WHERE market = $1
    `,
    [market],
  );

  res.status(200).json({
    market,
    snapshots: snapshots.rows[0],
    latestBuys: latestBuys.rows,
    priceHistory: history.rows[0],
    equityCurve: curve.rows[0],
    metrics: metrics.rows[0] ?? null,
  });
}

async function handleBacktestSummary(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cacheKey = `portfolio:backtest:summary:${market}`;
  const cached = await getCache(cacheKey);

  if (cached) {
    res.status(200).json({
      ...cached,
      cached: true,
    });
    return;
  }

  const { rows } = await query(
    `
    SELECT
      market,
      total_return_pct,
      annualized_sharpe,
      average_duration_days,
      profit_factor,
      win_rate_pct,
      max_drawdown_pct,
      equity,
      source,
      updated_at
    FROM portfolio_backtest_metrics
    WHERE market = $1
    `,
    [market],
  );

  const row = rows[0];

  const payload = row
    ? {
        market,
        totalReturnPct: Number(row.total_return_pct),
        annualizedSharpe: Number(row.annualized_sharpe),
        averageDurationDays: Number(row.average_duration_days),
        profitFactor: Number(row.profit_factor),
        winRatePct: Number(row.win_rate_pct),
        maxDrawdownPct: Number(row.max_drawdown_pct),
        equity: Number(row.equity),
        source: row.source,
        updatedAt: row.updated_at,
      }
    : {
        market,
        totalReturnPct: null,
        annualizedSharpe: null,
        averageDurationDays: null,
        profitFactor: null,
        winRatePct: null,
        maxDrawdownPct: null,
        equity: null,
        source: "reconstructed-strategy-backtest",
        updatedAt: null,
      };

  await setCache(cacheKey, payload, 60 * 10);

  res.status(200).json({
    ...payload,
    cached: false,
  });
}

async function handleBacktestHistory(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cacheKey = `portfolio:backtest:history:${market}:4y`;
  const cached = await getCache(cacheKey);

  if (cached?.data?.length) {
    res.status(200).json({
      ...cached,
      cached: true,
    });
    return;
  }

  const { rows } = await query(
    `
    SELECT
      date,
      equity,
      return_pct,
      deployed_pct,
      cash_pct,
      positions_count
    FROM portfolio_backtest_equity_curve
    WHERE market = $1
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    ORDER BY date ASC
    `,
    [market],
  );

  const data = rows.map((row, index) => ({
    index,
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date),
    equity: Number(row.equity),
    returnPct: Number(row.return_pct),
    deployedPct: Number(row.deployed_pct),
    cashPct: Number(row.cash_pct),
    positionsCount: Number(row.positions_count),
  }));

  const payload = {
    market,
    data,
    items: data,
    total: data.length,
    updatedAt: Date.now(),
    source: "reconstructed-strategy-backtest",
  };

  await setCache(cacheKey, payload, 60 * 10);

  res.status(200).json({
    ...payload,
    cached: false,
  });
}

async function handleSummary(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cacheKey = `portfolio:summary:${market}`;
  const cached = await getCache(cacheKey);

  if (cached) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT
      market,
      total_return_pct,
      annualized_sharpe,
      average_duration_days,
      profit_factor,
      win_rate_pct,
      max_drawdown_pct,
      equity,
      updated_at
    FROM portfolio_metrics
    WHERE market = $1
    `,
    [market],
  );

  const row = rows[0];

  const payload = row
    ? {
        market,
        totalReturnPct: Number(row.total_return_pct),
        annualizedSharpe: Number(row.annualized_sharpe),
        averageDurationDays: Number(row.average_duration_days),
        profitFactor: Number(row.profit_factor),
        winRatePct: Number(row.win_rate_pct),
        maxDrawdownPct: Number(row.max_drawdown_pct),
        equity: Number(row.equity),
        updatedAt: row.updated_at,
      }
    : {
        market,
        totalReturnPct: null,
        annualizedSharpe: null,
        averageDurationDays: null,
        profitFactor: null,
        winRatePct: null,
        maxDrawdownPct: null,
        equity: null,
        updatedAt: null,
      };

  await setCache(cacheKey, payload, 60 * 10);

  res.status(200).json({ ...payload, cached: false });
}

async function handleHistory(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cacheKey = `portfolio:history:${market}:4y`;
  const cached = await getCache(cacheKey);

  if (cached?.data?.length) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT date, equity, return_pct, deployed_pct, cash_pct
    FROM portfolio_equity_curve
    WHERE market = $1
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    ORDER BY date ASC
    `,
    [market],
  );

  const data = rows.map((row, index) => ({
    index,
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date),
    equity: Number(row.equity),
    returnPct: Number(row.return_pct),
    deployedPct: Number(row.deployed_pct),
    cashPct: Number(row.cash_pct),
  }));

  const payload = {
    market,
    data,
    items: data,
    total: data.length,
    updatedAt: Date.now(),
  };

  await setCache(cacheKey, payload, 60 * 10);

  res.status(200).json({ ...payload, cached: false });
}

async function handleSnapshot(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const date = body.date || new Date().toISOString().slice(0, 10);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!market || !items.length) {
    res.status(400).json({ error: "MARKET_AND_ITEMS_REQUIRED" });
    return;
  }

  for (const item of items) {
    const symbol = String(item.symbol || item.ticker || "").trim();

    if (!symbol) continue;

    await query(
      `
      INSERT INTO portfolio_snapshots (
        market,
        symbol,
        date,
        allocation_action,
        suggested_exposure,
        setup_quality,
        risk_pressure,
        expected_move,
        signal_action,
        signal_status,
        price
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (market, symbol, date)
      DO UPDATE SET
        allocation_action = EXCLUDED.allocation_action,
        suggested_exposure = EXCLUDED.suggested_exposure,
        setup_quality = EXCLUDED.setup_quality,
        risk_pressure = EXCLUDED.risk_pressure,
        expected_move = EXCLUDED.expected_move,
        signal_action = EXCLUDED.signal_action,
        signal_status = EXCLUDED.signal_status,
        price = EXCLUDED.price
      `,
      [
        market,
        symbol,
        date,
        item.allocationAction || "Hold",
        Number(item.suggestedExposure || 0),
        Number(item.setupQuality || 0),
        Number(item.riskPressure || 0),
        Number(item.expectedMove || 0),
        item.signalAction || null,
        item.signalStatus || null,
        Number(item.price || 0),
      ],
    );
  }

  await setCache(
    `portfolio:snapshot:${market}:latest`,
    {
      market,
      date,
      count: items.length,
      updatedAt: Date.now(),
    },
    60 * 10,
  );

  res.status(200).json({
    ok: true,
    market,
    date,
    count: items.length,
  });
}

async function fetchTradingViewCsv(symbol, market) {
  const baseUrl =
    process.env.TRADINGVIEW_DATA_BASE_URL ||
    "https://tradingview-data.vercel.app/api/chart-data";

  const url = new URL(baseUrl);
  url.searchParams.set("symbol", normalizeTradingViewSymbol(symbol, market));
  url.searchParams.set("lookbackYears", "4");
  url.searchParams.set("format", "csv");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 stocks-optimizer",
    },
  });

  if (!response.ok) {
    throw new Error(`TradingView history failed: ${response.status}`);
  }

  return response.text();
}

async function upsertHistory({ market, symbol, rows }) {
  for (const row of rows) {
    await query(
      `
      INSERT INTO stock_price_history (
        market, symbol, date, open, high, low, close, adj_close, volume, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (market, symbol, date)
      DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        adj_close = EXCLUDED.adj_close,
        volume = EXCLUDED.volume,
        updated_at = now()
      `,
      [
        market,
        symbol,
        row.date,
        Number.isFinite(row.open) ? row.open : null,
        Number.isFinite(row.high) ? row.high : null,
        Number.isFinite(row.low) ? row.low : null,
        row.close,
        Number.isFinite(row.adjClose) ? row.adjClose : null,
        Number.isFinite(row.volume) ? row.volume : null,
      ],
    );
  }
}

async function handleHistorySync(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const symbols = Array.isArray(body.symbols)
    ? body.symbols.map((symbol) => String(symbol).trim()).filter(Boolean)
    : [];

  if (!market || !symbols.length) {
    res.status(400).json({ error: "MARKET_AND_SYMBOLS_REQUIRED" });
    return;
  }

  const lock = await acquireLock(`lock:history-sync:${market}`, 60);

  if (!lock.acquired) {
    const cached = await getCache(`history-sync:${market}`);
    res.status(202).json({
      ok: true,
      market,
      status: "already_syncing",
      cached,
    });
    return;
  }

  const results = [];

  for (const symbol of symbols.slice(0, 200)) {
    const csv = await fetchTradingViewCsv(symbol, market);
    const rows = parseCsv(csv);

    await upsertHistory({ market, symbol, rows });

    results.push({
      symbol,
      rows: rows.length,
    });
  }

  const payload = {
    ok: true,
    market,
    results,
    syncedAt: Date.now(),
  };

  await setCache(`history-sync:${market}`, payload, 60 * 10);

  res.status(200).json(payload);
}

async function loadLatestPositions(market) {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (symbol)
      symbol,
      allocation_action,
      suggested_exposure,
      setup_quality,
      risk_pressure,
      expected_move,
      signal_action,
      signal_status,
      price,
      date
    FROM portfolio_snapshots
    WHERE market = $1
    ORDER BY symbol, date DESC
    `,
    [market],
  );

  return rows.filter((row) => {
    return (
      row.allocation_action === "Buy" && Number(row.suggested_exposure) > 0
    );
  });
}

async function loadHistoryRows(market, symbols) {
  if (!symbols.length) return [];

  const { rows } = await query(
    `
    SELECT market, symbol, date, close
    FROM stock_price_history
    WHERE market = $1
      AND symbol = ANY($2)
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    ORDER BY date ASC
    `,
    [market, symbols],
  );

  return rows;
}

function buildEquityCurve({ positions, historyRows }) {
  const bySymbol = new Map();

  for (const row of historyRows) {
    const symbol = row.symbol;

    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, []);
    }

    bySymbol.get(symbol).push({
      date:
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date),
      close: Number(row.close),
    });
  }

  const allDates = Array.from(
    new Set(
      historyRows.map((row) =>
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date),
      ),
    ),
  ).sort();

  if (!positions.length || !allDates.length) return [];

  const totalExposure = positions.reduce(
    (sum, position) => sum + Number(position.suggested_exposure || 0),
    0,
  );

  const deployedFraction = Math.min(1, Math.max(0, totalExposure / 100));
  const cashFraction = 1 - deployedFraction;

  return allDates.map((date) => {
    let weightedReturn = 0;

    for (const position of positions) {
      const symbolHistory = bySymbol.get(position.symbol) || [];
      const first = symbolHistory[0];
      const current =
        symbolHistory.find((point) => point.date === date) ||
        symbolHistory.filter((point) => point.date <= date).at(-1) ||
        first;

      const symbolWeight =
        Number(position.suggested_exposure || 0) / totalExposure;
      const symbolReturn =
        first && current ? pctReturn(first.close, current.close) : 0;

      weightedReturn += symbolWeight * symbolReturn;
    }

    const portfolioReturn = deployedFraction * weightedReturn;
    const equity =
      STARTING_EQUITY *
      (cashFraction + deployedFraction * (1 + weightedReturn));

    return {
      date,
      equity,
      returnPct: portfolioReturn * 100,
      deployedPct: deployedFraction * 100,
      cashPct: cashFraction * 100,
    };
  });
}

function computeMetrics(curve) {
  if (curve.length < 2) {
    return {
      totalReturnPct: null,
      annualizedSharpe: null,
      averageDurationDays: null,
      profitFactor: null,
      winRatePct: null,
      maxDrawdownPct: null,
      equity: curve.at(-1)?.equity ?? STARTING_EQUITY,
    };
  }

  const returns = [];

  for (let index = 1; index < curve.length; index += 1) {
    returns.push(pctReturn(curve[index - 1].equity, curve[index].equity));
  }

  const avgReturn = mean(returns);
  const volatility = stdev(returns);
  const annualizedSharpe =
    volatility > 0 ? (avgReturn / volatility) * Math.sqrt(252) : null;

  const grossProfit = returns
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(
    returns.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
  );

  const profitFactor =
    grossLoss === 0 ? (grossProfit > 0 ? 999 : null) : grossProfit / grossLoss;

  const winRatePct = returns.length
    ? (returns.filter((value) => value > 0).length / returns.length) * 100
    : null;

  let peak = curve[0].equity;
  let maxDrawdownPct = 0;

  for (const point of curve) {
    peak = Math.max(peak, point.equity);

    if (peak > 0) {
      maxDrawdownPct = Math.max(
        maxDrawdownPct,
        ((peak - point.equity) / peak) * 100,
      );
    }
  }

  return {
    totalReturnPct: curve.at(-1).returnPct,
    annualizedSharpe,
    averageDurationDays: curve.length,
    profitFactor,
    winRatePct,
    maxDrawdownPct,
    equity: curve.at(-1).equity,
  };
}

async function saveCurve(market, curve) {
  for (const point of curve) {
    await query(
      `
      INSERT INTO portfolio_equity_curve (
        market, date, equity, return_pct, deployed_pct, cash_pct, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT (market, date)
      DO UPDATE SET
        equity = EXCLUDED.equity,
        return_pct = EXCLUDED.return_pct,
        deployed_pct = EXCLUDED.deployed_pct,
        cash_pct = EXCLUDED.cash_pct,
        updated_at = now()
      `,
      [
        market,
        point.date,
        point.equity,
        point.returnPct,
        point.deployedPct,
        point.cashPct,
      ],
    );
  }
}

async function saveMetrics(market, metrics) {
  await query(
    `
    INSERT INTO portfolio_metrics (
      market,
      total_return_pct,
      annualized_sharpe,
      average_duration_days,
      profit_factor,
      win_rate_pct,
      max_drawdown_pct,
      equity,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (market)
    DO UPDATE SET
      total_return_pct = EXCLUDED.total_return_pct,
      annualized_sharpe = EXCLUDED.annualized_sharpe,
      average_duration_days = EXCLUDED.average_duration_days,
      profit_factor = EXCLUDED.profit_factor,
      win_rate_pct = EXCLUDED.win_rate_pct,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      equity = EXCLUDED.equity,
      updated_at = now()
    `,
    [
      market,
      metrics.totalReturnPct,
      metrics.annualizedSharpe,
      metrics.averageDurationDays,
      metrics.profitFactor,
      metrics.winRatePct,
      metrics.maxDrawdownPct,
      metrics.equity,
    ],
  );
}

async function syncHistoryForSymbols({ market, symbols, limit = 8 }) {
  const results = [];

  for (const symbol of symbols.slice(0, limit)) {
    const csv = await fetchTradingViewCsv(symbol, market);
    const rows = parseCsv(csv);

    await upsertHistory({ market, symbol, rows });

    results.push({
      symbol,
      rows: rows.length,
    });
  }

  return results;
}

async function loadRefreshableMarkets() {
  const { rows } = await query(
    `
    SELECT DISTINCT market
    FROM portfolio_snapshots
    WHERE market IS NOT NULL
      AND market <> ''
    ORDER BY market ASC
    `,
  );

  return rows.map((row) => marketKey(row.market)).filter(Boolean);
}

async function handleCronRefresh(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const requestedMarkets = String(
    url.searchParams.get("markets") || "ALL",
  ).trim();
  const discoveredMarkets =
    requestedMarkets.toUpperCase() === "ALL"
      ? await loadRefreshableMarkets()
      : requestedMarkets
          .split(",")
          .map((item) => marketKey(item))
          .filter(Boolean);

  const marketLimit = Math.min(
    25,
    Math.max(1, Number(url.searchParams.get("marketLimit") || 8)),
  );
  const markets = discoveredMarkets.slice(0, marketLimit);

  const limit = Math.min(
    8,
    Math.max(1, Number(url.searchParams.get("limit") || 2)),
  );
  const results = [];

  for (const market of markets) {
    const lock = await acquireLock(
      `lock:portfolio-cron-refresh:${market}`,
      120,
    );

    if (!lock.acquired) {
      results.push({ market, ok: true, status: "already_refreshing" });
      continue;
    }

    const positions = await loadLatestPositions(market);
    const symbols = Array.from(
      new Set(
        positions
          .map((position) => String(position.symbol || "").trim())
          .filter(Boolean),
      ),
    );

    if (!symbols.length) {
      results.push({
        market,
        ok: false,
        reason: "NO_BUY_POSITIONS",
        positions: 0,
      });
      continue;
    }

    const syncResults = await syncHistoryForSymbols({ market, symbols, limit });
    const historyRows = await loadHistoryRows(market, symbols);

    if (!historyRows.length) {
      results.push({
        market,
        ok: false,
        reason: "NO_PRICE_HISTORY",
        positions: positions.length,
        synced: syncResults,
      });
      continue;
    }

    const curve = buildEquityCurve({ positions, historyRows });
    const metrics = computeMetrics(curve);

    if (curve.length < 2) {
      results.push({
        market,
        ok: false,
        reason: "INSUFFICIENT_CURVE_POINTS",
        positions: positions.length,
        points: curve.length,
      });
      continue;
    }

    await saveCurve(market, curve);
    await saveMetrics(market, metrics);

    await setCache(
      `portfolio:history:${market}:4y`,
      {
        market,
        data: curve,
        items: curve,
        total: curve.length,
        updatedAt: Date.now(),
      },
      60 * 10,
    );

    await setCache(
      `portfolio:summary:${market}`,
      {
        market,
        ...metrics,
        updatedAt: Date.now(),
      },
      60 * 10,
    );

    results.push({
      market,
      ok: true,
      positions: positions.length,
      synced: syncResults.length,
      points: curve.length,
      metrics,
    });
  }

  res.status(200).json({
    ok: true,
    markets,
    limit,
    results,
  });
}

function rollingWindow(values, endIndex, length) {
  const start = Math.max(0, endIndex - length + 1);
  return values.slice(start, endIndex + 1);
}

function calculateBacktestSignal({ closes, index }) {
  const price = Number(closes[index]?.close);
  const previous = Number(closes[Math.max(0, index - 1)]?.close);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const window20 = rollingWindow(closes, index, 20)
    .map((row) => Number(row.close))
    .filter(Number.isFinite);
  const window60 = rollingWindow(closes, index, 60)
    .map((row) => Number(row.close))
    .filter(Number.isFinite);

  if (window20.length < 10 || window60.length < 20) {
    return {
      signalAction: "Hold",
      allocationAction: "Hold",
      suggestedExposure: 0,
      setupQuality: 45,
      riskPressure: 55,
      trendQuality: 45,
      expectedMove: 0,
      price,
    };
  }

  const avg20 = mean(window20);
  const avg60 = mean(window60);

  const returns = [];

  for (let i = 1; i < window20.length; i += 1) {
    const a = Number(window20[i - 1]);
    const b = Number(window20[i]);

    if (a > 0 && b > 0) {
      returns.push((b / a - 1) * 100);
    }
  }

  const recentReturn = previous > 0 ? (price / previous - 1) * 100 : 0;
  const avgReturn = mean(returns);
  const volatility = stdev(returns);
  const positiveBreadth = returns.length
    ? (returns.filter((value) => value >= 0).length / returns.length) * 100
    : 50;

  const trendQuality = Math.min(
    100,
    Math.max(
      0,
      50 +
        (price > avg20 ? 10 : -8) +
        (avg20 > avg60 ? 16 : -12) +
        avgReturn * 6 +
        positiveBreadth * 0.2,
    ),
  );

  const riskPressure = Math.min(
    100,
    Math.max(
      0,
      volatility * 12 +
        Math.max(0, -recentReturn) * 5 +
        (price < avg60 ? 12 : 0),
    ),
  );

  const setupQuality = Math.min(
    100,
    Math.max(
      0,
      trendQuality * 0.55 + (100 - riskPressure) * 0.3 + positiveBreadth * 0.15,
    ),
  );

  const expectedMove = avgReturn || recentReturn || 0;

  let signalAction = "Hold";
  let allocationAction = "Hold";
  let suggestedExposure = 0;

  if (
    setupQuality >= 68 &&
    riskPressure <= 55 &&
    price > avg20 &&
    avg20 > avg60
  ) {
    signalAction = "Buy";
    allocationAction = "Buy";
    suggestedExposure = Math.min(
      5.5,
      Math.max(0.5, (setupQuality - riskPressure * 0.35) / 15),
    );
  } else if (riskPressure >= 75 || (price < avg60 && recentReturn < -1.5)) {
    signalAction = "Sell";
    allocationAction = "Sell";
    suggestedExposure = 0;
  }

  return {
    signalAction,
    allocationAction,
    suggestedExposure,
    setupQuality,
    riskPressure,
    trendQuality,
    expectedMove,
    price,
  };
}

function inferHistoricalRegime({ signals }) {
  if (!signals.length) return "No Historical Coverage";

  const avgQuality = mean(
    signals.map((item) => Number(item.setupQuality || 0)),
  );
  const avgRisk = mean(signals.map((item) => Number(item.riskPressure || 0)));
  const exposure = signals.reduce(
    (sum, item) => sum + Number(item.suggestedExposure || 0),
    0,
  );

  if (avgRisk > 72) return "Capital Preservation Phase";
  if (exposure < 12) return "Defensive Environment";
  if (exposure < 35) return "Selective Upside Participation";
  if (avgQuality > 70) return "Constructive Trend Environment";
  return "Transitional Regime";
}

async function loadBacktestPriceRows(market, limitSymbols) {
  const { rows: symbols } = await query(
    `
    SELECT symbol, COUNT(*)::int AS rows
    FROM stock_price_history
    WHERE market = $1
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    GROUP BY symbol
    HAVING COUNT(*) > 80
    ORDER BY rows DESC, symbol ASC
    LIMIT $2
    `,
    [market, limitSymbols],
  );

  const symbolList = symbols.map((row) => row.symbol);

  if (!symbolList.length) {
    return {
      symbols: [],
      rows: [],
    };
  }

  const { rows } = await query(
    `
    SELECT symbol, date, close
    FROM stock_price_history
    WHERE market = $1
      AND symbol = ANY($2)
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    ORDER BY symbol ASC, date ASC
    `,
    [market, symbolList],
  );

  return {
    symbols: symbolList,
    rows,
  };
}

function groupPriceRowsBySymbol(rows) {
  const bySymbol = new Map();

  for (const row of rows) {
    const symbol = row.symbol;

    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, []);
    }

    bySymbol.get(symbol).push({
      symbol,
      date:
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date),
      close: Number(row.close),
    });
  }

  return bySymbol;
}

async function saveStrategySignals(market, signalRows) {
  for (const row of signalRows) {
    await query(
      `
      INSERT INTO strategy_signal_history (
        market,
        symbol,
        date,
        signal_action,
        allocation_action,
        suggested_exposure,
        setup_quality,
        risk_pressure,
        trend_quality,
        expected_move,
        regime,
        price,
        source
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'reconstructed-backtest')
      ON CONFLICT (market, symbol, date)
      DO UPDATE SET
        signal_action = EXCLUDED.signal_action,
        allocation_action = EXCLUDED.allocation_action,
        suggested_exposure = EXCLUDED.suggested_exposure,
        setup_quality = EXCLUDED.setup_quality,
        risk_pressure = EXCLUDED.risk_pressure,
        trend_quality = EXCLUDED.trend_quality,
        expected_move = EXCLUDED.expected_move,
        regime = EXCLUDED.regime,
        price = EXCLUDED.price
      `,
      [
        market,
        row.symbol,
        row.date,
        row.signalAction,
        row.allocationAction,
        row.suggestedExposure,
        row.setupQuality,
        row.riskPressure,
        row.trendQuality,
        row.expectedMove,
        row.regime,
        row.price,
      ],
    );
  }
}

function buildBacktestCurve({ bySymbol, signalRows }) {
  const byDate = new Map();

  for (const signal of signalRows) {
    if (!byDate.has(signal.date)) {
      byDate.set(signal.date, []);
    }

    byDate.get(signal.date).push(signal);
  }

  const dates = Array.from(byDate.keys()).sort();

  if (dates.length < 2) return [];

  let equity = STARTING_EQUITY;
  const curve = [];

  curve.push({
    date: dates[0],
    equity,
    returnPct: 0,
    deployedPct: 0,
    cashPct: 100,
    positionsCount: 0,
  });

  for (let dateIndex = 0; dateIndex < dates.length - 1; dateIndex += 1) {
    const date = dates[dateIndex];
    const nextDate = dates[dateIndex + 1];

    const dailySignals = byDate.get(date) || [];
    const buys = dailySignals.filter((item) => {
      return (
        item.allocationAction === "Buy" && Number(item.suggestedExposure) > 0
      );
    });

    const totalExposure = buys.reduce(
      (sum, item) => sum + Number(item.suggestedExposure || 0),
      0,
    );
    const deployedFraction = Math.min(1, Math.max(0, totalExposure / 100));
    const cashFraction = 1 - deployedFraction;

    let weightedReturn = 0;

    if (buys.length && totalExposure > 0) {
      for (const buy of buys) {
        const symbolHistory = bySymbol.get(buy.symbol) || [];
        const today = symbolHistory.find((point) => point.date === date);
        const tomorrow = symbolHistory.find((point) => point.date === nextDate);

        if (!today || !tomorrow) continue;

        const weight = Number(buy.suggestedExposure || 0) / totalExposure;
        const symbolReturn = pctReturn(today.close, tomorrow.close);

        weightedReturn += weight * symbolReturn;
      }
    }

    const portfolioReturn = deployedFraction * weightedReturn;
    equity = equity * (cashFraction + deployedFraction * (1 + weightedReturn));

    curve.push({
      date: nextDate,
      equity,
      returnPct: ((equity - STARTING_EQUITY) / STARTING_EQUITY) * 100,
      deployedPct: deployedFraction * 100,
      cashPct: cashFraction * 100,
      positionsCount: buys.length,
    });
  }

  return curve;
}

async function saveBacktestCurve(market, curve) {
  for (const point of curve) {
    await query(
      `
      INSERT INTO portfolio_backtest_equity_curve (
        market,
        date,
        equity,
        return_pct,
        deployed_pct,
        cash_pct,
        positions_count,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (market, date)
      DO UPDATE SET
        equity = EXCLUDED.equity,
        return_pct = EXCLUDED.return_pct,
        deployed_pct = EXCLUDED.deployed_pct,
        cash_pct = EXCLUDED.cash_pct,
        positions_count = EXCLUDED.positions_count,
        updated_at = now()
      `,
      [
        market,
        point.date,
        point.equity,
        point.returnPct,
        point.deployedPct,
        point.cashPct,
        point.positionsCount,
      ],
    );
  }
}

async function saveBacktestMetrics(market, metrics) {
  await query(
    `
    INSERT INTO portfolio_backtest_metrics (
      market,
      total_return_pct,
      annualized_sharpe,
      average_duration_days,
      profit_factor,
      win_rate_pct,
      max_drawdown_pct,
      equity,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (market)
    DO UPDATE SET
      total_return_pct = EXCLUDED.total_return_pct,
      annualized_sharpe = EXCLUDED.annualized_sharpe,
      average_duration_days = EXCLUDED.average_duration_days,
      profit_factor = EXCLUDED.profit_factor,
      win_rate_pct = EXCLUDED.win_rate_pct,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      equity = EXCLUDED.equity,
      updated_at = now()
    `,
    [
      market,
      metrics.totalReturnPct,
      metrics.annualizedSharpe,
      metrics.averageDurationDays,
      metrics.profitFactor,
      metrics.winRatePct,
      metrics.maxDrawdownPct,
      metrics.equity,
    ],
  );
}

async function handleRefreshMarket(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const lock = await acquireLock(
    `lock:portfolio-refresh-market:${market}`,
    120,
  );

  if (!lock.acquired) {
    res.status(202).json({
      ok: true,
      market,
      status: "already_refreshing",
    });
    return;
  }

  const positions = await loadLatestPositions(market);
  const symbols = Array.from(
    new Set(
      positions
        .map((position) => String(position.symbol || "").trim())
        .filter(Boolean),
    ),
  );

  if (!symbols.length) {
    res.status(200).json({
      ok: false,
      market,
      reason: "NO_BUY_POSITIONS",
      positions: 0,
      symbols: [],
      message:
        "No Buy positions with positive suggested exposure were found for this market.",
    });
    return;
  }

  const limit = Math.min(12, Math.max(1, Number(body.limit || 6)));
  const syncResults = await syncHistoryForSymbols({ market, symbols, limit });
  const historyRows = await loadHistoryRows(market, symbols);

  if (!historyRows.length) {
    res.status(200).json({
      ok: false,
      market,
      reason: "NO_PRICE_HISTORY",
      positions: positions.length,
      symbols,
      syncResults,
      points: 0,
    });
    return;
  }

  const curve = buildEquityCurve({ positions, historyRows });
  const metrics = computeMetrics(curve);

  if (curve.length < 2) {
    res.status(200).json({
      ok: false,
      market,
      reason: "INSUFFICIENT_CURVE_POINTS",
      positions: positions.length,
      symbols,
      syncResults,
      points: curve.length,
    });
    return;
  }

  await saveCurve(market, curve);
  await saveMetrics(market, metrics);

  await setCache(
    `portfolio:history:${market}:4y`,
    {
      market,
      data: curve,
      items: curve,
      total: curve.length,
      updatedAt: Date.now(),
    },
    60 * 10,
  );

  await setCache(
    `portfolio:summary:${market}`,
    {
      market,
      ...metrics,
      updatedAt: Date.now(),
    },
    60 * 10,
  );

  res.status(200).json({
    ok: true,
    market,
    positions: positions.length,
    symbols,
    synced: syncResults,
    points: curve.length,
    metrics,
  });
}

async function loadBacktestableMarkets() {
  const { rows } = await query(
    `
    SELECT market, COUNT(DISTINCT symbol)::int AS symbols
    FROM stock_price_history
    WHERE market IS NOT NULL
      AND market <> ''
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    GROUP BY market
    HAVING COUNT(DISTINCT symbol) > 0
    ORDER BY symbols DESC, market ASC
    `,
  );

  return rows.map((row) => marketKey(row.market)).filter(Boolean);
}

async function runBacktestForMarket({ market, limitSymbols }) {
  const loaded = await loadBacktestPriceRows(market, limitSymbols);

  if (!loaded.symbols.length || !loaded.rows.length) {
    return {
      ok: false,
      market,
      reason: "NO_PRICE_HISTORY",
      symbols: 0,
      rows: 0,
    };
  }

  const bySymbol = groupPriceRowsBySymbol(loaded.rows);
  const signalRows = [];

  for (const symbol of loaded.symbols) {
    const rows = bySymbol.get(symbol) || [];

    for (let index = 0; index < rows.length; index += 1) {
      const signal = calculateBacktestSignal({
        closes: rows,
        index,
      });

      if (!signal) continue;

      signalRows.push({
        market,
        symbol,
        date: rows[index].date,
        ...signal,
        regime: "Pending Regime",
      });
    }
  }

  const signalsByDate = new Map();

  for (const row of signalRows) {
    if (!signalsByDate.has(row.date)) {
      signalsByDate.set(row.date, []);
    }

    signalsByDate.get(row.date).push(row);
  }

  for (const dailySignals of signalsByDate.values()) {
    const regime = inferHistoricalRegime({ signals: dailySignals });

    for (const signal of dailySignals) {
      signal.regime = regime;

      if (regime === "Capital Preservation Phase" && signal.setupQuality < 82) {
        signal.allocationAction = "Hold";
        signal.suggestedExposure = 0;
      }

      if (regime === "Defensive Environment" && signal.setupQuality < 72) {
        signal.allocationAction = "Hold";
        signal.suggestedExposure = 0;
      }
    }
  }

  await saveStrategySignals(market, signalRows);

  const curve = buildBacktestCurve({ bySymbol, signalRows });

  if (curve.length < 2) {
    return {
      ok: false,
      market,
      reason: "INSUFFICIENT_BACKTEST_CURVE",
      symbols: loaded.symbols.length,
      signalRows: signalRows.length,
      points: curve.length,
    };
  }

  const metrics = computeMetrics(curve);

  await saveBacktestCurve(market, curve);
  await saveBacktestMetrics(market, metrics);

  await setCache(
    `portfolio:backtest:history:${market}:4y`,
    {
      market,
      data: curve,
      items: curve,
      total: curve.length,
      updatedAt: Date.now(),
      source: "reconstructed-strategy-backtest",
    },
    60 * 10,
  );

  await setCache(
    `portfolio:backtest:summary:${market}`,
    {
      market,
      ...metrics,
      updatedAt: Date.now(),
      source: "reconstructed-strategy-backtest",
    },
    60 * 10,
  );

  return {
    ok: true,
    market,
    source: "reconstructed-strategy-backtest",
    symbols: loaded.symbols.length,
    priceRows: loaded.rows.length,
    signalRows: signalRows.length,
    points: curve.length,
    metrics,
  };
}

async function handleCronBacktest(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const requestedMarkets = String(
    url.searchParams.get("markets") || "ALL",
  ).trim();

  const discoveredMarkets =
    requestedMarkets.toUpperCase() === "ALL"
      ? await loadBacktestableMarkets()
      : requestedMarkets
          .split(",")
          .map((item) => marketKey(item))
          .filter(Boolean);

  const marketLimit = Math.min(
    12,
    Math.max(1, Number(url.searchParams.get("marketLimit") || 4)),
  );
  const limitSymbols = Math.min(
    30,
    Math.max(2, Number(url.searchParams.get("limitSymbols") || 8)),
  );
  const markets = discoveredMarkets.slice(0, marketLimit);

  const results = [];

  for (const market of markets) {
    const lock = await acquireLock(
      `lock:portfolio-cron-backtest:${market}`,
      180,
    );

    if (!lock.acquired) {
      results.push({
        ok: true,
        market,
        status: "already_backtesting",
      });
      continue;
    }

    try {
      const result = await runBacktestForMarket({ market, limitSymbols });
      results.push(result);
    } catch (error) {
      results.push({
        ok: false,
        market,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    ok: true,
    markets,
    marketLimit,
    limitSymbols,
    results,
  });
}

async function handleBacktestMarket(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const limitSymbols = Math.min(
    80,
    Math.max(2, Number(body.limitSymbols || body.limit || 20)),
  );

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const lock = await acquireLock(
    `lock:portfolio-backtest-market:${market}`,
    180,
  );

  if (!lock.acquired) {
    res.status(202).json({
      ok: true,
      market,
      status: "already_backtesting",
    });
    return;
  }

  const result = await runBacktestForMarket({ market, limitSymbols });
  res.status(200).json(result);
}

async function handleRebuild(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const body = req.method === "POST" && req.body ? getBody(req) : {};
  const market = marketKey(body.market || url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const lock = await acquireLock(`lock:portfolio-rebuild:${market}`, 60);

  if (!lock.acquired) {
    res.status(202).json({
      ok: true,
      market,
      status: "already_rebuilding",
    });
    return;
  }

  const positions = await loadLatestPositions(market);
  const symbols = positions.map((position) => position.symbol);
  const historyRows = await loadHistoryRows(market, symbols);

  if (!positions.length) {
    res.status(200).json({
      ok: false,
      market,
      reason: "NO_BUY_POSITIONS",
      positions: 0,
      points: 0,
      message:
        "No Buy positions with positive suggested exposure were found in portfolio_snapshots.",
    });
    return;
  }

  if (!historyRows.length) {
    res.status(200).json({
      ok: false,
      market,
      reason: "NO_PRICE_HISTORY",
      positions: positions.length,
      symbols,
      points: 0,
      message:
        "Buy positions exist, but no 4-year price history rows exist for those symbols.",
    });
    return;
  }

  const curve = buildEquityCurve({ positions, historyRows });
  const metrics = computeMetrics(curve);

  if (curve.length < 2) {
    res.status(200).json({
      ok: false,
      market,
      reason: "INSUFFICIENT_CURVE_POINTS",
      positions: positions.length,
      historyRows: historyRows.length,
      points: curve.length,
    });
    return;
  }

  await saveCurve(market, curve);
  await saveMetrics(market, metrics);

  await setCache(
    `portfolio:history:${market}:4y`,
    {
      market,
      data: curve,
      items: curve,
      total: curve.length,
      updatedAt: Date.now(),
    },
    60 * 10,
  );

  await setCache(
    `portfolio:summary:${market}`,
    {
      market,
      ...metrics,
      updatedAt: Date.now(),
    },
    60 * 10,
  );

  res.status(200).json({
    ok: true,
    market,
    positions: positions.length,
    points: curve.length,
    metrics,
  });
}

module.exports = async function handler(req, res) {
  try {
    const route = routeName(req);

    if (route === "backtest-migrate") {
      await handleBacktestMigrate(req, res);
      return;
    }

    if (route === "migrate") {
      await handleMigrate(req, res);
      return;
    }

    if (route === "debug") {
      await handleDebug(req, res);
      return;
    }

    if (route === "backtest-summary") {
      await handleBacktestSummary(req, res);
      return;
    }

    if (route === "backtest-history") {
      await handleBacktestHistory(req, res);
      return;
    }

    if (route === "summary") {
      await handleSummary(req, res);
      return;
    }

    if (route === "history") {
      await handleHistory(req, res);
      return;
    }

    if (route === "snapshot") {
      await handleSnapshot(req, res);
      return;
    }

    if (route === "cron-refresh") {
      await handleCronRefresh(req, res);
      return;
    }

    if (route === "cron-backtest") {
      await handleCronBacktest(req, res);
      return;
    }

    if (route === "backtest-market") {
      await handleBacktestMarket(req, res);
      return;
    }

    if (route === "refresh-market") {
      await handleRefreshMarket(req, res);
      return;
    }

    if (route === "rebuild") {
      await handleRebuild(req, res);
      return;
    }

    if (route === "history-sync") {
      await handleHistorySync(req, res);
      return;
    }

    res.status(404).json({
      error: "PORTFOLIO_ROUTE_NOT_FOUND",
      route,
    });
  } catch (error) {
    res.status(500).json({
      error: "PORTFOLIO_ROUTE_FAILED",
      message: error.message,
    });
  }
};
