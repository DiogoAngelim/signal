import {
  type JudgementOutcome,
  type JudgementResult,
  type JudgementTrace,
  evaluateJudgement,
} from "../../../signal-framework/judgement/engine";
import {
  type StockSurvivalMemoryDiagnostic,
  buildStockSurvivalMemory,
} from "./survival-memory-adapter";

export type StockJudgementReadiness = {
  stage?: string;
  readinessScore?: number;
  maxPositionPct?: number;
  rawConfidence?: number;
  calibratedConfidence?: number;
  trustworthiness?: number;
  calibration?: {
    status?: string;
    sampleSize?: number;
    historicalAccuracy?: number;
    calibrationError?: number;
    trustworthiness?: number;
    warnings?: string[];
  };
  components?: {
    strategyEdge?: { score?: number; passed?: boolean };
    benchmarkEdge?: { score?: number; passed?: boolean };
    riskControl?: { score?: number; passed?: boolean };
    walkForwardRobustness?: { score?: number; passed?: boolean };
    liveSignalConsistency?: { score?: number; passed?: boolean };
    parameterRobustness?: { score?: number; passed?: boolean };
    concentrationControl?: { score?: number; passed?: boolean };
    dataReliability?: { score?: number; passed?: boolean };
  };
  benchmarks?: {
    excessReturnAfterCostsPct?: number;
    strategyReturnPct?: number;
    buyHoldReturnPct?: number;
  };
  walkForward?: {
    segmentCount?: number;
    positiveSegmentCount?: number;
    stable?: boolean;
    bestPeriodContributionPct?: number;
  };
  parameterStability?: {
    stable?: boolean;
    passRate?: number;
    benchmarkSurvivalRate?: number;
    variantCount?: number;
  };
  concentration?: {
    top1TradeContributionPct?: number;
    top5TradeContributionPct?: number;
    outlierDependent?: boolean;
  };
  robustnessDiagnostics?: Record<string, unknown>;
};

export type StockJudgementSizing = {
  decision?: string;
  mode?: string;
  size?: number;
  normalizedSize?: number;
  reasons?: string[];
};

export type StockJudgementInput = {
  market?: string;
  symbol?: string;
  rawAction: string;
  expectedEdgePct: number;
  rawSuggestedExposurePct: number;
  setupQuality: number;
  riskPressure: number;
  volatilityPct: number;
  liquidityScore?: number;
  rawConfidence: number;
  calibratedConfidence: number;
  readiness: StockJudgementReadiness;
  sizingResult?: StockJudgementSizing | null;
  previousTrades?: unknown[];
  strategyHistory?: unknown[];
  forwardShadow?: Record<string, unknown> | null;
  opportunityCandidates?: unknown[];
  agencyResult?: Record<string, unknown> | null;
  survivalMemory?: StockSurvivalMemoryDiagnostic | null;
};

export type StockJudgementResult = JudgementResult & {
  survivalMemory?: StockSurvivalMemoryDiagnostic;
};

export type StockJudgementExposureGate = {
  allowsNewExposure: boolean;
  requiresReview: boolean;
  blocksNewExposure: boolean;
  exposureMultiplier: number;
  adjustedExposurePct: number;
  reasons: string[];
};

export function evaluateStockJudgement(
  input: StockJudgementInput,
): StockJudgementResult {
  const survivalMemory =
    input.survivalMemory ??
    buildStockSurvivalMemory({
      market: input.market,
      symbol: input.symbol,
      rawAction: input.rawAction,
      setupQuality: input.setupQuality,
      riskPressure: input.riskPressure,
      volatilityPct: input.volatilityPct,
      liquidityScore: input.liquidityScore,
      expectedEdgePct: input.expectedEdgePct,
      rawSuggestedExposurePct: input.rawSuggestedExposurePct,
      maxPositionPct: input.readiness.maxPositionPct,
      readiness: input.readiness,
      trades: input.previousTrades,
      strategyHistory: input.strategyHistory,
      requireExplicitSurvivalFields: true,
    });
  const judgement = evaluateJudgement({
    currentState: currentStateFor(input),
    proposedDecision: {
      type: "stock-signal",
      action: input.rawAction,
      rawConfidence: input.calibratedConfidence,
      calibratedConfidence: input.calibratedConfidence,
      expectedEdgePct: input.expectedEdgePct,
      readinessStage: input.readiness.stage ?? "Unknown",
    },
    proposedAction: {
      kind: actionKindFor(input.rawAction),
      requestedExposurePct: input.rawSuggestedExposurePct,
      sizingDecision: input.sizingResult?.decision ?? "unknown",
      sizingMode: input.sizingResult?.mode ?? "none",
      sizedExposurePct: input.sizingResult?.size ?? 0,
    },
    historicalOutcomes: [
      ...tradeOutcomes(input),
      ...strategyHistoryOutcomes(input),
    ],
    traces: [
      ...forwardShadowTraces(input),
      ...opportunityTraces(input),
      ...agencyTraces(input),
    ],
    context: {
      market: input.market,
      symbol: input.symbol,
      rawConfidence: input.calibratedConfidence,
      calibratedConfidence: input.calibratedConfidence,
      minimumSimilarSamples: 5,
      strongSampleSize: 16,
      similarityThreshold: 0.42,
      overfitRisk: overfitRiskFor(input.readiness),
      calibrationStatus: input.readiness.calibration?.status,
      calibrationWarnings: input.readiness.calibration?.warnings ?? [],
    },
  });

  return applySurvivalMemoryToJudgement(
    judgement,
    survivalMemory,
    input.rawAction === "Buy" && input.expectedEdgePct > 0,
  );
}

