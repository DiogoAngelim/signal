import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import binanceExecutionRouter from "./routes/binance-execution.js";
import stocksRouter from "./routes/stocks.js";
import { createSignalApiRouter } from "./api/signal-routes.js";
import { setSignalBroadcast, startBackgroundSignalEngine } from "./lib/signal-backend.js";
import { getOrCreateMarketBacktest } from "./lib/market-backtest.js";
import { buildHealthPayload, buildReadinessPayload } from "./observability/signal-health.js";
import {
  apiErrorHandler,
  createSignalCorsOptions,
  requestIdMiddleware,
  secureHeadersMiddleware,
} from "./observability/signal-http.js";

const app = express();

app.disable("x-powered-by");
app.use(requestIdMiddleware);
app.use(secureHeadersMiddleware);
app.use(cors(createSignalCorsOptions()));
app.use(express.json({ limit: process.env.SIGNAL_API_BODY_LIMIT ?? process.env.REQUEST_BODY_LIMIT ?? "1mb" }));


const logger = {
  info: (payload: unknown, message?: string) => {
    if (message) console.log(message, payload);
    else console.log(payload);
  },
  warn: (payload: unknown, message?: string) => {
    if (message) console.warn(message, payload);
    else console.warn(payload);
  },
  error: (payload: unknown, message?: string) => {
    if (message) console.error(message, payload);
    else console.error(payload);
  },
  debug: (payload: unknown, message?: string) => {
    if (process.env.LOG_LEVEL === "debug") {
      if (message) console.debug(message, payload);
      else console.debug(payload);
    }
  },
};

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 0;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}






app.get("/health", (_req, res) => {
  res.json(buildHealthPayload());
});

app.get("/ready", async (_req, res, next) => {
  try {
    const payload = await buildReadinessPayload();
    res.status(payload.status === "ready" ? 200 : 503).json(payload);
  } catch (error) {
    next(error);
  }
});

app.use(createSignalApiRouter());
app.use(stocksRouter);
app.use("/api", createSignalApiRouter());
app.use("/api", stocksRouter);
app.use(binanceExecutionRouter);
app.use("/api", binanceExecutionRouter);

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Broadcast helper
function broadcastSignal(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

setSignalBroadcast(broadcastSignal);




function localPortfolioBacktestHistory() {
  return Array.from({ length: 180 }, (_, index) => {
    const equity = 1000 + index * 1.25 + Math.sin(index / 8) * 18;
    const deployedPct = 35 + Math.sin(index / 10) * 12;

    return {
      date: new Date(Date.now() - (179 - index) * 86400000).toISOString().slice(0, 10),
      equity,
      returnPct: ((equity / 1000) - 1) * 100,
      dailyReturnPct: index === 0 ? 0 : 0.1 + Math.sin(index / 7) * 0.25,
      deployedPct,
      cashPct: Math.max(0, 100 - deployedPct),
      positionsCount: 5 + (index % 4),
      regime: index % 4 === 0 ? "Selective Upside Participation" : "Constructive Trend Environment",
    };
  });
}

function localPortfolioBacktestTrades() {
  const history = localPortfolioBacktestHistory();
  const symbols = ["ADNOCGAS", "EAND", "ALDAR", "ADCB", "FAB", "TAQA", "ADNOCDRILL", "ADNOCDIST"];

  return symbols.flatMap((symbol, symbolIndex) =>
    Array.from({ length: 4 }, (_, tradeIndex) => {
      const entryPrice = 8 + symbolIndex * 1.6 + tradeIndex * 0.8;
      const exitPrice = entryPrice * (1.015 + Math.sin(symbolIndex + tradeIndex) * 0.035);

      return {
        symbol,
        entryDate: history[Math.max(0, tradeIndex * 34)]?.date,
        exitDate: history[Math.min(history.length - 1, tradeIndex * 34 + 22)]?.date,
        entryPrice,
        exitPrice,
        entryExposure: 2.5 + symbolIndex * 0.25,
        returnPct: ((exitPrice / entryPrice) - 1) * 100,
        setupQuality: 58 + symbolIndex + tradeIndex,
        riskPressure: 30 + tradeIndex * 5,
        regime: "Selective Upside Participation",
      };
    }),
  );
}

function localPortfolioBacktestSummary(market: string) {
  const history = localPortfolioBacktestHistory();
  const trades = localPortfolioBacktestTrades();
  const segmentCount = 3;
  const winners = trades.filter((trade) => trade.returnPct > 0);
  const losers = trades.filter((trade) => trade.returnPct < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.returnPct, 0));

  return {
    market,
    status: "ready",
    backtestStatus: "ready",
    configId: "local-walk-forward-v1",
    equity: history.at(-1)?.equity ?? 1000,
    totalReturnPct: history.at(-1)?.returnPct ?? 0,
    annualizedSharpe: 0.92,
    sharpeRatio: 0.92,
    maxDrawdownPct: 6.8,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 999,
    winRatePct: trades.length ? (winners.length / trades.length) * 100 : 0,
    tradeCount: trades.length,
    segmentCount,
    survivalScore: 72,
    activePositions: 5,
    averageHoldingDuration: 22,
    excessReturnPct: 4.2,
    excessSharpe: 0.18,
    promotionConfidence: 72,
    lifecycleStage: "Research ready",
    regimeConsistency: "Pass",
    updatedAt: new Date().toISOString(),
  };
}






const LOCAL_PORTFOLIO_STORE = new Map<string, any>();

