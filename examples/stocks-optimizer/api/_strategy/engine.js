const STARTING_EQUITY = 1000;

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
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

  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;

  return b / a - 1;
}

function rollingWindow(values, endIndex, length) {
  const start = Math.max(0, endIndex - length + 1);
  return values.slice(start, endIndex + 1);
}

function computeIndicators(bars, index, config = {}) {
  const current = bars[index];
  const previous = bars[Math.max(0, index - 1)];

  const close = numeric(current?.close);
  const previousClose = numeric(previous?.close, close);

  const fastLookback = Math.max(
    5,
    Math.min(60, Number(config.fastLookback || 20)),
  );
  const slowLookback = Math.max(
    fastLookback + 5,
    Math.min(180, Number(config.slowLookback || 60)),
  );
  const longLookback = Math.max(
    slowLookback + 10,
    Math.min(260, Number(config.longLookback || 120)),
  );
  const momentumLookback = Math.max(
    5,
    Math.min(40, Number(config.momentumLookback || 20)),
  );

  const window20 = rollingWindow(bars, index, momentumLookback)
    .map((bar) => numeric(bar.close))
    .filter((v) => v > 0);
  const window50 = rollingWindow(bars, index, fastLookback)
    .map((bar) => numeric(bar.close))
    .filter((v) => v > 0);
  const window60 = rollingWindow(bars, index, slowLookback)
    .map((bar) => numeric(bar.close))
    .filter((v) => v > 0);
  const window120 = rollingWindow(bars, index, longLookback)
    .map((bar) => numeric(bar.close))
    .filter((v) => v > 0);

  const returns20 = [];

  for (let i = 1; i < window20.length; i += 1) {
    returns20.push((window20[i] / window20[i - 1] - 1) * 100);
  }

  const avg20 = mean(window20);
  const avg50 = mean(window50);
  const avg60 = mean(window60);
  const avg120 = mean(window120);

  const recentReturn =
    previousClose > 0 && close > 0 ? (close / previousClose - 1) * 100 : 0;
  const avgReturn20 = mean(returns20);
  const volatility20 = stdev(returns20);
  const positiveBreadth20 = returns20.length
    ? (returns20.filter((value) => value >= 0).length / returns20.length) * 100
    : 50;

  const trendSlope20 =
    window20.length >= 2 && window20[0] > 0
      ? (window20[window20.length - 1] / window20[0] - 1) * 100
      : 0;

  return {
    close,
    previousClose,
    avg20,
    avg50,
    avg60,
    avg120,
    recentReturn,
    avgReturn20,
    volatility20,
    positiveBreadth20,
    trendSlope20,
    fastLookback,
    slowLookback,
    longLookback,
    momentumLookback,
    hasEnoughBars:
      window20.length >= Math.min(10, momentumLookback) &&
      window60.length >= Math.min(20, slowLookback),
  };
}

function classifyRegimeForMarket(symbolSignals) {
  const covered = symbolSignals.filter((signal) => signal.hasEvidence);

  if (!covered.length) {
    return {
      regime: "No Historical Coverage",
      avgQuality: 0,
      avgRisk: 0,
      breadth: 0,
      confidence: 0,
      targetExposure: 0,
    };
  }

  const avgQuality = mean(covered.map((signal) => signal.setupQuality));
  const avgRisk = mean(covered.map((signal) => signal.riskPressure));
  const targetExposure = clamp(
    covered.reduce((sum, signal) => sum + numeric(signal.suggestedExposure), 0),
    0,
    65,
  );

  const breadth = covered.length
    ? (covered.filter((signal) => signal.suggestedExposure > 0).length /
        covered.length) *
      100
    : 0;

  const confidence = clamp(avgQuality * 0.75 + (100 - avgRisk) * 0.25);

  let regime = "Transitional Regime";

  if (avgRisk > 72) {
    regime = "Capital Preservation Phase";
  } else if (targetExposure < 12) {
    regime = "Defensive Environment";
  } else if (targetExposure < 35) {
    regime = "Selective Upside Participation";
  } else if (avgQuality > 70) {
    regime = "Constructive Trend Environment";
  }

  return {
    regime,
    avgQuality,
    avgRisk,
    breadth,
    confidence,
    targetExposure,
  };
}

