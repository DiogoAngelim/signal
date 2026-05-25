import { Router } from "express";
import type { Request, Response } from "express";
import type {
  DecisionCard,
  MetricsGroups,
  ThresholdRow,
  ActivationConditions,
  SystemState,
  Exchange,
  Signal,
  SignalsResponse,
  TradeHistory,
  TradeRecord,
  PnlPoint,
} from "@workspace/api-zod";

const router = Router();

// ─── Static exchange list ────────────────────────────────────────────────────

const EXCHANGES: Exchange[] = [
  { id: "nasdaq", name: "NASDAQ", region: "US", assetClass: "Equities", currency: "USD" },
  { id: "nyse", name: "NYSE", region: "US", assetClass: "Equities", currency: "USD" },
  { id: "lse", name: "London Stock Exchange", region: "EU", assetClass: "Equities", currency: "GBP" },
  { id: "euronext", name: "Euronext", region: "EU", assetClass: "Equities", currency: "EUR" },
  { id: "tse", name: "Tokyo Stock Exchange", region: "APAC", assetClass: "Equities", currency: "JPY" },
  { id: "hkex", name: "Hong Kong Exchange", region: "APAC", assetClass: "Equities", currency: "HKD" },
  { id: "asx", name: "ASX", region: "APAC", assetClass: "Equities", currency: "AUD" },
  { id: "binance", name: "Binance", region: "Global", assetClass: "Crypto", currency: "USD" },
  { id: "coinbase", name: "Coinbase", region: "US", assetClass: "Crypto", currency: "USD" },
  { id: "cme", name: "CME Group", region: "US", assetClass: "Futures", currency: "USD" },
  { id: "forex", name: "Forex / OTC", region: "Global", assetClass: "FX", currency: "USD" },
];

// ─── Signal data per exchange ─────────────────────────────────────────────────

