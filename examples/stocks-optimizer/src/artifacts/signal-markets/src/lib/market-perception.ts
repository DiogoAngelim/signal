import {
  type CalibrationInput,
  type MetricContribution as FrameworkMetricContribution,
  type MetricState as FrameworkMetricState,
  type MetricInput as MarketMetricInput,
  type StocksOptimizerMetricSource as MarketPerceptionMetricSource,
  type NormalizationState as MetricNormalization,
  type MetricPolarity,
  type SignalContext,
  SignalFrameworkEngine,
  type SignalSnapshot,
  type StocksMeaningViewModel,
  type StocksPruningViewModel,
  type StocksPurposeViewModel,
  buildStocksLeadershipObservations,
  buildStocksMeaningViewModel,
  buildStocksOptimizerMetrics,
  buildStocksPruningInput,
  buildStocksPruningViewModel,
  buildStocksPurposeInput,
  buildStocksPurposeViewModel,
  buildStocksSynchronization,
  createStocksMetricRegistry,
  resolveSemanticState,
} from "../../../signal-framework";
import {
  type MarketReliabilityResult,
  applyReliabilityToMetricInputs,
  evaluateMarketReliability,
} from "./market-reliability";

export type {
  MarketMetricInput,
  MetricNormalization,
  MetricPolarity,
  MarketPerceptionMetricSource,
};

export type MarketLayerKey =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "indigo"
  | "violet"
  | "white";

export type MarketTimeframeKey = "intraday" | "swing" | "macro";

export type MetricLayerMapping = {
  layer: MarketLayerKey;
  weight: number;
  polarity?: MetricPolarity;
};

export type MetricDescriptor = {
  key: string;
  label: string;
  layerMappings: MetricLayerMapping[];
  description: string;
  unit?: string;
};

export type MetricContribution = FrameworkMetricContribution;

export type MetricState = Omit<FrameworkMetricState, "layers"> & {
  layers: MetricLayerMapping[];
};

export type MarketLayerState = {
  key: MarketLayerKey;
  label: string;
  meaning: string;
  color: string;
  score: number;
  confidence: number;
  momentum: number;
  classification: string;
  visualSignal: string;
  contributors: MetricContribution[];
};

export type MarketTimeframeState = {
  key: MarketTimeframeKey;
  label: string;
  score: number;
  agreement: number;
};

export type MarketStateTransition = {
  timestamp: number;
  regime: string;
  compositeScore: number;
  red: number;
  orange: number;
  yellow: number;
  green: number;
  blue: number;
  indigo: number;
  violet: number;
  white: number;
};

export type MarketStateSnapshot = {
  timestamp: number;
  timeframe: string;
  market: string;
  regime: string;
  compositeScore: number;
  confidence: number;
  agreement: number;
  dominantLayer: MarketLayerKey;
  layers: Record<MarketLayerKey, MarketLayerState>;
  timeframes: Record<MarketTimeframeKey, MarketTimeframeState>;
  metrics: Record<string, MetricState>;
  history: MarketStateTransition[];
  reliability?: MarketReliabilityResult;
  meaning?: StocksMeaningViewModel;
  pruning?: StocksPruningViewModel;
  purpose?: StocksPurposeViewModel;
  framework?: Pick<
    SignalSnapshot,
    | "synchronization"
    | "diagnostics"
    | "reflection"
    | "calibration"
    | "agency"
    | "pruning"
    | "meaning"
    | "purpose"
    | "needs"
    | "opportunities"
    | "opportunityDensity"
    | "rankings"
    | "validation"
    | "executionReadiness"
    | "events"
  >;
};

type LayerDefinition = {
  label: string;
  meaning: string;
  color: string;
  visualSignals: [string, string, string, string];
  classifications: [string, string, string, string];
};

const FRAMEWORK_TO_MARKET_LAYER = {
  survival: "red",
  emotion: "orange",
  conviction: "yellow",
  harmony: "green",
  information: "blue",
  intuition: "indigo",
  macroContext: "violet",
  selfAwareness: "white",
} as const;

