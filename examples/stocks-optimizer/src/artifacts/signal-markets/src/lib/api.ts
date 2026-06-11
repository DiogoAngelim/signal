const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "")
  .replace(/\/$/, "")
  .replace(/\/api\/stocks\/markets$/i, "")
  .replace(/\/api$/i, "");

function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  return `${API_BASE_URL}${normalizedPath}`;
}

import {
  type DashboardQuoteBatchResponse,
  type DashboardStockListResponse,
  parseDashboardMarketOptions,
  parseDashboardQuoteBatchResponse,
  parseDashboardStockListResponse,
} from "./dashboard-data-adapter";
import {
  backtestCacheKey,
  recoverBacktestPayload,
  rememberBacktestPayload,
  shouldProtectBacktestUrl,
} from "./persistent-backtest-cache";
import { sanitizePromotionState } from "./promotion-sanity";
export type StockStatus = "Stable" | "Rising" | "Watch" | "Dip";
export type TradeSignal = "Hold" | "Buy" | "Sell";
export type AllocationAction = TradeSignal | "Watch" | "Blocked";
export type SizingMode =
  | "none"
  | "micro"
  | "small"
  | "normal"
  | "large"
  | "maxSafe";
export type AdaptiveRegime =
  | "TRENDING"
  | "MEAN_REVERTING"
  | "HIGH_VOL"
  | "LOW_VOL"
  | "BREAKOUT"
  | "PANIC"
  | "COMPRESSION";
export type SignalLifecycle =
  | "EMITTED"
  | "ACTIVE"
  | "DECAYING"
  | "INVALIDATED"
  | "COMPLETED";
export type ModelLifecycleState =
  | "RESEARCH"
  | "CANDIDATE"
  | "SHADOW"
  | "SMALL_LIVE"
  | "PRODUCTION"
  | "WATCHLIST"
  | "REDUCED"
  | "RETIRED";
export type ModelLifecycleAction =
  | "Awaiting Decision"
  | "Careful"
  | "Trusted"
  | "Disregard";

export type BeliefVerdict = "justified" | "weak" | "contradicted" | "uncertain";

export interface BeliefEvidenceSummary {
  name: string;
  direction: "support" | "contradict" | "neutral";
  strength: number;
  confidence: number;
  weightedStrength: number;
  source?: string;
  reason: string;
}

export interface BeliefDiagnostic {
  verdict: BeliefVerdict;
  confidence: number;
  trustworthiness: number;
  evidenceStrength: number;
  evidenceAgreement: number;
  fragility: number;
  blockers: string[];
  warnings: string[];
  reason: string;
  supportingEvidence?: BeliefEvidenceSummary[];
  contradictoryEvidence?: BeliefEvidenceSummary[];
}

export type JudgementStatus =
  | "trusted"
  | "cautious"
  | "review_required"
  | "blocked";
export type RecognitionVerdict =
  | "recognized"
  | "partially_recognized"
  | "novel"
  | "conflicted"
  | "insufficient_evidence";

export interface RecognitionDiagnostic {
  recognitionScore: number;
  recurrenceConfidence: number;
  historicalSimilarityConfidence?: number;
  noveltyScore: number;
  archetype: string;
  archetypeConfidence: number;
  stateFingerprint: string;
  matchedSamples: number;
  matchedPositiveOutcomes: number;
  matchedNegativeOutcomes: number;
  outcomeStability: number;
  discoveryNoveltyJustified: boolean;
  judgementSimilarityJustified: boolean;
  verdict: RecognitionVerdict;
  reason: string;
  missingEvidence: string[];
  invalidationConditions: string[];
  metadata?: {
    module: "recognition";
    version: string;
    createdAt: string;
  };
}

export type SurvivalOutcomeClass =
  | "comfortable_survival"
  | "stressed_survival"
  | "barely_survived"
  | "failed_survival";

export type SurvivalMemoryStatus =
  | "empty"
  | "clear"
  | "watch"
  | "scarred"
  | "near_ruin";
export type SurvivalMemoryRecommendation =
  | "act"
  | "act_with_reduced_size"
  | "wait";

export interface SurvivalMemoryRecord {
  id: string;
  timestamp: string;
  asset?: string;
  venue?: string;
  regime?: string;
  stateFingerprint: string;
  action: "buy" | "sell" | "hold" | "watch" | "reduce" | "exit";
  maxExposure: number;
  realizedReturn: number;
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
  notes?: string[];
}

