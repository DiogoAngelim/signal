import type {
  AgencyInput,
  AgencyResult,
  DecisionResult,
} from "../agency/engine";
import type { CalibrationInput, CalibrationResult } from "../calibration/engine";
import type {
  DiscoveryIntelligenceInput,
  DiscoveryIntelligenceResult,
} from "../discovery-intelligence/engine";
import type { DiscoveryInput, DiscoveryResult } from "../discovery/engine";
import type { JudgementInput, JudgementResult } from "../judgement";
import type { LegacyInput, LegacyOutput } from "../legacy/engine";
import type { PruningInput, PruningResult } from "../pruning/engine";
import type { PurposeInput, PurposeResult } from "../purpose/engine";
import type { RecognitionInput, RecognitionResult } from "../recognition/engine";
import type { ReflectionInput, ReflectionResult } from "../reflection/engine";
import type { ViabilityInput, ViabilityResult } from "../viability/engine";

export type FrameworkDomain = string;

export type Score = number;

export type TimestampMs = number;

export type ConfidenceInterval = {
  lower: number;
  upper: number;
};

export type ObservationPoint = {
  id: string;
  timestamp: TimestampMs;
  value: number;
  dimensions?: Record<string, number | string | boolean | null>;
};

export type MetricPolarity = "direct" | "inverse";

export type MetricInput = {
  key: string;
  value: number;
  raw?: number | string | null;
  unit?: string;
  confidence?: number;
  detail?: string;
  timestamp?: TimestampMs;
};

export type MetricLayerMapping = {
  layer: PerceptionLayerKey;
  weight: number;
  polarity?: MetricPolarity;
};

export type MetricDescriptor = {
  key: string;
  label: string;
  description: string;
  unit?: string;
  layerMappings: MetricLayerMapping[];
};

export type NormalizationState = {
  zScore: number;
  zScoreNormalized: number;
  percentileScore: number;
  volatilityAdjustedScore: number;
  boundedScore: number;
};

export type MetricState = {
  key: string;
  label: string;
  description: string;
  raw: number | string | null;
  unit?: string;
  score: Score;
  confidence: Score;
  detail?: string;
  normalization: NormalizationState;
  layers: MetricLayerMapping[];
};

export type PerceptionLayerKey =
  | "survival"
  | "emotion"
  | "conviction"
  | "harmony"
  | "information"
  | "intuition"
  | "macroContext"
  | "selfAwareness";

export type PerceptionLayerDefinition = {
  key: PerceptionLayerKey;
  label: string;
  meaning: string;
};

export type MetricContribution = {
  metricKey: string;
  label: string;
  value: number;
  contribution: number;
  weight: number;
  raw: number | string | null;
  unit?: string;
  detail?: string;
  polarity: MetricPolarity;
};

export type PerceptionLayerState = PerceptionLayerDefinition & {
  score: Score;
  confidence: Score;
  uncertainty: Score;
  momentum: number;
  classification: string;
  contributors: MetricContribution[];
};

export type TimeframeKey = "intraday" | "swing" | "macro";

export type TimeframeState = {
  key: TimeframeKey;
  label: string;
  score: Score;
  agreement: Score;
};

export type VenueState =
  | "PREMARKET"
  | "OPEN"
  | "LIVE_SYNCED"
  | "DEGRADED"
  | "CLOSED"
  | "STALE";

export type SynchronizationInput = {
  venueState?: VenueState;
  quoteAgeMs?: number;
  websocketLatencyMs?: number;
  candleIntegrity?: number;
  missingIntervals?: number;
  staleTimestamps?: number;
  spreadBps?: number;
  liquidityScore?: number;
};

export type SynchronizationState = {
  venueState: VenueState;
  score: Score;
  dataFreshness: Score;
  reliabilityPenalty: Score;
  quoteAgeMs: number;
  websocketLatencyMs: number;
  candleIntegrity: Score;
  missingIntervals: number;
  staleTimestamps: number;
  spreadIrregularity: Score;
  liquidityDegradation: Score;
};

export type RegimeName =
  | "Risk-On Expansion"
  | "Defensive Compression"
  | "Panic Cascade"
  | "Rotational Recovery"
  | "Low-Vol Grind"
  | "Trend Expansion"
  | "Distribution Phase"
  | "Mean-Reversion Chaos";

