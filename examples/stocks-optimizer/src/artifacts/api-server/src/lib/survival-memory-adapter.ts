import {
  type SurvivalMemoryAnalysis,
  type SurvivalMemoryRecord,
  type SurvivalOutcomeClass,
  buildSurvivalMemoryRecord,
  evaluateSurvivalMemory,
  fingerprintSurvivalState,
} from "../../../signal-framework/survival-memory/engine";

export type StockSurvivalMemoryInput = {
  market?: string;
  symbol?: string;
  rawAction?: string;
  setupQuality?: number;
  riskPressure?: number;
  volatilityPct?: number;
  liquidityScore?: number;
  expectedEdgePct?: number;
  rawSuggestedExposurePct?: number;
  maxPositionPct?: number;
  readiness?: Record<string, any> | null;
  trades?: unknown[];
  strategyHistory?: unknown[];
  requireExplicitSurvivalFields?: boolean;
};

export type StockSurvivalMemoryDiagnostic = SurvivalMemoryAnalysis & {
  module: "stocks.survival-memory";
  name: "Survival Memory";
  maxExposurePct: number;
  stateFingerprint: string;
  records: SurvivalMemoryRecord[];
};

export type SurvivalEnrichedTrade<T> = T & {
  stateFingerprint: string;
  maxDrawdown: number;
  maxAdverseExcursion: number;
  recoveryTimeBars?: number;
  volatilityExpansion: number;
  tailRisk: number;
  liquidityStress: number;
  structuralDanger: number;
  novelty: number;
  opportunityDensity: number;
  outcomeClass: SurvivalOutcomeClass;
  survivalCost: number;
  scarWeight: number;
  survivalNotes?: string[];
};

export function buildStockSurvivalMemory(
  input: StockSurvivalMemoryInput,
): StockSurvivalMemoryDiagnostic {
  const currentState = stockSurvivalState(input);
  const stateFingerprint = fingerprintSurvivalState(currentState);
  const records = [
    ...recordsFromTrades(input.trades ?? [], input),
    ...recordsFromHistory(input.strategyHistory ?? [], input),
  ];
  const analysis = evaluateSurvivalMemory({
    records,
    currentState,
    stateFingerprint,
    similarityThreshold: 0.3,
  });
  const baseMaxExposure = clamp(
    firstNumber(
      input.maxPositionPct,
      input.readiness?.maxPositionPct,
      input.rawSuggestedExposurePct,
      0,
    ),
  );
  const maxExposurePct = round(baseMaxExposure * analysis.exposureMultiplier);

  return {
    ...analysis,
    module: "stocks.survival-memory",
    name: "Survival Memory",
    maxExposurePct,
    stateFingerprint,
    records,
  };
}

export function enrichTradesWithSurvivalMemory<T>(
  trades: T[],
  input: StockSurvivalMemoryInput = {},
): Array<SurvivalEnrichedTrade<T>> {
  return trades.map((trade, index) => {
    const record = survivalRecordFromObject(trade, index, input, "trade");

    return {
      ...trade,
      stateFingerprint: record.stateFingerprint,
      maxDrawdown: record.maxDrawdown,
      maxAdverseExcursion: record.maxAdverseExcursion,
      recoveryTimeBars: record.recoveryTimeBars,
      volatilityExpansion: record.volatilityExpansion,
      tailRisk: record.tailRisk,
      liquidityStress: record.liquidityStress,
      structuralDanger: record.structuralDanger,
      novelty: record.novelty,
      opportunityDensity: record.opportunityDensity,
      outcomeClass: record.outcomeClass,
      survivalCost: record.survivalCost,
      scarWeight: record.scarWeight,
      ...(record.notes?.length ? { survivalNotes: record.notes } : {}),
    };
  });
}

function recordsFromTrades(trades: unknown[], input: StockSurvivalMemoryInput) {
  return trades.flatMap((trade, index) => {
    if (
      input.requireExplicitSurvivalFields &&
      !hasExplicitSurvivalFields(trade)
    )
      return [];
    return [survivalRecordFromObject(trade, index, input, "trade")];
  });
}