export interface SurvivalMemoryDiagnostic {
  module: "stocks.survival-memory";
  name: "Survival Memory";
  status: SurvivalMemoryStatus;
  recommendation: SurvivalMemoryRecommendation;
  recordCount: number;
  matchedCount: number;
  scarCount: number;
  nearRuinCount: number;
  averageSurvivalCost: number;
  recoveryBurden: number;
  survivalConfidence: number;
  currentStateSimilarity: number;
  exposureMultiplier: number;
  confidencePenalty: number;
  maxExposurePct: number;
  stateFingerprint: string;
  mainWarnings: string[];
  reasons: string[];
  missingEvidence: string[];
  unlockConditions: string[];
  invalidationConditions: string[];
  fragileMatches: Array<{
    id: string;
    similarity: number;
    outcomeClass: SurvivalOutcomeClass;
    survivalCost: number;
    realizedReturn: number;
  }>;
  records: SurvivalMemoryRecord[];
}

export interface JudgementDiagnostic {
  status: JudgementStatus;
  rawConfidence: number;
  adjustedConfidence: number;
  trust: number;
  calibration: number;
  reliability: number;
  overfitRisk: number;
  outcomeStability: number;
  similarSampleSize: number;
  expectedOutcome?: number;
  confidenceDelta: number;
  reasons: string[];
  warnings: string[];
  survivalMemory?: SurvivalMemoryDiagnostic;
  evidence: {
    similarStates: number;
    positiveOutcomes: number;
    negativeOutcomes: number;
    neutralOutcomes: number;
    averageOutcome?: number;
    winRate?: number;
    consistency?: number;
  };
}

export interface TrustGovernorDiagnostic {
  module: "signal.trust-governor";
  name: "Signal Trust Governor";
  trustScore: number;
  confidenceCap: number;
  participationMode:
    | "blocked"
    | "exits_only"
    | "paper"
    | "micro"
    | "limited"
    | "normal";
  maxExposure: number;
  allowsNewExposure: boolean;
  requiresReview: boolean;
  allowedActions: string[];
  blockedActions: string[];
  primaryBlocker?: string;
  blockers?: Array<{
    id: string;
    label: string;
    severity: string;
    reason: string;
    unlockCriteria?: string[];
  }>;
  unlockCriteria?: string[];
  contradictions?: string[];
  reasons?: string[];
}

export interface TrustStateDiagnostic {
  score: number;
  status: "untrusted" | "provisional" | "trusted" | "highly_trusted";
  reasons: string[];
}

export interface PermissionStateDiagnostic {
  allowed: boolean;
  level: "blocked" | "review_required" | "limited" | "approved";
  reasons: string[];
}

export interface CapacityStateDiagnostic {
  maxExposure: number;
  mode: "none" | "micro" | "reduced" | "normal" | "expanded";
  reasons: string[];
}

export interface UrgencyStateDiagnostic {
  score: number;
  mode: "none" | "wait" | "monitor" | "act_soon" | "act_now";
  reasons: string[];
}

export interface DecisionStatesDiagnostic {
  trust: TrustStateDiagnostic;
  permission: PermissionStateDiagnostic;
  capacity: CapacityStateDiagnostic;
  urgency: UrgencyStateDiagnostic;
}

export interface ExecutionQualityDiagnostic {
  score: number;
  status: "blocked" | "poor" | "acceptable" | "good" | "excellent";
  entryQuality: number;
  exitQuality: number;
  liquidityQuality: number;
  slippageRisk: number;
  volatilityRisk: number;
  timingUrgency: number;
  scalingQuality: number;
  invalidationClarity: number;
  blockers: string[];
  warnings: string[];
  recommendedExecutionMode:
    | "do_not_execute"
    | "wait"
    | "limit_only"
    | "small_probe"
    | "scale_in"
    | "normal";
  explanation: string;
  audit?: Record<string, any>;
}

export interface CounterfactualDiagnostic {
  scenarios: Array<{
    id: string;
    kind: string;
    label: string;
    decision: string;
    expectedOutcomeScore: number;
    expectedReturn: number;
    riskScore: number;
    regretScore: number;
    restrictionImpactScore: number;
    confidence: number;
    summary: string;
    assumptions: string[];
  }>;
  avoidedLossScore: number;
  missedUpsideScore: number;
  restrictionValueScore: number;
  cautionCostScore: number;
  recommendedLearning: string[];
  shouldAdjustRestrictionPolicy: boolean;
  shouldAdjustDiscoveryPolicy: boolean;
  shouldAdjustSizingPolicy: boolean;
  explanation: string;
}

export interface DiscoveryAccountabilityDiagnostic {
  accountabilityScore: number;
  maturity: number;
  earlyDetectionAccuracy: number;
  falseDiscoveryRate: number;
  missedOpportunityRate: number;
  noveltyToProfitConversion: number;
  discoveryDecay: number;
  confirmationLatency: number;
  status: "immature" | "developing" | "reliable" | "trusted";
  blockers: string[];
  unlockConditions: string[];
  explanation: string;
}