export type RegimeState = {
  name: RegimeName;
  probabilities: Record<RegimeName, number>;
  confidence: Score;
  transitionDetected: boolean;
  previous?: RegimeName;
  thresholds: Record<string, number>;
  modifiers: {
    signalWeightScale: number;
    confidenceScale: number;
    exposureCap: number;
    trendInterpretation: number;
    volatilityNormalization: number;
  };
};

export type Contradiction = {
  key: string;
  severity: Score;
  confidenceImpact: Score;
  readinessImpact: Score;
  description: string;
  evidence: Record<string, number | string | boolean>;
};

export type DiagnosticsState = {
  modelConfidence: Score;
  predictionCalibration: Score;
  overfitProbability: Score;
  contradictionDensity: Score;
  uncertainty: Score;
  confidenceDecay: Score;
  historicalReliability: Score;
  trust: Score;
  contradictions: Contradiction[];
};

export type ReadinessStateName =
  | "Dormant"
  | "Emerging"
  | "Constructive"
  | "Expanding"
  | "Extended"
  | "Fragile"
  | "Breaking";

export type ExecutionReadinessState = {
  state: ReadinessStateName;
  readinessScore: Score;
  executionSuitability: Score;
  riskAdjustedExposureSuggestion: Score;
  confidenceAdjustedSizing: Score;
  rationale: string[];
};

export type NeedCategory =
  | "discover-opportunities"
  | "gather-evidence"
  | "reduce-exposure"
  | "increase-participation"
  | "wait"
  | "maintain";

export type DetectedNeed = {
  needId: string;
  category: NeedCategory;
  severity: Score;
  confidence: Score;
  explanation: string;
  recommendations: string[];
};

export type NeedDetectionOptions = {
  minSeverity?: Score;
  targetOpportunityDensity?: Score;
  targetParticipation?: Score;
};

export type NeedDetectionInput = {
  perception?: {
    compositeScore?: Score;
    confidence?: Score;
    agreement?: Score;
    layers?: Record<
      string,
      { score?: number; confidence?: number; momentum?: number }
    >;
  };
  diagnostics?: Partial<DiagnosticsState>;
  synchronization?: Partial<SynchronizationState>;
  executionReadiness?: Partial<ExecutionReadinessState>;
  rankings?: LeadershipRank[];
  opportunities?: OpportunityCandidate[];
  opportunityDensity?: Score;
};

export type OpportunityType =
  | "emergence"
  | "acceleration"
  | "compression"
  | "expansion"
  | "alignment"
  | "divergence"
  | "persistence"
  | "transition";

export type OpportunityCandidate = {
  opportunityId: string;
  type: OpportunityType;
  strength: Score;
  confidence: Score;
  evidence: string[];
  emerging: boolean;
  persistent: boolean;
};

export type OpportunitySeed = OpportunityCandidate;

export type DiscoveryFinding = {
  findingId: string;
  pattern: string;
  support: Score;
  confidence: Score;
  explanation: string;
  recommendations: string[];
  feedsOpportunityTypes: OpportunityType[];
};

export type OpportunityDiscoveryInput = {
  perception?: {
    compositeScore?: Score;
    confidence?: Score;
    agreement?: Score;
    layers?: Record<
      string,
      { score?: number; confidence?: number; momentum?: number }
    >;
  };
  intelligence?: {
    readinessScore?: Score;
    trust?: Score;
    contradictions?: number;
    transitionDetected?: boolean;
  };
  needs?: DetectedNeed[];
  observationSeries?: Array<{ id: string; values: number[] }>;
  seeds?: OpportunitySeed[];
  explorerFindings?: DiscoveryFinding[];
};

export type OpportunityDensityTrend = "improving" | "weakening" | "flat";

export type OpportunityDensityInput = {
  candidates: OpportunityCandidate[];
  previousDensity?: Score;
};

export type OpportunityDensityState = {
  density: Score;
  quality: Score;
  confidence: Score;
  trend: OpportunityDensityTrend;
  explanation: string;
};

export type OpportunityOutcome =
  | "winning"
  | "losing"
  | "blocked"
  | "almost-qualified";

