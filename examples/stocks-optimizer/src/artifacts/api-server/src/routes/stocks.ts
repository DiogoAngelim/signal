import { Router, type IRouter, type Request } from "express";
import { getOrCreateMarketBacktest } from "../lib/market-backtest.js";
import {
  attachSignalsToQuotes,
  fetchMarketQuotes,
} from "../lib/stock-data.js";
import {
  storeSignalEvents,
  type SignalScope,
} from "../lib/signal-backend.js";
import {
  sendSignalNotificationEmails,
  sendSignalNotificationTestEmail,
} from "../lib/signal-email.js";
import { loadTradingViewHistoricalBars } from "../lib/tradingview-history.js";
import { sizeFinancialExposure } from "../lib/financial-sizing.js";
import {
  accountabilityGetOperation,
  decisionCapabilitiesPayload,
  enrichStrategySignals,
  evaluateDecisionOperation,
  predictScenariosOperation,
  recordDecisionOutcomeOperation,
  replayDecisionOperation,
  simulateOperation,
  summarizeStrategyDecisionIntelligence,
} from "../lib/decision-intelligence.js";















function shouldSkipLocalQuoteSymbol(symbol: string) {
  const value = String(symbol ?? "").trim().toUpperCase();

  return (
    !value ||
    /\d{3,}$/.test(value) ||
    /^[A-Z]+\d{3,}$/.test(value) ||
    value.includes("TEST") ||
    value.includes("DUMMY")
  );
}



const router: IRouter = Router();

router.get("/decision/capabilities", (_req, res) => {
  res.json(decisionCapabilitiesPayload());
});

router.post("/decision/evaluate.v1", (req, res) => {
  res.json(evaluateDecisionOperation(req.body ?? {}));
});

router.post("/decision/replay.v1", (req, res) => {
  res.json(replayDecisionOperation(req.body ?? {}));
});

router.post("/decision/outcome.record.v1", (req, res) => {
  res.json(recordDecisionOutcomeOperation(req.body ?? {}));
});

router.get("/decision/accountability.get.v1", (req, res) => {
  res.json(accountabilityGetOperation(req.query ?? {}));
});

router.post("/decision/accountability.get.v1", (req, res) => {
  res.json(accountabilityGetOperation(req.body ?? {}));
});

router.post("/decision/scenarios.predict.v1", (req, res) => {
  res.json(predictScenariosOperation(req.body ?? {}));
});

router.post("/decision/simulate.v1", (req, res) => {
  res.json(simulateOperation(req.body ?? {}));
});

function forcedWalkForwardHistory() {
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

function forcedWalkForwardTrades() {
  const history = forcedWalkForwardHistory();
  const symbols = [
    "ADNOCGAS",
    "EAND",
    "ALDAR",
    "ADCB",
    "FAB",
    "TAQA",
    "ADNOCDRILL",
    "ADNOCDIST",
  ];

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

function forcedWalkForwardSummary(market: string) {
  const history = forcedWalkForwardHistory();
  const trades = forcedWalkForwardTrades();
  const winners = trades.filter((trade) => trade.returnPct > 0);
  const losers = trades.filter((trade) => trade.returnPct < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.returnPct, 0));

  return {
    market,
    configId: "local-walk-forward-v1",
    equity: history.at(-1)?.equity ?? 1000,
    totalReturnPct: history.at(-1)?.returnPct ?? 0,
    annualizedSharpe: 0.92,
    maxDrawdownPct: 6.8,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 999,
    winRatePct: trades.length ? (winners.length / trades.length) * 100 : 0,
    tradeCount: trades.length,
    segmentCount: 3,
    survivalScore: 72,
    updatedAt: new Date().toISOString(),
    note: "Forced local walk-forward data is active.",
  };
}



function normalizeStockListArray(value: any) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.stocks)) return value.stocks;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.symbols)) {
    return value.symbols.map((symbol: any, index: number) =>
      typeof symbol === "string"
        ? {
            symbol,
            ticker: symbol,
            name: symbol,
            price: 10 + index * 2.5,
            regularMarketPrice: 10 + index * 2.5,
            close: 10 + index * 2.5,
          }
        : symbol,
    );
  }

  return [];
}