export interface DiscoveryIntelligenceDiagnostic {
  score: number;
  regimeCoverageScore?: number;
  maturity: {
    emerging: number;
    detected: number;
    observed: number;
    confirmed: number;
    repeatable: number;
    trusted: number;
    institutional: number;
    discoveryCount: number;
    promotionRate: number;
    abandonmentRate: number;
    falseDiscoveryRate: number;
    noveltyConversionRate: number;
    trustedConversionRate: number;
    institutionalConversionRate: number;
    maturityScore: number;
  };
  economics: {
    actValue: number;
    waitValue: number;
    rejectValue: number;
    restrictValue: number;
    avoidedLoss: number;
    missedUpside: number;
    opportunityCost: number;
    economicsScore: number;
  };
  governance: {
    score: number;
    restrictions: Array<{
      id: string;
      type: string;
      label: string;
      avoidedLoss: number;
      missedUpside: number;
      effectiveness: number;
      helpful: boolean;
      recommendation: string;
    }>;
    helpfulRestrictions: number;
    harmfulRestrictions: number;
  };
  institutionalization: {
    knowledgeCount: number;
    policyCount: number;
    standardCount: number;
    institutionalCount: number;
    institutionalizationScore: number;
  };
  metaLearning: {
    score: number;
    calibrationTrend: number;
    trustTrend: number;
    survivalTrend: number;
    decisionQualityTrend: number;
    governanceTrend: number;
  };
  recommendations: Array<{
    id: string;
    category: string;
    priority: string;
    message: string;
  }>;
}

export interface HistoryDiagnostics {
  historyCoverageYears?: number;
  requestedYears?: number;
  availableYears?: number;
  coveragePct?: number;
  coverageStatus?: "full" | "partial" | "thin" | "unavailable" | string;
  historyDepthScore?: number;
  regimeCoverageScore?: number;
  sampleDiversityScore?: number;
  regimeDiversityScore?: number;
  temporalConcentrationScore?: number;
  currentRegime?: string;
  keyRegimesCovered?: string[];
  regimeCounts?: Record<string, number>;
  explanation?: string;
}

export interface WisdomDiagnostic {
  decisionQuality: number;
  wisdomScore: number;
  learningConfidence: number;
  counterfactuals: {
    decisionQuality: number;
    avoidedLoss: number;
    missedUpside: number;
    restrictionValue: number;
    counterfactualConfidence: number;
    actualOutcome?: {
      id: string;
      label: string;
      action: string;
      kind: string;
      utility: number;
      reward: number;
      cost: number;
      adverseImpact: number;
      confidence: number;
    };
    bestAlternative?: {
      id: string;
      label: string;
      action: string;
      kind: string;
      utility: number;
      reward: number;
      cost: number;
      adverseImpact: number;
      confidence: number;
    } | null;
    worstAlternative?: {
      id: string;
      label: string;
      action: string;
      kind: string;
      utility: number;
      reward: number;
      cost: number;
      adverseImpact: number;
      confidence: number;
    } | null;
    explanation: string;
  };
  opportunityEconomics: {
    actionValue: number;
    waitValue: number;
    rejectValue: number;
    scaleValue?: number;
    urgencyCost: number;
    opportunityCost: number;
    bestOption: string;
  };
  discoveryMaturity: {
    maturityScore: number;
    recurrenceRate: number;
    noveltyPersistence: number;
    conversionRate: number;
    trustedDiscoveries: Array<{
      id: string;
      stage: string;
      maturityScore: number;
    }>;
    lifecycle: Array<{ stage: string; count: number }>;
  };
  agencyEffectiveness: {
    agencyAccuracy: number;
    interventionValue: number;
    approvalQuality: number;
    rejectionQuality: number;
    governanceEffectiveness: number;
  };
  portfolioIntelligence: {
    concentrationRisk: number;
    diversificationQuality: number;
    capitalEfficiency: number;
    opportunityCoverage: number;
    portfolioConvexity: number;
    allocationQuality: number;
  };
  contributors?: Record<
    string,
    Array<{
      id: string;
      label: string;
      value: number;
      weight: number;
      contribution: number;
      reason: string;
    }>
  >;
  explanation: string;
}

export interface ExecutiveDecisionDiagnostic {
  decision:
    | "buy"
    | "sell"
    | "hold"
    | "watch"
    | "avoid"
    | "escalate"
    | "deescalate"
    | "review";
  participationMode: "none" | "watch" | "limited" | "normal" | "aggressive";
  confidence: number;
  trust: number;
  permission: PermissionStateDiagnostic;
  capacity: CapacityStateDiagnostic;
  urgency: UrgencyStateDiagnostic;
  maxExposure: number;
  primaryReason: string;
  primaryLimiter?: string;
  strongestEvidence: string[];
  restrictions: Array<{
    id: string;
    label: string;
    reason: string;
    severity?: string;
  }>;
  unlockConditions: Array<{ id: string; description: string; source?: string }>;
  invalidationConditions: Array<{
    id: string;
    description: string;
    source?: string;
  }>;
  nextReviewCondition?: string;
  explanation: string;
  audit?: Record<string, any>;
}