function runSymbolIntelligence({ market, symbol, bars, index, config = {} }) {
  const current = bars[index];

  if (!current) return null;

  const indicators = computeIndicators(bars, index, config);
  const close = indicators.close;

  if (!close || close <= 0) return null;

  const hasEvidence = indicators.hasEnoughBars;

  const signalConfidence = hasEvidence ? 62 : 45;

  const trendQuality = clamp(
    50 +
      indicators.avgReturn20 * 8 +
      indicators.positiveBreadth20 * 0.25 +
      indicators.trendSlope20 * 0.8 +
      (close > indicators.avg20 ? 8 : -8) +
      (indicators.avg20 > indicators.avg60 ? 14 : -12) +
      (hasEvidence ? 0 : -20),
  );

  const riskPressure = clamp(
    indicators.volatility20 * 12 +
      Math.max(0, -indicators.recentReturn) * 5 +
      (close < indicators.avg60 ? 12 : 0) +
      (hasEvidence ? 0 : 20),
    0,
    100,
  );

  const setupQuality = clamp(
    signalConfidence * 0.45 + trendQuality * 0.45 + (100 - riskPressure) * 0.1,
  );
  const timingQuality = clamp(
    (setupQuality + trendQuality + indicators.positiveBreadth20) / 3,
  );
  const expectedMove = indicators.avgReturn20 || indicators.recentReturn || 0;

  let signalAction = "Hold";
  let allocationAction = "Hold";
  let suggestedExposure = 0;

  const buyQuality = numeric(config.buyQuality, 68);
  const buyRiskMax = numeric(config.buyRiskMax, 58);
  const defensiveBuyQuality = numeric(config.defensiveBuyQuality, 74);
  const minExpectedMove = numeric(config.minExpectedMove, -0.5);
  const maxExposure = numeric(config.maxExposure, 5.5);
  const exposureDivisor = numeric(config.exposureDivisor, 15);

  if (
    hasEvidence &&
    setupQuality >= buyQuality &&
    riskPressure <= buyRiskMax &&
    close > indicators.avg20 &&
    indicators.avg20 > indicators.avg60 &&
    expectedMove > minExpectedMove
  ) {
    signalAction = "Buy";
    allocationAction = "Buy";
    suggestedExposure = clamp(
      (setupQuality - riskPressure * 0.35) / exposureDivisor,
      0.5,
      maxExposure,
    );
  }

  if (
    riskPressure >= 76 ||
    (hasEvidence &&
      close < indicators.avg60 &&
      indicators.recentReturn < -1.5) ||
    setupQuality < 38
  ) {
    signalAction = "Sell";
    allocationAction = "Sell";
    suggestedExposure = 0;
  }

  return {
    market,
    symbol,
    timestamp: current.timestamp || current.date,
    price: close,
    signalAction,
    allocationAction,
    signalStatus: "provided",
    suggestedExposure,
    setupQuality,
    riskPressure,
    trendQuality,
    timingQuality,
    expectedMove,
    hasEvidence,
    indicators,
    config,
    source: "shared-strategy-engine",
  };
}

function applyRegimeToSignals(symbolSignals, regimeState) {
  return symbolSignals.map((signal) => {
    if (!signal) return signal;

    const next = { ...signal, regime: regimeState.regime };

    if (regimeState.regime === "Capital Preservation Phase") {
      if (next.allocationAction === "Buy" && next.setupQuality < 84) {
        next.allocationAction = "Hold";
        next.signalAction = "Hold";
        next.suggestedExposure = 0;
      }
    }

    if (regimeState.regime === "Defensive Environment") {
      const defensiveBuyQuality = numeric(next.config?.defensiveBuyQuality, 74);
      if (
        next.allocationAction === "Buy" &&
        next.setupQuality < defensiveBuyQuality
      ) {
        next.allocationAction = "Hold";
        next.signalAction = "Hold";
        next.suggestedExposure = 0;
      }
    }

    return next;
  });
}