function buildSignals(exchange: string, mode: string, budget: number): Signal[] {
  const now = new Date().toISOString();
  const multiplier = mode === "aggressive" ? 1.4 : mode === "conservative" ? 0.6 : 1.0;

  const signalsByExchange: Record<string, Signal[]> = {
    nasdaq: [
      { id: "sig-1", ticker: "NVDA", direction: "buy", exchange: "nasdaq", confidence: 82.4, amountPct: parseFloat((5.2 * multiplier).toFixed(1)), amountUnits: Math.round(12 * multiplier), price: 894.5, rationale: "Strong momentum breakout above 20-day MA with volume confirmation", generatedAt: now },
      { id: "sig-2", ticker: "MSFT", direction: "buy", exchange: "nasdaq", confidence: 74.1, amountPct: parseFloat((3.8 * multiplier).toFixed(1)), amountUnits: Math.round(8 * multiplier), price: 412.3, rationale: "Cloud segment beat + institutional accumulation signal", generatedAt: now },
      { id: "sig-3", ticker: "INTC", direction: "sell", exchange: "nasdaq", confidence: 71.6, amountPct: parseFloat((2.1 * multiplier).toFixed(1)), amountUnits: Math.round(45 * multiplier), price: 31.2, rationale: "Margin compression + competitor share gains in datacenter CPU", generatedAt: now },
      { id: "sig-4", ticker: "AMZN", direction: "buy", exchange: "nasdaq", confidence: 68.9, amountPct: parseFloat((4.1 * multiplier).toFixed(1)), amountUnits: Math.round(10 * multiplier), price: 182.7, rationale: "AWS re-acceleration and margin expansion trend intact", generatedAt: now },
      { id: "sig-5", ticker: "TSLA", direction: "sell", exchange: "nasdaq", confidence: 66.3, amountPct: parseFloat((1.8 * multiplier).toFixed(1)), amountUnits: Math.round(14 * multiplier), price: 247.4, rationale: "Delivery miss risk + EV margin headwind from price cuts", generatedAt: now },
    ],
    nyse: [
      { id: "sig-6", ticker: "JPM", direction: "buy", exchange: "nyse", confidence: 79.2, amountPct: parseFloat((4.4 * multiplier).toFixed(1)), amountUnits: Math.round(18 * multiplier), price: 193.8, rationale: "Net interest income expansion + strong trading desk performance", generatedAt: now },
      { id: "sig-7", ticker: "XOM", direction: "sell", exchange: "nyse", confidence: 72.8, amountPct: parseFloat((2.6 * multiplier).toFixed(1)), amountUnits: Math.round(22 * multiplier), price: 118.5, rationale: "Crude inventory build + demand slowdown signal from shipping data", generatedAt: now },
      { id: "sig-8", ticker: "WMT", direction: "buy", exchange: "nyse", confidence: 70.5, amountPct: parseFloat((3.2 * multiplier).toFixed(1)), amountUnits: Math.round(20 * multiplier), price: 68.4, rationale: "Defensive positioning + grocery share gains vs discount peers", generatedAt: now },
      { id: "sig-9", ticker: "GS", direction: "buy", exchange: "nyse", confidence: 65.1, amountPct: parseFloat((2.9 * multiplier).toFixed(1)), amountUnits: Math.round(6 * multiplier), price: 448.2, rationale: "IB pipeline recovery and fixed income strength", generatedAt: now },
    ],
    binance: [
      { id: "sig-10", ticker: "BTC/USDT", direction: "buy", exchange: "binance", confidence: 76.3, amountPct: parseFloat((6.2 * multiplier).toFixed(1)), amountUnits: parseFloat((0.14 * multiplier).toFixed(3)), price: 68420.0, rationale: "Spot ETF inflow acceleration + hash rate all-time high signal", generatedAt: now },
      { id: "sig-11", ticker: "ETH/USDT", direction: "buy", exchange: "binance", confidence: 68.7, amountPct: parseFloat((3.8 * multiplier).toFixed(1)), amountUnits: parseFloat((1.8 * multiplier).toFixed(2)), price: 3640.5, rationale: "Layer-2 TVL growth + staking yield compression improving", generatedAt: now },
      { id: "sig-12", ticker: "SOL/USDT", direction: "sell", exchange: "binance", confidence: 63.2, amountPct: parseFloat((2.1 * multiplier).toFixed(1)), amountUnits: parseFloat((8.5 * multiplier).toFixed(1)), price: 142.3, rationale: "Validator concentration risk + network congestion events", generatedAt: now },
    ],
    lse: [
      { id: "sig-13", ticker: "HSBA", direction: "buy", exchange: "lse", confidence: 73.4, amountPct: parseFloat((3.6 * multiplier).toFixed(1)), amountUnits: Math.round(280 * multiplier), price: 7.14, rationale: "Asia revenue resilience + GBP weakness tailwind for repatriated earnings", generatedAt: now },
      { id: "sig-14", ticker: "BP.", direction: "sell", exchange: "lse", confidence: 69.1, amountPct: parseFloat((2.3 * multiplier).toFixed(1)), amountUnits: Math.round(190 * multiplier), price: 4.68, rationale: "Renewable transition capex acceleration reducing near-term FCF", generatedAt: now },
      { id: "sig-15", ticker: "AZN", direction: "buy", exchange: "lse", confidence: 77.8, amountPct: parseFloat((4.1 * multiplier).toFixed(1)), amountUnits: Math.round(35 * multiplier), price: 124.5, rationale: "Oncology pipeline catalyst + emerging market access expansion", generatedAt: now },
    ],
    cme: [
      { id: "sig-16", ticker: "ES1!", direction: "sell", exchange: "cme", confidence: 71.2, amountPct: parseFloat((3.2 * multiplier).toFixed(1)), amountUnits: Math.round(2 * multiplier), price: 5320.5, rationale: "Overbought RSI at resistance + FOMC hawkish lean risk", generatedAt: now },
      { id: "sig-17", ticker: "GC1!", direction: "buy", exchange: "cme", confidence: 75.6, amountPct: parseFloat((4.5 * multiplier).toFixed(1)), amountUnits: Math.round(3 * multiplier), price: 2388.4, rationale: "Central bank accumulation + real yield decline supporting precious metals", generatedAt: now },
      { id: "sig-18", ticker: "CL1!", direction: "sell", exchange: "cme", confidence: 64.8, amountPct: parseFloat((2.1 * multiplier).toFixed(1)), amountUnits: Math.round(4 * multiplier), price: 81.7, rationale: "OPEC+ compliance weakness + US inventory build 3rd consecutive week", generatedAt: now },
    ],
  };

  const defaultSignals: Signal[] = [
    { id: "sig-def-1", ticker: "SPY", direction: "buy", exchange: exchange, confidence: 71.0, amountPct: parseFloat((4.0 * multiplier).toFixed(1)), amountUnits: Math.round(15 * multiplier), price: 528.3, rationale: "Broad market momentum intact + breadth improving", generatedAt: now },
    { id: "sig-def-2", ticker: "QQQ", direction: "buy", exchange: exchange, confidence: 68.5, amountPct: parseFloat((3.2 * multiplier).toFixed(1)), amountUnits: Math.round(10 * multiplier), price: 441.7, rationale: "Tech sector leadership persists on AI capital cycle", generatedAt: now },
    { id: "sig-def-3", ticker: "TLT", direction: "sell", exchange: exchange, confidence: 66.2, amountPct: parseFloat((2.4 * multiplier).toFixed(1)), amountUnits: Math.round(25 * multiplier), price: 91.2, rationale: "Duration risk elevated ahead of potential rate re-pricing", generatedAt: now },
  ];

  const list = signalsByExchange[exchange] || defaultSignals;

  // Adjust position sizes based on budget
  if (budget !== 0 && Math.abs(budget) > 0) {
    return list.map((s) => ({
      ...s,
      amountUnits: budget > 0
        ? parseFloat((s.amountUnits * (budget / 100000)).toFixed(2))
        : 0,
    }));
  }
  return list;
}