export type RecoveryStatus = "locked" | "recovering" | "restored" | "regressed";
export type RecoveryMode = "observe" | "reduced-size" | "graduated" | "normal";

export interface RecoveryDiagnostic {
  module: "signal.recovery";
  name: "Signal Recovery";
  status: RecoveryStatus;
  mode: RecoveryMode;
  recoveryScore: number;
  trustedCapacity: number;
  confidenceCapLift: number;
  recommendedExposureCap: number;
  canRestoreSizing: boolean;
  shouldEscalateHumanReview: boolean;
  reasons: string[];
  blockers: string[];
  unlockConditions: string[];
  invalidationConditions: string[];
  audit?: Record<string, any>;
}

export type RestorationProgressStatus =
  | "blocked"
  | "collecting_evidence"
  | "ready_for_restoration"
  | "restored";

export type SurvivalMemoryRestorationState =
  | "scarred"
  | "watch"
  | "limited"
  | "clear";

export interface RestorationLedgerEntry {
  id: string;
  timestamp?: string;
  asset?: string;
  maxExposure: number;
  realizedReturn: number;
  maxDrawdown: number;
  maxAdverseExcursion: number;
  survivalCost: number;
  outcomeClass: SurvivalOutcomeClass;
  clean: boolean;
  boundaryBreaches: string[];
  maxAdverseExcursionBoundary: number;
  maxAdverseExcursionRemaining: number;
  survivalCostBoundary: number;
  survivalCostRemaining: number;
}

export interface RestorationProgressDiagnostic {
  module: "stocks.restoration-progress";
  name: "Restoration Progress";
  status: RestorationProgressStatus;
  restorationState: SurvivalMemoryRestorationState;
  progressPct: number;
  summary: string;
  primaryBlocker: string | null;
  currentExposureCapPct: number;
  targetNormalExposurePct: number;
  canRestoreSizing: boolean;
  gates: Array<{
    id: string;
    label: string;
    passed: boolean;
    current: string;
    target: string;
    progressPct: number;
    detail: string;
    unlockCondition?: string;
  }>;
  outcomeProof: {
    requiredCleanOutcomes: number;
    reducedSizeOutcomeCount: number;
    totalCleanReducedSizeOutcomeCount: number;
    cleanReducedSizeOutcomeCount: number;
    failedReducedSizeOutcomeCount: number;
    remainingCleanReducedSizeOutcomes: number;
    activeProofBoundaryBreakCount: number;
    lastBoundaryBreakId?: string;
    cleanOutcomeRatio: number;
    survivalCostBoundary: number;
    maxDrawdownBoundary: number;
    maxAdverseExcursionBoundary: number;
    ledgerEntries: RestorationLedgerEntry[];
    recentOutcomes: RestorationLedgerEntry[];
  };
  ledger: {
    title: "Survival Memory Restoration Ledger";
    state: SurvivalMemoryRestorationState;
    statePath: Array<{
      state: SurvivalMemoryRestorationState;
      label: string;
      passed: boolean;
      detail: string;
    }>;
    entries: RestorationLedgerEntry[];
    exactUnlockCondition: string;
    boundarySummary: string;
    requiredCleanOutcomes: number;
    cleanReducedSizeOutcomeCount: number;
    failedReducedSizeOutcomeCount: number;
  };
  actionPlan?: {
    title: "Survival Memory Restoration Plan";
    status:
      | "collecting_evidence"
      | "reset_required"
      | "ready_for_review"
      | "restored";
    activeInstruction: string;
    exposureInstruction: string;
    remainingCleanOutcomes: number;
    activeBoundaryBreaks: number;
    steps: Array<{
      id: string;
      label: string;
      status: "done" | "active" | "blocked";
      detail: string;
    }>;
  };
  nextActions: string[];
  invalidationConditions: string[];
}

export interface ReadinessRemediationDiagnostic {
  module: "signal.readiness-remediation-planner";
  name: "Readiness Remediation Planner";
  status: "ready" | "watch" | "review" | "blocked";
  summary: string;
  topAction: string;
  totalExpectedTrustLift: number;
  executionGate: "open" | "review" | "blocked";
  targetStage?: string;
  steps: Array<{
    id: string;
    category: string;
    title: string;
    priority: number;
    severity: string;
    status: string;
    expectedTrustLift: number;
    effort: string;
    reason: string;
    evidenceRequired: string[];
    unlocks: string[];
    sourceIds: string[];
    metrics: {
      currentScore: number | null;
      targetScore: number;
      deficit: number;
    };
  }>;
  blockers: string[];
  audit?: {
    inputGateCount: number;
    failedGateCount: number;
    failureFlagCount: number;
    formulas?: string[];
  };
}