function runStrategyForMarketAtIndex({
  market,
  barsBySymbol,
  indexBySymbol,
  config = {},
}) {
  const rawSignals = [];

  for (const [symbol, bars] of barsBySymbol.entries()) {
    const index = indexBySymbol.get(symbol);

    if (index == null || index < 0 || index >= bars.length) continue;

    const signal = runSymbolIntelligence({
      market,
      symbol,
      bars,
      index,
      config,
    });

    if (signal) rawSignals.push(signal);
  }

  const regimeState = classifyRegimeForMarket(rawSignals);
  const regimeAdjustedSignals = applyRegimeToSignals(rawSignals, regimeState);
  const signals = optimizeMptAllocation({
    signals: regimeAdjustedSignals,
    barsBySymbol,
    config,
  });

  return {
    market,
    regimeState,
    signals,
  };
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

function buildBacktestFromSharedEngine({ market, barsBySymbol, config = {} }) {
  const allDates = Array.from(
    new Set(
      Array.from(barsBySymbol.values())
        .flat()
        .map((bar) => bar.timestamp || bar.date)
        .filter(Boolean),
    ),
  ).sort();

  if (allDates.length < 2) {
    return {
      curve: [],
      signals: [],
      metrics: computeMetrics([]),
    };
  }

  let equity = STARTING_EQUITY;
  const curve = [
    {
      index: 0,
      date: allDates[0],
      equity,
      returnPct: 0,
      deployedPct: 0,
      cashPct: 100,
      positionsCount: 0,
    },
  ];

  const allSignals = [];

  for (let dateIndex = 0; dateIndex < allDates.length - 1; dateIndex += 1) {
    const date = allDates[dateIndex];
    const nextDate = allDates[dateIndex + 1];

    const indexBySymbol = new Map();

    for (const [symbol, bars] of barsBySymbol.entries()) {
      let index = -1;

      for (let i = 0; i < bars.length; i += 1) {
        const barDate = bars[i].timestamp || bars[i].date;

        if (barDate <= date) index = i;
        if (barDate > date) break;
      }

      indexBySymbol.set(symbol, index);
    }

    const result = runStrategyForMarketAtIndex({
      market,
      barsBySymbol,
      indexBySymbol,
      config,
    });

    allSignals.push(
      ...result.signals.map((signal) => ({
        ...signal,
        timestamp: date,
      })),
    );

    const buys = result.signals.filter((signal) => {
      return (
        signal.allocationAction === "Buy" &&
        numeric(signal.suggestedExposure) > 0
      );
    });

    const totalExposure = buys.reduce(
      (sum, signal) => sum + numeric(signal.suggestedExposure),
      0,
    );
    const deployedFraction = Math.min(1, Math.max(0, totalExposure / 100));
    const cashFraction = 1 - deployedFraction;

    let weightedReturn = 0;

    if (buys.length && totalExposure > 0) {
      for (const buy of buys) {
        const bars = barsBySymbol.get(buy.symbol) || [];
        const today = bars.find((bar) => (bar.timestamp || bar.date) === date);
        const tomorrow = bars.find(
          (bar) => (bar.timestamp || bar.date) === nextDate,
        );

        if (!today || !tomorrow) continue;

        const weight = numeric(buy.suggestedExposure) / totalExposure;
        const symbolReturn = pctReturn(today.close, tomorrow.close);

        weightedReturn += weight * symbolReturn;
      }
    }

    equity = equity * (cashFraction + deployedFraction * (1 + weightedReturn));

    curve.push({
      index: dateIndex + 1,
      date: nextDate,
      equity,
      returnPct: ((equity - STARTING_EQUITY) / STARTING_EQUITY) * 100,
      deployedPct: deployedFraction * 100,
      cashPct: cashFraction * 100,
      positionsCount: buys.length,
      regime: result.regimeState.regime,
    });
  }

  return {
    curve,
    signals: allSignals,
    metrics: computeMetrics(curve),
  };
}

function generateConservativeConfigs() {
  const configs = [];
  let id = 0;

  const fastLookbacks = [10, 20, 30];
  const slowLookbacks = [50, 60, 90];
  const momentumLookbacks = [14, 20];
  const buyQualities = [64, 68, 72];
  const buyRiskMaxes = [50, 58, 66];
  const minExpectedMoves = [-0.5, 0, 0.25];
  const maxExposures = [3.5, 5.0];

  for (const fastLookback of fastLookbacks) {
    for (const slowLookback of slowLookbacks) {
      if (fastLookback >= slowLookback) continue;

      for (const momentumLookback of momentumLookbacks) {
        for (const buyQuality of buyQualities) {
          for (const buyRiskMax of buyRiskMaxes) {
            for (const minExpectedMove of minExpectedMoves) {
              for (const maxExposure of maxExposures) {
                id += 1;

                configs.push({
                  id: `cfg_${String(id).padStart(4, "0")}`,
                  name: `Trend ${fastLookback}/${slowLookback} Q${buyQuality} R${buyRiskMax}`,
                  fastLookback,
                  slowLookback,
                  longLookback: 120,
                  momentumLookback,
                  buyQuality,
                  defensiveBuyQuality: Math.min(84, buyQuality + 6),
                  buyRiskMax,
                  minExpectedMove,
                  maxExposure,
                  exposureDivisor: maxExposure <= 3.5 ? 18 : 15,
                });
              }
            }
          }
        }
      }
    }
  }

  return configs;
}

function splitCurveByRatio(curve, trainRatio = 0.7) {
  if (curve.length < 10) {
    return {
      train: curve,
      test: [],
    };
  }

  const splitIndex = Math.max(2, Math.floor(curve.length * trainRatio));

  return {
    train: curve.slice(0, splitIndex),
    test: curve.slice(splitIndex - 1),
  };
}

function scoreBacktestMetrics(metrics, curve, signalCount = 0) {
  if (!metrics || metrics.totalReturnPct == null || !curve.length)
    return Number.NEGATIVE_INFINITY;

  const sharpe = numeric(metrics.annualizedSharpe);
  const totalReturn = numeric(metrics.totalReturnPct);
  const maxDrawdown = numeric(metrics.maxDrawdownPct);
  const profitFactor = numeric(metrics.profitFactor);
  const winRate = numeric(metrics.winRatePct);

  const tradePenalty = signalCount < 30 ? (30 - signalCount) * 0.75 : 0;
  const drawdownPenalty = Math.max(0, maxDrawdown - 18) * 1.5;
  const returnPenalty = totalReturn < 0 ? Math.abs(totalReturn) * 0.5 : 0;
  const pfBonus = Math.min(20, profitFactor * 4);
  const winBonus = Math.min(12, winRate / 8);

  return (
    sharpe * 35 +
    totalReturn * 0.35 +
    pfBonus +
    winBonus -
    maxDrawdown * 1.25 -
    drawdownPenalty -
    tradePenalty -
    returnPenalty
  );
}

function evaluateConfigOnBars({
  market,
  barsBySymbol,
  config,
  trainRatio = 0.7,
}) {
  const full = buildBacktestFromSharedEngine({
    market,
    barsBySymbol,
    config,
  });

  const split = splitCurveByRatio(full.curve, trainRatio);
  const trainMetrics = computeMetrics(split.train);
  const testMetrics = computeMetrics(split.test);

  const signalCount = full.signals.filter(
    (signal) => signal.allocationAction === "Buy",
  ).length;

  const trainScore = scoreBacktestMetrics(
    trainMetrics,
    split.train,
    signalCount,
  );
  const testScore = scoreBacktestMetrics(testMetrics, split.test, signalCount);

  const degradationPenalty =
    Number.isFinite(trainScore) && Number.isFinite(testScore)
      ? Math.max(0, trainScore - testScore) * 0.35
      : 999;

  const score = testScore * 0.65 + trainScore * 0.35 - degradationPenalty;

  return {
    config,
    score,
    trainScore,
    testScore,
    signalCount,
    trainMetrics,
    testMetrics,
    fullMetrics: full.metrics,
    curve: full.curve,
    signals: full.signals,
  };
}

function optimizeConfigsOnBars({
  market,
  barsBySymbol,
  configs = generateConservativeConfigs(),
  limit = 40,
}) {
  const candidates = configs.slice(0, Math.max(1, limit));
  const results = [];

  for (const config of candidates) {
    const evaluation = evaluateConfigOnBars({
      market,
      barsBySymbol,
      config,
    });

    if (Number.isFinite(evaluation.score)) {
      results.push(evaluation);
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results;
}

function returnsForBars(bars, lookback = 60) {
  const usable = bars.slice(Math.max(0, bars.length - lookback - 1));
  const returns = [];

  for (let i = 1; i < usable.length; i += 1) {
    const previous = numeric(usable[i - 1]?.close);
    const current = numeric(usable[i]?.close);

    if (previous > 0 && current > 0) {
      returns.push(current / previous - 1);
    }
  }

  return returns;
}

function buildReturnMatrix({ signals, barsBySymbol, lookback = 60 }) {
  const symbols = signals.map((signal) => signal.symbol);
  const bySymbolReturns = new Map();
  let minLength = Number.POSITIVE_INFINITY;

  for (const symbol of symbols) {
    const returns = returnsForBars(barsBySymbol.get(symbol) || [], lookback);

    if (returns.length >= 10) {
      bySymbolReturns.set(symbol, returns);
      minLength = Math.min(minLength, returns.length);
    }
  }

  const filteredSymbols = symbols.filter((symbol) =>
    bySymbolReturns.has(symbol),
  );

  return {
    symbols: filteredSymbols,
    matrix: filteredSymbols.map((symbol) =>
      bySymbolReturns.get(symbol).slice(-minLength),
    ),
  };
}

function covariance(a, b) {
  if (!a.length || a.length !== b.length) return 0;

  const meanA = mean(a);
  const meanB = mean(b);

  return mean(a.map((value, index) => (value - meanA) * (b[index] - meanB)));
}

function buildShrinkageCovariance(matrix, shrinkage = 0.35) {
  const n = matrix.length;
  const cov = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const raw = covariance(matrix[i], matrix[j]);
      cov[i][j] = i === j ? raw : raw * (1 - shrinkage);
    }
  }

  return cov;
}

function portfolioVariance(weights, cov) {
  let variance = 0;

  for (let i = 0; i < weights.length; i += 1) {
    for (let j = 0; j < weights.length; j += 1) {
      variance += weights[i] * weights[j] * cov[i][j];
    }
  }

  return Math.max(0, variance);
}

function normalizeWeights(weights, maxTotalWeight) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);

  if (total <= 0) return weights.map(() => 0);

  const scale = Math.min(1, maxTotalWeight / total);

  return weights.map((value) => Math.max(0, value) * scale);
}