const LAYER_ORDER: MarketLayerKey[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
  "white",
];

export const MARKET_LAYER_DEFINITIONS: Record<MarketLayerKey, LayerDefinition> =
  {
    red: {
      label: "Survival",
      meaning:
        "Liquidity stress, tail pressure, volatility expansion, and structural instability.",
      color: "#ff3b30",
      classifications: [
        "Stable geometry",
        "Pressure building",
        "Structural stress",
        "Critical instability",
      ],
      visualSignals: [
        "Smooth pressure ring",
        "Compressed ring",
        "Fractured turbulence",
        "Violent fragmentation",
      ],
    },
    orange: {
      label: "Emotion",
      meaning:
        "Crowd acceleration, panic/euphoria, narrative concentration, and emotional turbulence.",
      color: "#ff8a00",
      classifications: [
        "Calm flow",
        "Warming crowd",
        "Overheated emotion",
        "Explosive psychology",
      ],
      visualSignals: [
        "Warm breathing",
        "Fluid acceleration",
        "Heatwave bursts",
        "Chaotic flow",
      ],
    },
    yellow: {
      label: "Conviction",
      meaning:
        "Signal consensus, directional authority, stability, and execution confidence.",
      color: "#ffd84d",
      classifications: [
        "Scattered signal",
        "Forming bias",
        "Coherent projection",
        "Focused authority",
      ],
      visualSignals: [
        "Diffuse rays",
        "Aligning vectors",
        "Luminous beams",
        "Focused streams",
      ],
    },
    green: {
      label: "Harmony",
      meaning:
        "Breadth, synchronization, structural balance, and portfolio symmetry.",
      color: "#24d17e",
      classifications: [
        "Fragmented field",
        "Partial alignment",
        "Synchronized market",
        "Balanced ecosystem",
      ],
      visualSignals: [
        "Warped asymmetry",
        "Partial orbit",
        "Harmonic waves",
        "Orbital synchronization",
      ],
    },
    blue: {
      label: "Information",
      meaning:
        "Information transfer, event absorption, quote reliability, and signal confirmation.",
      color: "#37a5ff",
      classifications: [
        "Signal gaps",
        "Uneven transfer",
        "Coherent propagation",
        "Efficient absorption",
      ],
      visualSignals: [
        "Broken interference",
        "Mixed ripples",
        "Clear wave field",
        "Clean propagation",
      ],
    },
    indigo: {
      label: "Intuition",
      meaning:
        "Anomaly emergence, latent structure, and transition probability.",
      color: "#6755ff",
      classifications: [
        "Dormant topology",
        "Hidden activity",
        "Transition forming",
        "Regime emergence",
      ],
      visualSignals: [
        "Dim topology",
        "Node activation",
        "Structural morphing",
        "Topology transformation",
      ],
    },
    violet: {
      label: "Macro Context",
      meaning:
        "Macro pressure, capital rotation, long-cycle environment, and regime gravity.",
      color: "#b65cff",
      classifications: [
        "Clear atmosphere",
        "Macro drift",
        "Environmental pressure",
        "Dense gravity",
      ],
      visualSignals: [
        "Smooth ambient field",
        "Orbital drift",
        "Warped density",
        "Gravitational distortion",
      ],
    },
    white: {
      label: "System Self-Awareness",
      meaning:
        "Data reliability, calibrated confidence, uncertainty, memory depth, decision consistency, and residual overfit risk.",
      color: "#f8fafc",
      classifications: [
        "Uncalibrated",
        "Review-gated",
        "Self-aware",
        "Autonomous-ready",
      ],
      visualSignals: [
        "Unstable nucleus",
        "Soft flicker",
        "Stable pulse",
        "Radiant center",
      ],
    },
  };

export class MetricRegistry {
  private readonly frameworkRegistry = createStocksMetricRegistry();

  all(): MetricDescriptor[] {
    return this.frameworkRegistry.all().map((descriptor) => ({
      ...descriptor,
      layerMappings: descriptor.layerMappings.map((mapping) => ({
        ...mapping,
        layer: FRAMEWORK_TO_MARKET_LAYER[mapping.layer],
      })),
    }));
  }
}