function recordsFromHistory(
  history: unknown[],
  input: StockSurvivalMemoryInput,
) {
  return history.flatMap((entry, index) => {
    const record = objectOrEmpty(entry);
    if (
      input.requireExplicitSurvivalFields &&
      !hasExplicitSurvivalFields(record)
    )
      return [];
    const returnPct = firstNumber(
      record.returnPct,
      record.return_pct,
      record.portfolioReturnPct,
      record.changePct,
    );
    if (returnPct == null) return [];

    return survivalRecordFromObject(
      {
        ...record,
        returnPct,
        symbol: input.symbol,
        market: input.market,
        entryExposure: firstNumber(
          record.deployedPct,
          input.rawSuggestedExposurePct,
          input.maxPositionPct,
          0,
        ),
        riskPressure: firstNumber(
          record.riskPressure,
          input.riskPressure,
          record.drawdownPct,
          record.maxDrawdownPct,
          0,
        ),
      },
      index,
      input,
      "history",
    );
  });
}

function hasExplicitSurvivalFields(value: unknown) {
  const record = objectOrEmpty(value);
  return [
    "survivalCost",
    "outcomeClass",
    "scarWeight",
    "maxDrawdown",
    "maxDrawdownPct",
    "maxAdverseExcursion",
    "maxAdverseExcursionPct",
    "recoveryTimeBars",
    "volatilityExpansion",
    "tailRisk",
    "liquidityStress",
    "structuralDanger",
  ].some(
    (key) =>
      record[key] !== null && record[key] !== undefined && record[key] !== "",
  );
}

function survivalRecordFromObject(
  value: unknown,
  index: number,
  input: StockSurvivalMemoryInput,
  source: "trade" | "history",
): SurvivalMemoryRecord {
  const record = objectOrEmpty(value);
  const symbol = String(
    record.symbol ?? record.ticker ?? input.symbol ?? `${source}-${index + 1}`,
  ).toUpperCase();
  const market =
    String(record.market ?? input.market ?? "").toUpperCase() || undefined;
  const realizedReturn = firstNumber(
    record.realizedReturn,
    record.returnPct,
    record.return_pct,
    record.profitPct,
    record.pnlPct,
    0,
  )!;
  const maxExposure = firstNumber(
    record.maxExposure,
    record.entryExposure,
    record.exposurePct,
    input.rawSuggestedExposurePct,
    input.maxPositionPct,
    0,
  )!;
  const riskPressure = clamp(
    firstNumber(record.riskPressure, input.riskPressure, 0)!,
  );
  const volatilityPct = Math.max(
    0,
    firstNumber(
      record.volatilityPct,
      input.volatilityPct,
      riskPressure / 12,
      0,
    )!,
  );
  const liquidityScore = clamp(
    firstNumber(record.liquidityScore, input.liquidityScore, 70)!,
  );
  const maxDrawdown = firstNumber(
    record.maxDrawdown,
    record.maxDrawdownPct,
    record.drawdownPct,
    record.drawdown,
    record.maxAdverseExcursion,
    realizedReturn < 0 ? Math.abs(realizedReturn) : riskPressure * 0.16,
    0,
  )!;
  const maxAdverseExcursion = firstNumber(
    record.maxAdverseExcursion,
    record.maxAdverseExcursionPct,
    record.adverseExcursionPct,
    maxDrawdown,
    realizedReturn < 0 ? Math.abs(realizedReturn) : riskPressure * 0.2,
    0,
  )!;
  const explicitStructuralDanger = firstNumber(
    record.structuralDanger,
    record.structuralRisk,
  );
  const structuralDanger =
    explicitStructuralDanger ??
    (source === "history" ? structuralDangerFor(input.readiness) : 0);
  const recoveryTimeBars = firstNumber(
    record.recoveryTimeBars,
    record.recoveryBars,
    record.holdingBars,
    durationBars(record.entryDate, record.exitDate),
  );
  const state = stockSurvivalState({
    ...input,
    symbol,
    market,
    rawAction: String(
      record.signalAction ?? record.action ?? input.rawAction ?? "Buy",
    ),
    setupQuality: firstNumber(record.setupQuality, input.setupQuality, 50)!,
    riskPressure,
    volatilityPct,
    liquidityScore,
    expectedEdgePct: realizedReturn,
    rawSuggestedExposurePct: maxExposure,
  });

  return buildSurvivalMemoryRecord({
    id: String(record.id ?? `${source}-${symbol}-${index + 1}`),
    timestamp: String(
      record.exitDate ??
        record.date ??
        record.timestamp ??
        record.entryDate ??
        "",
    ),
    asset: symbol,
    venue: market,
    regime: String(
      record.regime ??
        input.readiness?.stage ??
        input.readiness?.readinessStage ??
        "unknown",
    ),
    state,
    stateFingerprint:
      typeof record.stateFingerprint === "string"
        ? record.stateFingerprint
        : undefined,
    action: String(
      record.signalAction ?? record.action ?? input.rawAction ?? "Buy",
    ),
    maxExposure,
    realizedReturn,
    maxDrawdown,
    maxAdverseExcursion,
    recoveryTimeBars,
    volatilityExpansion: firstNumber(
      record.volatilityExpansion,
      record.volatilityShock,
      riskPressure,
      volatilityPct * 12,
      0,
    )!,
    tailRisk: firstNumber(
      record.tailRisk,
      record.tailPressure,
      Math.max(riskPressure, maxAdverseExcursion * 2),
      0,
    )!,
    liquidityStress: firstNumber(
      record.liquidityStress,
      record.liquidityPressure,
      100 - liquidityScore,
      riskPressure * 0.45,
      0,
    )!,
    structuralDanger,
    novelty: firstNumber(record.novelty, noveltyFor(input.readiness), 0)!,
    opportunityDensity: firstNumber(
      record.opportunityDensity,
      input.maxPositionPct && input.maxPositionPct > 0
        ? (maxExposure / input.maxPositionPct) * 100
        : undefined,
      input.setupQuality,
      0,
    )!,
  });
}

