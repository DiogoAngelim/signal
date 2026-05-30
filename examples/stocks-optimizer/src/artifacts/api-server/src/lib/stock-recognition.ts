import {
  recognizeState,
  type RecognitionInput,
  type RecognitionResult,
  type RecognitionVerdict,
} from "../../../signal-framework/recognition/engine";

export type StockRecognitionSignal = {
  symbol?: string;
  ticker?: string;
  signalAction?: string;
  allocationAction?: string;
  signalStatus?: string;
  setupQuality?: number;
  riskPressure?: number;
  trendQuality?: number;
  timingQuality?: number;
  expectedMove?: number;
  signalConfidence?: number;
  rawConfidence?: number;
  calibratedConfidence?: number;
  diagnostic?: Record<string, unknown>;
  opportunityDiscovery?: any;
  judgement?: any;
  survivalMemory?: any;
  recovery?: any;
  recognition?: RecognitionResult;
};

export type StockRecognitionDiagnostics = {
  module: "stocks.recognition-adapter";
  primary: RecognitionResult | null;
  verdictCounts: Record<RecognitionVerdict, number>;
  signals: Array<{
    symbol: string;
    verdict: RecognitionVerdict;
    recognitionScore: number;
    recurrenceConfidence: number;
    noveltyScore: number;
    archetype: string;
    matchedSamples: number;
  }>;
};

export type StockRecognitionApplicationResult<T extends StockRecognitionSignal> = {
  signals: Array<T & { recognition: RecognitionResult }>;
  recognitionDiagnostics: StockRecognitionDiagnostics;
};

export function applyStockRecognitionDiagnostics<T extends StockRecognitionSignal>(input: {
  market: string;
  signals: T[];
  trades?: unknown[];
  summary?: Record<string, any>;
  opportunityDiscovery?: any;
}): StockRecognitionApplicationResult<T> {
  const candidates = new Map(
    array(input.opportunityDiscovery?.candidates).map((candidate: any) => [symbolOf(candidate), candidate]),
  );
  const signals = input.signals.map((signal) => {
    const recognition = recognizeState(buildStockRecognitionInput({
      signal,
      candidate: candidates.get(symbolOf(signal)),
      trades: input.trades,
      summary: input.summary,
      opportunityDiscovery: input.opportunityDiscovery,
    }));

    return {
      ...signal,
      recognition,
    };
  });

  return {
    signals,
    recognitionDiagnostics: summarizeRecognitionDiagnostics(signals),
  };
}

export function buildStockRecognitionInput(input: {
  signal: StockRecognitionSignal;
  candidate?: any;
  trades?: unknown[];
  summary?: Record<string, any>;
  opportunityDiscovery?: any;
}): RecognitionInput {
  const signal = input.signal;
  const candidate = input.candidate ?? signal.opportunityDiscovery ?? {};
  const genericDiscovery = candidate.discovery ?? signal.opportunityDiscovery?.discovery ?? input.opportunityDiscovery?.discovery ?? null;
  const judgement = signal.judgement ?? null;
  const survivalMemory = signal.survivalMemory ?? judgement?.survivalMemory ?? null;
  const rawAction = actionIntentFor(signal);
  const currentState = {
    actionIntent: rawAction,
    setupQuality: finiteNumber(signal.setupQuality),
    riskPressure: finiteNumber(signal.riskPressure),
    signalConfidence: finiteNumber(signal.calibratedConfidence ?? signal.signalConfidence ?? signal.rawConfidence),
  };
  const perception = {
    opportunityDensity: finiteNumber(input.opportunityDiscovery?.density?.density),
    opportunityQuality: finiteNumber(candidate.candidateScore ?? input.opportunityDiscovery?.density?.quality),
    readinessScore: finiteNumber(input.summary?.readinessScore),
    dataReliability: finiteNumber(input.summary?.strategyReadiness?.components?.dataReliability?.score ?? input.summary?.dataReliability?.score),
  };

  return {
    currentState,
    perception,
    discovery: genericDiscovery,
    judgement,
    survivalMemory,
    recovery: compactRecoveryContext(signal.recovery ?? input.summary?.recovery ?? null),
    outcomeSamples: tradeOutcomeSamples(input.trades, rawAction),
    archetypes: [
      ...archetypesFromCandidate(candidate, input.trades),
      ...archetypesFromJudgement({
        currentState,
        judgement,
        perception,
        summary: input.summary,
      }),
    ],
    now: "1970-01-01T00:00:00.000Z",
  };
}