export type ResolveDecision =
  | "commit"
  | "wait"
  | "escalate"
  | "reject"
  | "invalidate";

export type CommitmentLevel =
  | "none"
  | "watch"
  | "limited"
  | "graduated"
  | "full";

export interface ResolveTrace {
  id: string;
  label: string;
  value: number | string | null;
  score: number;
  weight: number;
  passed: boolean;
  threshold?: number;
  reason: string;
}

export interface ResolveDiagnostic {
  decision: ResolveDecision;
  commitmentLevel: CommitmentLevel;
  resolveScore: number;
  requiredScore: number;
  humanReviewRequired: boolean;
  missingEvidence: string[];
  unlockConditions: string[];
  invalidationConditions: string[];
  explanation: string;
  traces: ResolveTrace[];
  metadata: {
    module: "resolve";
    version: "v1";
    createdAt: string;
  };
}

export interface MarketOption {
  code: string;
  label: string;
  count: number;
}

export interface StockListItem {
  symbol: string;
  name: string;
  market?: string;
  sector?: string;
  image?: string;
  exchange: string;
  country: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  changePercent: number;
  status: StockStatus;
  high52: number;
  low52: number;
  history: number[];
  summary: string;
  impact: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
  sizingMode?: SizingMode;
  sizingReasons?: string[];
  sizingConstraints?: Array<{
    id: string;
    label?: string;
    passed: boolean;
    reason?: string;
  }>;
  viabilityVerdict?: "viable" | "marginal" | "not-viable" | "blocked";
  viabilityReason?: string;
  viabilityWarnings?: string[];
  viabilityBlockers?: string[];
  viabilityMarginOfSafety?: number;
  belief?: BeliefDiagnostic | null;
  recognition?: RecognitionDiagnostic;
  judgement?: JudgementDiagnostic;
  survivalMemory?: SurvivalMemoryDiagnostic;
  trustGovernor?: TrustGovernorDiagnostic;
  recovery?: RecoveryDiagnostic;
  restorationProgress?: RestorationProgressDiagnostic;
  resolve?: ResolveDiagnostic;
  executionQuality?: ExecutionQualityDiagnostic;
  counterfactual?: CounterfactualDiagnostic;
  discoveryAccountability?: DiscoveryAccountabilityDiagnostic;
  discoveryIntelligence?: DiscoveryIntelligenceDiagnostic;
  wisdom?: WisdomDiagnostic;
  executiveDecision?: ExecutiveDecisionDiagnostic;
  decisionStates?: DecisionStatesDiagnostic;
  rejectionReason?: string | null;
  modelId?: string;
  modelLifecycleState?: ModelLifecycleState;
  modelLifecycleAction?: ModelLifecycleAction;
  modelLifecycleReason?: string;
  modelCanOpenNewTrades?: boolean;
  modelAllocationMultiplier?: number;
  quoteSource?: "binance-spot" | "binance-futures" | "tradingview";
  quoteStatus?: "available" | "pending" | "unavailable";
  quoteStatusReason?: string;
  quoteLastAttemptedAt?: number;
  regime?: AdaptiveRegime;
  confidence?: number;
  uncertainty?: number;
  driftScore?: number;
  stabilityScore?: number;
  expectedMovePct?: number;
  featureConsensus?: number;
  ensembleAgreement?: number;
  lifecycleState?: SignalLifecycle;
  liveMetrics?: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  diagnostics?: {
    entropy: number;
    featureDrift: number;
    predictionResidual: number;
    volatilityShift: number;
  };
}