function loadStockList(market: string, limit = 80) {
  const result = loadMarketList(market, limit);
  return normalizeStockListArray(result);
}

function loadMarketList(market: string, limit = 80) {
  const normalizedMarket = String(market ?? "").trim().toUpperCase();

  const fallbackByMarket: Record<string, string[]> = {
    ADX: ["ADNOCGAS", "EAND", "ALDAR", "ADCB", "FAB", "TAQA", "ADNOCDRILL", "ADNOCDIST"],
    B3: ["PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "WEGE3", "BBAS3", "RENT3"],
    BINANCE: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AAVEUSDT", "ADAUSDT"],
  };

  const symbols = fallbackByMarket[normalizedMarket] ?? fallbackByMarket.ADX;

  return normalizeStockListArray(symbols).slice(0, limit).map((symbol, index) => ({
    symbol,
    ticker: symbol,
    name: symbol,
    market: normalizedMarket,
    price: 10 + index * 2.5,
    regularMarketPrice: 10 + index * 2.5,
    close: 10 + index * 2.5,
  }));
}



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

let signalPersistenceWarningLogged = false;
let monthlyVolatilityPersistenceWarningLogged = false;
const MARKET_MONTHLY_VOLATILITY_REFRESH_INTERVAL_MS = Number(
  process.env.MARKET_MONTHLY_VOLATILITY_REFRESH_INTERVAL_MS ?? 60 * 60 * 1000,
);
const REFRESH_MARKET_MONTHLY_VOLATILITY_ON_QUOTES =
  process.env.MARKET_MONTHLY_VOLATILITY_REFRESH_ON_QUOTES === "true";
const SIGNAL_EMAIL_TEST_COOLDOWN_MS = Number(
  process.env.SIGNAL_EMAIL_TEST_COOLDOWN_MS ?? 60_000,
);
const STOCK_QUOTES_RESPONSE_BUDGET_MS = Number(
  process.env.STOCK_QUOTES_RESPONSE_BUDGET_MS ?? 45_000,
);
const STOCK_QUOTES_PERSISTENCE_ENABLED =
  process.env.STOCK_QUOTES_PERSISTENCE_ENABLED !== "false";

const STRATEGY_ROUTE_CACHE = new Map<string, { cachedAt: number; payload: any }>();
let lastSignalEmailTestAt = 0;

function resolveSignalScope(market: string): SignalScope {
  return {
    scopeCode: market,
    scopeType: "market",
  };
}

function hasSignalEmailTestAccess(req: Request): boolean {
  const secret = process.env.SIGNAL_EMAIL_TEST_SECRET?.trim() || process.env.ADMIN_SECRET?.trim();
  if (!secret) return true;

  const authorization = String(req.headers.authorization ?? "");
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";
  const headerToken = String(req.headers["x-signal-email-test-secret"] ?? "");

  return bearerToken === secret || headerToken === secret;
}

async function notifySignalEventsIfAvailable(
  scope: SignalScope,
  quotes: any[],
) {
  try {
    await storeSignalEvents(scope, quotes);
  } catch (error) {
    logger.warn(
      { err: error, scopeCode: scope.scopeCode, scopeType: scope.scopeType },
      "Signal event persistence unavailable; sending signal emails directly",
    );
    await sendSignalNotificationEmails(
      quotes.map((quote) => ({
        emittedAt: quote.signalEmittedAt,
        quote,
        scope,
      })),
    );
  }
}

function strategyNumeric(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function strategyClamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeStrategyTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function buildMinimalStrategyPayload(market: string, limitSymbols = 80) {
  const list = loadMarketList(market).length ? loadMarketList(market) : loadStockList(market);
  const items = normalizeStockListArray(list).slice(0, Math.max(1, limitSymbols));

  const signals = items.map((item: any, index: number) => {
    const symbol = normalizeStrategyTicker(item.symbol ?? item.ticker);
    const price = strategyNumeric(item.price, 0);
    const changePercent = strategyNumeric(item.changePercent, 0);

    const setupQuality = strategyClamp(
      strategyNumeric(item.setupQuality, 50 + Math.max(0, changePercent) * 4 + Math.max(0, 20 - index) * 0.25),
    );

    const riskPressure = strategyClamp(
      strategyNumeric(item.riskPressure, Math.max(15, 45 - Math.max(0, changePercent) * 2)),
    );

    const signalAction =
      setupQuality >= 62 && riskPressure < 55
        ? "Buy"
        : riskPressure > 72
          ? "Sell"
          : "Hold";

    const rawSuggestedExposure =
      signalAction === "Buy"
        ? strategyClamp((setupQuality - riskPressure * 0.35) / 15, 0, 5.5)
        : 0;
    const sizingConstraints = [
      {
        id: "signal-persistence",
        label: "Signal persistence",
        type: "soft" as const,
        passed: setupQuality >= 58,
        severity: "medium" as const,
        reason: "Signal persistence is not strong enough for full sizing.",
      },
      {
        id: "cross-timeframe-agreement",
        label: "Cross-timeframe agreement",
        type: "soft" as const,
        passed: setupQuality >= 62,
        severity: "high" as const,
        reason: "Cross-timeframe agreement is not confirmed in the local route.",
      },
      {
        id: "liquidity-data-availability",
        label: "Liquidity and data availability",
        type: "hard" as const,
        passed: price > 0,
        severity: "high" as const,
        reason: "Price data is incomplete for sizing.",
      },
      {
        id: "volatility-acceptance",
        label: "Volatility acceptance",
        type: "hard" as const,
        passed: riskPressure < 72,
        severity: "high" as const,
        reason: "Volatility or risk pressure is too high.",
      },
      {
        id: "confidence-stability",
        label: "Confidence stability",
        type: "soft" as const,
        passed: setupQuality >= 56,
        severity: "medium" as const,
        reason: "Confidence stability is weak.",
      },
      {
        id: "opportunity-density",
        label: "Opportunity density",
        type: "hard" as const,
        passed: signalAction === "Buy" && rawSuggestedExposure > 0,
        severity: "high" as const,
        reason: "Actionable opportunity density is too low.",
      },
      {
        id: "risk-gate",
        label: "Risk gate",
        type: "hard" as const,
        passed: riskPressure < 72,
        severity: "high" as const,
        reason: "Risk gate prevents position sizing.",
      },
    ];
    const financialSizing = sizeFinancialExposure({
      targetRef: symbol,
      actionRef: signalAction,
      confidence: setupQuality,
      riskPressure,
      requestedExposurePct: rawSuggestedExposure,
      availableExposurePct: 5.5,
      maxExposurePct: 5.5,
      constraints: sizingConstraints,
      viability: {
        expectedBenefit: strategyClamp(
          setupQuality * 0.6 +
            Math.max(0, changePercent) * 7,
        ),
        expectedCost: strategyClamp(Math.abs(changePercent) * 4),
        expectedRisk: riskPressure,
        uncertainty: 100 - setupQuality,
        confidence: setupQuality,
        minMarginOfSafety: 0,
        thresholds: {
          minConfidence: 56,
          maxRisk: 72,
          maxUncertainty: 70,
          maxCost: 85,
        },
        constraints: sizingConstraints.map((constraint) => ({
          id: constraint.id,
          label: constraint.label,
          type: constraint.type,
          hard: constraint.type === "hard",
          passed: constraint.passed,
          severity: constraint.severity,
          reason: constraint.reason,
        })),
        context: { changePercent },
      },
    });
    const suggestedExposure = signalAction === "Buy" ? financialSizing.suggestedExposurePct : 0;

    return {
      symbol,
      ticker: symbol,
      price,
      signalAction,
      allocationAction: signalAction,
      signalStatus: "provided",
      suggestedExposure,
      setupQuality,
      riskPressure,
      trendQuality: strategyClamp(setupQuality + changePercent),
      timingQuality: strategyClamp((setupQuality + Math.max(0, changePercent * 8)) / 2),
      expectedMove: changePercent,
      sizingMode: financialSizing.sizingMode,
      sizingReasons: financialSizing.sizingReasons,
      sizingConstraints: financialSizing.sizingConstraints,
      sizingResult: financialSizing.sizingResult,
      viabilityVerdict: financialSizing.viabilityVerdict,
      viabilityReason: financialSizing.viabilityReason,
      viabilityWarnings: financialSizing.viabilityWarnings,
      viabilityBlockers: financialSizing.viabilityBlockers,
      viabilityMarginOfSafety: financialSizing.viabilityMarginOfSafety,
      viabilityResult: financialSizing.viabilityResult,
      regime:
        riskPressure > 72
          ? "Capital Preservation Phase"
          : suggestedExposure <= 0
            ? "Defensive Environment"
            : setupQuality > 70
              ? "Constructive Trend Environment"
              : "Selective Upside Participation",
    };
  }).filter((signal) => signal.symbol);

  const decisionSignals = enrichStrategySignals(signals, { market });
  const buyCount = decisionSignals.filter((signal) => signal.signalAction === "Buy").length;
  const avgRisk = decisionSignals.length
    ? decisionSignals.reduce((sum, signal) => sum + strategyNumeric(signal.riskPressure), 0) / decisionSignals.length
    : 0;
  const avgQuality = decisionSignals.length
    ? decisionSignals.reduce((sum, signal) => sum + strategyNumeric(signal.setupQuality), 0) / decisionSignals.length
    : 0;

  const regime =
    avgRisk > 72
      ? "Capital Preservation Phase"
      : buyCount === 0
        ? "Defensive Environment"
        : avgQuality > 70
          ? "Constructive Trend Environment"
          : "Selective Upside Participation";

  const updatedAt = new Date().toISOString();

  return {
    ok: true,
    market,
    signals: decisionSignals,
    decisionIntelligence: summarizeStrategyDecisionIntelligence(decisionSignals),
    regime: {
      regime,
      configId: "local-walk-forward-v1",
      survivalScore: 72,
    },
    config: {
      id: "local-walk-forward-v1",
      mode: "minimal-local-route",
      note: "Local strategy route is active. Full walk-forward optimizer can replace this payload.",
    },
    summary: {
      market,
      configId: "local-walk-forward-v1",
      equity: 1000,
      totalReturnPct: 0,
      annualizedSharpe: 0.92,
      maxDrawdownPct: 6.8,
      profitFactor: 1.8,
      winRatePct: 62.5,
      tradeCount: forcedWalkForwardTrades().length,
      segmentCount: 3,
      survivalScore: 72,
      updatedAt,
      note: "Forced local walk-forward data is active.",
    },
    history: [],
    trades: [],
  };
}




async function handleStrategyRoute(req: any, res: any) {
  try {
    const action = String(req.query.action ?? req.body?.action ?? "").trim();
    const market = String(req.query.market ?? req.body?.market ?? "ADX").trim().toUpperCase();
    const runtimeMode = String(
      req.query.mode ??
        req.query.runtimeMode ??
        req.body?.mode ??
        req.body?.runtimeMode ??
        "",
    ).trim();
    const diagnosticsRequested =
      action === "diagnostics" ||
      req.query.diagnostics === "true" ||
      req.body?.diagnostics === true;
    let portfolioPayload: any = null;
    try {
      portfolioPayload = await getOrCreateMarketBacktest(market, {
        force: action === "walk-forward-market" || action === "diagnostics",
        diagnostics: diagnosticsRequested,
        debug: req.query.debug === "true" || req.body?.debug === true,
        persistDiagnostics: req.query.persistDiagnostics === "true" || req.body?.persistDiagnostics === true,
        runtimeMode,
      });

      if (!portfolioPayload) {
        res.status(500).json({ error: "Failed to load market backtest cache" });
        return;
      }
    } catch (err) {
      try { console.error("strategy backtest error:", err); } catch {}
      res.status(500).json({ error: "Failed to load market backtest cache", details: String(err) });
      return;
    }
    const summary = portfolioPayload.summary ?? portfolioPayload.snapshot ?? {};
    const history = portfolioPayload.history ?? [];
    const trades = portfolioPayload.trades ?? [];

    if (action === "diagnostics") {
      res.json({
        ok: true,
        market,
        summary,
        diagnostics: portfolioPayload.diagnostics ?? null,
        agencyDiagnostics: portfolioPayload.agencyDiagnostics ?? null,
        resolveDiagnostics: portfolioPayload.resolveDiagnostics ?? summary.resolveDiagnostics ?? null,
      });
      return;
    }

    if (action === "walk-forward-summary") {
      res.json(summary);
      return;
    }

    if (action === "walk-forward-history") {
      res.json({ data: history });
      return;
    }

    if (action === "walk-forward-trades") {
      const limit = Math.max(1, Math.min(Number(req.query.limit ?? 5000), 20000));
      res.json({ trades: trades.slice(-limit) });
      return;
    }

    if (action === "walk-forward-market" || action === "live-market") {
      const regime = {
        regime: history.at(-1)?.regime ?? "Constructive Trend Environment",
        survivalScore: summary.survivalScore ?? 0,
        configId: summary.configId ?? "local-walk-forward-v1",
      };
      const signals = enrichStrategySignals(
        Array.isArray(portfolioPayload.signals) ? portfolioPayload.signals : [],
        {
          market,
          summary,
          regime,
        },
      );

      res.json({
        ok: true,
        market,
        summary,
        config: {
          id: summary.configId ?? "local-walk-forward-v1",
          source: "portfolio-market-cache",
        },
        regime,
        signals,
        decisionIntelligence: summarizeStrategyDecisionIntelligence(signals),
        opportunityDiscovery: portfolioPayload.opportunityDiscovery ?? null,
        agencyDiagnostics: portfolioPayload.agencyDiagnostics ?? null,
        resolveDiagnostics: portfolioPayload.resolveDiagnostics ?? summary.resolveDiagnostics ?? null,
        diagnostics: diagnosticsRequested ? portfolioPayload.diagnostics ?? null : undefined,
      });
      return;
    }

    res.status(400).json({
      error: "Unsupported strategy action",
      action,
      supportedActions: [
        "live-market",
        "walk-forward-market",
        "walk-forward-summary",
        "walk-forward-history",
        "walk-forward-trades",
        "diagnostics",
      ],
    });
  } catch (error) {
    logger.error({ err: error }, "Strategy route failed");
    res.status(500).json({
      error: error instanceof Error ? error.message : "Strategy route failed",
    });
  }
}


async function handleStocksMarketsRoute(_req: any, res: any) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const publicDir =
      process.env.STOCKS_PUBLIC_DIR ||
      "/Users/diogoangelim/signal/examples/stocks-optimizer/src/artifacts/signal-markets/public";

    const entries = await fs.readdir(publicDir, { withFileTypes: true });

    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);

    const markets = new Map<string, {
      code: string;
      value?: string;
      market?: string;
      label?: string;
      name: string;
      displayName?: string;
      symbolCount: number;
      sourceFiles: string[];
    }>();

    for (const filename of jsonFiles) {
      let payload: any;

      try {
        payload = JSON.parse(await fs.readFile(path.join(publicDir, filename), "utf8"));
      } catch {
        continue;
      }

      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.stocks)
            ? payload.stocks
            : Array.isArray(payload?.symbols)
              ? payload.symbols
              : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.results)
                  ? payload.results
                  : [];

      const fallbackCode = String(
        payload?.market ??
          payload?.exchange ??
          payload?.scopeCode ??
          payload?.marketCode ??
          payload?.venue ??
          "",
      ).trim();

      const fallbackName = String(
        payload?.marketName ??
          payload?.exchangeName ??
          payload?.scopeName ??
          payload?.venueName ??
          payload?.name ??
          fallbackCode,
      ).trim();

      for (const row of rows) {
        const code = String(
          row?.market ??
            row?.exchange ??
            row?.scopeCode ??
            row?.marketCode ??
            row?.venue ??
            fallbackCode ??
            "",
        ).trim().toUpperCase();

        if (!code) continue;

        const name = String(
          row?.marketName ??
            row?.exchangeName ??
            row?.scopeName ??
            row?.venueName ??
            fallbackName ??
            code,
        ).trim();

        const existing = markets.get(code);

        if (existing) {
          existing.symbolCount += 1;
          existing.value = existing.value ?? existing.code;
          existing.market = existing.market ?? existing.code;
          existing.label = existing.label ?? existing.name ?? existing.code;
          existing.displayName = existing.displayName ?? existing.name ?? existing.code;

          if (!existing.sourceFiles.includes(filename)) {
            existing.sourceFiles.push(filename);
          }
        } else {
          markets.set(code, {
            code,
            value: code,
            market: code,
            label: name || code,
            name: name || code,
            displayName: name || code,
            symbolCount: 1,
            sourceFiles: [filename],
          });
        }
      }
    }

    const data = Array.from(markets.values())
      .filter((market) => market.code)
      .map((market) => ({
        ...market,
        value: market.value ?? market.code,
        market: market.market ?? market.code,
        label: market.label ?? market.name ?? market.code,
        name: market.name ?? market.label ?? market.code,
        displayName: market.displayName ?? market.name ?? market.label ?? market.code,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    res.json({
      data,
      count: data.length,
      publicDir,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load markets from stock-list JSON files",
    });
  }
}



async function handleStocksListRoute(req: any, res: any) {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const market = String(req.query.market ?? "").trim().toUpperCase();
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.max(1, Math.min(Number(req.query.limit ?? 500), 5000));

    if (!market) {
      res.status(400).json({ error: "market is required" });
      return;
    }

    const publicDir =
      process.env.STOCKS_PUBLIC_DIR ||
      "/Users/diogoangelim/signal/examples/stocks-optimizer/src/artifacts/signal-markets/public";

    const entries = await fs.readdir(publicDir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);

    const rows: any[] = [];

    for (const filename of jsonFiles) {
      let payload: any;

      try {
        payload = JSON.parse(await fs.readFile(path.join(publicDir, filename), "utf8"));
      } catch {
        continue;
      }

      const fileRows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.stocks)
            ? payload.stocks
            : Array.isArray(payload?.symbols)
              ? payload.symbols
              : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload?.results)
                  ? payload.results
                  : [];

      const fallbackMarket = String(
        payload?.market ??
          payload?.exchange ??
          payload?.scopeCode ??
          payload?.marketCode ??
          payload?.venue ??
          "",
      ).trim().toUpperCase();

      for (const row of fileRows) {
        const rowMarket = String(
          row?.market ??
            row?.exchange ??
            row?.scopeCode ??
            row?.marketCode ??
            row?.venue ??
            fallbackMarket ??
            "",
        ).trim().toUpperCase();

        if (rowMarket !== market) continue;

        const symbol = String(row?.symbol ?? row?.ticker ?? row?.code ?? row?.name ?? "").trim();
        if (!symbol) continue;

        rows.push({
          ...row,
          symbol,
          ticker: row?.ticker ?? symbol,
          name: row?.name ?? row?.description ?? symbol,
          market,
          exchange: row?.exchange ?? market,
          sourceFile: filename,
        });
      }
    }

    const data = rows.slice(offset, offset + limit);

    res.json({
      data,
      market,
      offset,
      limit,
      total: rows.length,
      count: data.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load stocks from JSON files",
    });
  }
}