function tradeOutcomeSamples(trades: unknown[] | undefined, actionIntent: string) {
  return array(trades).map((trade: any, index) => {
    const realized = finiteNumber(trade?.returnPct ?? trade?.profitPct ?? trade?.value ?? trade?.score) ?? 0;

    return {
      id: String(trade?.id ?? trade?.tradeId ?? `trade:${index + 1}`),
      state: {
        actionIntent: String(trade?.rawAction ?? trade?.action ?? (actionIntent || "Buy")),
        setupQuality: finiteNumber(trade?.setupQuality),
        riskPressure: finiteNumber(trade?.riskPressure),
        signalConfidence: finiteNumber(trade?.confidence ?? trade?.signalConfidence),
      },
      value: realized,
      success: realized > 0 ? true : realized < 0 ? false : null,
      archetype: realized > 0 ? "stable_positive_state" : realized < 0 ? "stable_negative_state" : "mixed_recurring_state",
      confidence: finiteNumber(trade?.confidence ?? trade?.signalConfidence),
    };
  });
}

function archetypesFromCandidate(candidate: any, trades: unknown[] | undefined) {
  const closed = array(trades);
  const outcomes = closed
    .map((trade: any) => finiteNumber(trade?.returnPct ?? trade?.profitPct ?? trade?.value ?? trade?.score))
    .filter((value): value is number => value != null);
  if (!outcomes.length) return [];

  const positiveOutcomes = outcomes.filter((value) => value > 0).length;
  const negativeOutcomes = outcomes.filter((value) => value < 0).length;
  const neutralOutcomes = outcomes.length - positiveOutcomes - negativeOutcomes;
  const setupQuality = finiteNumber(candidate?.candidateScore);
  if (setupQuality == null) return [];

  return [{
    id: "candidate-outcome-archetype",
    label: positiveOutcomes >= negativeOutcomes ? "stable_positive_state" : "stable_negative_state",
    state: {
      setupQuality,
    },
    confidence: Math.min(95, Math.max(50, (positiveOutcomes / Math.max(1, outcomes.length)) * 100)),
    sampleSize: outcomes.length,
    positiveOutcomes,
    negativeOutcomes,
    neutralOutcomes,
    outcomeStability: Math.max(0, (Math.max(positiveOutcomes, negativeOutcomes, neutralOutcomes) / outcomes.length) * 100),
  }];
}

function compactRecoveryContext(recovery: any) {
  if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) return null;

  const context: Record<string, string | number> = {};
  const status = stringValue(recovery.status);
  const mode = stringValue(recovery.mode);
  const recoveryScore = finiteNumber(recovery.recoveryScore);
  const trustedCapacity = finiteNumber(recovery.trustedCapacity);
  const recommendedExposureCap = finiteNumber(recovery.recommendedExposureCap);
  const confidenceCapLift = finiteNumber(recovery.confidenceCapLift);

  if (status) context.status = status;
  if (mode) context.mode = mode;
  if (recoveryScore != null) context.recoveryScore = recoveryScore;
  if (trustedCapacity != null) context.trustedCapacity = trustedCapacity;
  if (recommendedExposureCap != null) context.recommendedExposureCap = recommendedExposureCap;
  if (confidenceCapLift != null) context.confidenceCapLift = confidenceCapLift;

  return Object.keys(context).length ? context : null;
}

