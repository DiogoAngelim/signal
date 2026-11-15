export type StewardshipImportance = "low" | "medium" | "high" | "critical";

export type StewardshipSeverity = "low" | "medium" | "high" | "critical";

export type StewardshipStrength = "weak" | "limited" | "adequate" | "strong";

export type StewardshipVisibility = "hidden" | "partial" | "explicit";

export type StewardshipEvidenceQuality =
  | "absent"
  | "weak"
  | "limited"
  | "adequate"
  | "strong";

export type StewardshipGovernanceStatus =
  | "blocked"
  | "weak"
  | "caution"
  | "acceptable";

export type StewardshipPolicyCompliance =
  | "compliant"
  | "needs_review"
  | "violated"
  | "unknown";

export type StewardshipReversibility = "unknown" | "low" | "medium" | "high";

export type StewardshipConcentrationRisk =
  | "unknown"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type StewardshipRecommendationAction =
  | "observe"
  | "monitor"
  | "preserve"
  | "proceed_gradually"
  | "reduce_exposure"
  | "intervene"
  | "pause"
  | "stop"
  | "review_again";

export type StewardshipSubject = {
  id: string;
  label: string;
  domain?: string;
  importance: StewardshipImportance;
  desiredState: string;
};

export type StewardshipContext = {
  decisionId?: string;
  horizon?: "immediate" | "short" | "medium" | "long" | "ongoing";
  reversibility?: StewardshipReversibility | number;
  concentrationRisk?: StewardshipConcentrationRisk | number;
  accountabilityOwner?: string;
  accountabilityReview?: string;
  policyCompliance?: StewardshipPolicyCompliance;
  missingInformation?: string[];
  constraints?: string[];
  monitoringCadence?: string;
  notes?: string[];
};

export type StewardshipThreat = {
  id: string;
  label: string;
  description?: string;
  severity: StewardshipSeverity;
  likelihood?: number;
  reversible?: boolean;
  mitigated?: boolean;
  evidenceIds?: string[];
};

export type StewardshipProtection = {
  id: string;
  label: string;
  description?: string;
  strength: StewardshipStrength;
  durability?: StewardshipEvidenceQuality | number;
  evidenceIds?: string[];
};

export type StewardshipUncertainty = {
  id: string;
  label: string;
  description?: string;
  severity: StewardshipSeverity;
  visibility: StewardshipVisibility;
};

export type StewardshipEvidence = {
  id: string;
  label: string;
  summary: string;
  quality: StewardshipEvidenceQuality | number;
  durability: StewardshipEvidenceQuality | number;
  confidence?: number;
  source?: string;
  observedAt?: string;
  supports?: string[];
  contradicts?: string[];
};

export type StewardshipLessonOutcome =
  | "confirmed"
  | "contradicted"
  | "mixed"
  | "unknown"
  | "too_early";

export type StewardshipLesson = {
  id: string;
  label: string;
  summary: string;
  outcome: StewardshipLessonOutcome;
  repetition: number;
  confidence?: number;
  durability?: StewardshipEvidenceQuality | number;
  evidenceIds?: string[];
  sourceOutcomeReviewId?: string;
};

export type StewardshipOutcomeReview = {
  id?: string;
  label?: string;
  summary?: string;
  outcome?: StewardshipLessonOutcome;
  known?: boolean;
  repeated?: number;
  confidence?: number;
  durability?: StewardshipEvidenceQuality | number;
  reviewDepth?: number;
  lessons?: string[];
  evidenceIds?: string[];
  uncertainty?: string;
};

export type StewardshipGovernanceInputs = {
  evidenceQuality?: StewardshipEvidenceQuality | number;
  evidenceDurability?: StewardshipEvidenceQuality | number;
  reviewDepth?: StewardshipEvidenceQuality | number;
  repetitionStrength?: StewardshipEvidenceQuality | number;
  uncertaintyVisibility?: StewardshipVisibility | number;
  riskVisibility?: StewardshipVisibility | number;
  reversibility?: StewardshipReversibility | number;
  concentrationRisk?: StewardshipConcentrationRisk | number;
  accountabilityClarity?: StewardshipEvidenceQuality | number;
  policyCompliance?: StewardshipPolicyCompliance;
  missingInformation?: string[];
  contradictionLevel?: StewardshipSeverity | number;
};