export function judgementExposureGate(
  judgement: JudgementResult | null | undefined,
  exposurePct: number,
): StockJudgementExposureGate {
  if (!judgement) {
    return {
      allowsNewExposure: true,
      requiresReview: false,
      blocksNewExposure: false,
      exposureMultiplier: 1,
      adjustedExposurePct: roundPct(exposurePct),
      reasons: [],
    };
  }

  const blocksNewExposure = judgement.status === "blocked";
  const requiresReview = judgement.status === "review_required";
  const allowsNewExposure = !blocksNewExposure && !requiresReview;
  const confidenceRatio =
    judgement.rawConfidence > 0
      ? clamp(judgement.adjustedConfidence / judgement.rawConfidence, 0, 1)
      : 0;
  const exposureMultiplier = allowsNewExposure
    ? judgement.status === "trusted"
      ? confidenceRatio
      : Math.min(0.75, confidenceRatio)
    : 0;
  const adjustedExposurePct = roundPct(exposurePct * exposureMultiplier);

  return {
    allowsNewExposure,
    requiresReview,
    blocksNewExposure,
    exposureMultiplier: roundPct(exposureMultiplier),
    adjustedExposurePct,
    reasons: judgementReasons(judgement),
  };
}

export function judgementTrustForAgency(
  readinessTrust: number,
  judgement: JudgementResult | null | undefined,
) {
  const baseTrust = clamp(readinessTrust);
  if (!judgement) return baseTrust;
  if (judgement.status === "trusted")
    return roundPct(Math.max(baseTrust, judgement.trust));
  if (judgement.status === "cautious")
    return roundPct(Math.min(baseTrust, judgement.trust));
  return roundPct(
    Math.min(baseTrust, judgement.trust, judgement.adjustedConfidence),
  );
}

export function judgementReasons(judgement: JudgementResult) {
  return [
    ...judgement.reasons,
    ...judgement.warnings.map((warning) => `Judgement warning: ${warning}.`),
  ];
}

function applySurvivalMemoryToJudgement(
  judgement: JudgementResult,
  survivalMemory: StockSurvivalMemoryDiagnostic,
  opensNewExposure: boolean,
): StockJudgementResult {
  if (
    !opensNewExposure ||
    survivalMemory.recordCount === 0 ||
    survivalMemory.scarCount === 0
  ) {
    return { ...judgement, survivalMemory };
  }

  const penalty = clamp(survivalMemory.confidencePenalty, 0, 45);
  const adjustedConfidence = clamp(
    Math.min(
      judgement.adjustedConfidence - penalty,
      survivalMemory.survivalConfidence,
    ),
  );
  const trust = clamp(
    Math.min(
      judgement.trust - penalty * 0.6,
      survivalMemory.survivalConfidence,
    ),
  );
  const reliability = clamp(
    Math.min(
      judgement.reliability,
      100 - survivalMemory.averageSurvivalCost * 0.7,
    ),
  );
  const outcomeStability = clamp(
    Math.min(
      judgement.outcomeStability,
      100 - survivalMemory.averageSurvivalCost * 0.8,
    ),
  );
  const overfitRisk = clamp(
    Math.max(judgement.overfitRisk, survivalMemory.averageSurvivalCost),
  );
  const status: JudgementResult["status"] =
    survivalMemory.recommendation === "wait" &&
    survivalMemory.exposureMultiplier === 0
      ? "blocked"
      : survivalMemory.recommendation === "wait"
        ? "review_required"
        : judgement.status === "trusted"
          ? "cautious"
          : judgement.status;
  const reasons = unique([
    ...judgement.reasons,
    ...survivalMemory.reasons,
    survivalMemory.mainWarnings.some((warning) => /profitable/i.test(warning))
      ? "Survival memory penalized confidence because similar states were profitable but had unacceptable drawdown."
      : "Survival memory capped confidence because similar states carried survival scars.",
  ]);
  const warnings = unique([
    ...judgement.warnings,
    "survival scars detected",
    ...survivalMemory.mainWarnings,
  ]);

  return {
    ...judgement,
    status,
    adjustedConfidence,
    trust,
    reliability,
    outcomeStability,
    overfitRisk,
    confidenceDelta: roundPct(adjustedConfidence - judgement.rawConfidence),
    reasons,
    warnings,
    survivalMemory,
  };
}

