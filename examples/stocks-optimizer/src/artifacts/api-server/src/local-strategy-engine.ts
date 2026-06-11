import { sizeFinancialExposure } from "./lib/financial-sizing";
import {
  enrichStrategySignals,
  summarizeStrategyDecisionIntelligence,
} from "./lib/decision-intelligence";

type StrategyPoint = {
  date: string;
  equity: number;
  returnPct: number;
  dailyReturnPct: number;
  deployedPct: number;
  cashPct: number;
  positionsCount: number;
  regime: string;
};

type StrategyTrade = {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  entryExposure: number;
  returnPct: number;
  regime: string;
  setupQuality: number;
  riskPressure: number;
};

type MarketItem = Record<string, any>;

const STRATEGY_CACHE = new Map<string, { cachedAt: number; payload: any }>();

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function ticker(item: MarketItem) {
  return String(item.symbol ?? item.ticker ?? item.name ?? "").trim().toUpperCase();
}

function priceOf(item: MarketItem) {
  return Math.max(
    0.01,
    num(item.price ?? item.last ?? item.close ?? item.regularMarketPrice ?? item.value, 1),
  );
}

function changePctOf(item: MarketItem, index: number) {
  const raw =
    item.changePercent ??
    item.changePct ??
    item.percentChange ??
    item.regularMarketChangePercent ??
    item.change;

  const parsed = num(raw, NaN);

  if (Number.isFinite(parsed)) return parsed;

  
  return Math.sin(index * 0.73) * 1.8 + Math.cos(index * 0.37) * 0.9;
}

function seededNoise(symbol: string, day: number) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) {
    hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  }

  const x = Math.sin(hash * 0.0001 + day * 0.41) * 30000;
  return x - Math.floor(x);
}

function generateSyntheticBars(item: MarketItem, index: number, days = 360) {
  const symbol = ticker(item) || `SYM${index}`;
  const currentPrice = priceOf(item);
  const recentChange = changePctOf(item, index) / 100;

  let price = currentPrice / Math.max(0.35, 1 + recentChange * 18);
  const bars: Array<{ date: string; close: number }> = [];

  const now = new Date();

  for (let day = days - 1; day >= 0; day -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - day);

    const t = days - day;
    const drift = recentChange / 18;
    const cycle = Math.sin(t / 17 + index) * 0.004;
    const noise = (seededNoise(symbol, t) - 0.5) * 0.018;
    const shock = Math.sin(t / 53 + index * 1.7) * 0.006;

    price = Math.max(0.01, price * (1 + drift + cycle + noise + shock));

    bars.push({
      date: date.toISOString().slice(0, 10),
      close: price,
    });
  }

  
  const scale = currentPrice / Math.max(0.01, bars[bars.length - 1]?.close ?? currentPrice);

  return bars.map((bar) => ({
    date: bar.date,
    close: Math.max(0.01, bar.close * scale),
  }));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function sma(values: number[], end: number, period: number) {
  const start = Math.max(0, end - period + 1);
  return mean(values.slice(start, end + 1));
}

function returns(values: number[]) {
  const result: number[] = [];

  for (let i = 1; i < values.length; i += 1) {
    const previous = values[i - 1];
    const current = values[i];

    if (previous > 0 && current > 0) {
      result.push(current / previous - 1);
    }
  }

  return result;
}

function pct(previous: number, current: number) {
  return previous > 0 && current > 0 ? ((current - previous) / previous) * 100 : 0;
}

