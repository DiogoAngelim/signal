export type DecisionModuleName =
  | "discovery"
  | "judgment"
  | "purpose"
  | "need"
  | "trust"
  | "reflection"
  | "recovery"
  | "memory"
  | "learning"
  | "calibration"
  | "identity"
  | "awareness"
  | "agency";

export const DECISION_MODULES: readonly DecisionModuleName[] = [
  "discovery",
  "judgment",
  "purpose",
  "need",
  "trust",
  "reflection",
  "recovery",
  "memory",
  "learning",
  "calibration",
  "identity",
  "awareness",
  "agency",
];

export type ModuleStateInput =
  | number
  | {
      score?: number;
      confidence?: number;
      trust?: number;
      risk?: number;
      uncertainty?: number;
      status?: string;
      reasons?: string[];
      explanation?: string;
      allowed?: boolean;
      metadata?: Record<string, unknown>;
    };

export type DecisionModuleInputs = Partial<Record<DecisionModuleName, ModuleStateInput>>;

export type NormalizedModuleState = {
  module: DecisionModuleName;
  score: number;
  confidence: number;
  risk: number;
  uncertainty: number;
  allowed: boolean;
  reasons: string[];
  status?: string;
  metadata?: Record<string, unknown>;
};

export type RealitySource = {
  sourceId: string;
  name?: string;
  sourceType?: "human" | "api" | "sensor" | "database" | "model" | "system" | "other";
  reliabilityScore?: number;
  freshnessWindowMs?: number;
  metadata?: Record<string, unknown>;
};

export interface RealitySnapshot {
  snapshotId: string;
  source: string;
  createdAt: string;
  dataQuality: number;
  freshnessScore: number;
  payload: unknown;
  sourceRef?: RealitySource;
  metadata?: Record<string, unknown>;
}

export type RealitySnapshotInput = {
  snapshotId?: string;
  source?: string;
  createdAt?: string;
  dataQuality?: number;
  freshnessScore?: number;
  payload: unknown;
  sourceRef?: RealitySource;
  metadata?: Record<string, unknown>;
};

export type CoherenceStatus =
  | "aligned"
  | "stable"
  | "tension"
  | "unstable"
  | "contradictory"
  | "blocked";

export type CoherenceConflictSeverity = "low" | "medium" | "high" | "critical";

export type CoherenceConflict = {
  conflictId: string;
  modules: DecisionModuleName[];
  severity: CoherenceConflictSeverity;
  description: string;
  recommendation: string;
};

export interface CoherenceAssessment {
  score: number;
  status: CoherenceStatus;
  contradictions: CoherenceConflict[];
  consensusLevel: number;
  actionAllowed: boolean;
  actionScale: number;
  trustAdjustment: number;
  agencyAdjustment: number;
  confidenceAdjustment: number;
  explanation: string[];
}

export type OutcomeCategory =
  | "success"
  | "failure"
  | "partial-success"
  | "unexpected-success"
  | "unexpected-failure"
  | "inconclusive";

export type OutcomeHorizon = "short-term" | "medium-term" | "long-term";

export interface OutcomeEvaluation {
  outcomeId: string;
  decisionId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  originalDecisionId?: string;
  category: OutcomeCategory;
  successScore: number;
  purposeAlignment: number;
  needAlignment: number;
  riskEfficiency: number;
  confidenceAccuracy: number;
  trustImpact: number;
  calibrationImpact: number;
  lessons: string[];
  metadata?: Record<string, unknown>;
}

export type OutcomeEvaluationInput = {
  outcomeId?: string;
  decisionId: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  originalDecisionId?: string;
  horizon?: OutcomeHorizon;
  expectedConfidence?: number;
  expectedRisk?: number;
  actualSuccessScore?: number;
  purposeAlignment?: number;
  needAlignment?: number;
  realizedReward?: number;
  riskTaken?: number;
  unexpected?: boolean;
  inconclusive?: boolean;
  lessons?: string[];
  metadata?: Record<string, unknown>;
};

export type OutcomeFeedback = {
  modules: Partial<Record<DecisionModuleName, number>>;
  explanations: string[];
};