function currentStateFor(input: StockJudgementInput) {
  return {
    market: input.market,
    symbol: input.symbol,
    rawAction: input.rawAction,
    expectedEdgePct: input.expectedEdgePct,
    setupQuality: input.setupQuality,
    riskPressure: input.riskPressure,
    volatilityPct: input.volatilityPct,
    liquidityScore: input.liquidityScore ?? 70,
    readinessStage: input.readiness.stage ?? "Unknown",
    readinessScore:
      input.readiness.readinessScore ??
      input.readiness.calibratedConfidence ??
      input.calibratedConfidence,
    benchmarkExcessPct:
      input.readiness.benchmarks?.excessReturnAfterCostsPct ?? 0,
    liveSignalScore:
      input.readiness.components?.liveSignalConsistency?.score ?? 0,
    parameterPassRate: input.readiness.parameterStability?.passRate ?? 0,
    sizingDecision: input.sizingResult?.decision ?? "unknown",
    sizingMode: input.sizingResult?.mode ?? "none",
  };
}

function tradeOutcomes(input: StockJudgementInput): JudgementOutcome[] {
  return safeArray(input.previousTrades).map((trade, index) => {
    const record = objectOrEmpty(trade);
    const returnPct = firstNumber(
      record.returnPct,
      record.return_pct,
      record.profitPct,
      record.pnlPct,
      0,
    ) as number;
    const symbol = String(
      record.symbol ?? record.ticker ?? input.symbol ?? `trade-${index}`,
    ).toUpperCase();

    return {
      id: String(record.id ?? `${symbol}-${index}`),
      state: {
        market: record.market ?? input.market,
        symbol,
        rawAction: record.signalAction ?? record.action ?? "Buy",
        setupQuality: firstNumber(record.setupQuality, input.setupQuality),
        riskPressure: firstNumber(record.riskPressure, input.riskPressure),
        volatilityPct: firstNumber(record.volatilityPct, input.volatilityPct),
        readinessStage: input.readiness.stage ?? "Unknown",
        benchmarkExcessPct:
          input.readiness.benchmarks?.excessReturnAfterCostsPct ?? 0,
      },
      decision: {
        type: "stock-signal",
        action: record.signalAction ?? record.action ?? "Buy",
        expectedEdgePct: firstNumber(
          record.expectedEdgePct,
          returnPct,
          input.expectedEdgePct,
        ),
      },
      action: {
        kind: "open_exposure",
        requestedExposurePct: firstNumber(
          record.entryExposure,
          record.exposurePct,
          input.rawSuggestedExposurePct,
        ),
      },
      outcome: {
        returnPct,
        success: returnPct > 0 ? true : returnPct < 0 ? false : null,
        label:
          returnPct > 0 ? "success" : returnPct < 0 ? "failure" : "neutral",
      },
      confidence: firstNumber(
        record.confidence,
        record.signalConfidence,
        record.rawConfidence,
        input.rawConfidence,
      ),
      metadata: {
        source: "previous-trade",
        survivalCost: firstNumber(record.survivalCost),
        outcomeClass: record.outcomeClass,
        maxDrawdown: firstNumber(record.maxDrawdown, record.maxDrawdownPct),
        maxAdverseExcursion: firstNumber(record.maxAdverseExcursion),
      },
    };
  });
}

function strategyHistoryOutcomes(
  input: StockJudgementInput,
): JudgementOutcome[] {
  return safeArray(input.strategyHistory).flatMap((entry, index) => {
    const record = objectOrEmpty(entry);
    const returnPct = firstNumber(
      record.returnPct,
      record.return_pct,
      record.portfolioReturnPct,
      record.changePct,
    );
    if (returnPct == null) return [];

    return [
      {
        id: String(record.id ?? record.date ?? `history-${index}`),
        state: {
          market: input.market,
          rawAction: input.rawAction,
          readinessStage: input.readiness.stage ?? "Unknown",
          setupQuality: input.setupQuality,
          riskPressure: input.riskPressure,
          volatilityPct: input.volatilityPct,
        },
        decision: {
          type: "strategy-history",
          confidence: firstNumber(record.confidence, input.rawConfidence),
        },
        action: {
          kind: actionKindFor(input.rawAction),
          requestedExposurePct: input.rawSuggestedExposurePct,
        },
        outcome: {
          returnPct,
          success: returnPct > 0 ? true : returnPct < 0 ? false : null,
        },
        confidence: firstNumber(record.confidence, input.rawConfidence),
        metadata: {
          source: "strategy-history",
          survivalCost: firstNumber(record.survivalCost),
          outcomeClass: record.outcomeClass,
        },
      },
    ];
  });
}