export type OpportunityOutcomeRecord = {
  opportunityId: string;
  outcome: OpportunityOutcome;
  candidate: OpportunityCandidate;
  features?: Record<string, boolean | number | string | null | undefined>;
  evidence?: string[];
};

export type LeadershipRank = {
  id: string;
  score: Score;
  relativeStrength: Score;
  momentumPersistence: Score;
  volatilityAdjustedPerformance: Score;
  volumeExpansion: Score;
  liquidityQuality: Score;
  breadthParticipation: Score;
  sectorSynchronization: Score;
  emerging: boolean;
  acceleration: Score;
  compressionStructure: Score;
  anomalousAccumulation: Score;
};

export type SignalDirection = "up" | "down" | "flat" | "unknown";

export type SignalRecord = {
  id: string;
  timestamp: TimestampMs;
  regime: RegimeName;
  environment: {
    marketState?: string;
    volatilityState?: string;
    breadthState?: string;
  };
  confidence: Score;
  composition: Record<string, number>;
  expectedDirection: SignalDirection;
  expectedMagnitude: number;
  executionAssumptions: Record<string, number | string | boolean>;
};

export type SignalOutcome = {
  signalId: string;
  window: string;
  evaluatedAt: TimestampMs;
  realizedDirection: SignalDirection;
  realizedMagnitude: number;
};

export type ValidationState = {
  expectancy: number;
  sharpe: number;
  drawdown: number;
  regimeAccuracy: Partial<Record<RegimeName, number>>;
  calibrationAccuracy: Score;
  confidenceRealism: Score;
  evaluatedSignals: number;
};

export type SignalSnapshot = {
  id: string;
  cycle: number;
  timestamp: TimestampMs;
  domain: FrameworkDomain;
  context: Record<string, unknown>;
  perception: {
    layers: Record<PerceptionLayerKey, PerceptionLayerState>;
    timeframes: Record<TimeframeKey, TimeframeState>;
    compositeScore: Score;
    confidence: Score;
    agreement: Score;
    dominantLayer: PerceptionLayerKey;
  };
  reflection?: ReflectionResult;
  calibration?: CalibrationResult;
  judgement?: JudgementResult;
  discovery?: DiscoveryResult;
  discoveryIntelligence?: DiscoveryIntelligenceResult;
  recognition?: RecognitionResult;
  decision?: DecisionResult | null;
  agency?: AgencyResult;
  viability?: ViabilityResult;
  legacy?: LegacyOutput;
  pruning?: PruningResult;
  purpose?: PurposeResult;
  regime: RegimeState;
  synchronization: SynchronizationState;
  diagnostics: DiagnosticsState;
  needs: DetectedNeed[];
  opportunities: OpportunityCandidate[];
  opportunityDensity: OpportunityDensityState;
  confidence: Score;
  rankings: LeadershipRank[];
  validation: ValidationState;
  executionReadiness: ExecutionReadinessState;
  metrics: Record<string, MetricState>;
  events: FrameworkEvent[];
};

export type FrameworkEvent = {
  type: string;
  timestamp: TimestampMs;
  payload: Record<string, unknown>;
};

export type SignalContext = {
  timestamp?: TimestampMs;
  domain?: FrameworkDomain;
  id?: string;
  metrics: MetricInput[];
  synchronization?: SynchronizationInput;
  reflection?: Partial<ReflectionInput>;
  calibration?: Partial<CalibrationInput> & {
    history?: CalibrationInput[];
  };
  judgement?: Partial<JudgementInput>;
  discovery?: Partial<DiscoveryInput>;
  discoveryIntelligence?: Partial<DiscoveryIntelligenceInput>;
  recognition?: Partial<RecognitionInput>;
  pruning?: Partial<PruningInput>;
  purpose?: Partial<Omit<PurposeInput, "ambition">> & Pick<PurposeInput, "ambition">;
  decision?: DecisionResult | null;
  agency?: AgencyInput;
  viability?: Partial<ViabilityInput>;
  legacy?: Partial<LegacyInput>;
  observations?: ObservationPoint[];
  signals?: SignalRecord[];
  outcomes?: SignalOutcome[];
  metadata?: Record<string, unknown>;
};