export interface AccountabilityReport {
  decisionId: string;
  decisionSummary: string;
  actionTaken: boolean;
  modulesInvolved: string[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
  contradictionsDetected: string[];
  confidenceAtDecision: number;
  confidenceToday: number;
  outcomeSummary?: string;
  lessonsLearned: string[];
  replayResult: "same-decision" | "changed-decision" | "inconclusive";
  humanExplanation: string;
}

export interface PredictionScenario {
  scenarioId: string;
  label: string;
  probability: number;
  expectedReward: number;
  expectedRisk: number;
  downsideRisk: number;
  uncertainty: number;
  purposeAlignment: number;
  needAlignment: number;
  confidence: number;
  assumptions: string[];
  warningSigns: string[];
}

export type PredictionInput = {
  decisionId?: string;
  currentScore?: number;
  expectedReward?: number;
  expectedRisk?: number;
  uncertainty?: number;
  purposeAlignment?: number;
  needAlignment?: number;
  confidence?: number;
  labels?: string[];
  assumptions?: string[];
};

export type SimulationRecommendation = "act" | "reduce" | "wait" | "block" | "escalate";

export type SimulationPathResult = {
  actionVariant: string;
  expectedOutcomeScore: number;
  worstCaseScore: number;
  bestCaseScore: number;
  survivalScore: number;
  regretScore: number;
  explanation: string[];
};

export interface SimulationResult {
  simulationId: string;
  decisionId?: string;
  actionVariant: string;
  scenariosTested: PredictionScenario[];
  expectedOutcomeScore: number;
  worstCaseScore: number;
  bestCaseScore: number;
  survivalScore: number;
  regretScore: number;
  recommendedAction: SimulationRecommendation;
  explanation: string[];
  pathComparisons: SimulationPathResult[];
}

export type SimulationInput = {
  simulationId?: string;
  decisionId?: string;
  scenarios: PredictionScenario[];
  actionVariants?: string[];
  currentExposure?: number;
};

export interface WisdomAssessment {
  score: number;
  irreversibleRisk: number;
  survivalPriority: number;
  longTermAlignment: number;
  shortTermTemptation: number;
  decision: "proceed" | "proceed-small" | "wait" | "avoid";
  reason: string[];
}

export type WisdomInput = {
  expectedReward?: number;
  downsideRisk?: number;
  irreversibleRisk?: number;
  survivalPriority?: number;
  longTermAlignment?: number;
  shortTermTemptation?: number;
  uncertainty?: number;
  confidence?: number;
};

export interface SignalDecisionRecord {
  decisionId: string;
  createdAt: string;
  source: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  originalDecisionId?: string;
  realitySnapshotId: string;
  realitySnapshot?: RealitySnapshot;
  observation: unknown;
  discovery?: unknown;
  judgment?: unknown;
  purpose?: unknown;
  need?: unknown;
  coherence: CoherenceAssessment;
  prediction?: PredictionScenario[];
  simulation?: SimulationResult;
  wisdom?: WisdomAssessment;
  agency?: unknown;
  action?: unknown;
  outcome?: OutcomeEvaluation;
  accountability?: AccountabilityReport;
  humanSummary: string;
  retentionTier: "hot" | "warm" | "cold" | "expired";
}

export type DecisionRecordInput = {
  decisionId: string;
  createdAt?: string;
  source?: string;
  appId?: string;
  domain?: string;
  timestamp?: string;
  correlationId?: string;
  version?: string;
  originalDecisionId?: string;
  realitySnapshotId?: string;
  realitySnapshot?: RealitySnapshotInput | RealitySnapshot;
  observation: unknown;
  discovery?: unknown;
  judgment?: unknown;
  purpose?: unknown;
  need?: unknown;
  coherence: CoherenceAssessment;
  prediction?: PredictionScenario[];
  simulation?: SimulationResult;
  wisdom?: WisdomAssessment;
  agency?: unknown;
  action?: unknown;
  outcome?: OutcomeEvaluation;
  accountability?: AccountabilityReport;
  humanSummary?: string;
  retentionTier?: "hot" | "warm" | "cold" | "expired";
};

export type DecisionReplayComparison = {
  decisionId: string;
  originalActionAllowed: boolean;
  currentActionAllowed: boolean;
  originalScale: number;
  currentScale: number;
  replayResult: "same-decision" | "changed-decision" | "inconclusive";
  differences: string[];
  explanation: string;
};

export type DecisionRecordStore = {
  save(record: SignalDecisionRecord): SignalDecisionRecord;
  get(decisionId: string): SignalDecisionRecord | undefined;
  list(): SignalDecisionRecord[];
  audit(decisionId: string): AccountabilityReport | undefined;
  replay(decisionId: string, current: CoherenceAssessment): DecisionReplayComparison | undefined;
  clear(): void;
};

export type DecisionPipelineInput = {
  decisionId: string;
  source?: string;
  realitySnapshotId?: string;
  realitySnapshot?: RealitySnapshotInput | RealitySnapshot;
  observation: unknown;
  modules: DecisionModuleInputs;
  prediction?: PredictionInput;
  wisdom?: WisdomInput;
  action?: unknown;
  outcome?: OutcomeEvaluationInput;
  createdAt?: string;
  retentionTier?: "hot" | "warm" | "cold" | "expired";
};

export type DecisionPipelineResult = {
  record: SignalDecisionRecord;
  coherenceScore: number;
  coherenceStatus: CoherenceStatus;
  consensusLevel: number;
  predictionScenarios: PredictionScenario[];
  simulationRecommendation: SimulationRecommendation;
  wisdomDecision: WisdomAssessment["decision"];
  outcomeAccuracy?: number;
  accountabilitySummary: string;
  decisionReplayAvailable: boolean;
  actionAllowed: boolean;
  actionScale: number;
};

export type DecisionOperationKind = "query" | "mutation" | "event";

export type DecisionOperationDefinition = {
  kind: DecisionOperationKind;
  name: string;
  version: "v1";
  description: string;
  idempotent: boolean;
  replaySafe: boolean;
};