function forwardShadowTraces(input: StockJudgementInput): JudgementTrace[] {
  const shadow = input.forwardShadow;
  if (!shadow) return [];

  const evaluated = firstNumber(
    shadow.evaluatedSignalCount,
    shadow.evaluatedSignals,
    0,
  ) as number;
  if (evaluated <= 0) return [];

  const averageReturnPct = firstNumber(
    shadow.averageReturnPct,
    shadow.meanReturnPct,
    0,
  ) as number;
  return [
    {
      state: {
        market: input.market,
        rawAction: input.rawAction,
        readinessStage: input.readiness.stage ?? "Unknown",
        setupQuality: input.setupQuality,
        riskPressure: input.riskPressure,
      },
      decision: {
        type: "forward-shadow",
        confidence: input.calibratedConfidence,
      },
      action: {
        kind: actionKindFor(input.rawAction),
      },
      outcome: {
        returnPct: averageReturnPct,
        success:
          averageReturnPct > 0 ? true : averageReturnPct < 0 ? false : null,
      },
      confidence: input.calibratedConfidence,
      metadata: { source: "forward-shadow", sampleSize: evaluated },
    },
  ];
}

function opportunityTraces(input: StockJudgementInput): JudgementTrace[] {
  return safeArray(input.opportunityCandidates)
    .slice(0, 5)
    .map((candidate, index) => {
      const record = objectOrEmpty(candidate);
      const score = firstNumber(
        record.candidateScore,
        record.score,
        0,
      ) as number;
      return {
        id: String(record.symbol ?? record.id ?? `candidate-${index}`),
        state: {
          market: input.market,
          symbol: record.symbol ?? input.symbol,
          rawAction: input.rawAction,
          setupQuality: firstNumber(record.candidateScore, input.setupQuality),
          riskPressure: input.riskPressure,
        },
        decision: {
          type: "opportunity-candidate",
          confidence: score,
        },
        action: {
          kind: actionKindFor(input.rawAction),
        },
        outcome: {
          returnPct: firstNumber(
            record.expectedOutcome,
            record.expectedMove,
            input.expectedEdgePct,
          ),
          success: score >= 60,
        },
        confidence: score,
        metadata: { source: "opportunity-candidate" },
      };
    });
}

function agencyTraces(input: StockJudgementInput): JudgementTrace[] {
  const agency = input.agencyResult;
  if (!agency) return [];

  return [
    {
      state: {
        market: input.market,
        symbol: input.symbol,
        rawAction: input.rawAction,
        setupQuality: input.setupQuality,
        riskPressure: input.riskPressure,
      },
      decision: {
        type: "agency-audit",
        confidence: input.calibratedConfidence,
      },
      action: {
        kind: actionKindFor(input.rawAction),
      },
      outcome: {
        label:
          agency.allowed === true
            ? "success"
            : agency.requiresApproval === true
              ? "partial"
              : "failure",
      },
      confidence: input.calibratedConfidence,
      metadata: { source: "agency-audit" },
    },
  ];
}

function overfitRiskFor(readiness: StockJudgementReadiness) {
  const robustness = readiness.robustnessDiagnostics ?? {};
  const explicit = firstNumber(
    robustness.overfitRisk,
    robustness.overfitRiskPct,
    robustness.overfitRiskScore,
  );
  const concentration = readiness.concentration?.outlierDependent
    ? Math.max(
        firstNumber(
          readiness.concentration.top1TradeContributionPct,
          0,
        ) as number,
        firstNumber(
          readiness.concentration.top5TradeContributionPct,
          0,
        ) as number,
      )
    : 0;
  const walkForwardRisk = readiness.walkForward?.stable === false ? 70 : 0;
  const parameterRisk =
    readiness.parameterStability?.stable === false
      ? 100 - (firstNumber(readiness.parameterStability.passRate, 0) as number)
      : 0;

  return clamp(
    Math.max(explicit ?? 0, concentration, walkForwardRisk, parameterRisk),
  );
}

function actionKindFor(action: string) {
  if (action === "Buy") return "open_exposure";
  if (action === "Sell") return "reduce_exposure";
  return "observe";
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundPct(value: number) {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