router.get("/stocks/list", handleStocksListRoute);

router.get("/stocks/markets", handleStocksMarketsRoute);

router.post("/stocks/signals/email-test", async (req, res) => {
  if (!hasSignalEmailTestAccess(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const now = Date.now();
  if (now - lastSignalEmailTestAt < SIGNAL_EMAIL_TEST_COOLDOWN_MS) {
    res.status(429).json({ error: "Email test is cooling down" });
    return;
  }

  const result = await sendSignalNotificationTestEmail(req.body ?? {});
  if (result.sent) {
    lastSignalEmailTestAt = now;
    res.json({ data: result });
    return;
  }

  const statusCode =
    result.reason === "missing-provider"
      ? 503
      : result.reason === "disabled"
        ? 409
        : 500;
  res.status(statusCode).json({ error: result.reason, data: result });
});


async function handleStocksQuotesRoute(req: any, res: any) {
  try {
    const market = String(req.body?.market ?? req.query.market ?? "").trim().toUpperCase();
    const symbols = Array.isArray(req.body?.symbols)
      ? req.body.symbols.map((symbol: unknown) => String(symbol).trim()).filter(Boolean)
      : [];
    const startedAt = Date.now();

    if (!market) {
      res.status(400).json({ error: "market is required" });
      return;
    }

    if (!symbols.length) {
      res.status(400).json({ error: "symbols array is required" });
      return;
    }

    const timeoutMs = Math.max(5_000, Number(req.body?.timeoutMs ?? req.query.timeoutMs ?? 45_000));
    const deadlineAt = Date.now() + timeoutMs;
    const quotes = await fetchMarketQuotes(market, symbols, {
      bypassCache: req.body?.bypass === true,
      deadlineAt,
      minRemainingMs: 2_500,
    });
    const withSignals = req.body?.withSignals !== false && req.query.withSignals !== "false";
    const enriched = withSignals
      ? await attachSignalsToQuotes(quotes, market, {
          deadlineAt,
          minRemainingMs: 1_500,
          recordSignalSnapshots: req.body?.recordSignalSnapshots !== false,
        })
      : quotes;
    if (withSignals && STOCK_QUOTES_PERSISTENCE_ENABLED && enriched.length) {
      await notifySignalEventsIfAvailable(resolveSignalScope(market), enriched);
    }
    const quoteSymbols = new Set(enriched.map((quote: any) => String(quote.symbol ?? "").toUpperCase()));
    const unavailableSymbols = symbols.filter((symbol: string) => !quoteSymbols.has(symbol.toUpperCase()));
    const responseQuotes = enriched.map((quote: any) => ({
      ...quote,
      ticker: quote.ticker ?? quote.symbol,
      market,
      close: quote.close ?? quote.price,
      last: quote.last ?? quote.price,
      lastPrice: quote.lastPrice ?? quote.price,
      regularMarketPrice: quote.regularMarketPrice ?? quote.price,
      regularMarketChangePercent: quote.regularMarketChangePercent ?? quote.changePercent,
      quoteStatus: "available",
      source: quote.source ?? quote.quoteSource ?? "tradingview-data",
      provider: quote.provider ?? "tradingview-data",
      sampleCount: Array.isArray(quote.history) ? quote.history.length : 0,
      updatedAt: quote.updatedAt ?? new Date().toISOString(),
    }));

    res.json({
      data: {
        market,
        requestedSymbols: symbols,
        unavailableSymbols,
        deferredSymbols: [],
        partial: unavailableSymbols.length > 0,
        quotes: responseQuotes,
        elapsedMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load quotes",
    });
  }
}



router.post("/stocks/quotes", handleStocksQuotesRoute);


async function loadStockRowForHistory(market: string, symbol: string) {
  try {
    const port = process.env.PORT ?? "4010";
    const internalBase = process.env.INTERNAL_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${port}`);
    const response = await fetch(
      `${internalBase}/api/stocks/list?market=${encodeURIComponent(market)}&offset=0&limit=5000`,
    );

    if (!response.ok) return null;

    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    return rows.find((row: any) => {
      const rowSymbol = String(row?.symbol ?? row?.ticker ?? row?.code ?? row?.name ?? "").trim().toUpperCase();
      return rowSymbol === symbol.toUpperCase();
    }) ?? null;
  } catch {
    return null;
  }
}

router.get("/stocks/history", async (req, res) => {
  try {
    const market = String(req.query.market ?? "").trim().toUpperCase();
    const symbol = String(req.query.symbol ?? "").trim().toUpperCase();
    const days = Math.max(60, Math.min(Number(req.query.days ?? 252), 720));

    if (!market || !symbol) {
      res.status(400).json({ error: "market and symbol are required" });
      return;
    }

    const data = await loadTradingViewHistoricalBars(market, symbol, {
      bars: days,
      lookbackYears: Math.max(1, Math.ceil(days / 252)),
      minBars: 2,
    });

    res.json({
      market,
      symbol,
      provider: "tradingview-data",
      source: data[0]?.source ?? "tradingview-data",
      sourceStatus: data.length ? data[0]?.sourceStatus ?? "delayed" : "unavailable",
      dataQuality: data.length ? data[0]?.dataQuality ?? "real" : "degraded",
      data,
      count: data.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load stock history",
    });
  }
});


router.get("/strategy", handleStrategyRoute);
router.post("/strategy", handleStrategyRoute);


export default router;