export function createDefaultMetricRegistry() {
  return new MetricRegistry();
}

export function buildMarketPerceptionMetrics(
  input: MarketPerceptionMetricSource,
): MarketMetricInput[] {
  return buildStocksOptimizerMetrics(input);
}

export class MarketStateEngine {
  private readonly engine = new SignalFrameworkEngine(
    createStocksMetricRegistry(),
  );
  private readonly history: MarketStateTransition[] = [];
  private lastSource: MarketPerceptionMetricSource | null = null;

  constructor(
    _registry = createDefaultMetricRegistry(),
    private readonly options: {
      maxSnapshotHistory?: number;
      storageKey?: string;
    } = {},
  ) {}

  setSource(input: MarketPerceptionMetricSource) {
    this.lastSource = input;
  }

  async ingest(
    inputs: MarketMetricInput[],
    context: { market: string; timeframe?: string; timestamp?: number } = {
      market: "Unknown",
    },
  ): Promise<MarketStateSnapshot> {
    const timestamp = context.timestamp ?? Date.now();
    const reliability = this.lastSource
      ? evaluateMarketReliability({
          ...this.lastSource,
          market: context.market,
          now: timestamp,
        })
      : undefined;
    const calibration = this.lastSource
      ? buildCalibrationContext(this.lastSource, timestamp)
      : undefined;
    const reliabilityAdjustedInputs = reliability
      ? applyReliabilityToMetricInputs(inputs, reliability)
      : inputs;
    const frameworkSnapshot = await this.engine.cycleOnce({
      timestamp,
      domain: "stocks-optimizer",
      metrics: reliabilityAdjustedInputs,
      synchronization: this.lastSource
        ? buildStocksSynchronization(this.lastSource)
        : undefined,
      calibration,
      meaning: this.lastSource?.meaningText
        ? {
            text: this.lastSource.meaningText,
            context: {
              domain: "stocks-optimizer",
              currentGoal: "sustainable market progress",
              safetyConstraints: [
                "Protect risk of ruin before optimizing return.",
                "Do not let revenge, panic recovery, or speed pressure increase exposure.",
              ],
            },
          }
        : undefined,
      pruning: this.lastSource
        ? buildStocksPruningInput(this.lastSource, { now: timestamp })
        : undefined,
      purpose: this.lastSource
        ? buildStocksPurposeInput(this.lastSource, { now: timestamp })
        : undefined,
      observations: this.lastSource
        ? buildStocksLeadershipObservations(this.lastSource.stocks, timestamp)
        : [],
      metadata: {
        market: context.market,
        timeframe: context.timeframe ?? "live",
        boundary: "stocks-optimizer-adapter",
        reliability,
      },
    });
    const snapshot = adaptSnapshot(
      frameworkSnapshot,
      context.market,
      context.timeframe ?? "live",
      this.history,
      reliability,
    );
    this.history.push(compactTransition(snapshot));
    this.history.splice(
      0,
      Math.max(
        0,
        this.history.length - (this.options.maxSnapshotHistory ?? 80),
      ),
    );
    snapshot.history = this.history.slice();
    return snapshot;
  }

  getHistory() {
    return this.history.slice();
  }
}

