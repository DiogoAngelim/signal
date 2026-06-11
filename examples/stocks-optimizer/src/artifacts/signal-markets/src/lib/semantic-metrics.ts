import {
  type SemanticStateResult,
  resolveSemanticState,
} from "../../../signal-framework";

export type SemanticMetricView = {
  word: string;
  score: number;
  confidence: number;
  lexiconVersion: string;
  secondary: string[];
};

export type DashboardSemanticMetricsInput = {
  marketHealthPct: number;
  opportunityDensityPct: number;
  confidencePct: number;
  riskPct: number;
  avgQualityPct: number;
  suggestedMaximumExposurePct: number;
  strategyCapPct: number;
  sizingMode?: string;
};

export type DashboardSemanticMetrics = {
  marketHealth: SemanticMetricView;
  opportunityDensity: SemanticMetricView;
  sizing: SemanticMetricView;
  maximumExposure: SemanticMetricView;
  risk: SemanticMetricView;
  trend: SemanticMetricView;
  durability: SemanticMetricView;
};

export function buildDashboardSemanticMetrics(
  input: DashboardSemanticMetricsInput,
): DashboardSemanticMetrics {
  const marketHealth = pct(input.marketHealthPct);
  const opportunityDensity = pct(input.opportunityDensityPct);
  const confidence = pct(input.confidencePct);
  const risk = pct(input.riskPct, 1);
  const riskControl = 1 - risk;
  const trendQuality = pct(input.avgQualityPct);
  const exposureShare = exposureRatio(
    input.suggestedMaximumExposurePct,
    input.strategyCapPct,
  );

  return {
    marketHealth: semanticMetric(
      {
        stability: marketHealth,
        confidence,
        coherence: average([marketHealth, confidence, riskControl]),
        participation: opportunityDensity,
        volatility: risk,
        stress: risk,
        uncertainty: 1 - confidence,
      },
      { stability: 1.5, coherence: 1.2, confidence: 1.1, stress: 1.1 },
    ),
    opportunityDensity: semanticMetric(
      {
        participation: opportunityDensity,
        synchronization: clamp01(opportunityDensity * 0.75 + confidence * 0.25),
        momentum: clamp01(opportunityDensity * 0.7 + trendQuality * 0.3),
        confidence,
        uncertainty: 1 - opportunityDensity,
        urgency: opportunityDensity > 0.55 ? 0.58 : 0.18,
      },
      { participation: 2, synchronization: 1.2, uncertainty: 0.8 },
    ),
    sizing: semanticMetric(
      sizingDimensions(
        input.sizingMode,
        exposureShare,
        confidence,
        riskControl,
      ),
      { participation: 1.5, confidence: 1, stability: 1, stress: 0.8 },
      ["Limited", "Controlled", "Aggressive"],
    ),
    maximumExposure: semanticMetric(
      exposureDimensions(exposureShare, confidence, riskControl),
      { participation: 1.4, confidence: 0.9, stability: 0.9, urgency: 0.6 },
      ["Limited", "Controlled", "Cautious", "Aggressive"],
    ),
    risk: semanticMetric(
      {
        stability: riskControl,
        confidence,
        volatility: risk,
        stress: risk,
        uncertainty: average([risk, 1 - confidence]),
        urgency: risk > 0.7 ? 0.8 : risk * 0.6,
      },
      { stress: 1.5, volatility: 1.2, stability: 1.2, uncertainty: 1 },
    ),
    trend: semanticMetric(
      {
        momentum: trendQuality,
        direction: trendQuality,
        confidence,
        coherence: average([trendQuality, confidence, marketHealth]),
        volatility: risk,
        uncertainty: 1 - confidence,
      },
      { momentum: 1.4, direction: 1.2, coherence: 1 },
    ),
    durability: semanticMetric(
      {
        stability: average([marketHealth, riskControl]),
        confidence,
        coherence: average([marketHealth, confidence, trendQuality]),
        stress: risk,
        uncertainty: average([1 - confidence, risk]),
        momentum: trendQuality,
      },
      { stability: 1.3, confidence: 1.1, coherence: 1.1, stress: 0.9 },
    ),
  };
}

function semanticMetric(
  dimensions: Record<string, number>,
  weights: Record<string, number>,
  priority: string[] = [],
): SemanticMetricView {
  return toSemanticMetricView(
    resolveSemanticState(
      { dimensions },
      {
        weights,
        priority,
        secondaryLimit: 2,
      },
    ),
  );
}

function toSemanticMetricView(result: SemanticStateResult): SemanticMetricView {
  return {
    word: result.word,
    score: result.score,
    confidence: result.confidence,
    lexiconVersion: result.lexiconVersion,
    secondary: result.secondary.map((candidate) => candidate.word),
  };
}

function sizingDimensions(
  sizingMode: string | undefined,
  exposureShare: number,
  confidence: number,
  riskControl: number,
) {
  if (!sizingMode || sizingMode === "none" || exposureShare <= 0.01) {
    return {
      participation: 0.24,
      confidence: 0.42,
      direction: 0.44,
      stability: riskControl,
      stress: 1 - riskControl,
    };
  }

  const urgencyByMode: Record<string, number> = {
    micro: 0.24,
    small: 0.36,
    normal: 0.52,
    large: 0.68,
    maxSafe: 0.78,
  };

  return {
    participation: exposureShare,
    confidence,
    stability: riskControl,
    stress: 1 - riskControl,
    urgency: urgencyByMode[sizingMode] ?? exposureShare,
    momentum: exposureShare,
    direction: clamp01(0.45 + exposureShare * 0.45),
  };
}

function exposureDimensions(
  exposureShare: number,
  confidence: number,
  riskControl: number,
) {
  if (exposureShare <= 0.01) {
    return {
      participation: 0.24,
      confidence: 0.42,
      direction: 0.44,
      stability: riskControl,
      urgency: 0.16,
    };
  }

  return {
    participation: exposureShare,
    confidence,
    stability: riskControl,
    urgency: exposureShare,
    momentum: exposureShare,
    direction: clamp01(0.4 + exposureShare * 0.5),
    stress: 1 - riskControl,
  };
}

function exposureRatio(exposurePct: number, capPct: number) {
  if (!Number.isFinite(exposurePct) || !Number.isFinite(capPct) || capPct <= 0)
    return 0;
  return clamp01(exposurePct / capPct);
}

function pct(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return clamp01(value / 100);
}

function average(values: number[]) {
  return clamp01(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
