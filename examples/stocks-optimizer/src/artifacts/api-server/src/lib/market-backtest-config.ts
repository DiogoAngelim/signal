export type MarketBacktestConfig = {
  id: string;
  profile: string;
  lookbackDays: number;
  holdingDays: number;
  rebalanceDays: number;
  minMomentumPct: number;
  maxPositions: number;
  targetExposurePct: number;
  maxPositionPct: number;
  volatilityLookbackDays: number;
  volatilityCapPct: number;
  costBps: number;
  minimumTrades: number;
  minimumWalkForwardSegments: number;
  benchmarkSafetyMarginPct: number;
  minimumForwardSignals: number;
  relativeMomentumAnchorDays: number;
  candidateScoreShareFloor: number;
  marketMomentumFloorPct: number;
  maxWalkForwardPeriodContributionPct: number;
  stopLossPct: number;
  trailingStopPct: number;
};

export const MARKET_BACKTEST_CACHE_VERSION = 11;

const BASE_PROFILE: Omit<MarketBacktestConfig, "id" | "profile"> = {
  lookbackDays: 60,
  holdingDays: 20,
  rebalanceDays: 20,
  minMomentumPct: -0.1,
  maxPositions: 4,
  targetExposurePct: 88,
  maxPositionPct: 22,
  volatilityLookbackDays: 30,
  volatilityCapPct: 8,
  costBps: 6,
  minimumTrades: 30,
  minimumWalkForwardSegments: 3,
  benchmarkSafetyMarginPct: 2,
  minimumForwardSignals: 20,
  relativeMomentumAnchorDays: 60,
  candidateScoreShareFloor: 0,
  marketMomentumFloorPct: 8,
  maxWalkForwardPeriodContributionPct: 60,
  stopLossPct: 7,
  trailingStopPct: 9,
};

const PROFILE_OVERRIDES: Record<string, Partial<MarketBacktestConfig>> = {
  CRYPTO_LIQUID: {
    lookbackDays: 55,
    holdingDays: 7,
    rebalanceDays: 5,
    minMomentumPct: 0,
    maxPositions: 1,
    targetExposurePct: 30,
    maxPositionPct: 30,
    volatilityLookbackDays: 20,
    volatilityCapPct: 30,
    costBps: 9,
    benchmarkSafetyMarginPct: 2,
    minimumForwardSignals: 30,
    relativeMomentumAnchorDays: 55,
    candidateScoreShareFloor: 0.72,
    marketMomentumFloorPct: 6,
    maxWalkForwardPeriodContributionPct: 70,
    stopLossPct: 5.5,
    trailingStopPct: 7,
  },
  BRAZIL_B3: {
    lookbackDays: 40,
    holdingDays: 20,
    rebalanceDays: 20,
    minMomentumPct: -0.1,
    maxPositions: 4,
    targetExposurePct: 88,
    maxPositionPct: 22,
    volatilityCapPct: 10,
    costBps: 13,
    stopLossPct: 7,
    trailingStopPct: 9,
  },
  GULF_LARGE_CAP: {
    lookbackDays: 60,
    holdingDays: 20,
    rebalanceDays: 20,
    minMomentumPct: -0.1,
    maxPositions: 4,
    targetExposurePct: 90,
    maxPositionPct: 22.5,
    volatilityCapPct: 8,
    costBps: 7,
    stopLossPct: 6.5,
    trailingStopPct: 8,
  },
  US_LARGE_CAP: {
    lookbackDays: 60,
    holdingDays: 20,
    rebalanceDays: 20,
    minMomentumPct: -0.1,
    maxPositions: 4,
    targetExposurePct: 90,
    maxPositionPct: 22.5,
    volatilityCapPct: 8,
    costBps: 4,
    stopLossPct: 7,
    trailingStopPct: 9,
  },
};

export function backtestProfileForMarket(marketInput: string) {
  const market = String(marketInput || "ADX").trim().toUpperCase();

  if (/BINANCE|CRYPTO/.test(market)) return "CRYPTO_LIQUID";
  if (/B3|BMFBOVESPA|BRASIL|BRAZIL/.test(market)) return "BRAZIL_B3";
  if (/ADX|DFM|DUBAI|ABU DHABI|UAE|AE\b/.test(market)) return "GULF_LARGE_CAP";
  if (/NASDAQ|NYSE|AMEX|ARCA|BATS|IEX|US\b|USA/.test(market)) return "US_LARGE_CAP";

  return "GLOBAL_LIQUID";
}

export function backtestConfigForMarket(marketInput: string): MarketBacktestConfig {
  const market = String(marketInput || "ADX").trim().toUpperCase();
  const profile = backtestProfileForMarket(market);
  const resolved = { ...BASE_PROFILE, ...(PROFILE_OVERRIDES[profile] ?? {}) };

  return {
    ...resolved,
    profile,
    id: `market-rotation-${profile.toLowerCase()}-${market.toLowerCase()}-v${MARKET_BACKTEST_CACHE_VERSION}`,
  };
}