export type StewardshipGovernanceAssessment = {
  trustworthyEnough: boolean;
  status: StewardshipGovernanceStatus;
  evidenceQuality: StewardshipEvidenceQuality;
  evidenceDurability: StewardshipEvidenceQuality;
  reviewDepth: StewardshipEvidenceQuality;
  repetitionStrength: StewardshipEvidenceQuality;
  uncertaintyVisibility: StewardshipVisibility;
  riskVisibility: StewardshipVisibility;
  reversibility: StewardshipReversibility;
  concentrationRisk: StewardshipConcentrationRisk;
  accountabilityClarity: StewardshipEvidenceQuality;
  policyCompliance: StewardshipPolicyCompliance;
  missingInformation: string[];
  contradictionLevel: StewardshipSeverity;
  warnings: string[];
  blockers: string[];
  rationale: string[];
};

export type StewardshipRecommendation = {
  action: StewardshipRecommendationAction;
  summary: string;
  rationale: string[];
  confidence: "low" | "medium" | "high";
};

export type StewardshipNextStep = {
  category: StewardshipRecommendationAction;
  description: string;
  reviewTrigger: string;
  reversible: boolean;
};

export type StewardshipLedgerTraceability = {
  decisionLinked: boolean;
  outcomeReviewed: boolean;
  lessonLinked: boolean;
  evidenceLinked: boolean;
  missingEvidenceReferences: string[];
  score: number;
  complete: boolean;
};

export type StewardshipLedgerDecisionTrace = {
  id: string;
  subjectId: string;
  subjectLabel: string;
  linked: boolean;
  missing: string[];
};

export type StewardshipLedgerOutcomeTrace = {
  id: string;
  label: string;
  outcome: StewardshipLessonOutcome;
  known: boolean;
  lessonIds: string[];
  evidenceIds: string[];
  linkedEvidenceIds: string[];
  missingEvidenceIds: string[];
};

export type StewardshipLedgerLessonTrace = {
  id: string;
  label: string;
  outcome: StewardshipLessonOutcome;
  summary: string;
  repetition: number;
  evidenceIds: string[];
  linkedEvidenceIds: string[];
  missingEvidenceIds: string[];
  sourceOutcomeReviewId?: string;
};

export type StewardshipLedgerEvidenceTrace = {
  id: string;
  label: string;
  quality: StewardshipEvidenceQuality | number;
  durability: StewardshipEvidenceQuality | number;
  usedByLessonIds: string[];
  usedByThreatIds: string[];
  usedByProtectionIds: string[];
  orphaned: boolean;
};

export type StewardshipLedger = {
  decision: StewardshipLedgerDecisionTrace;
  outcomes: StewardshipLedgerOutcomeTrace[];
  lessons: StewardshipLedgerLessonTrace[];
  evidence: StewardshipLedgerEvidenceTrace[];
  traceability: StewardshipLedgerTraceability;
  gaps: string[];
  warnings: string[];
};

export type StewardshipAssessment = {
  subject: StewardshipSubject;
  whatMatters: string[];
  threats: StewardshipThreat[];
  protections: StewardshipProtection[];
  lessons: StewardshipLesson[];
  ledger: StewardshipLedger;
  governance: StewardshipGovernanceAssessment;
  recommendation: StewardshipRecommendation;
  smallestResponsibleNextStep: StewardshipNextStep;
  monitoringPlan: string[];
  uncertaintySummary: string[];
  rationale: string[];
  disclaimers: string[];
};

export type StewardshipMemoryInput = {
  evidence?: StewardshipEvidence[];
  lessons?: StewardshipLesson[];
};

export type StewardshipInput = {
  subject?: Partial<StewardshipSubject>;
  context?: StewardshipContext;
  memory?: StewardshipMemoryInput;
  evidence?: StewardshipEvidence[];
  outcomeReviews?: StewardshipOutcomeReview[];
  threats?: StewardshipThreat[];
  protections?: StewardshipProtection[];
  uncertainties?: StewardshipUncertainty[];
  governance?: StewardshipGovernanceInputs;
};