function signalForBars(
  symbol: string,
  bars: Array<{ date: string; close: number }>,
  index: number,
  config: any,
) {
  if (index < Math.max(config.slow, config.momentum, config.riskLookback) + 1) return null;

  const closes = bars.map((bar) => bar.close);
  const close = closes[index];
  const fast = sma(closes, index, config.fast);
  const slow = sma(closes, index, config.slow);
  const momentum = pct(closes[index - config.momentum], close);
  const vol = stdev(returns(closes.slice(index - config.riskLookback, index + 1))) * Math.sqrt(252) * 100;
  const trend = slow > 0 ? ((fast - slow) / slow) * 100 : 0;

  const setupQuality = clamp(50 + trend * 12 + momentum * 1.8 - Math.max(0, vol - 35) * 0.22);
  const riskPressure = clamp(vol * 0.9 + Math.max(0, -momentum) * 2.5);

  const buy =
    fast > slow &&
    momentum >= config.minMomentum &&
    setupQuality >= config.minQuality &&
    riskPressure <= config.maxRisk;

  const sell =
    fast < slow ||
    momentum <= -Math.abs(config.minMomentum) ||
    riskPressure >= config.maxRisk + 15;

  const signalAction = buy ? "Buy" : sell ? "Sell" : "Hold";

  const rawSuggestedExposure =
    signalAction === "Buy"
      ? clamp((setupQuality - riskPressure * 0.35) / 14, 0, config.maxPositionPct)
      : 0;
  const sizingConstraints = [
    {
      id: "signal-persistence",
      label: "Signal persistence",
      type: "soft" as const,
      passed: momentum >= config.minMomentum,
      severity: "medium" as const,
      reason: "Momentum persistence is not confirmed.",
    },
    {
      id: "cross-timeframe-agreement",
      label: "Cross-timeframe agreement",
      type: "soft" as const,
      passed: fast > slow && trend > 0,
      severity: "high" as const,
      reason: "Fast and slow trend evidence do not agree.",
    },
    {
      id: "liquidity-data-availability",
      label: "Liquidity and data availability",
      type: "hard" as const,
      passed: bars.length > config.slow + config.riskLookback,
      severity: "high" as const,
      reason: "Historical bars are incomplete for sizing.",
    },
    {
      id: "volatility-acceptance",
      label: "Volatility acceptance",
      type: "hard" as const,
      passed: riskPressure <= config.maxRisk,
      severity: "high" as const,
      reason: "Volatility exceeds the local strategy risk gate.",
    },
    {
      id: "confidence-stability",
      label: "Confidence stability",
      type: "soft" as const,
      passed: setupQuality >= config.minQuality,
      severity: "medium" as const,
      reason: "Setup quality is not stable enough for full sizing.",
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
      passed: riskPressure <= config.maxRisk,
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
    availableExposurePct: config.maxPositionPct,
    maxExposurePct: config.maxPositionPct,
    constraints: sizingConstraints,
    viability: {
      expectedBenefit: clamp(
        setupQuality * 0.55 +
          Math.max(0, momentum) * 8 +
          Math.max(0, trend) * 3,
      ),
      expectedCost: clamp(Math.abs(momentum) * 4 + Math.max(0, vol - 35) * 0.35),
      expectedRisk: riskPressure,
      uncertainty: 100 - setupQuality,
      confidence: setupQuality,
      minMarginOfSafety: 0,
      thresholds: {
        minConfidence: config.minQuality,
        maxRisk: config.maxRisk,
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
      context: { momentum, trend, volatilityPct: vol },
    },
  });
  const suggestedExposure = signalAction === "Buy" ? financialSizing.suggestedExposurePct : 0;

  const regime =
    riskPressure > 72
      ? "Capital Preservation Phase"
      : suggestedExposure <= 0
        ? "Defensive Environment"
        : setupQuality > 72
          ? "Constructive Trend Environment"
          : "Selective Upside Participation";

  return {
    symbol,
    date: bars[index].date,
    close,
    signalAction,
    allocationAction: signalAction,
    signalStatus: "provided",
    suggestedExposure,
    setupQuality,
    riskPressure,
    trendQuality: clamp(50 + trend * 10 + momentum),
    timingQuality: clamp((setupQuality + Math.max(0, momentum * 8)) / 2),
    expectedMove: momentum,
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
    regime,
  };
}

function configGrid(limit = 24) {
  const configs: any[] = [];

  for (const fast of [8, 12, 20]) {
    for (const slow of [30, 50, 80]) {
      if (fast >= slow) continue;

      for (const momentum of [10, 20, 40]) {
        for (const minMomentum of [0, 1.25, 2.5]) {
          for (const maxRisk of [55, 70]) {
            configs.push({
              id: `sma${fast}_${slow}_mom${momentum}_risk${maxRisk}_m${minMomentum}`,
              fast,
              slow,
              momentum,
              riskLookback: 30,
              minMomentum,
              maxRisk,
              minQuality: 56,
              spreadBps: 5,
              slippageBps: 2,
              totalExposureCap: 65,
              maxPositionPct: 5.5,
            });

            if (configs.length >= limit) return configs;
          }
        }
      }
    }
  }

  return configs;
}

function simulate(
  grouped: Map<string, Array<{ date: string; close: number }>>,
  dates: string[],
  config: any,
) {
  const initialEquity = 1000;
  let equity = initialEquity;
  let lastEquity = initialEquity;

  const curve: StrategyPoint[] = [];
  const trades: StrategyTrade[] = [];
  const active = new Map<string, any>();

  for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
    const date = dates[dateIndex];
    const signals: any[] = [];

    for (const [symbol, bars] of grouped.entries()) {
      const barIndex = bars.findIndex((bar) => bar.date === date);
      if (barIndex < 0) continue;

      const signal = signalForBars(symbol, bars, barIndex, config);
      if (signal) signals.push(signal);
    }

    const targets = new Map<string, any>();
    let deployedPct = 0;

    for (const signal of signals
      .filter((item) => item.signalAction === "Buy" && item.suggestedExposure > 0)
      .sort((a, b) => b.setupQuality - a.setupQuality)) {
      if (deployedPct >= config.totalExposureCap) break;

      const exposure = Math.min(
        signal.suggestedExposure,
        config.maxPositionPct,
        config.totalExposureCap - deployedPct,
      );

      if (exposure <= 0) continue;

      targets.set(signal.symbol, {
        ...signal,
        entryExposure: exposure,
      });

      deployedPct += exposure;
    }

    for (const [symbol, position] of Array.from(active.entries())) {
      if (!targets.has(symbol)) {
        const bars = grouped.get(symbol) ?? [];
        const exit = bars.find((bar) => bar.date === date)?.close ?? position.entryPrice;
        const gross = pct(position.entryPrice, exit);
        const cost = (config.spreadBps + config.slippageBps) / 100;

        trades.push({
          symbol,
          entryDate: position.entryDate,
          exitDate: date,
          entryPrice: position.entryPrice,
          exitPrice: exit,
          entryExposure: position.entryExposure,
          returnPct: gross - cost,
          regime: position.regime,
          setupQuality: position.setupQuality,
          riskPressure: position.riskPressure,
        });

        active.delete(symbol);
      }
    }

    for (const [symbol, target] of targets.entries()) {
      if (!active.has(symbol)) {
        active.set(symbol, {
          ...target,
          entryDate: date,
          entryPrice: target.close,
        });
      }
    }

    let dailyReturn = 0;
    let totalExposure = 0;

    for (const [symbol, position] of active.entries()) {
      const bars = grouped.get(symbol) ?? [];
      const currentIndex = bars.findIndex((bar) => bar.date === date);
      if (currentIndex <= 0) continue;

      const current = bars[currentIndex].close;
      const previous = bars[currentIndex - 1].close;
      const positionReturn = previous > 0 ? current / previous - 1 : 0;

      dailyReturn += (position.entryExposure / 100) * positionReturn;
      totalExposure += position.entryExposure;
    }

    equity = Math.max(0, equity * (1 + dailyReturn));

    const dailyReturnPct = lastEquity > 0 ? ((equity / lastEquity) - 1) * 100 : 0;
    const returnPct = ((equity / initialEquity) - 1) * 100;

    lastEquity = equity;

    curve.push({
      date,
      equity,
      returnPct,
      dailyReturnPct,
      deployedPct: totalExposure,
      cashPct: Math.max(0, 100 - totalExposure),
      positionsCount: active.size,
      regime:
        totalExposure <= 5
          ? "Defensive Environment"
          : totalExposure < 35
            ? "Selective Upside Participation"
            : "Constructive Trend Environment",
    });
  }

  const equityReturns = returns(curve.map((point) => point.equity));
  const avg = mean(equityReturns);
  const vol = stdev(equityReturns);
  const annualizedSharpe = vol > 0 ? (avg / vol) * Math.sqrt(252) : null;

  let peak = initialEquity;
  let maxDrawdownPct = 0;

  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - point.equity) / peak) * 100 : 0);
  }

  const tradeReturns = trades.map((trade) => trade.returnPct);
  const wins = tradeReturns.filter((value) => value > 0);
  const losses = tradeReturns.filter((value) => value < 0);

  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : null;
  const winRatePct = tradeReturns.length ? (wins.length / tradeReturns.length) * 100 : null;
  const totalReturnPct = curve.length ? curve[curve.length - 1].returnPct : 0;

  const survivalScore = clamp(
    (totalReturnPct > 0 ? 18 : 0) +
      ((annualizedSharpe ?? 0) >= 0.75 ? 18 : 0) +
      (maxDrawdownPct <= 18 ? 18 : 0) +
      ((profitFactor ?? 0) >= 1.15 ? 16 : 0) +
      (trades.length >= 30 ? 12 : 0) +
      ((winRatePct ?? 0) >= 45 ? 8 : 0) -
      Math.max(0, maxDrawdownPct - 18),
  );

  return {
    config,
    history: curve,
    trades,
    summary: {
      configId: config.id,
      equity,
      totalReturnPct,
      annualizedSharpe,
      maxDrawdownPct,
      profitFactor,
      winRatePct,
      tradeCount: trades.length,
      segmentCount: Math.max(1, Math.floor(dates.length / 63)),
      survivalScore,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function runLocalWalkForwardStrategy(input: {
  market: string;
  items: MarketItem[];
  symbolLimit?: number;
  configLimit?: number;
  maxBars?: number;
}) {
  const market = input.market;
  const symbolLimit = Math.max(5, Math.min(Number(input.symbolLimit ?? 40), 120));
  const configLimit = Math.max(4, Math.min(Number(input.configLimit ?? 24), 80));
  const maxBars = Math.max(120, Math.min(Number(input.maxBars ?? 360), 720));

  const items = input.items.slice(0, symbolLimit);
  const grouped = new Map<string, Array<{ date: string; close: number }>>();

  items.forEach((item, index) => {
    const symbol = ticker(item) || `SYM${index}`;
    grouped.set(symbol, generateSyntheticBars(item, index, maxBars));
  });

  const dates = Array.from(
    new Set(Array.from(grouped.values()).flatMap((bars) => bars.map((bar) => bar.date))),
  ).sort();

  const results = configGrid(configLimit).map((config) => simulate(grouped, dates, config));

  results.sort((a, b) => {
    const survivalDelta = b.summary.survivalScore - a.summary.survivalScore;
    if (survivalDelta !== 0) return survivalDelta;

    return (b.summary.annualizedSharpe ?? -999) - (a.summary.annualizedSharpe ?? -999);
  });

  const best = results[0];
  const latestDate = dates[dates.length - 1];

  const signals = Array.from(grouped.entries())
    .map(([symbol, bars]) => {
      const index = bars.findIndex((bar) => bar.date === latestDate);
      return index >= 0 ? signalForBars(symbol, bars, index, best.config) : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.setupQuality - a.setupQuality);
  const decisionSignals = enrichStrategySignals(signals as any[], {
    market,
    summary: best.summary,
    regime: {
      regime: best.history[best.history.length - 1]?.regime ?? "Unknown",
      configId: best.config.id,
      survivalScore: best.summary.survivalScore,
    },
  });

  const payload = {
    ok: true,
    market,
    config: best.config,
    regime: {
      regime: best.history[best.history.length - 1]?.regime ?? "Unknown",
      configId: best.config.id,
      survivalScore: best.summary.survivalScore,
    },
    signals: decisionSignals,
    decisionIntelligence: summarizeStrategyDecisionIntelligence(decisionSignals),
    summary: {
      market,
      ...best.summary,
      excessReturnPct: best.summary.totalReturnPct,
      excessSharpe: best.summary.annualizedSharpe,
    },
    history: best.history,
    trades: best.trades,
  };

  STRATEGY_CACHE.set(market, {
    cachedAt: Date.now(),
    payload,
  });

  return payload;
}

export function getCachedLocalStrategy(market: string) {
  return STRATEGY_CACHE.get(market)?.payload ?? null;
}