export type StockData = StockListItem & {
  ticker: string;
  price?: number;
  bid?: number;
  ask?: number;
  changePercent?: number;
  status?: StockStatus;
  high52?: number;
  low52?: number;
  history?: number[];
  summary?: string;
  impact?: string;
  cap?: string;
  peRatio?: number;
  signalAction?: TradeSignal;
  signalConfidence?: number;
  signalSource?: "node-ecu" | "heuristic";
  signalEmittedAt?: string;
  signalEntryPrice?: number;
  signalReturnPercent?: number;
  sizingMode?: SizingMode;
  sizingReasons?: string[];
  sizingConstraints?: Array<{
    id: string;
    label?: string;
    passed: boolean;
    reason?: string;
  }>;
  viabilityVerdict?: "viable" | "marginal" | "not-viable" | "blocked";
  viabilityReason?: string;
  viabilityWarnings?: string[];
  viabilityBlockers?: string[];
  viabilityMarginOfSafety?: number;
  belief?: BeliefDiagnostic | null;
  recognition?: RecognitionDiagnostic;
  judgement?: JudgementDiagnostic;
  survivalMemory?: SurvivalMemoryDiagnostic;
  trustGovernor?: TrustGovernorDiagnostic;
  recovery?: RecoveryDiagnostic;
  restorationProgress?: RestorationProgressDiagnostic;
  resolve?: ResolveDiagnostic;
  executionQuality?: ExecutionQualityDiagnostic;
  counterfactual?: CounterfactualDiagnostic;
  discoveryAccountability?: DiscoveryAccountabilityDiagnostic;
  discoveryIntelligence?: DiscoveryIntelligenceDiagnostic;
  wisdom?: WisdomDiagnostic;
  executiveDecision?: ExecutiveDecisionDiagnostic;
  decisionStates?: DecisionStatesDiagnostic;
  rejectionReason?: string | null;
  modelId?: string;
  modelLifecycleState?: ModelLifecycleState;
  modelLifecycleAction?: ModelLifecycleAction;
  modelLifecycleReason?: string;
  modelCanOpenNewTrades?: boolean;
  modelAllocationMultiplier?: number;
  quoteSource?: "binance-spot" | "binance-futures" | "tradingview";
  quoteStatus?: "available" | "pending" | "unavailable";
  quoteStatusReason?: string;
  quoteLastAttemptedAt?: number;
  regime?: AdaptiveRegime;
  confidence?: number;
  uncertainty?: number;
  driftScore?: number;
  stabilityScore?: number;
  expectedMovePct?: number;
  featureConsensus?: number;
  ensembleAgreement?: number;
  lifecycleState?: SignalLifecycle;
  liveMetrics?: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
  diagnostics?: {
    entropy: number;
    featureDrift: number;
    predictionResidual: number;
    volatilityShift: number;
  };
};

export interface SignalEvent {
  id: string;
  scopeType: "market" | "exchange";
  scopeCode: string;
  symbol: string;
  token?: string;
  emittedAt: string;
  signal: StockQuote & Partial<StockData>;
}

export interface EvaluationMetrics {
  expectancy_r: number;
  rolling_expectancy_r: number;
  profit_factor_after_costs: number;
  max_drawdown: number;
  average_winner_r: number;
  average_loser_r: number;
  top_1_profit_dependency: number;
  top_3_profit_dependency: number;
  result_without_top_1: number;
  result_without_top_3: number;
  slippage_sensitivity: number;
  live_vs_backtest_decay: number;
}

export interface ModelLifecycleRecord {
  model_id: string;
  parent_model_id: string | null;
  training_window_start: string;
  training_window_end: string;
  validation_window_start: string;
  validation_window_end: string;
  regime_scope: string;
  feature_hash: string;
  parameter_hash: string;
  objective_function: string;
  number_of_tested_variants: number;
  lifecycle_state: ModelLifecycleState;
  registered_at: string;
  updated_at: string;
}

export interface ModelLifecycleAuditEntry {
  audit_id: number;
  model_id: string;
  timestamp: string;
  old_state: ModelLifecycleState;
  new_state: ModelLifecycleState;
  metrics_snapshot: Partial<EvaluationMetrics>;
  reason: string;
}

export interface PortfolioDecisionTopTicker {
  ticker: string;
  action: string;
  allocationPct: number;
  targetCapital: number;
  quality: number;
  risk: number;
}

export interface PortfolioDecisionMemoryEntry {
  id: string;
  market: string;
  recordedAt: number;
  signature: string;
  recommendation: string;
  readiness: string;
  tone: "good" | "info" | "warn" | "bad";
  budget: number;
  targetAllocationPct: number;
  targetCapital: number;
  confidenceFilter: "small" | "balanced" | "normal";
  confidenceFilterLabel: string;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
  topTickers: PortfolioDecisionTopTicker[];
  startPortfolioValue: number;
  startTotalReturn: number;
  startSharpe: number | null;
  startProfitFactor: number | null;
  startClosedTrades: number;
  startDrawdown: number;
  dataQualityPct: number;
}

export interface PortfolioDecisionOutcome {
  id: number;
  decisionId: string;
  windowLabel: "1d" | "7d" | "30d";
  evaluatedAt: number;
  outcome: "Too early" | "Helped" | "Hurt" | "Mixed";
  tone: "good" | "info" | "warn" | "bad";
  returnChange: number;
  sharpeChange: number;
  closedTradeChange: number;
  drawdownChange: number;
  trustChange: string;
}

export interface PortfolioDecisionAuditEntry {
  id: number;
  decisionId: string | null;
  market: string;
  eventType: "recorded" | "outcome_checked";
  timestamp: number;
  snapshot: Record<string, unknown>;
}

