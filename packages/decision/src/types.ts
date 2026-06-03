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

export type DecisionEvidenceDirection = "supporting" | "contradicting" | "neutral";

export type AssessmentFactStatus = "known" | "unknown" | "assumed" | "contradicted";

export type DecisionReversibility = "unknown" | "low" | "medium" | "high";

export type DecisionOutcomeReviewAssumptionStatus = "failed" | "survived" | "untested";

export type DecisionOutcomeReviewEvidenceRole = "mattered" | "misleading" | "neutral";

export type DecisionLearningOutcome = "confirmed" | "contradicted" | "mixed" | "unknown";

export type DecisionEvidenceInput = {
  evidenceId?: string;
  label: string;
  summary?: string;
  direction?: DecisionEvidenceDirection;
  quality?: number;
  reliability?: number;
  freshness?: number;
  independence?: number;
  replication?: number;
  calibration?: number;
  traceability?: number;
  strength?: number;
  source?: string;
  observedAt?: string;
  supports?: string[];
  contradicts?: string[];
  metadata?: Record<string, unknown>;
};

export type DecisionEvidence = {
  evidenceId: string;
  label: string;
  summary: string;
  direction: DecisionEvidenceDirection;
  quality: number;
  reliability: number;
  freshness: number;
  independence: number;
  replication: number;
  calibration: number;
  traceability: number;
  strength: number;
  source?: string;
  observedAt?: string;
  supports: string[];
  contradicts: string[];
  metadata?: Record<string, unknown>;
};

export type AssessmentFactInput =
  | string
  | {
      factId?: string;
      label: string;
      summary?: string;
      evidenceIds?: string[];
      reviewAfter?: string;
      metadata?: Record<string, unknown>;
    };

export type AssessmentFact = {
  factId: string;
  label: string;
  summary: string;
  status: AssessmentFactStatus;
  evidenceIds: string[];
  reviewAfter?: string;
  metadata?: Record<string, unknown>;
};

export type DecisionThreatInput =
  | string
  | {
      threatId?: string;
      label: string;
      severity?: number;
      likelihood?: number;
      evidenceIds?: string[];
      metadata?: Record<string, unknown>;
    };

export type DecisionThreat = {
  threatId: string;
  label: string;
  severity: number;
  likelihood: number;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
};

export type DecisionReversibilityInput =
  | number
  | DecisionReversibility
  | {
      canUndo?: boolean;
      cost?: number;
      speed?: number;
      score?: number;
      notes?: string[];
    };

export type DecisionReversibilityAssessment = {
  level: DecisionReversibility;
  score: number;
  canUndo: boolean;
  cost: number;
  speed: number;
  notes: string[];
};

export type DecisionEvidenceQualityAssessment = {
  quality: number;
  reliability: number;
  freshness: number;
  independence: number;
  replication: number;
  contradictionPressure: number;
  calibration: number;
  traceability: number;
  coverage: number;
  explanation: string[];
};

export type DecisionConfidenceDiscipline = {
  requested: number;
  capped: number;
  cap: number;
  evidenceQualityCap: number;
  contradictionCap: number;
  assumptionCap: number;
  unknownCoverageCap: number;
  explanation: string[];
};

export type DecisionGovernanceAssessment = {
  score: number;
  auditability: number;
  explainability: number;
  challengeability: number;
  traceability: number;
  evidenceCoverage: number;
  contradictionVisibility: number;
  assumptionVisibility: number;
  warnings: string[];
  blockers: string[];
  explanation: string[];
};

export type DecisionStewardshipAssessment = {
  importance: number;
  threatPressure: number;
  optionality: number;
  resilience: number;
  reversibility: DecisionReversibilityAssessment;
  recommendation: "proceed" | "proceed-reversibly" | "wait" | "reduce" | "avoid";
  explanation: string[];
};

export type DecisionNextBestEvidence = {
  question: string;
  whyItMatters: string;
  expectedImpact: string;
  expectedUncertaintyReduction: number;
};

export type DecisionJournal = {
  decisionId: string;
  createdAt: string;
  evidenceUsed: string[];
  assumptionsUsed: string[];
  contradictionsPresent: string[];
  unknownsPresent: string[];
  reasoningSummary: string;
};

export type DecisionAssessmentInput = {
  decisionId?: string;
  createdAt?: string;
  evidence?: DecisionEvidenceInput[];
  known?: AssessmentFactInput[];
  unknowns?: AssessmentFactInput[];
  assumptions?: AssessmentFactInput[];
  contradicted?: AssessmentFactInput[];
  desiredConfidence?: number;
  importance?: number;
  threats?: DecisionThreatInput[];
  optionality?: number;
  resilience?: number;
  reversibility?: DecisionReversibilityInput;
  reasoningSummary?: string;
  nextBestEvidence?: Partial<DecisionNextBestEvidence>;
};

export type DecisionAssessment = {
  decisionId?: string;
  createdAt: string;
  evidence: DecisionEvidence[];
  known: AssessmentFact[];
  unknowns: AssessmentFact[];
  assumptions: AssessmentFact[];
  contradicted: AssessmentFact[];
  evidenceQuality: DecisionEvidenceQualityAssessment;
  confidence: DecisionConfidenceDiscipline;
  governance: DecisionGovernanceAssessment;
  stewardship: DecisionStewardshipAssessment;
  nextBestEvidence: DecisionNextBestEvidence;
  journal: DecisionJournal;
  explanation: string[];
};

export type DecisionOutcomeReviewAssumption = {
  assumptionId: string;
  label: string;
  status: DecisionOutcomeReviewAssumptionStatus;
  why?: string;
};

export type DecisionOutcomeReviewEvidence = {
  evidenceId: string;
  label: string;
  role: DecisionOutcomeReviewEvidenceRole;
  why?: string;
};

export type DecisionOutcomeReviewInput = {
  reviewId?: string;
  decisionId: string;
  reviewedAt?: string;
  whatHappened: string;
  why?: string;
  surprises?: string[];
  assumptions?: DecisionOutcomeReviewAssumption[];
  evidence?: DecisionOutcomeReviewEvidence[];
  whatShouldChange?: string;
  lessons?: string[];
};

export type DecisionLearning = {
  learningId: string;
  decisionId: string;
  whatHappened: string;
  why: string;
  whatShouldChange: string;
  outcome: DecisionLearningOutcome;
};

export type DecisionOutcomeReview = {
  reviewId: string;
  decisionId: string;
  reviewedAt: string;
  whatHappened: string;
  why: string;
  surprises: string[];
  assumptionFailures: DecisionOutcomeReviewAssumption[];
  assumptionSurvivals: DecisionOutcomeReviewAssumption[];
  evidenceThatMattered: DecisionOutcomeReviewEvidence[];
  evidenceThatMisled: DecisionOutcomeReviewEvidence[];
  lessons: string[];
  learning: DecisionLearning;
};

export type DecisionLearningPattern = {
  patternId: string;
  lesson: string;
  frequency: number;
  confirmations: number;
  contradictions: number;
  survivalRate: number;
  explanation: string;
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
  review?: DecisionOutcomeReview;
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
  review?: DecisionOutcomeReviewInput;
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
  assessment?: DecisionAssessment;
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
  assessment?: DecisionAssessmentInput | DecisionAssessment;
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
  assessment?: DecisionAssessmentInput;
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