function stockSurvivalState(input: StockSurvivalMemoryInput) {
  const readiness = input.readiness ?? {};
  const structuralDanger = structuralDangerFor(readiness);
  const liquidityStress = 100 - clamp(firstNumber(input.liquidityScore, 70)!);
  const riskPressure = clamp(
    firstNumber(
      input.riskPressure,
      input.volatilityPct != null ? input.volatilityPct * 12 : undefined,
      0,
    )!,
  );

  return {
    venue: input.market,
    regime:
      readiness.stage ?? readiness.readinessStage ?? readiness.lifecycleStage,
    action: input.rawAction ?? "Buy",
    setupQuality: input.setupQuality,
    riskPressure,
    volatilityExpansion: firstNumber(
      input.volatilityPct != null ? input.volatilityPct * 12 : undefined,
      riskPressure,
      0,
    ),
    liquidityStress,
    tailRisk: Math.max(
      riskPressure,
      Math.max(0, -number(input.expectedEdgePct)) * 5,
    ),
    structuralDanger,
    novelty: noveltyFor(readiness),
    opportunityDensity:
      input.maxPositionPct && input.maxPositionPct > 0
        ? (number(input.rawSuggestedExposurePct) / input.maxPositionPct) * 100
        : input.setupQuality,
  };
}

function structuralDangerFor(
  readiness: Record<string, any> | null | undefined,
) {
  const concentration = readiness?.concentration?.outlierDependent
    ? Math.max(
        firstNumber(readiness.concentration.top1TradeContributionPct, 0)!,
        firstNumber(readiness.concentration.top5TradeContributionPct, 0)!,
      )
    : 0;

  return clamp(
    Math.max(
      firstNumber(
        readiness?.robustnessDiagnostics?.overfitRisk,
        readiness?.robustnessDiagnostics?.overfitRiskPct,
        0,
      )!,
      concentration,
      readiness?.walkForward?.stable === false ? 70 : 0,
      readiness?.parameterStability?.stable === false ? 65 : 0,
    ),
  );
}

function noveltyFor(readiness: Record<string, any> | null | undefined) {
  const sampleSize = firstNumber(
    readiness?.calibration?.sampleSize,
    readiness?.similarSampleSize,
    0,
  )!;
  return clamp(100 - Math.min(100, sampleSize * 4));
}

function durationBars(start: unknown, end: unknown) {
  const startMs = Date.parse(String(start ?? ""));
  const endMs = Date.parse(String(end ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs)
    return undefined;
  return Math.max(1, Math.round((endMs - startMs) / 86_400_000));
}

function objectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100;
}