export interface StockQuoteBatchResponse {
  market?: string;
  exchange?: string;
  requestedSymbols: string[];
  unavailableSymbols: string[];
  deferredSymbols?: string[];
  partial: boolean;
  quotes: StockQuote[];
}

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_RETRY_COUNT = 1;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const STATIC_CACHE_TTL_MS = 30 * 60_000;
const QUOTE_BATCH_CACHE_TTL_MS = 10 * 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function readCache<T>(key: string): T | null {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry && memoryEntry.expiresAt > now) return memoryEntry.value;
  if (memoryEntry) memoryCache.delete(key);

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (entry.expiresAt > now) {
      memoryCache.set(key, entry);
      return entry.value;
    }
    sessionStorage.removeItem(key);
  } catch {
    return null;
  }

  return null;
}

function writeCache<T>(key: string, value: T, ttlMs: number) {
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore storage pressure; the memory cache still covers this tab.
  }
}

export class ApiRequestError extends Error {
  status?: number;
  retryable: boolean;
  timedOut: boolean;

  constructor(
    message: string,
    options?: { status?: number; retryable?: boolean; timedOut?: boolean },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    this.timedOut = options?.timedOut ?? false;
  }
}

function sanitizeBacktestApiPayload<T>(url: string, payload: T): T {
  if (
    !url.includes("/api/portfolio") &&
    !url.includes("/portfolio") &&
    !url.includes("/api/strategy") &&
    !url.includes("/strategy")
  ) {
    return payload;
  }

  const anyPayload: any = payload;

  if (anyPayload?.summary) {
    return {
      ...anyPayload,
      summary: sanitizePromotionState(anyPayload.summary),
      snapshot: anyPayload.snapshot
        ? sanitizePromotionState(anyPayload.snapshot)
        : anyPayload.snapshot,
    };
  }

  if (
    anyPayload &&
    typeof anyPayload === "object" &&
    ("tradeCount" in anyPayload ||
      "survivalScore" in anyPayload ||
      "backtestStatus" in anyPayload)
  ) {
    return sanitizePromotionState(anyPayload) as T;
  }

  return payload;
}

function protectBacktestApiPayload<T>(
  url: string,
  method: string,
  payload: T,
): T {
  if (!shouldProtectBacktestUrl(url)) return payload;

  const key = backtestCacheKey(url, method);
  const recovered = recoverBacktestPayload(key, payload);

  if (recovered === payload) {
    rememberBacktestPayload(key, payload);
  }

  return sanitizeBacktestApiPayload(url, recovered);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalBrowserRuntime() {
  if (typeof window === "undefined") return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
}

function shouldSkipLocalPortfolioRoute(path: string) {
  return (
    path.includes("/api/stocks/watch-market") &&
    import.meta.env.VITE_ENABLE_PORTFOLIO_API !== "true" &&
    isLocalBrowserRuntime()
  );
}

async function request<T>(
  path: string,
  options?: RequestInit & {
    timeoutMs?: number;
    retryCount?: number;
  },
): Promise<T> {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retryCount = DEFAULT_RETRY_COUNT,
    ...fetchOptions
  } = options ?? {};

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = fetchOptions.signal;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortListener = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", abortListener, { once: true });
      }
    }

    try {
      const rawPath = typeof path === "string" ? path : String(path);

      if (shouldSkipLocalPortfolioRoute(rawPath)) {
        console.info("[api] Skipping /api/stocks/watch-market locally");
        return {
          ok: true,
          skipped: true,
          reason: "portfolio API disabled locally",
        } as any;
      }

      const response = await fetch(apiUrl(path), {
        headers: { "Content-Type": "application/json" },
        ...fetchOptions,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApiRequestError(`Request failed: ${response.status}`, {
          status: response.status,
          retryable: RETRYABLE_STATUSES.has(response.status),
        });
      }

      const body = (await response.json()) as { data?: T } | T;
      const data =
        body && typeof body === "object" && "data" in body
          ? (body as { data: T }).data
          : (body as T);
      const method = String(fetchOptions.method ?? "GET").toUpperCase();
      return protectBacktestApiPayload(rawPath, method, data);
    } catch (error) {
      const normalized =
        error instanceof ApiRequestError
          ? error
          : timedOut
            ? new ApiRequestError("Request timed out", {
                retryable: true,
                timedOut: true,
              })
            : new ApiRequestError(
                error instanceof Error ? error.message : "Request failed",
                { retryable: true },
              );

      if (attempt < retryCount && normalized.retryable) {
        await delay(500 * (attempt + 1));
        continue;
      }

      throw normalized;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", abortListener);
      }
    }
  }

  throw new ApiRequestError("Request failed", { retryable: false });
}

export async function fetchMarkets(): Promise<MarketOption[]> {
  const response = await request<any>("/api/stocks/markets");
  return parseDashboardMarketOptions(response);
}