// ─── Trade history ─────────────────────────────────────────────────────────

function buildTradeHistory(exchange: string, mode: string): TradeHistory {
  const multiplier = mode === "aggressive" ? 1.5 : mode === "conservative" ? 0.6 : 1.0;

  // Generate 90 days of chart data
  const chartData: PnlPoint[] = [];
  let cumPnl = 0;
  const start = new Date();
  start.setDate(start.getDate() - 90);

  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    // Simulate realistic equity curve with some noise and general trend
    const base = (Math.sin(i * 0.12) * 1200 + i * 38 - 800) * multiplier;
    const noise = (Math.sin(i * 3.7) * 420 + Math.cos(i * 2.1) * 280) * multiplier;
    const daily = parseFloat((base * 0.02 + noise * 0.01).toFixed(2));
    cumPnl = parseFloat((cumPnl + daily).toFixed(2));
    chartData.push({ date: dateStr, cumulativePnl: cumPnl, dailyPnl: daily });
  }

  const tickersByExchange: Record<string, string[]> = {
    nasdaq: ["NVDA", "MSFT", "AMZN", "GOOGL", "META", "AAPL", "INTC", "AMD"],
    nyse: ["JPM", "WMT", "XOM", "GS", "BAC", "CVX", "JNJ", "PG"],
    binance: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "AVAX/USDT"],
    lse: ["HSBA", "AZN", "BP.", "SHEL", "GSK", "ULVR"],
    cme: ["ES1!", "GC1!", "CL1!", "NQ1!", "ZB1!"],
  };
  const tickers = tickersByExchange[exchange] || ["SPY", "QQQ", "TLT", "IWM", "GLD"];

  const trades: TradeRecord[] = [];
  let winCount = 0;
  let lossCount = 0;
  let totalPnl = 0;

  for (let i = 0; i < 24; i++) {
    const openDays = 90 - i * 3 - Math.floor(Math.random() * 2);
    const holdDays = Math.floor(Math.random() * 5) + 1;
    const openDate = new Date(start);
    openDate.setDate(openDate.getDate() + openDays);
    const closeDate = new Date(openDate);
    closeDate.setDate(closeDate.getDate() + holdDays);

    const ticker = tickers[i % tickers.length];
    const direction = i % 3 === 0 ? "short" : "long";
    const entry = 100 + Math.sin(i * 1.7) * 40 + i * 2;
    const pnlPct = (Math.sin(i * 2.3) * 4.2 + (i % 2 === 0 ? 0.8 : -0.6)) * multiplier;
    const exit = entry * (1 + pnlPct / 100);
    const units = Math.max(1, Math.round((20 - i * 0.5) * multiplier));
    const pnl = parseFloat(((exit - entry) * units * (direction === "short" ? -1 : 1)).toFixed(2));
    totalPnl += pnl;
    if (pnl >= 0) winCount++; else lossCount++;

    trades.push({
      id: `trade-${i + 1}`,
      ticker,
      direction,
      exchange,
      openedAt: openDate.toISOString(),
      closedAt: closeDate.toISOString(),
      entryPrice: parseFloat(entry.toFixed(2)),
      exitPrice: parseFloat(exit.toFixed(2)),
      units,
      pnl,
      pnlPct: parseFloat(pnlPct.toFixed(2)),
    });
  }

  trades.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());

  return {
    trades,
    chartData,
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    totalPnlPct: parseFloat(((totalPnl / 100000) * 100).toFixed(2)),
    winCount,
    lossCount,
    exchange,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/capital-desk/decision", (_req: Request, res: Response): void => {
  const decision: DecisionCard = {
    decision: "Do Not Trade",
    confidence: 41.2,
    allocationPct: 0,
    timestamp: new Date().toISOString(),
    decisionColor: "red",
    reasoning:
      "Sharpe ratio (0.68) and win rate (47.3%) are both below required thresholds. Model trust insufficient for deployment.",
  };
  res.json(decision);
});

