export type RegimeType =
  | "bull"
  | "bear"
  | "crash"
  | "recovery"
  | "volatility_transition"
  | "sideways"
  | "low_volatility"
  | "high_volatility"
  | "unknown";

export type HistoryCoverageStatus = "full" | "partial" | "thin" | "unavailable";

export type HistoricalCandle = {
  date: string;
  timestamp?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  source?: string;
  sourceStatus?: string;
  dataQuality?: string;
  providerSymbol?: string;
  exchange?: string;
  synthetic?: false;
  regime?: RegimeType;
  regimeConfidence?: number;
};

export type HistoryCoverage = {
  requestedYears: number;
  availableYears: number;
  requestedBars: number;
  returnedBars: number;
  expectedBars: number;
  firstDate: string | null;
  lastDate: string | null;
  coveragePct: number;
  status: HistoryCoverageStatus;
  source: string;
  providerSymbol?: string;
  exchange?: string;
};

export type CandleAudit = {
  duplicateCount: number;
  gapCount: number;
  longestGapDays: number;
  invalidOhlcCount: number;
  missingVolumeCount: number;
  stale: boolean;
  staleDays: number;
  qualityScore: number;
  warnings: string[];
  sourceStatus?: string;
  dataQuality?: string;
};

export type RegimeSegment = {
  regime: RegimeType;
  startDate: string;
  endDate: string;
  samples: number;
  returnPct: number;
  volatilityPct: number;
};

export type RegimeStatistics = {
  regimeCounts: Partial<Record<RegimeType, number>>;
  regimeSharePct: Partial<Record<RegimeType, number>>;
  keyRegimesCovered: RegimeType[];
  historyDepthScore: number;
  regimeCoverageScore: number;
  regimeDiversityScore: number;
  sampleDiversityScore: number;
  temporalConcentrationScore: number;
  currentRegime: RegimeType;
};

export type HistoricalDataset = {
  symbol: string;
  market?: string;
  providerSymbol?: string;
  exchange?: string;
  bars: HistoricalCandle[];
  coverage: HistoryCoverage;
  audit: CandleAudit;
  regimes: RegimeSegment[];
  regimeStats: RegimeStatistics;
  generatedAt: string;
};