function adaptSnapshot(
  snapshot: Readonly<SignalSnapshot>,
  market: string,
  timeframe: string,
  history: MarketStateTransition[],
  reliability?: MarketReliabilityResult,
): MarketStateSnapshot {
  const layers = {} as Record<MarketLayerKey, MarketLayerState>;

  for (const [frameworkKey, layer] of Object.entries(
    snapshot.perception.layers,
  )) {
    const marketKey =
      FRAMEWORK_TO_MARKET_LAYER[
        frameworkKey as keyof typeof FRAMEWORK_TO_MARKET_LAYER
      ];
    const definition = MARKET_LAYER_DEFINITIONS[marketKey];
    const visualIndex =
      layer.score >= 75 ? 3 : layer.score >= 50 ? 2 : layer.score >= 25 ? 1 : 0;
    const confidence = reliability
      ? Math.min(layer.confidence, reliability.confidenceCap)
      : layer.confidence;
    layers[marketKey] = {
      key: marketKey,
      label: definition.label,
      meaning: definition.meaning,
      color: definition.color,
      score: layer.score,
      confidence,
      momentum: layer.momentum,
      classification: semanticLayerClassification(
        marketKey,
        layer.score,
        confidence,
        layer.momentum,
      ),
      visualSignal: definition.visualSignals[visualIndex],
      contributors: layer.contributors,
    };
  }

  const timeframes = Object.fromEntries(
    Object.entries(snapshot.perception.timeframes).map(([key, state]) => [
      key,
      state,
    ]),
  ) as Record<MarketTimeframeKey, MarketTimeframeState>;

  return {
    timestamp: snapshot.timestamp,
    timeframe,
    market,
    regime: snapshot.regime.name,
    compositeScore: snapshot.perception.compositeScore,
    confidence: reliability
      ? Math.min(snapshot.confidence, reliability.confidenceCap)
      : snapshot.confidence,
    agreement: snapshot.perception.agreement,
    dominantLayer: FRAMEWORK_TO_MARKET_LAYER[snapshot.perception.dominantLayer],
    layers,
    timeframes,
    metrics: adaptMetrics(snapshot.metrics),
    history: history.slice(),
    reliability,
    meaning: buildStocksMeaningViewModel(snapshot.meaning),
    pruning: buildStocksPruningViewModel(snapshot.pruning),
    purpose: buildStocksPurposeViewModel(snapshot.purpose),
    framework: {
      synchronization: snapshot.synchronization,
      diagnostics: snapshot.diagnostics,
      reflection: snapshot.reflection,
      calibration: snapshot.calibration,
      agency: snapshot.agency,
      pruning: snapshot.pruning,
      meaning: snapshot.meaning,
      purpose: snapshot.purpose,
      needs: snapshot.needs,
      opportunities: snapshot.opportunities,
      opportunityDensity: snapshot.opportunityDensity,
      rankings: snapshot.rankings,
      validation: snapshot.validation,
      executionReadiness: snapshot.executionReadiness,
      events: snapshot.events,
    },
  };
}

function buildCalibrationContext(
  source: MarketPerceptionMetricSource,
  timestamp: number,
): SignalContext["calibration"] | undefined {
  const confidence =
    finiteNumber(source.calibrationRawConfidence) ??
    finiteNumber(source.confidence) ??
    finiteNumber(source.survivalScore);
  if (confidence == null) return undefined;

  return {
    id: `market-calibration-${timestamp}`,
    timestamp: new Date(timestamp).toISOString(),
    prediction: {
      expectedOutcome: "trusted-understanding",
      calibratedConfidence: finiteNumber(
        source.calibrationCalibratedConfidence,
      ),
    },
    confidence: clampPct(confidence),
    metadata: {
      source: "market-perception-calibration",
      status: source.calibrationStatus ?? "unknown",
      trustworthiness: finiteNumber(source.calibrationTrustworthiness),
      warnings: Array.isArray(source.calibrationWarnings)
        ? source.calibrationWarnings
        : [],
    },
    history: buildCalibrationHistory(source, timestamp),
  };
}