router.get("/capital-desk/metrics", (_req: Request, res: Response): void => {
  const metrics: MetricsGroups = {
    evaluatedAt: new Date().toISOString(),
    groups: [
      {
        group: "Performance",
        metrics: [
          { label: "Sharpe Ratio", value: 0.68, unit: "ratio", displayValue: "0.68", status: "fail", trend: "down" },
          { label: "Win Rate", value: 47.3, unit: "%", displayValue: "47.3%", status: "fail", trend: "down" },
          { label: "Avg Return / Trade", value: 0.31, unit: "%", displayValue: "0.31%", status: "warn", trend: "flat" },
          { label: "Profit Factor", value: 1.12, unit: "ratio", displayValue: "1.12", status: "warn", trend: "flat" },
          { label: "Annualised Return", value: 8.4, unit: "%", displayValue: "8.4%", status: "warn", trend: "up" },
        ],
      },
      {
        group: "Risk",
        metrics: [
          { label: "Max Drawdown", value: -18.7, unit: "%", displayValue: "-18.7%", status: "fail", trend: "down" },
          { label: "Volatility (Ann.)", value: 22.4, unit: "%", displayValue: "22.4%", status: "fail", trend: "up" },
          { label: "VaR 95% (1-day)", value: -2.1, unit: "%", displayValue: "-2.1%", status: "warn", trend: "flat" },
          { label: "Calmar Ratio", value: 0.45, unit: "ratio", displayValue: "0.45", status: "fail", trend: "down" },
          { label: "Beta vs SPY", value: 0.89, unit: "ratio", displayValue: "0.89", status: "pass", trend: "flat" },
        ],
      },
      {
        group: "Data Quality",
        metrics: [
          { label: "Coverage", value: 94.1, unit: "%", displayValue: "94.1%", status: "pass", trend: "up" },
          { label: "Staleness (avg hrs)", value: 0.4, unit: "ratio", displayValue: "0.4h", status: "pass", trend: "flat" },
          { label: "Feature Completeness", value: 88.6, unit: "%", displayValue: "88.6%", status: "warn", trend: "flat" },
          { label: "Outlier Rate", value: 1.8, unit: "%", displayValue: "1.8%", status: "pass", trend: "flat" },
        ],
      },
      {
        group: "Model Trust",
        metrics: [
          { label: "OOS Accuracy", value: 53.1, unit: "%", displayValue: "53.1%", status: "fail", trend: "down" },
          { label: "Backtest / Live Drift", value: 12.4, unit: "%", displayValue: "12.4%", status: "fail", trend: "up" },
          { label: "Signal Correlation", value: 0.71, unit: "ratio", displayValue: "0.71", status: "pass", trend: "flat" },
          { label: "Model Age (days)", value: 47, unit: "days", displayValue: "47d", status: "warn", trend: "up" },
          { label: "Confidence Score", value: 41.2, unit: "%", displayValue: "41.2%", status: "fail", trend: "down" },
        ],
      },
    ],
  };
  res.json(metrics);
});