export async function fetchStockList(
  market: string,
  offset = 0,
  limit = 50,
): Promise<DashboardStockListResponse> {
  const response = await request<unknown>(
    `/api/stocks/list?market=${encodeURIComponent(market)}&offset=${offset}&limit=${limit}`,
  );

  return parseDashboardStockListResponse(response, { market, offset, limit });
}

export async function fetchStockQuoteBatch(
  market: string,
  symbols: string[],
  options?: {
    withSignals?: boolean;
    timeoutMs?: number;
    retryCount?: number;
  },
): Promise<DashboardQuoteBatchResponse> {
  const response = await request<unknown>("/api/stocks/quotes", {
    method: "POST",
    body: JSON.stringify({
      market,
      symbols,
      withSignals: options?.withSignals ?? true,
      timeoutMs: options?.timeoutMs,
      retryCount: options?.retryCount,
    }),
  });

  return parseDashboardQuoteBatchResponse(response, {
    market,
    requestedSymbols: symbols,
  });
}

export async function fetchStockQuotes(
  market: string,
  symbols: string[],
  options?: { withSignals?: boolean; timeoutMs?: number; retryCount?: number },
): Promise<StockQuote[]> {
  const response = await fetchStockQuoteBatch(market, symbols, options);
  return response.quotes;
}

export async function registerSignalWatchlist(
  market: string,
  symbols: string[],
): Promise<void> {
  await request("/api/stocks/watch-market", {
    method: "POST",
    body: JSON.stringify({ market, symbols }),
  });
}

export async function fetchSignalHistory(
  market?: string,
  limit = 100,
): Promise<SignalEvent[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<SignalEvent[]>(`/stocks/signals/history?${params}`);
}

export async function fetchModelLifecycle(): Promise<ModelLifecycleRecord[]> {
  return request<ModelLifecycleRecord[]>("/stocks/model-lifecycle", {
    timeoutMs: 30_000,
    retryCount: 0,
  });
}

export async function fetchModelLifecycleAudit(
  modelId?: string,
): Promise<ModelLifecycleAuditEntry[]> {
  const params = new URLSearchParams();
  if (modelId) params.set("modelId", modelId);
  return request<ModelLifecycleAuditEntry[]>(
    `/stocks/model-lifecycle/audit${params.size ? `?${params}` : ""}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function createModelLifecycleCandidate(input: {
  market: string;
  parentModelId?: string;
  reason?: string;
}): Promise<{ created: number; models: ModelLifecycleRecord[] }> {
  return request<{ created: number; models: ModelLifecycleRecord[] }>(
    "/stocks/model-lifecycle/candidate",
    {
      method: "POST",
      body: JSON.stringify(input),
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function fetchPortfolioDecisionMemory(
  market?: string,
  limit = 50,
): Promise<PortfolioDecisionMemoryEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<PortfolioDecisionMemoryEntry[]>(
    `/stocks/portfolio-decisions?${params}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function fetchPortfolioDecisionAudit(
  market?: string,
  limit = 50,
): Promise<PortfolioDecisionAuditEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<PortfolioDecisionAuditEntry[]>(
    `/stocks/portfolio-decisions/audit?${params}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function fetchPortfolioDecisionOutcomes(
  market?: string,
  limit = 50,
): Promise<PortfolioDecisionOutcome[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (market) params.set("market", market);
  return request<PortfolioDecisionOutcome[]>(
    `/stocks/portfolio-decisions/outcomes?${params}`,
    {
      timeoutMs: 30_000,
      retryCount: 0,
    },
  );
}

export async function recordPortfolioDecisionMemory(
  entry: PortfolioDecisionMemoryEntry,
): Promise<PortfolioDecisionMemoryEntry> {
  return request<PortfolioDecisionMemoryEntry>("/stocks/portfolio-decisions", {
    method: "POST",
    body: JSON.stringify(entry),
    timeoutMs: 30_000,
    retryCount: 0,
  });
}

export async function reviewPortfolioDecisionOutcomes(input: {
  market: string;
  evaluatedAt?: number;
  currentPortfolioValue: number;
  currentTotalReturn: number;
  currentSharpe: number | null;
  currentProfitFactor: number | null;
  currentClosedTrades: number;
  currentDrawdown: number;
  lifecycleState: ModelLifecycleState;
  lifecycleLabel: string;
}): Promise<{
  entries: PortfolioDecisionMemoryEntry[];
  outcomes: PortfolioDecisionOutcome[];
}> {
  return request<{
    entries: PortfolioDecisionMemoryEntry[];
    outcomes: PortfolioDecisionOutcome[];
  }>("/stocks/portfolio-decisions/outcomes", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    retryCount: 0,
  });
}