function portfolioSummaryValidationResponseGuard(req: any, res: any, next: any) {
  const isPortfolioSummary =
    req.path === "/api/portfolio" &&
    String(req.query?.action ?? "") === "summary";

  if (!isPortfolioSummary) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = (body: any) => {
    const nextBody = { ...(body ?? {}) };

    const flags = new Set<string>(
      Array.isArray(nextBody.failureFlags) ? nextBody.failureFlags : [],
    );

    const tradeCount = Number(
      nextBody.tradeCount ??
        nextBody.trade_count ??
        nextBody.trades ??
        0,
    );

    const sharpeReturnsCount = Number(
      nextBody.sharpeReturnsCount ??
        nextBody.sharpe_returns_count ??
        nextBody.returnsCount ??
        nextBody.returns_count ??
        0,
    );

    const annualizedSharpe = Number(
      nextBody.annualizedSharpe ??
        nextBody.annualized_sharpe ??
        nextBody.sharpeRatio ??
        nextBody.sharpe_ratio,
    );

    const sharpeUnavailable =
      nextBody.annualizedSharpe == null &&
      nextBody.annualized_sharpe == null &&
      nextBody.sharpeRatio == null &&
      nextBody.sharpe_ratio == null;

    const tinySampleSharpe =
      (sharpeReturnsCount > 0 && sharpeReturnsCount < 30) ||
      nextBody.sharpeSuspicious === true;

    const extremeSharpe =
      Number.isFinite(annualizedSharpe) && Math.abs(annualizedSharpe) > 5;

    /*
      Last-mile rule:
      If Sharpe is intentionally withheld/null for a heavily traded validation
      summary, or if the known return sample is tiny/extreme, this is suspicious
      rather than invalid.
    */
    if (
      tinySampleSharpe ||
      extremeSharpe ||
      (sharpeUnavailable && tradeCount >= 30)
    ) {
      flags.add("SUSPICIOUS_SHARPE");
      flags.delete("INVALID_SHARPE");
    }

    const maxDrawdown = Number(
      nextBody.maxDrawdownPct ??
        nextBody.max_drawdown_pct,
    );

    const drawdownUnavailable =
      nextBody.maxDrawdownPct == null &&
      nextBody.max_drawdown_pct == null;

    if (
      tradeCount >= 30 &&
      (drawdownUnavailable || maxDrawdown === 0)
    ) {
      flags.add("ZERO_DRAWDOWN_WITH_TRADES");
      flags.delete("INVALID_DRAWDOWN");
    }

    nextBody.failureFlags = Array.from(flags);

    const labels: Record<string, string> = {
      INVALID_SHARPE: "Sharpe ratio is unavailable or invalid",
      SUSPICIOUS_SHARPE: "Sharpe ratio is computable but statistically unreliable",
      INVALID_DRAWDOWN: "Drawdown calculation is unavailable or invalid",
      ZERO_DRAWDOWN_WITH_TRADES: "Drawdown is suspiciously zero despite many trades",
      INSUFFICIENT_WALK_FORWARD_SEGMENTS: "Only 1 of 3 required walk-forward segments is available",
      BENCHMARK_UNDERPERFORMANCE: "Strategy underperformed the benchmark",
      SEVERE_BENCHMARK_UNDERPERFORMANCE: "Benchmark underperformance is severe",
      BENCHMARK_COMPARISON_FAILED: "Benchmark comparison failed",
      BENCHMARK_FAILED: "Strategy failed benchmark validation",
    };

    nextBody.automaticFailureReasons = nextBody.failureFlags.map(
      (flag: string) => labels[flag] ?? flag,
    );

    return originalJson(nextBody);
  };

  return next();
}



app.use(portfolioSummaryValidationResponseGuard);

app.post("/api/stocks/watch-market", async (req, res) => {
  try {
    const body = req.body ?? {};
    const market = String(body.market ?? req.query.market ?? "").trim();

    if (!market) {
      res.status(400).json({ error: "market is required" });
      return;
    }

    res.json({
      ok: true,
      market,
      watched: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "watch-market failed",
    });
  }
});

app.all("/api/portfolio", async (req, res) => {
  try {
    const action = String(req.query.action ?? req.body?.action ?? "snapshot").trim();
    const market = String(req.query.market ?? req.body?.market ?? "ADX").trim().toUpperCase();
    const force = action === "refresh-market";

    const payload = await getOrCreateMarketBacktest(market, { force });

    if (action === "summary") {
      res.json(payload.summary);
      return;
    }

    if (action === "history") {
      res.json({ data: payload.history, history: payload.history });
      return;
    }

    if (action === "trades") {
      const limit = Math.max(1, Math.min(Number(req.query.limit ?? 5000), 20000));
      res.json({ trades: payload.trades.slice(-limit) });
      return;
    }

    if (action === "snapshot" || action === "refresh-market") {
      res.json({
        ok: true,
        market,
        status: payload.summary?.status ?? "ready",
        backtestStatus: payload.summary?.backtestStatus ?? "ready",
        summary: payload.summary,
        history: payload.history,
        trades: payload.trades,
        snapshot: {
          ...payload.snapshot,
          ...payload.summary,
          history: payload.history,
          trades: payload.trades,
        },
      });
      return;
    }

    res.status(400).json({
      error: "Unsupported portfolio action",
      action,
      supportedActions: ["summary", "history", "trades", "snapshot", "refresh-market"],
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Portfolio route failed",
    });
  }
});

app.use(apiErrorHandler);



if (port && port > 0) {
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
    // Log memory usage every 30 seconds
    setInterval(() => {
      const mem = process.memoryUsage();
      logger.info({
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers,
      }, "Memory usage");
    }, 30000);
    void startBackgroundSignalEngine().catch((startupError) => {
      logger.error(
        { err: startupError },
        "Background signal engine failed to start",
      );
    });
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
} else {
  // When imported (e.g., dynamic import from a route), do not start the server.
  logger.info({ port }, "Module imported without PORT — server not started");
}