router.get("/capital-desk/thresholds", (_req: Request, res: Response): void => {
  const thresholds: ThresholdRow[] = [
    { metric: "Sharpe Ratio", value: "0.68", required: "≥ 1.00", status: "fail", group: "Performance", delta: "-0.32" },
    { metric: "Win Rate", value: "47.3%", required: "≥ 52%", status: "fail", group: "Performance", delta: "-4.7pp" },
    { metric: "Avg Return / Trade", value: "0.31%", required: "≥ 0.25%", status: "warn", group: "Performance", delta: "+0.06pp" },
    { metric: "Profit Factor", value: "1.12", required: "≥ 1.30", status: "warn", group: "Performance", delta: "-0.18" },
    { metric: "Annualised Return", value: "8.4%", required: "≥ 12%", status: "warn", group: "Performance", delta: "-3.6pp" },
    { metric: "Max Drawdown", value: "-18.7%", required: "≥ -15%", status: "fail", group: "Risk", delta: "-3.7pp" },
    { metric: "Volatility (Ann.)", value: "22.4%", required: "≤ 20%", status: "fail", group: "Risk", delta: "+2.4pp" },
    { metric: "VaR 95% (1-day)", value: "-2.1%", required: "≥ -2.5%", status: "warn", group: "Risk", delta: "+0.4pp" },
    { metric: "Calmar Ratio", value: "0.45", required: "≥ 0.60", status: "fail", group: "Risk", delta: "-0.15" },
    { metric: "Beta vs SPY", value: "0.89", required: "≤ 1.10", status: "pass", group: "Risk", delta: "-0.21" },
    { metric: "Coverage", value: "94.1%", required: "≥ 90%", status: "pass", group: "Data Quality", delta: "+4.1pp" },
    { metric: "Staleness (avg hrs)", value: "0.4h", required: "≤ 2.0h", status: "pass", group: "Data Quality", delta: "-1.6h" },
    { metric: "Feature Completeness", value: "88.6%", required: "≥ 90%", status: "warn", group: "Data Quality", delta: "-1.4pp" },
    { metric: "Outlier Rate", value: "1.8%", required: "≤ 3%", status: "pass", group: "Data Quality", delta: "-1.2pp" },
    { metric: "OOS Accuracy", value: "53.1%", required: "≥ 57%", status: "fail", group: "Model Trust", delta: "-3.9pp" },
    { metric: "Backtest / Live Drift", value: "12.4%", required: "≤ 8%", status: "fail", group: "Model Trust", delta: "+4.4pp" },
    { metric: "Signal Correlation", value: "0.71", required: "≥ 0.65", status: "pass", group: "Model Trust", delta: "+0.06" },
    { metric: "Model Age (days)", value: "47d", required: "≤ 60d", status: "warn", group: "Model Trust", delta: "-13d" },
    { metric: "Confidence Score", value: "41.2%", required: "≥ 55%", status: "fail", group: "Model Trust", delta: "-13.8pp" },
  ];
  res.json(thresholds);
});

router.get("/capital-desk/activation-conditions", (_req: Request, res: Response): void => {
  const conditions: ActivationConditions = {
    currentDecision: "Do Not Trade",
    targetDecision: "Trade",
    conditions: [
      { label: "Sharpe Ratio", current: "0.68", required: "≥ 1.00", met: false },
      { label: "Win Rate", current: "47.3%", required: "≥ 52%", met: false },
      { label: "Max Drawdown within limit", current: "-18.7%", required: "≥ -15%", met: false },
      { label: "Volatility (Ann.)", current: "22.4%", required: "≤ 20%", met: false },
      { label: "OOS Accuracy", current: "53.1%", required: "≥ 57%", met: false },
      { label: "Backtest / Live Drift", current: "12.4%", required: "≤ 8%", met: false },
      { label: "Confidence Score", current: "41.2%", required: "≥ 55%", met: false },
      { label: "Calmar Ratio", current: "0.45", required: "≥ 0.60", met: false },
      { label: "Data Coverage", current: "94.1%", required: "≥ 90%", met: true },
      { label: "Signal Correlation", current: "0.71", required: "≥ 0.65", met: true },
      { label: "Beta vs SPY", current: "0.89", required: "≤ 1.10", met: true },
      { label: "Feature Completeness", current: "88.6%", required: "≥ 90%", met: false },
    ],
  };
  res.json(conditions);
});

router.get("/capital-desk/system-state", (_req: Request, res: Response): void => {
  const state: SystemState = {
    lifecycleMode: "Warmup",
    closedTrades: 214,
    coveragePct: 94.1,
    lastEvaluation: new Date().toISOString(),
    maturityScore: 41.2,
    notes:
      "Model is in warmup phase. 8 of 12 activation conditions unmet. Awaiting Sharpe ≥ 1.0 and Win Rate ≥ 52% before transitioning to Active.",
  };
  res.json(state);
});

router.get("/capital-desk/exchanges", (_req: Request, res: Response): void => {
  res.json(EXCHANGES);
});

router.get("/capital-desk/signals", (req: Request, res: Response): void => {
  const exchange = (req.query["exchange"] as string) || "nasdaq";
  const mode = (req.query["mode"] as string) || "balanced";
  const budget = parseFloat((req.query["budget"] as string) || "0");

  const signals = buildSignals(exchange, mode, budget);
  const response: SignalsResponse = {
    signals,
    exchange,
    mode,
    budget,
    generatedAt: new Date().toISOString(),
  };
  res.json(response);
});

router.get("/capital-desk/trade-history", (req: Request, res: Response): void => {
  const exchange = (req.query["exchange"] as string) || "nasdaq";
  const mode = (req.query["mode"] as string) || "balanced";
  res.json(buildTradeHistory(exchange, mode));
});

export default router;