function archetypesFromJudgement(input: {
  currentState: Record<string, unknown>;
  judgement: any;
  perception: Record<string, unknown>;
  summary?: Record<string, any>;
}) {
  const judgement = input.judgement;
  const evidence = judgement?.evidence ?? {};
  const similarStates = Math.max(
    Math.round(finiteNumber(judgement?.similarSampleSize) ?? 0),
    Math.round(finiteNumber(evidence.similarStates) ?? 0),
  );
  const positiveOutcomes = Math.max(0, Math.round(finiteNumber(evidence.positiveOutcomes) ?? 0));
  const negativeOutcomes = Math.max(0, Math.round(finiteNumber(evidence.negativeOutcomes) ?? 0));
  const neutralOutcomes = Math.max(0, Math.round(finiteNumber(evidence.neutralOutcomes) ?? 0));
  const outcomeCount = positiveOutcomes + negativeOutcomes + neutralOutcomes;
  const reliability = finiteNumber(judgement?.reliability) ?? 0;
  const outcomeStability = finiteNumber(judgement?.outcomeStability) ?? finiteNumber(evidence.consistency) ?? 0;
  const dataReliability = finiteNumber(input.summary?.strategyReadiness?.components?.dataReliability?.score ?? input.summary?.dataReliability?.score);
  const stateFeatureCount = Object.values(input.currentState).filter((value) => value != null && value !== "").length;
  const hasStrongLinkage =
    similarStates >= 12 &&
    outcomeCount >= 5 &&
    reliability >= 70 &&
    outcomeStability >= 60 &&
    stateFeatureCount >= 3 &&
    (dataReliability == null || dataReliability >= 70);

  if (!hasStrongLinkage) return [];

  const dominantOutcomes = Math.max(positiveOutcomes, negativeOutcomes, neutralOutcomes);
  const dominantRatio = dominantOutcomes / outcomeCount;
  const label = dominantRatio >= 0.7 && positiveOutcomes === dominantOutcomes
    ? "stable_positive_state"
    : dominantRatio >= 0.7 && negativeOutcomes === dominantOutcomes
      ? "stable_negative_state"
      : "mixed_recurring_state";
  const sampleConfidence = Math.min(100, (similarStates / 16) * 100);
  const confidence = Math.min(95, Math.max(60, (
    reliability * 0.35 +
    outcomeStability * 0.35 +
    sampleConfidence * 0.2 +
    (dataReliability ?? reliability) * 0.1
  )));

  return [{
    id: "judgement-outcome-archetype",
    label,
    state: input.currentState,
    perception: input.perception,
    confidence,
    sampleSize: similarStates,
    positiveOutcomes,
    negativeOutcomes,
    neutralOutcomes,
    outcomeStability,
    metadata: {
      source: "judgement",
      reliability,
      similarStates,
    },
  }];
}

function summarizeRecognitionDiagnostics(
  signals: Array<StockRecognitionSignal & { recognition: RecognitionResult }>,
): StockRecognitionDiagnostics {
  const verdictCounts: Record<RecognitionVerdict, number> = {
    recognized: 0,
    partially_recognized: 0,
    novel: 0,
    conflicted: 0,
    insufficient_evidence: 0,
  };

  for (const signal of signals) {
    verdictCounts[signal.recognition.verdict] += 1;
  }

  const primary = [...signals].sort((left, right) =>
    right.recognition.recognitionScore - left.recognition.recognitionScore ||
    symbolOf(left).localeCompare(symbolOf(right)),
  )[0]?.recognition ?? null;

  return {
    module: "stocks.recognition-adapter",
    primary,
    verdictCounts,
    signals: signals.map((signal) => ({
      symbol: symbolOf(signal),
      verdict: signal.recognition.verdict,
      recognitionScore: signal.recognition.recognitionScore,
      recurrenceConfidence: signal.recognition.recurrenceConfidence,
      noveltyScore: signal.recognition.noveltyScore,
      archetype: signal.recognition.archetype,
      matchedSamples: signal.recognition.matchedSamples,
    })),
  };
}

function actionIntentFor(signal: StockRecognitionSignal) {
  return String(signal.diagnostic?.rawAction ?? signal.signalAction ?? signal.allocationAction ?? "Hold");
}

function symbolOf(value: any) {
  return String(value?.symbol ?? value?.ticker ?? "").trim().toUpperCase();
}

function finiteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function stringValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function array<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}