function optimizeMptAllocation({ signals, barsBySymbol, config = {} }) {
  const buySignals = signals.filter((signal) => {
    return (
      signal.allocationAction === "Buy" && numeric(signal.suggestedExposure) > 0
    );
  });

  if (!buySignals.length) {
    return signals.map((signal) => ({
      ...signal,
      mptWeight: 0,
      suggestedExposure: 0,
      allocationModel: "mpt-constrained",
    }));
  }

  const maxTotalExposure = numeric(config.maxTotalExposure, 65) / 100;
  const maxPositionWeight =
    numeric(config.maxPositionWeight, numeric(config.maxExposure, 5.5)) / 100;
  const riskAversion = numeric(config.riskAversion, 8);
  const covarianceLookback = Math.max(
    20,
    Math.min(180, Number(config.covarianceLookback || 60)),
  );
  const covarianceShrinkage = Math.max(
    0,
    Math.min(0.95, Number(config.covarianceShrinkage ?? 0.35)),
  );

  const { symbols, matrix } = buildReturnMatrix({
    signals: buySignals,
    barsBySymbol,
    lookback: covarianceLookback,
  });

  if (!symbols.length || !matrix.length) {
    return signals;
  }

  const signalBySymbol = new Map(
    buySignals.map((signal) => [signal.symbol, signal]),
  );
  const cov = buildShrinkageCovariance(matrix, covarianceShrinkage);

  const expectedReturns = symbols.map((symbol) => {
    const signal = signalBySymbol.get(symbol);
    const historicalMean = mean(
      returnsForBars(barsBySymbol.get(symbol) || [], covarianceLookback),
    );
    const signalExpected = numeric(signal?.expectedMove) / 100;

    return historicalMean * 0.35 + signalExpected * 0.65;
  });

  let weights = symbols.map((symbol, index) => {
    const signal = signalBySymbol.get(symbol);
    const variance = Math.max(cov[index][index], 1e-8);
    const qualityBoost = clamp(numeric(signal?.setupQuality), 0, 100) / 100;
    const riskPenalty = clamp(numeric(signal?.riskPressure), 0, 100) / 100;

    const rawScore =
      expectedReturns[index] * qualityBoost -
      variance * riskAversion -
      riskPenalty * 0.002;

    return Math.max(0, rawScore / Math.max(variance * riskAversion, 1e-8));
  });

  weights = weights.map((weight) => Math.min(weight, maxPositionWeight));
  weights = normalizeWeights(weights, maxTotalExposure);

  for (let iteration = 0; iteration < 30; iteration += 1) {
    const currentVariance = portfolioVariance(weights, cov);

    for (let i = 0; i < weights.length; i += 1) {
      const original = weights[i];

      const candidates = [
        Math.max(0, original - 0.0025),
        original,
        Math.min(maxPositionWeight, original + 0.0025),
      ];

      let bestWeight = original;
      let bestObjective = Number.NEGATIVE_INFINITY;

      for (const candidate of candidates) {
        const trial = [...weights];
        trial[i] = candidate;
        const normalized = normalizeWeights(trial, maxTotalExposure);
        const expected = normalized.reduce(
          (sum, weight, index) => sum + weight * expectedReturns[index],
          0,
        );
        const variance = portfolioVariance(normalized, cov);
        const objective = expected - riskAversion * variance;

        if (objective > bestObjective) {
          bestObjective = objective;
          bestWeight = normalized[i];
        }
      }

      weights[i] = bestWeight;
    }

    weights = normalizeWeights(
      weights.map((weight) => Math.min(weight, maxPositionWeight)),
      maxTotalExposure,
    );

    const nextVariance = portfolioVariance(weights, cov);

    if (Math.abs(nextVariance - currentVariance) < 1e-10) break;
  }

  const weightBySymbol = new Map(
    symbols.map((symbol, index) => [symbol, weights[index]]),
  );

  return signals.map((signal) => {
    if (signal.allocationAction !== "Buy") {
      return {
        ...signal,
        mptWeight: 0,
        suggestedExposure: 0,
        allocationModel: "mpt-constrained",
      };
    }

    const weight = weightBySymbol.get(signal.symbol) || 0;

    return {
      ...signal,
      mptWeight: weight,
      suggestedExposure: weight * 100,
      allocationModel: "mpt-constrained",
    };
  });
}

module.exports = {
  STARTING_EQUITY,
  numeric,
  clamp,
  mean,
  stdev,
  pctReturn,
  runSymbolIntelligence,
  runStrategyForMarketAtIndex,
  buildBacktestFromSharedEngine,
  classifyRegimeForMarket,
  computeMetrics,
  generateConservativeConfigs,
  evaluateConfigOnBars,
  optimizeConfigsOnBars,
  optimizeMptAllocation,
};