function buildCalibrationHistory(
  source: MarketPerceptionMetricSource,
  timestamp: number,
): CalibrationInput[] {
  const sampleSize = Math.min(
    160,
    Math.max(0, Math.round(finiteNumber(source.calibrationSampleSize) ?? 0)),
  );
  const historicalAccuracy = finiteNumber(source.calibrationHistoricalAccuracy);
  if (sampleSize <= 0 || historicalAccuracy == null) return [];

  const calibrationError = finiteNumber(source.calibrationError) ?? 0;
  const averageConfidence = clampPct(historicalAccuracy + calibrationError);
  const successCount = Math.round(
    sampleSize * (clampPct(historicalAccuracy) / 100),
  );

  return Array.from({ length: sampleSize }, (_, index) => {
    const success = index < successCount;
    return {
      id: `market-calibration-history-${timestamp}-${index}`,
      timestamp: new Date(
        timestamp - (sampleSize - index) * 60_000,
      ).toISOString(),
      prediction: { expectedOutcome: "success" },
      confidence: averageConfidence,
      outcome: { label: success ? "success" : "failure", correct: success },
      metadata: {
        source: "readiness-calibration-summary",
        sampleIndex: index,
        summarized: true,
      },
    };
  });
}

function semanticLayerClassification(
  layer: MarketLayerKey,
  score: number,
  confidence: number,
  momentum: number,
) {
  if (layer === "white") {
    if (score >= 90) return "Autonomous-ready";
    if (score >= 75) return "Self-aware";
    if (score >= 50) return "Review-gated";
    return "Uncalibrated";
  }

  const strength = pct(score);
  const trust = pct(confidence);
  const motion = clamp01(
    0.5 + (Number.isFinite(momentum) ? momentum : 0) / 100,
  );

  const dimensionsByLayer: Record<MarketLayerKey, Record<string, number>> = {
    red: {
      stability: 1 - strength,
      stress: strength,
      volatility: strength,
      urgency: strength,
      confidence: trust,
      uncertainty: 1 - trust,
    },
    orange: {
      stress: strength,
      volatility: strength,
      urgency: strength,
      participation: strength,
      momentum: motion,
      uncertainty: 1 - trust,
    },
    yellow: {
      confidence: strength,
      coherence: strength,
      direction: strength,
      momentum: motion,
      uncertainty: 1 - trust,
    },
    green: {
      synchronization: strength,
      coherence: strength,
      participation: strength,
      stability: trust,
      uncertainty: 1 - trust,
    },
    blue: {
      coherence: strength,
      confidence: trust,
      synchronization: strength,
      stability: strength,
      uncertainty: 1 - strength,
    },
    indigo: {
      momentum: strength,
      direction: strength,
      uncertainty: 1 - trust,
      urgency: motion,
      coherence: strength,
    },
    violet: {
      stability: 1 - strength * 0.5,
      stress: strength,
      uncertainty: strength,
      volatility: strength * 0.7,
      direction: motion,
    },
    white: {
      confidence: strength,
      stability: strength,
      coherence: strength,
      uncertainty: 1 - strength,
      stress: 1 - trust,
    },
  };

  return resolveSemanticState(
    { dimensions: dimensionsByLayer[layer] },
    {
      weights: {
        confidence: 1.2,
        coherence: 1.1,
        participation: 1,
        stability: 1,
        stress: 1,
        synchronization: 1,
        uncertainty: 1,
        volatility: 1,
      },
      secondaryLimit: 2,
    },
  ).word;
}

function adaptMetrics(
  metrics: SignalSnapshot["metrics"],
): Record<string, MetricState> {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, metric]) => [
      key,
      {
        ...metric,
        layers: metric.layers.map((mapping) => ({
          ...mapping,
          layer: FRAMEWORK_TO_MARKET_LAYER[mapping.layer],
        })),
      },
    ]),
  ) as Record<string, MetricState>;
}

function pct(value: number) {
  return clamp01(Number.isFinite(value) ? value / 100 : 0);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function clampPct(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function compactTransition(
  snapshot: MarketStateSnapshot,
): MarketStateTransition {
  return {
    timestamp: snapshot.timestamp,
    regime: snapshot.regime,
    compositeScore: snapshot.compositeScore,
    red: snapshot.layers.red.score,
    orange: snapshot.layers.orange.score,
    yellow: snapshot.layers.yellow.score,
    green: snapshot.layers.green.score,
    blue: snapshot.layers.blue.score,
    indigo: snapshot.layers.indigo.score,
    violet: snapshot.layers.violet.score,
    white: snapshot.layers.white.score,
  };
}

void LAYER_ORDER;
