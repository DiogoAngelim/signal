import { clamp, mean, numeric, stdev } from "../math/statistics";
import type { MeaningResult } from "../meaning/engine";
import type {
  PruningCandidateAssessment,
  PruningRecommendedAction,
  PruningResult,
} from "../pruning/engine";

export type WisdomDecisionStatus =
  | "approved"
  | "blocked"
  | "delayed"
  | "reduced-size"
  | "rejected"
  | "observed"
  | string;

export type DiscoveryLifecycleStage =
  | "Detected"
  | "Observed"
  | "Confirmed"
  | "Repeatable"
  | "Trusted"
  | "Institutional";

export type WisdomContributor = {
  id: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type WisdomScoreAudit = {
  value: number;
  contributors: WisdomContributor[];
  formula: string;
};

export type WisdomOutcomeResult = {
  value?: number;
  reward?: number;
  cost?: number;
  adverseImpact?: number;
  risk?: number;
  success?: boolean;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type WisdomAlternativeScenario = {
  id?: string;
  label?: string;
  action?: string;
  kind?:
    | "actual"
    | "do-nothing"
    | "wait"
    | "scale"
    | "reject"
    | "alternative"
    | string;
  expectedReward?: number;
  expectedCost?: number;
  expectedRisk?: number;
  expectedValue?: number;
  expectedConfidence?: number;
  scale?: number;
  delayHours?: number;
  realizedResult?: WisdomOutcomeResult;
  counterfactualResult?: WisdomOutcomeResult;
  metadata?: Record<string, unknown>;
};

export type DecisionOutcomeRecord = {
  id?: string;
  action?: string;
  status?: WisdomDecisionStatus;
  context?: Record<string, unknown>;
  alternatives?: WisdomAlternativeScenario[];
  futureOutcome?: WisdomOutcomeResult;
  realizedResult?: WisdomOutcomeResult;
  counterfactualResult?: WisdomOutcomeResult;
  createdAt?: string;
  outcomeAt?: string;
  reflection?: unknown;
  agency?: unknown;
  survivalMemory?: unknown;
  discovery?: unknown;
  metadata?: Record<string, unknown>;
};

export class DecisionOutcomeMemory {
  private records: DecisionOutcomeRecord[];

  constructor(records: DecisionOutcomeRecord[] = []) {
    this.records = records.map((record, index) =>
      normalizeRecord(record, index),
    );
  }

  record(record: DecisionOutcomeRecord): DecisionOutcomeRecord {
    const normalized = normalizeRecord(record, this.records.length);
    this.records = [...this.records, normalized];
    return copy(normalized);
  }

  all(): DecisionOutcomeRecord[] {
    return copy(this.records);
  }

  find(id: string): DecisionOutcomeRecord | null {
    return copy(this.records.find((record) => record.id === id) ?? null);
  }

  load(records: DecisionOutcomeRecord[]): DecisionOutcomeRecord[] {
    this.records = records.map((record, index) =>
      normalizeRecord(record, index),
    );
    return this.all();
  }

  clear(): DecisionOutcomeRecord[] {
    this.records = [];
    return [];
  }
}

export type WisdomCounterfactualInput = {
  decision?: DecisionOutcomeRecord | null;
  action?: string;
  status?: WisdomDecisionStatus;
  actual?: WisdomOutcomeResult | WisdomAlternativeScenario | null;
  alternatives?: WisdomAlternativeScenario[];
  history?: DecisionOutcomeRecord[];
  valueScale?: number;
};

export type WisdomCounterfactualResult = {
  decisionQuality: number;
  avoidedLoss: number;
  missedUpside: number;
  restrictionValue: number;
  counterfactualConfidence: number;
  actualOutcome: WisdomReviewedScenario;
  bestAlternative: WisdomReviewedScenario | null;
  worstAlternative: WisdomReviewedScenario | null;
  reviewedAlternatives: WisdomReviewedScenario[];
  contributors: Record<
    | "decisionQuality"
    | "avoidedLoss"
    | "missedUpside"
    | "restrictionValue"
    | "counterfactualConfidence",
    WisdomContributor[]
  >;
  scores: Record<
    | "decisionQuality"
    | "avoidedLoss"
    | "missedUpside"
    | "restrictionValue"
    | "counterfactualConfidence",
    WisdomScoreAudit
  >;
  explanation: string;
  formulas: string[];
};

export type WisdomReviewedScenario = {
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

export type OpportunityEconomicsOption = {
  expectedReward?: number;
  expectedCost?: number;
  expectedRisk?: number;
  confidence?: number;
};

export type OpportunityEconomicsInput = {
  action?: OpportunityEconomicsOption;
  wait?: OpportunityEconomicsOption;
  reject?: OpportunityEconomicsOption;
  scale?: OpportunityEconomicsOption;
  selected?: "action" | "wait" | "reject" | "scale" | string;
  riskPenalty?: number;
  history?: DecisionOutcomeRecord[];
};

export type OpportunityEconomicsResult = {
  actionValue: number;
  waitValue: number;
  rejectValue: number;
  scaleValue: number;
  urgencyCost: number;
  opportunityCost: number;
  bestOption: "action" | "wait" | "reject" | "scale";
  contributors: Record<
    | "actionValue"
    | "waitValue"
    | "rejectValue"
    | "scaleValue"
    | "urgencyCost"
    | "opportunityCost",
    WisdomContributor[]
  >;
  scores: Record<
    | "actionValue"
    | "waitValue"
    | "rejectValue"
    | "scaleValue"
    | "urgencyCost"
    | "opportunityCost",
    WisdomScoreAudit
  >;
  explanation: string;
  formulas: string[];
};

export type DiscoveryMaturityInput = {
  discoveries?: WisdomDiscoveryRecord[];
  now?: string | number | Date;
};

export type WisdomDiscoveryRecord = {
  id?: string;
  status?: DiscoveryLifecycleStage | string;
  detectedAt?: string | number | Date;
  observedAt?: string | number | Date;
  confirmedAt?: string | number | Date;
  confirmationCount?: number;
  recurrenceCount?: number;
  observationCount?: number;
  opportunityCount?: number;
  conversionCount?: number;
  successCount?: number;
  novelty?: number;
  maturityScore?: number;
};

export type DiscoveryMaturityResult = {
  maturityScore: number;
  recurrenceRate: number;
  noveltyPersistence: number;
  conversionRate: number;
  trustedDiscoveries: Array<{
    id: string;
    stage: DiscoveryLifecycleStage;
    maturityScore: number;
  }>;
  lifecycle: Array<{ stage: DiscoveryLifecycleStage; count: number }>;
  contributors: Record<
    | "maturityScore"
    | "recurrenceRate"
    | "noveltyPersistence"
    | "conversionRate",
    WisdomContributor[]
  >;
  scores: Record<
    | "maturityScore"
    | "recurrenceRate"
    | "noveltyPersistence"
    | "conversionRate",
    WisdomScoreAudit
  >;
  explanation: string;
  formulas: string[];
};

export type AgencyEffectivenessInput = {
  events?: AgencyEffectivenessEvent[];
  history?: DecisionOutcomeRecord[];
};

export type AgencyEffectivenessEvent = {
  id?: string;
  action?:
    | "approved"
    | "rejected"
    | "intervened"
    | "overridden"
    | "blocked"
    | string;
  proposedAction?: string;
  realizedResult?: WisdomOutcomeResult;
  baselineResult?: WisdomOutcomeResult;
  counterfactualResult?: WisdomOutcomeResult;
  frictionCost?: number;
  override?: boolean;
};

export type AgencyEffectivenessResult = {
  agencyAccuracy: number;
  interventionValue: number;
  approvalQuality: number;
  rejectionQuality: number;
  governanceEffectiveness: number;
  contributors: Record<
    | "agencyAccuracy"
    | "interventionValue"
    | "approvalQuality"
    | "rejectionQuality"
    | "governanceEffectiveness",
    WisdomContributor[]
  >;
  scores: Record<
    | "agencyAccuracy"
    | "interventionValue"
    | "approvalQuality"
    | "rejectionQuality"
    | "governanceEffectiveness",
    WisdomScoreAudit
  >;
  explanation: string;
  formulas: string[];
};

export type PortfolioIntelligenceInput = {
  opportunities?: WisdomPortfolioOpportunity[];
  currentAllocations?: WisdomAllocation[] | Record<string, number>;
  capitalConstraints?: {
    availableCapital?: number;
    usedCapital?: number;
    maxAllocationPerOpportunity?: number;
  };
  correlationStructure?:
    | WisdomCorrelation[]
    | Record<string, Record<string, number>>;
  riskProfile?: {
    riskTolerance?: number;
    concentrationLimit?: number;
    minimumCoverage?: number;
  };
};

export type WisdomPortfolioOpportunity = {
  id: string;
  expectedValue?: number;
  expectedReward?: number;
  expectedRisk?: number;
  requiredCapital?: number;
  allocation?: number;
  group?: string;
  upside?: number;
  downside?: number;
  confidence?: number;
};

export type WisdomAllocation = {
  id: string;
  amount: number;
};

export type WisdomCorrelation = {
  left?: string;
  right?: string;
  source?: string;
  target?: string;
  correlation: number;
};

export type PortfolioIntelligenceResult = {
  concentrationRisk: number;
  diversificationQuality: number;
  capitalEfficiency: number;
  opportunityCoverage: number;
  portfolioConvexity: number;
  allocationQuality: number;
  contributors: Record<
    | "concentrationRisk"
    | "diversificationQuality"
    | "capitalEfficiency"
    | "opportunityCoverage"
    | "portfolioConvexity"
    | "allocationQuality",
    WisdomContributor[]
  >;
  scores: Record<
    | "concentrationRisk"
    | "diversificationQuality"
    | "capitalEfficiency"
    | "opportunityCoverage"
    | "portfolioConvexity"
    | "allocationQuality",
    WisdomScoreAudit
  >;
  explanation: string;
  formulas: string[];
};

export type DecisionQualityInput = {
  decision?: DecisionOutcomeRecord | null;
  history?: DecisionOutcomeRecord[];
  counterfactuals?: WisdomCounterfactualResult;
  opportunityEconomics?: OpportunityEconomicsResult;
  discoveryMaturity?: DiscoveryMaturityResult;
  agencyEffectiveness?: AgencyEffectivenessResult;
  portfolioIntelligence?: PortfolioIntelligenceResult;
  reflection?: unknown;
  agency?: unknown;
  pruning?: Partial<PruningResult> | PruningCandidateAssessment[];
  meaning?: Partial<MeaningResult> | null;
  survivalMemory?: unknown;
  discovery?: unknown;
};

export type DecisionQualityResult = {
  decisionQuality: number;
  wisdomScore: number;
  learningConfidence: number;
  counterfactuals: WisdomCounterfactualResult;
  opportunityEconomics: OpportunityEconomicsResult;
  discoveryMaturity: DiscoveryMaturityResult;
  agencyEffectiveness: AgencyEffectivenessResult;
  portfolioIntelligence: PortfolioIntelligenceResult;
  contributors: Record<
    "decisionQuality" | "wisdomScore" | "learningConfidence",
    WisdomContributor[]
  >;
  scores: Record<
    "decisionQuality" | "wisdomScore" | "learningConfidence",
    WisdomScoreAudit
  >;
  sourceModules: string[];
  justifiedConfidence: number;
  falseConfidenceRisk: number;
  robustnessScore: number;
  antifragilityScore: number;
  recommendedAction: string;
  survivalAdjustment: number;
  pruning?: WisdomPruningAdjustment;
  meaning?: WisdomMeaningAdjustment;
  explanation: string;
  formulas: string[];
};

export type WisdomPruningAdjustment = {
  pruningScore: number;
  ignoranceEffectivenessScore: number;
  evidenceConfidence: number;
  falseConfidenceRisk: number;
  robustnessAdjustment: number;
  confidenceAdjustment: number;
  recommendedAction: PruningRecommendedAction;
  survivalContribution: number;
  warnings: string[];
};

export type WisdomMeaningAdjustment = {
  gravityScore: number;
  needConfidence: number;
  falseConfidenceRisk: number;
  confidenceAdjustment: number;
  decisionPenalty: number;
  safetyPriority: number;
  recommendedAction: "allow" | "scale" | "review" | "block";
  warnings: string[];
};

export type WisdomSummary = {
  wisdomSummary: string[];
  counterfactualReview: {
    actualOutcome: WisdomReviewedScenario | null;
    bestAlternative: WisdomReviewedScenario | null;
    worstAlternative: WisdomReviewedScenario | null;
    decisionQuality: number;
  };
  opportunityEconomics: Pick<
    OpportunityEconomicsResult,
    | "actionValue"
    | "waitValue"
    | "rejectValue"
    | "scaleValue"
    | "urgencyCost"
    | "opportunityCost"
    | "bestOption"
  >;
  discoveryMaturity: {
    maturityScore: number;
    recurrenceRate: number;
    noveltyPersistence: number;
    conversionRate: number;
    trustedDiscoveries: DiscoveryMaturityResult["trustedDiscoveries"];
    lifecycle: DiscoveryMaturityResult["lifecycle"];
  };
  agencyEffectiveness: Pick<
    AgencyEffectivenessResult,
    | "agencyAccuracy"
    | "interventionValue"
    | "approvalQuality"
    | "rejectionQuality"
    | "governanceEffectiveness"
  >;
  portfolioIntelligence: Pick<
    PortfolioIntelligenceResult,
    | "concentrationRisk"
    | "diversificationQuality"
    | "capitalEfficiency"
    | "opportunityCoverage"
    | "portfolioConvexity"
    | "allocationQuality"
  >;
  contributors: DecisionQualityResult["contributors"];
  explanation: string;
};

export type WisdomSummaryInput = Partial<DecisionQualityInput> & {
  records?: DecisionOutcomeRecord[];
  discoveries?: WisdomDiscoveryRecord[];
  agencyEvents?: AgencyEffectivenessEvent[];
  portfolio?: PortfolioIntelligenceInput;
};

export type WisdomEngine = {
  memory: DecisionOutcomeMemory;
  evaluateDecisionQuality: (
    input?: DecisionQualityInput,
  ) => DecisionQualityResult;
  evaluateCounterfactuals: (
    input?: WisdomCounterfactualInput,
  ) => WisdomCounterfactualResult;
  evaluateOpportunityEconomics: (
    input?: OpportunityEconomicsInput,
  ) => OpportunityEconomicsResult;
  evaluateDiscoveryMaturity: (
    input?: DiscoveryMaturityInput,
  ) => DiscoveryMaturityResult;
  evaluateAgencyEffectiveness: (
    input?: AgencyEffectivenessInput,
  ) => AgencyEffectivenessResult;
  evaluatePortfolioIntelligence: (
    input?: PortfolioIntelligenceInput,
  ) => PortfolioIntelligenceResult;
  recordOutcome: (record: DecisionOutcomeRecord) => RecordOutcomeResult;
  buildWisdomSummary: (input?: WisdomSummaryInput) => WisdomSummary;
};

export type RecordOutcomeResult = {
  record: DecisionOutcomeRecord;
  counterfactuals: WisdomCounterfactualResult;
  decisionQuality: DecisionQualityResult;
  memorySize: number;
};

export function createDecisionOutcomeMemory(
  records: DecisionOutcomeRecord[] = [],
) {
  return new DecisionOutcomeMemory(records);
}

export function createWisdom(
  input: { memory?: DecisionOutcomeMemory | DecisionOutcomeRecord[] } = {},
): WisdomEngine {
  const memory = Array.isArray(input.memory)
    ? createDecisionOutcomeMemory(input.memory)
    : (input.memory ?? createDecisionOutcomeMemory());

  return {
    memory,
    evaluateDecisionQuality: (qualityInput = {}) =>
      evaluateDecisionQuality({
        ...qualityInput,
        history: qualityInput.history ?? memory.all(),
      }),
    evaluateCounterfactuals: (counterfactualInput = {}) =>
      evaluateCounterfactuals({
        ...counterfactualInput,
        history: counterfactualInput.history ?? memory.all(),
      }),
    evaluateOpportunityEconomics,
    evaluateDiscoveryMaturity,
    evaluateAgencyEffectiveness: (agencyInput = {}) =>
      evaluateAgencyEffectiveness({
        ...agencyInput,
        history: agencyInput.history ?? memory.all(),
      }),
    evaluatePortfolioIntelligence,
    recordOutcome: (record: DecisionOutcomeRecord) =>
      recordOutcome({ memory, record }),
    buildWisdomSummary: (summaryInput = {}) =>
      buildWisdomSummary({
        ...summaryInput,
        records: summaryInput.records ?? memory.all(),
      }),
  };
}

export function evaluateCounterfactuals(
  input: WisdomCounterfactualInput = {},
): WisdomCounterfactualResult {
  const record = input.decision ?? recordFromCounterfactualInput(input);
  const actualOutcome = reviewActualScenario(record, input);
  const reviewedAlternatives = (record.alternatives ?? []).map(
    (alternative, index) => reviewAlternativeScenario(alternative, index),
  );
  const allScenarios = [actualOutcome, ...reviewedAlternatives];
  const bestAlternative = reviewedAlternatives.length
    ? maxBy(reviewedAlternatives, (scenario) => scenario.utility)
    : null;
  const worstAlternative = reviewedAlternatives.length
    ? minBy(reviewedAlternatives, (scenario) => scenario.utility)
    : null;
  const bestUtility = maxBy(
    allScenarios,
    (scenario) => scenario.utility,
  ).utility;
  const worstUtility = minBy(
    allScenarios,
    (scenario) => scenario.utility,
  ).utility;
  const spread = Math.max(0.0001, bestUtility - worstUtility);
  const valueScale =
    input.valueScale ??
    scaleFor(allScenarios.map((scenario) => scenario.utility));
  const alternativeBestUtility =
    bestAlternative?.utility ?? actualOutcome.utility;
  const alternativeWorstAdverse = reviewedAlternatives.length
    ? Math.max(
        ...reviewedAlternatives.map((scenario) => scenario.adverseImpact),
      )
    : actualOutcome.adverseImpact;
  const missedUpsideRaw = Math.max(
    0,
    alternativeBestUtility - actualOutcome.utility,
  );
  const avoidedLossRaw = Math.max(
    0,
    alternativeWorstAdverse - actualOutcome.adverseImpact,
  );
  const decisionQuality = roundScore(
    ((actualOutcome.utility - worstUtility) / spread) * 100,
  );
  const missedUpside = roundScore((missedUpsideRaw / valueScale) * 100);
  const avoidedLoss = roundScore((avoidedLossRaw / valueScale) * 100);
  const restricted = isRestricted(record.status);
  const restrictionValue = roundScore(
    50 + (avoidedLoss - missedUpside) * (restricted ? 0.5 : 0.25),
  );
  const counterfactualConfidence = counterfactualConfidenceFor({
    alternatives: reviewedAlternatives,
    history: input.history ?? [],
    actualOutcome,
  });
  const scores = {
    decisionQuality: audit(
      decisionQuality,
      "decisionQuality = actual utility rank between worst and best observed or counterfactual scenario",
      [
        contributor(
          "actual-utility",
          "Actual utility",
          actualOutcome.utility,
          0.55,
          "Realized or expected utility of the chosen action.",
        ),
        contributor(
          "best-utility",
          "Best scenario utility",
          bestUtility,
          0.25,
          "Highest utility among actual and alternatives.",
        ),
        contributor(
          "worst-utility",
          "Worst scenario utility",
          worstUtility,
          0.2,
          "Lowest utility among actual and alternatives.",
        ),
      ],
    ),
    avoidedLoss: audit(
      avoidedLoss,
      "avoidedLoss = normalized adverse impact avoided versus the worst alternative",
      [
        contributor(
          "alternative-adverse-impact",
          "Worst alternative adverse impact",
          alternativeWorstAdverse,
          0.6,
          "Largest adverse impact among alternatives.",
        ),
        contributor(
          "actual-adverse-impact",
          "Actual adverse impact",
          actualOutcome.adverseImpact,
          0.4,
          "Adverse impact of the selected action.",
        ),
      ],
    ),
    missedUpside: audit(
      missedUpside,
      "missedUpside = normalized gap between best alternative utility and actual utility",
      [
        contributor(
          "best-alternative",
          "Best alternative utility",
          alternativeBestUtility,
          0.65,
          "Best utility available in non-selected scenarios.",
        ),
        contributor(
          "actual-utility",
          "Actual utility",
          actualOutcome.utility,
          0.35,
          "Utility of the selected action.",
        ),
      ],
    ),
    restrictionValue: audit(
      restrictionValue,
      "restrictionValue = 50 + avoided loss minus missed upside, weighted by whether a restriction was active",
      [
        contributor(
          "avoided-loss",
          "Avoided loss",
          avoidedLoss,
          0.5,
          "Protection created by the restriction.",
        ),
        contributor(
          "missed-upside",
          "Missed upside",
          missedUpside,
          -0.5,
          "Opportunity sacrificed by the restriction.",
        ),
        contributor(
          "restriction-active",
          "Restriction active",
          restricted ? 100 : 0,
          0.15,
          "Whether the decision was blocked, delayed, reduced, or rejected.",
        ),
      ],
    ),
    counterfactualConfidence: audit(
      counterfactualConfidence,
      "counterfactualConfidence = outcome coverage plus memory depth minus scenario dispersion",
      [
        contributor(
          "coverage",
          "Alternative outcome coverage",
          coverageFor(reviewedAlternatives),
          0.45,
          "Share of alternatives with realized or counterfactual outcomes.",
        ),
        contributor(
          "memory-depth",
          "Memory depth",
          Math.min(100, (input.history ?? []).length * 5),
          0.35,
          "Prior outcome records available for learning.",
        ),
        contributor(
          "consistency",
          "Scenario consistency",
          Math.max(
            0,
            100 - stdev(allScenarios.map((scenario) => scenario.utility)) * 8,
          ),
          0.2,
          "Lower utility dispersion increases confidence.",
        ),
      ],
    ),
  };

  return {
    decisionQuality,
    avoidedLoss,
    missedUpside,
    restrictionValue,
    counterfactualConfidence,
    actualOutcome,
    bestAlternative,
    worstAlternative,
    reviewedAlternatives,
    contributors: contributorsFrom(scores),
    scores,
    explanation: counterfactualExplanation(
      decisionQuality,
      avoidedLoss,
      missedUpside,
      restrictionValue,
    ),
    formulas: Object.values(scores).map((score) => score.formula),
  };
}

export function evaluateOpportunityEconomics(
  input: OpportunityEconomicsInput = {},
): OpportunityEconomicsResult {
  const riskPenalty = numeric(input.riskPenalty, 1);
  const options = {
    action: economicValue("action", input.action, riskPenalty),
    wait: economicValue("wait", input.wait, riskPenalty),
    reject: economicValue("reject", input.reject, riskPenalty),
    scale: economicValue("scale", input.scale, riskPenalty),
  };
  const ordered = Object.entries(options) as Array<
    [OpportunityEconomicsResult["bestOption"], ReturnType<typeof economicValue>]
  >;
  const bestOption = ordered.sort(
    (left, right) => right[1].utility - left[1].utility,
  )[0][0];
  const selected = selectedEconomicsKey(input.selected);
  const urgencyCost = Math.max(
    0,
    options.action.utility - options.wait.utility,
  );
  const opportunityCost = Math.max(
    0,
    options[bestOption].utility - options[selected].utility,
  );
  const scores = {
    actionValue: optionAudit(options.action),
    waitValue: optionAudit(options.wait),
    rejectValue: optionAudit(options.reject),
    scaleValue: optionAudit(options.scale),
    urgencyCost: audit(
      roundNumber(urgencyCost),
      "urgencyCost = max(0, action value - wait value)",
      [
        contributor(
          "action-value",
          "Action value",
          options.action.utility,
          0.5,
          "Expected utility of acting now.",
        ),
        contributor(
          "wait-value",
          "Wait value",
          options.wait.utility,
          -0.5,
          "Expected utility of waiting.",
        ),
      ],
    ),
    opportunityCost: audit(
      roundNumber(opportunityCost),
      "opportunityCost = max(0, best option value - selected option value)",
      [
        contributor(
          "best-option",
          "Best option value",
          options[bestOption].utility,
          0.6,
          `Best option is ${bestOption}.`,
        ),
        contributor(
          "selected-option",
          "Selected option value",
          options[selected].utility,
          -0.4,
          `Selected option is ${selected}.`,
        ),
      ],
    ),
  };

  return {
    actionValue: scores.actionValue.value,
    waitValue: scores.waitValue.value,
    rejectValue: scores.rejectValue.value,
    scaleValue: scores.scaleValue.value,
    urgencyCost: scores.urgencyCost.value,
    opportunityCost: scores.opportunityCost.value,
    bestOption,
    contributors: contributorsFrom(scores),
    scores,
    explanation: `Opportunity economics favors ${bestOption}; waiting costs ${roundNumber(urgencyCost)} utility units when action value exceeds wait value.`,
    formulas: Object.values(scores).map((score) => score.formula),
  };
}

export function evaluateDiscoveryMaturity(
  input: DiscoveryMaturityInput = {},
): DiscoveryMaturityResult {
  const discoveries = input.discoveries ?? [];
  const now = deterministicNow(discoveries, input.now);
  const reviewed = discoveries.map((discovery, index) =>
    reviewDiscovery(discovery, index, now),
  );
  const recurrenceRate = pct(
    reviewed.reduce((sum, item) => sum + item.recurrences, 0),
    reviewed.reduce((sum, item) => sum + Math.max(1, item.observations), 0),
    0,
  );
  const noveltyPersistence = roundScore(
    mean(reviewed.map((item) => item.noveltyPersistence)),
  );
  const conversionRate = pct(
    reviewed.reduce((sum, item) => sum + item.successes, 0),
    reviewed.reduce((sum, item) => sum + item.conversions, 0),
    0,
  );
  const maturityScore = roundScore(
    mean(reviewed.map((item) => item.maturityScore)),
  );
  const trustedDiscoveries = reviewed
    .filter(
      (item) =>
        item.stage === "Trusted" ||
        item.stage === "Institutional" ||
        item.maturityScore >= 75,
    )
    .map((item) => ({
      id: item.id,
      stage: item.stage,
      maturityScore: item.maturityScore,
    }));
  const lifecycle = lifecycleCounts(reviewed.map((item) => item.stage));
  const scores = {
    maturityScore: audit(
      maturityScore,
      "maturityScore = average lifecycle maturity from age, confirmation, recurrence, novelty persistence, and conversion",
      [
        contributor(
          "age",
          "Discovery age",
          mean(reviewed.map((item) => item.ageScore)),
          0.18,
          "Older discoveries have had more time to prove or decay.",
        ),
        contributor(
          "confirmation",
          "Confirmations",
          mean(reviewed.map((item) => item.confirmationScore)),
          0.26,
          "Evidence-backed confirmations replace raw confidence.",
        ),
        contributor(
          "recurrence",
          "Recurrence",
          recurrenceRate,
          0.22,
          "Recurring discoveries are more mature than isolated discoveries.",
        ),
        contributor(
          "conversion",
          "Conversion",
          conversionRate,
          0.22,
          "Confirmed discoveries must convert into useful outcomes.",
        ),
        contributor(
          "novelty",
          "Novelty persistence",
          noveltyPersistence,
          0.12,
          "Novelty should persist without being merely fresh.",
        ),
      ],
    ),
    recurrenceRate: audit(
      recurrenceRate,
      "recurrenceRate = recurrence count divided by observation count",
      [
        contributor(
          "recurrence-rate",
          "Recurrence rate",
          recurrenceRate,
          1,
          "How often detections recur across observations.",
        ),
      ],
    ),
    noveltyPersistence: audit(
      noveltyPersistence,
      "noveltyPersistence = novelty after deterministic age decay",
      [
        contributor(
          "novelty-persistence",
          "Novelty persistence",
          noveltyPersistence,
          1,
          "Novel discoveries retain value only if novelty persists.",
        ),
      ],
    ),
    conversionRate: audit(
      conversionRate,
      "conversionRate = successful conversions divided by conversion opportunities",
      [
        contributor(
          "conversion-rate",
          "Conversion rate",
          conversionRate,
          1,
          "How often discoveries become useful decisions.",
        ),
      ],
    ),
  };

  return {
    maturityScore,
    recurrenceRate,
    noveltyPersistence,
    conversionRate,
    trustedDiscoveries,
    lifecycle,
    contributors: contributorsFrom(scores),
    scores,
    explanation: trustedDiscoveries.length
      ? `${trustedDiscoveries.length} discoveries have earned trusted or institutional maturity.`
      : "Discovery maturity is still evidence-seeking; raw discovery confidence should remain capped.",
    formulas: Object.values(scores).map((score) => score.formula),
  };
}

export function evaluateAgencyEffectiveness(
  input: AgencyEffectivenessInput = {},
): AgencyEffectivenessResult {
  const events = input.events ?? agencyEventsFromHistory(input.history ?? []);
  const approvals = events.filter(
    (event) => normalized(event.action) === "approved",
  );
  const rejections = events.filter((event) =>
    ["rejected", "blocked"].includes(normalized(event.action)),
  );
  const interventions = events.filter(
    (event) =>
      ["intervened", "overridden"].includes(normalized(event.action)) ||
      event.override === true,
  );
  const approvalQuality = qualityScore(
    approvals.map((event) => outcomeUtility(event.realizedResult)),
  );
  const rejectionQuality = qualityScore(
    rejections.map((event) => rejectionDelta(event)),
  );
  const interventionValue = qualityScore(
    interventions.map((event) => interventionDelta(event)),
  );
  const accuracySamples = events
    .map((event) => agencyCorrectness(event))
    .filter(Number.isFinite);
  const agencyAccuracy = roundScore(mean(accuracySamples));
  const frictionPenalty = roundScore(
    mean(events.map((event) => Math.max(0, numeric(event.frictionCost, 0)))) *
      5,
  );
  const governanceEffectiveness = roundScore(
    mean([
      agencyAccuracy,
      interventionValue,
      approvalQuality,
      rejectionQuality,
      Math.max(0, 100 - frictionPenalty),
    ]),
  );
  const scores = {
    agencyAccuracy: audit(
      agencyAccuracy,
      "agencyAccuracy = share of Agency decisions whose eventual utility direction was correct",
      [
        contributor(
          "accuracy",
          "Decision accuracy",
          agencyAccuracy,
          1,
          "Approvals should be useful; rejections and blocks should avoid worse outcomes.",
        ),
      ],
    ),
    interventionValue: audit(
      interventionValue,
      "interventionValue = normalized improvement of intervention outcomes over baseline outcomes",
      [
        contributor(
          "intervention-value",
          "Intervention value",
          interventionValue,
          1,
          "Whether Agency interventions improved outcomes rather than only adding friction.",
        ),
      ],
    ),
    approvalQuality: audit(
      approvalQuality,
      "approvalQuality = normalized utility of approved decisions",
      [
        contributor(
          "approval-quality",
          "Approval quality",
          approvalQuality,
          1,
          "Quality of Agency approvals with realized outcomes.",
        ),
      ],
    ),
    rejectionQuality: audit(
      rejectionQuality,
      "rejectionQuality = normalized avoided utility loss from rejected or blocked decisions",
      [
        contributor(
          "rejection-quality",
          "Rejection quality",
          rejectionQuality,
          1,
          "Quality of Agency rejections and blocks.",
        ),
      ],
    ),
    governanceEffectiveness: audit(
      governanceEffectiveness,
      "governanceEffectiveness = mean accuracy, intervention value, approval quality, rejection quality, and low friction",
      [
        contributor(
          "accuracy",
          "Agency accuracy",
          agencyAccuracy,
          0.25,
          "Outcome-direction correctness.",
        ),
        contributor(
          "intervention",
          "Intervention value",
          interventionValue,
          0.25,
          "Value added by interventions.",
        ),
        contributor(
          "approval",
          "Approval quality",
          approvalQuality,
          0.2,
          "Quality of approvals.",
        ),
        contributor(
          "rejection",
          "Rejection quality",
          rejectionQuality,
          0.2,
          "Quality of rejections.",
        ),
        contributor(
          "friction",
          "Friction control",
          Math.max(0, 100 - frictionPenalty),
          0.1,
          "Governance should not create unnecessary cost.",
        ),
      ],
    ),
  };

  return {
    agencyAccuracy,
    interventionValue,
    approvalQuality,
    rejectionQuality,
    governanceEffectiveness,
    contributors: contributorsFrom(scores),
    scores,
    explanation:
      governanceEffectiveness >= 60
        ? "Agency is adding measurable decision value."
        : "Agency is not yet proving enough value over its friction cost.",
    formulas: Object.values(scores).map((score) => score.formula),
  };
}

export function evaluatePortfolioIntelligence(
  input: PortfolioIntelligenceInput = {},
): PortfolioIntelligenceResult {
  const opportunities = input.opportunities ?? [];
  const allocations = allocationsFor(input.currentAllocations, opportunities);
  const totalCapital = totalCapitalFor(
    input.capitalConstraints,
    allocations,
    opportunities,
  );
  const weights = allocations.map((allocation) =>
    totalCapital > 0 ? allocation.amount / totalCapital : 0,
  );
  const hhi = weights.reduce((sum, weight) => sum + weight ** 2, 0);
  const concentrationRisk = roundScore(hhi * 100);
  const averageCorrelation = averageCorrelationFor(input.correlationStructure);
  const groupBalance = groupBalanceFor(opportunities, allocations);
  const diversificationQuality = roundScore(
    100 -
      concentrationRisk * 0.55 -
      averageCorrelation * 35 +
      groupBalance * 0.25,
  );
  const capitalEfficiency = roundScore(
    50 + averageAllocatedUtility(opportunities, allocations) * 10,
  );
  const opportunityCoverage = coverageScoreFor(
    opportunities,
    allocations,
    input.riskProfile?.minimumCoverage,
  );
  const portfolioConvexity = convexityScoreFor(opportunities, allocations);
  const allocationQuality = roundScore(
    mean([
      Math.max(0, 100 - concentrationRisk),
      diversificationQuality,
      capitalEfficiency,
      opportunityCoverage,
      portfolioConvexity,
    ]),
  );
  const scores = {
    concentrationRisk: audit(
      concentrationRisk,
      "concentrationRisk = Herfindahl allocation concentration",
      [
        contributor(
          "hhi",
          "Allocation concentration",
          concentrationRisk,
          1,
          "Higher concentration means less diversified capital use.",
        ),
      ],
    ),
    diversificationQuality: audit(
      diversificationQuality,
      "diversificationQuality = concentration control plus group balance minus correlation pressure",
      [
        contributor(
          "concentration",
          "Concentration control",
          Math.max(0, 100 - concentrationRisk),
          0.45,
          "Lower concentration improves diversification.",
        ),
        contributor(
          "correlation",
          "Correlation control",
          Math.max(0, 100 - averageCorrelation * 100),
          0.35,
          "Lower correlation improves diversification.",
        ),
        contributor(
          "group-balance",
          "Group balance",
          groupBalance,
          0.2,
          "Capital spread across opportunity groups.",
        ),
      ],
    ),
    capitalEfficiency: audit(
      capitalEfficiency,
      "capitalEfficiency = normalized expected utility per allocated capital",
      [
        contributor(
          "capital-efficiency",
          "Capital efficiency",
          capitalEfficiency,
          1,
          "Expected value after risk per unit of allocated capital.",
        ),
      ],
    ),
    opportunityCoverage: audit(
      opportunityCoverage,
      "opportunityCoverage = positive opportunities receiving capital divided by positive opportunities available",
      [
        contributor(
          "coverage",
          "Opportunity coverage",
          opportunityCoverage,
          1,
          "How much of the available opportunity set is represented by allocations.",
        ),
      ],
    ),
    portfolioConvexity: audit(
      portfolioConvexity,
      "portfolioConvexity = weighted upside versus downside asymmetry",
      [
        contributor(
          "convexity",
          "Portfolio convexity",
          portfolioConvexity,
          1,
          "Allocations should preserve asymmetric upside relative to downside.",
        ),
      ],
    ),
    allocationQuality: audit(
      allocationQuality,
      "allocationQuality = blend of concentration control, diversification, capital efficiency, coverage, and convexity",
      [
        contributor(
          "concentration-control",
          "Concentration control",
          Math.max(0, 100 - concentrationRisk),
          0.2,
          "Avoid over-allocating to one opportunity.",
        ),
        contributor(
          "diversification",
          "Diversification quality",
          diversificationQuality,
          0.2,
          "Quality of cross-opportunity distribution.",
        ),
        contributor(
          "capital-efficiency",
          "Capital efficiency",
          capitalEfficiency,
          0.25,
          "Expected value per capital unit.",
        ),
        contributor(
          "coverage",
          "Opportunity coverage",
          opportunityCoverage,
          0.2,
          "Participation across useful opportunities.",
        ),
        contributor(
          "convexity",
          "Portfolio convexity",
          portfolioConvexity,
          0.15,
          "Asymmetric outcome profile.",
        ),
      ],
    ),
  };

  return {
    concentrationRisk,
    diversificationQuality,
    capitalEfficiency,
    opportunityCoverage,
    portfolioConvexity,
    allocationQuality,
    contributors: contributorsFrom(scores),
    scores,
    explanation:
      allocationQuality >= 60
        ? "Portfolio allocation is using capital efficiently relative to risk, coverage, and diversification."
        : "Portfolio allocation needs better coverage, diversification, or expected utility per capital unit.",
    formulas: Object.values(scores).map((score) => score.formula),
  };
}

export function evaluateDecisionQuality(
  input: DecisionQualityInput = {},
): DecisionQualityResult {
  const history = input.history ?? [];
  const counterfactuals =
    input.counterfactuals ??
    evaluateCounterfactuals({ decision: input.decision ?? null, history });
  const opportunityEconomics =
    input.opportunityEconomics ?? evaluateOpportunityEconomics();
  const discoveryMaturity =
    input.discoveryMaturity ??
    evaluateDiscoveryMaturity({
      discoveries: discoveryRecordsFrom(input.discovery),
    });
  const agencyEffectiveness =
    input.agencyEffectiveness ?? evaluateAgencyEffectiveness({ history });
  const portfolioIntelligence =
    input.portfolioIntelligence ?? evaluatePortfolioIntelligence();
  const reflectionScore = scoreFromUnknown(
    input.reflection,
    ["reflectionScore", "score"],
    50,
  );
  const survivalScore = scoreFromUnknown(
    input.survivalMemory,
    ["survivalConfidence", "score"],
    50,
  );
  const pruning = pruningAdjustmentFor(input.pruning);
  const meaning = meaningAdjustmentFor(input.meaning);
  const economicsScore = economicsScoreFor(opportunityEconomics);
  const decisionQuality = roundScore(
    mean([
      counterfactuals.decisionQuality,
      economicsScore,
      discoveryMaturity.maturityScore,
      agencyEffectiveness.governanceEffectiveness,
      portfolioIntelligence.allocationQuality,
      reflectionScore,
      survivalScore,
    ]) +
      pruning.robustnessAdjustment * 0.12 -
      pruning.falseConfidenceRisk * 0.08 -
      meaning.decisionPenalty,
  );
  const learningConfidence = roundScore(
    mean([
      counterfactuals.counterfactualConfidence,
      Math.min(100, history.length * 5),
      discoveryMaturity.maturityScore,
      agencyEffectiveness.agencyAccuracy,
    ]) +
      pruning.confidenceAdjustment +
      meaning.confidenceAdjustment,
  );
  const wisdomScore = roundScore(
    mean([
      decisionQuality,
      learningConfidence,
      counterfactuals.restrictionValue,
      Math.max(0, 100 - opportunityEconomics.opportunityCost),
    ]),
  );
  const justifiedConfidence = roundScore(
    learningConfidence -
      pruning.falseConfidenceRisk * 0.32 +
      pruning.evidenceConfidence * 0.12,
  );
  const falseConfidenceRisk = roundScore(
    Math.max(pruning.falseConfidenceRisk, meaning.falseConfidenceRisk),
  );
  const robustnessScore = roundScore(
    mean([
      portfolioIntelligence.diversificationQuality,
      100 - falseConfidenceRisk,
      pruning.evidenceConfidence,
      100 - meaning.falseConfidenceRisk,
    ]),
  );
  const antifragilityScore = roundScore(
    mean([
      survivalScore,
      counterfactuals.restrictionValue,
      pruning.survivalContribution,
      pruning.ignoranceEffectivenessScore,
      meaning.safetyPriority,
    ]),
  );
  const survivalAdjustment = roundScore(
    50 +
      (pruning.survivalContribution - pruning.pruningScore) * 0.35 -
      meaning.falseConfidenceRisk * 0.18,
  );
  const recommendedAction = wisdomRecommendedAction(
    opportunityEconomics.bestOption,
    pruning,
    meaning,
  );
  const scores = {
    decisionQuality: audit(
      decisionQuality,
      "decisionQuality = mean counterfactual quality, economics, discovery maturity, agency effectiveness, portfolio quality, reflection, and survival evidence",
      [
        contributor(
          "counterfactuals",
          "Counterfactual decision quality",
          counterfactuals.decisionQuality,
          0.2,
          "How the actual outcome compares with alternatives.",
        ),
        contributor(
          "economics",
          "Opportunity economics",
          economicsScore,
          0.16,
          "Whether acting, waiting, rejecting, or scaling had the best expected utility.",
        ),
        contributor(
          "discovery",
          "Discovery maturity",
          discoveryMaturity.maturityScore,
          0.14,
          "Evidence-backed maturity of the opportunity source.",
        ),
        contributor(
          "agency",
          "Agency effectiveness",
          agencyEffectiveness.governanceEffectiveness,
          0.14,
          "Whether governance improved outcomes.",
        ),
        contributor(
          "portfolio",
          "Portfolio intelligence",
          portfolioIntelligence.allocationQuality,
          0.14,
          "Portfolio-level capital allocation quality.",
        ),
        contributor(
          "reflection",
          "Reflection",
          reflectionScore,
          0.11,
          "Reflection quality supplied by the caller.",
        ),
        contributor(
          "survival",
          "Survival memory",
          survivalScore,
          0.11,
          "Long-term survival evidence supplied by the caller.",
        ),
        contributor(
          "pruning",
          "Pruning restraint",
          100 - pruning.falseConfidenceRisk,
          0.08,
          "Whether noisy, stale, redundant, or overfit evidence has been restrained.",
        ),
        contributor(
          "meaning",
          "Meaning alignment",
          100 - meaning.falseConfidenceRisk,
          0.08,
          "Whether the desire has been transformed into a safe positive goal.",
        ),
      ],
    ),
    wisdomScore: audit(
      wisdomScore,
      "wisdomScore = mean decision quality, learning confidence, restriction value, and low opportunity cost",
      [
        contributor(
          "decision-quality",
          "Decision quality",
          decisionQuality,
          0.35,
          "Composite quality of this decision.",
        ),
        contributor(
          "learning-confidence",
          "Learning confidence",
          learningConfidence,
          0.25,
          "Confidence that outcome history is sufficient.",
        ),
        contributor(
          "restriction-value",
          "Restriction value",
          counterfactuals.restrictionValue,
          0.2,
          "Whether restrictions are creating value.",
        ),
        contributor(
          "opportunity-cost-control",
          "Opportunity cost control",
          Math.max(0, 100 - opportunityEconomics.opportunityCost),
          0.2,
          "Whether caution is not too costly.",
        ),
      ],
    ),
    learningConfidence: audit(
      learningConfidence,
      "learningConfidence = counterfactual confidence, memory depth, discovery maturity, and agency accuracy",
      [
        contributor(
          "counterfactual-confidence",
          "Counterfactual confidence",
          counterfactuals.counterfactualConfidence,
          0.35,
          "Quality of alternative outcome evidence.",
        ),
        contributor(
          "memory-depth",
          "Memory depth",
          Math.min(100, history.length * 5),
          0.25,
          "Persisted outcome records.",
        ),
        contributor(
          "discovery-maturity",
          "Discovery maturity",
          discoveryMaturity.maturityScore,
          0.2,
          "Mature discovery histories increase confidence.",
        ),
        contributor(
          "agency-accuracy",
          "Agency accuracy",
          agencyEffectiveness.agencyAccuracy,
          0.2,
          "Agency outcome correctness.",
        ),
        contributor(
          "pruning-evidence",
          "Pruning evidence",
          pruning.evidenceConfidence,
          0.1,
          "Pruning cannot increase confidence when evidence is weak.",
        ),
        contributor(
          "meaning-confidence",
          "Meaning confidence",
          meaning.needConfidence * 100,
          0.1,
          "Low need confidence lowers learning confidence.",
        ),
      ],
    ),
  };

  return {
    decisionQuality,
    wisdomScore,
    learningConfidence,
    counterfactuals,
    opportunityEconomics,
    discoveryMaturity,
    agencyEffectiveness,
    portfolioIntelligence,
    contributors: contributorsFrom(scores),
    scores,
    sourceModules: unique([
      ...sourceModulesFor(input),
      ...(input.pruning ? ["pruning"] : []),
      ...(input.meaning ? ["meaning"] : []),
      "counterfactuals",
      "opportunityEconomics",
      "discoveryMaturity",
      "agencyEffectiveness",
      "portfolioIntelligence",
    ]),
    justifiedConfidence,
    falseConfidenceRisk,
    robustnessScore,
    antifragilityScore,
    recommendedAction,
    survivalAdjustment,
    ...(input.pruning ? { pruning } : {}),
    ...(input.meaning ? { meaning } : {}),
    explanation: `Wisdom score is ${wisdomScore}/100 with decision quality ${decisionQuality}/100, learning confidence ${learningConfidence}/100, false-confidence risk ${falseConfidenceRisk}/100, and Meaning gravity ${meaning.gravityScore}/10.`,
    formulas: [
      ...Object.values(scores).map((score) => score.formula),
      "justifiedConfidence = learning confidence adjusted down by pruning false-confidence risk and weak evidence",
      "robustnessScore = diversification, pruning evidence confidence, and low false-confidence risk",
      "recommendedAction escalates review when pruning finds ignored, quarantined, stale, noisy, or low-evidence drivers",
      "meaningAdjustment reduces confidence and escalates review when literal desire is unsafe or ambiguous",
    ],
  };
}

export function recordOutcome(
  input:
    | DecisionOutcomeRecord
    | { memory?: DecisionOutcomeMemory; record: DecisionOutcomeRecord },
): RecordOutcomeResult {
  const memory =
    "record" in input
      ? (input.memory ?? createDecisionOutcomeMemory())
      : createDecisionOutcomeMemory();
  const record = "record" in input ? input.record : input;
  const stored = memory.record(record);
  const history = memory.all();
  const counterfactuals = evaluateCounterfactuals({
    decision: stored,
    history,
  });
  const decisionQuality = evaluateDecisionQuality({
    decision: stored,
    history,
    counterfactuals,
  });

  return {
    record: stored,
    counterfactuals,
    decisionQuality,
    memorySize: history.length,
  };
}

export function buildWisdomSummary(
  input: WisdomSummaryInput = {},
): WisdomSummary {
  const records = input.records ?? input.history ?? [];
  const counterfactuals =
    input.counterfactuals ?? aggregateCounterfactuals(records);
  const opportunityEconomics =
    input.opportunityEconomics ?? evaluateOpportunityEconomics();
  const discoveryMaturity =
    input.discoveryMaturity ??
    evaluateDiscoveryMaturity({
      discoveries: input.discoveries ?? discoveryRecordsFrom(input.discovery),
    });
  const agencyEffectiveness =
    input.agencyEffectiveness ??
    evaluateAgencyEffectiveness({
      events: input.agencyEvents,
      history: records,
    });
  const portfolioIntelligence =
    input.portfolioIntelligence ??
    evaluatePortfolioIntelligence(input.portfolio);
  const decisionQuality = evaluateDecisionQuality({
    ...input,
    history: records,
    counterfactuals,
    opportunityEconomics,
    discoveryMaturity,
    agencyEffectiveness,
    portfolioIntelligence,
  });
  const delayed = records.filter(
    (record) => normalized(record.status) === "delayed",
  );
  const delayedCounterfactuals = delayed.map((record) =>
    evaluateCounterfactuals({ decision: record, history: records }),
  );
  const delayedMissedUpside = sum(
    delayedCounterfactuals.map((item) => item.missedUpside),
  );
  const delayedAvoidedLoss = sum(
    delayedCounterfactuals.map((item) => item.avoidedLoss),
  );
  const summary = [
    `Restrictions saved ${roundNumber(counterfactuals.avoidedLoss)} outcome-risk points while sacrificing ${roundNumber(counterfactuals.missedUpside)} opportunity points.`,
    `Delayed decisions sacrificed ${roundNumber(delayedMissedUpside)} opportunity points while reducing adverse impact by ${roundNumber(delayedAvoidedLoss)} points.`,
    `Agency interventions improved outcome quality by ${roundNumber(agencyEffectiveness.interventionValue)} points with ${roundNumber(agencyEffectiveness.governanceEffectiveness)} governance effectiveness.`,
    `Portfolio allocation quality is ${roundNumber(portfolioIntelligence.allocationQuality)}/100 with ${roundNumber(portfolioIntelligence.capitalEfficiency)}/100 capital efficiency.`,
  ];

  return {
    wisdomSummary: summary,
    counterfactualReview: {
      actualOutcome: counterfactuals.actualOutcome ?? null,
      bestAlternative: counterfactuals.bestAlternative,
      worstAlternative: counterfactuals.worstAlternative,
      decisionQuality: counterfactuals.decisionQuality,
    },
    opportunityEconomics: {
      actionValue: opportunityEconomics.actionValue,
      waitValue: opportunityEconomics.waitValue,
      rejectValue: opportunityEconomics.rejectValue,
      scaleValue: opportunityEconomics.scaleValue,
      urgencyCost: opportunityEconomics.urgencyCost,
      opportunityCost: opportunityEconomics.opportunityCost,
      bestOption: opportunityEconomics.bestOption,
    },
    discoveryMaturity: {
      maturityScore: discoveryMaturity.maturityScore,
      recurrenceRate: discoveryMaturity.recurrenceRate,
      noveltyPersistence: discoveryMaturity.noveltyPersistence,
      conversionRate: discoveryMaturity.conversionRate,
      trustedDiscoveries: discoveryMaturity.trustedDiscoveries,
      lifecycle: discoveryMaturity.lifecycle,
    },
    agencyEffectiveness: {
      agencyAccuracy: agencyEffectiveness.agencyAccuracy,
      interventionValue: agencyEffectiveness.interventionValue,
      approvalQuality: agencyEffectiveness.approvalQuality,
      rejectionQuality: agencyEffectiveness.rejectionQuality,
      governanceEffectiveness: agencyEffectiveness.governanceEffectiveness,
    },
    portfolioIntelligence: {
      concentrationRisk: portfolioIntelligence.concentrationRisk,
      diversificationQuality: portfolioIntelligence.diversificationQuality,
      capitalEfficiency: portfolioIntelligence.capitalEfficiency,
      opportunityCoverage: portfolioIntelligence.opportunityCoverage,
      portfolioConvexity: portfolioIntelligence.portfolioConvexity,
      allocationQuality: portfolioIntelligence.allocationQuality,
    },
    contributors: decisionQuality.contributors,
    explanation: decisionQuality.explanation,
  };
}

function normalizeRecord(
  record: DecisionOutcomeRecord,
  index: number,
): DecisionOutcomeRecord {
  return {
    ...copy(record),
    id: record.id?.trim() || `decision-outcome-${index + 1}`,
    action: record.action?.trim() || "unknown-action",
    status: record.status ?? "observed",
    alternatives: (record.alternatives ?? []).map(
      (alternative, alternativeIndex) => ({
        ...alternative,
        id: alternative.id?.trim() || `alternative-${alternativeIndex + 1}`,
        label:
          alternative.label?.trim() ||
          labelForAlternative(alternative, alternativeIndex),
        action: alternative.action?.trim() || alternative.kind || "alternative",
      }),
    ),
  };
}

function recordFromCounterfactualInput(
  input: WisdomCounterfactualInput,
): DecisionOutcomeRecord {
  const actual = input.actual;
  const outcome = isAlternative(actual)
    ? (actual.realizedResult ?? actual.counterfactualResult)
    : actual;
  return normalizeRecord(
    {
      action:
        input.action ?? (isAlternative(actual) ? actual.action : undefined),
      status: input.status ?? "observed",
      realizedResult: outcome ?? undefined,
      alternatives: input.alternatives ?? [],
    },
    0,
  );
}

function reviewActualScenario(
  record: DecisionOutcomeRecord,
  input: WisdomCounterfactualInput,
): WisdomReviewedScenario {
  const actualAlternative = isAlternative(input.actual) ? input.actual : null;
  const result =
    record.realizedResult ??
    record.futureOutcome ??
    actualAlternative?.realizedResult ??
    actualAlternative?.counterfactualResult;
  const fallback = actualAlternative ? expectedUtility(actualAlternative) : 0;
  const utility = outcomeUtility(result, fallback);

  return {
    id: record.id ?? "actual",
    label: "Actual outcome",
    action: record.action ?? "actual",
    kind: "actual",
    utility,
    reward: rewardFor(result, fallback),
    cost: costFor(result),
    adverseImpact: adverseImpactFor(result, utility),
    confidence: score(
      result?.confidence,
      actualAlternative?.expectedConfidence ?? 50,
    ),
  };
}

function reviewAlternativeScenario(
  alternative: WisdomAlternativeScenario,
  index: number,
): WisdomReviewedScenario {
  const result = alternative.realizedResult ?? alternative.counterfactualResult;
  const fallback = expectedUtility(alternative);
  const utility = outcomeUtility(result, fallback);

  return {
    id: alternative.id ?? `alternative-${index + 1}`,
    label: alternative.label ?? labelForAlternative(alternative, index),
    action: alternative.action ?? alternative.kind ?? "alternative",
    kind: alternative.kind ?? "alternative",
    utility,
    reward: rewardFor(
      result,
      numeric(
        alternative.expectedReward ?? alternative.expectedValue,
        fallback,
      ),
    ),
    cost: costFor(result, numeric(alternative.expectedCost, 0)),
    adverseImpact: adverseImpactFor(
      result,
      utility,
      numeric(alternative.expectedRisk, Math.max(0, -fallback)),
    ),
    confidence: score(result?.confidence, alternative.expectedConfidence ?? 50),
  };
}

function expectedUtility(alternative: WisdomAlternativeScenario) {
  const reward = numeric(
    alternative.expectedReward ?? alternative.expectedValue,
    0,
  );
  const cost = numeric(alternative.expectedCost, 0);
  const risk = numeric(alternative.expectedRisk, 0);
  const scale = numeric(alternative.scale, 1);
  const confidence = score(alternative.expectedConfidence, 100) / 100;
  return roundNumber((reward * confidence - cost - risk) * scale);
}

function outcomeUtility(result?: WisdomOutcomeResult, fallback = 0) {
  if (!result) return roundNumber(fallback);
  const explicit = Number(result.value);
  if (Number.isFinite(explicit)) return roundNumber(explicit);
  const reward = numeric(result.reward, fallback);
  const cost = numeric(result.cost, 0);
  const risk = numeric(result.risk ?? result.adverseImpact, 0);
  return roundNumber(reward - cost - risk);
}

function rewardFor(result: WisdomOutcomeResult | undefined, fallback = 0) {
  if (!result) return roundNumber(Math.max(0, fallback));
  return roundNumber(numeric(result.reward ?? result.value, fallback));
}

function costFor(result: WisdomOutcomeResult | undefined, fallback = 0) {
  if (!result) return roundNumber(fallback);
  return roundNumber(numeric(result.cost, fallback));
}

function adverseImpactFor(
  result: WisdomOutcomeResult | undefined,
  utility: number,
  fallback = 0,
) {
  if (!result) return roundNumber(Math.max(fallback, -utility, 0));
  return roundNumber(
    Math.max(
      0,
      numeric(
        result.adverseImpact ?? result.risk,
        Math.max(fallback, -utility, 0),
      ),
    ),
  );
}

function counterfactualConfidenceFor(input: {
  alternatives: WisdomReviewedScenario[];
  history: DecisionOutcomeRecord[];
  actualOutcome: WisdomReviewedScenario;
}) {
  const coverage = coverageFor(input.alternatives);
  const memoryDepth = Math.min(100, input.history.length * 5);
  const consistency = Math.max(
    0,
    100 -
      stdev(
        [input.actualOutcome, ...input.alternatives].map(
          (scenario) => scenario.utility,
        ),
      ) *
        8,
  );
  return roundScore(coverage * 0.45 + memoryDepth * 0.35 + consistency * 0.2);
}

function coverageFor(alternatives: WisdomReviewedScenario[]) {
  if (!alternatives.length) return 0;
  const covered = alternatives.filter(
    (alternative) =>
      alternative.confidence > 0 && Number.isFinite(alternative.utility),
  ).length;
  return roundScore((covered / alternatives.length) * 100);
}

function economicValue(
  key: string,
  option: OpportunityEconomicsOption | undefined,
  riskPenalty: number,
) {
  const reward = numeric(option?.expectedReward, 0);
  const cost = numeric(option?.expectedCost, 0);
  const risk = numeric(option?.expectedRisk, 0);
  const confidence = score(option?.confidence, option ? 100 : 0) / 100;
  const utility = roundNumber(reward * confidence - cost - risk * riskPenalty);

  return {
    key,
    reward,
    cost,
    risk,
    confidence: roundScore(confidence * 100),
    utility,
  };
}

function optionAudit(option: ReturnType<typeof economicValue>) {
  return audit(
    option.utility,
    `${option.key}Value = expected reward * confidence - expected cost - expected risk * risk penalty`,
    [
      contributor(
        `${option.key}-reward`,
        "Expected reward",
        option.reward,
        0.45,
        "Reward expected from this option.",
      ),
      contributor(
        `${option.key}-confidence`,
        "Confidence",
        option.confidence,
        0.2,
        "Confidence applied to expected reward.",
      ),
      contributor(
        `${option.key}-cost`,
        "Expected cost",
        option.cost,
        -0.2,
        "Direct cost expected from this option.",
      ),
      contributor(
        `${option.key}-risk`,
        "Expected risk",
        option.risk,
        -0.15,
        "Adverse impact expected from this option.",
      ),
    ],
  );
}

function selectedEconomicsKey(
  value: unknown,
): OpportunityEconomicsResult["bestOption"] {
  const normalizedValue = normalized(value);
  if (
    normalizedValue === "wait" ||
    normalizedValue === "reject" ||
    normalizedValue === "scale"
  )
    return normalizedValue;
  return "action";
}

function reviewDiscovery(
  discovery: WisdomDiscoveryRecord,
  index: number,
  now: number,
) {
  const detected = toTime(discovery.detectedAt) ?? now;
  const ageDays = Math.max(0, (now - detected) / 86_400_000);
  const confirmations = Math.max(
    0,
    Math.round(
      numeric(discovery.confirmationCount, discovery.confirmedAt ? 1 : 0),
    ),
  );
  const observations = Math.max(
    1,
    Math.round(
      numeric(discovery.observationCount ?? discovery.opportunityCount, 1),
    ),
  );
  const recurrences = Math.max(
    0,
    Math.round(numeric(discovery.recurrenceCount, 0)),
  );
  const conversions = Math.max(
    0,
    Math.round(numeric(discovery.conversionCount, observations)),
  );
  const successes = Math.max(0, Math.round(numeric(discovery.successCount, 0)));
  const ageScore = clamp(ageDays * 2.5);
  const confirmationScore = clamp(confirmations * 16);
  const recurrenceScore = pct(recurrences, observations, 0);
  const conversionScore = pct(successes, conversions, 0);
  const noveltyPersistence = roundScore(
    Math.max(
      0,
      score(discovery.novelty, 50) - ageDays * 0.8 + recurrenceScore * 0.25,
    ),
  );
  const suppliedMaturity = optionalScore(discovery.maturityScore);
  const maturityScore = roundScore(
    suppliedMaturity ??
      mean([
        ageScore * 0.18,
        confirmationScore * 0.26,
        recurrenceScore * 0.22,
        conversionScore * 0.22,
        noveltyPersistence * 0.12,
      ]) * 5,
  );
  const stage = lifecycleStageFor(
    discovery.status,
    maturityScore,
    confirmations,
    recurrences,
  );

  return {
    id: discovery.id ?? `discovery-${index + 1}`,
    stage,
    ageScore,
    confirmations,
    confirmationScore,
    recurrences,
    observations,
    conversions,
    successes,
    noveltyPersistence,
    maturityScore,
  };
}

function lifecycleStageFor(
  status: WisdomDiscoveryRecord["status"],
  maturityScore: number,
  confirmations: number,
  recurrences: number,
): DiscoveryLifecycleStage {
  const normalizedStatus = normalized(status);
  const direct = DISCOVERY_STAGES.find(
    (stage) => normalized(stage) === normalizedStatus,
  );
  if (direct) return direct;
  if (maturityScore >= 90 && recurrences >= 10) return "Institutional";
  if (maturityScore >= 75 && confirmations >= 4) return "Trusted";
  if (maturityScore >= 60 && recurrences >= 3) return "Repeatable";
  if (maturityScore >= 40 && confirmations >= 1) return "Confirmed";
  if (maturityScore >= 20) return "Observed";
  return "Detected";
}

function lifecycleCounts(stages: DiscoveryLifecycleStage[]) {
  return DISCOVERY_STAGES.map((stage) => ({
    stage,
    count: stages.filter((candidate) => candidate === stage).length,
  }));
}

function agencyEventsFromHistory(
  history: DecisionOutcomeRecord[],
): AgencyEffectivenessEvent[] {
  return history.map((record, index) => ({
    id: record.id ?? `agency-event-${index + 1}`,
    action: agencyActionFromStatus(record.status),
    realizedResult: record.realizedResult ?? record.futureOutcome,
    counterfactualResult:
      record.counterfactualResult ??
      bestCounterfactualResult(record.alternatives),
    frictionCost: numeric(
      (record.context?.frictionCost as number | undefined) ?? 0,
      0,
    ),
  }));
}

function agencyActionFromStatus(status: unknown) {
  const value = normalized(status);
  if (value === "approved") return "approved";
  if (value === "blocked") return "blocked";
  if (value === "rejected") return "rejected";
  if (value === "delayed" || value === "reduced-size") return "intervened";
  return "approved";
}

function bestCounterfactualResult(
  alternatives: WisdomAlternativeScenario[] | undefined,
) {
  const reviewed = (alternatives ?? []).map((alternative, index) =>
    reviewAlternativeScenario(alternative, index),
  );
  return reviewed.length
    ? { value: maxBy(reviewed, (scenario) => scenario.utility).utility }
    : undefined;
}

function rejectionDelta(event: AgencyEffectivenessEvent) {
  const actual = outcomeUtility(event.realizedResult, 0);
  const counterfactual = outcomeUtility(event.counterfactualResult, 0);
  return actual - counterfactual;
}

function interventionDelta(event: AgencyEffectivenessEvent) {
  const actual = outcomeUtility(event.realizedResult, 0);
  const baseline = outcomeUtility(
    event.baselineResult ?? event.counterfactualResult,
    0,
  );
  return actual - baseline;
}

function agencyCorrectness(event: AgencyEffectivenessEvent) {
  const action = normalized(event.action);
  if (action === "approved")
    return outcomeUtility(event.realizedResult, 0) >= 0 ? 100 : 0;
  if (action === "rejected" || action === "blocked")
    return rejectionDelta(event) >= 0 ? 100 : 0;
  if (
    action === "intervened" ||
    action === "overridden" ||
    event.override === true
  )
    return interventionDelta(event) >= 0 ? 100 : 0;
  return 50;
}

function qualityScore(values: number[]) {
  if (!values.length) return 50;
  return roundScore(50 + mean(values) * 10);
}

function allocationsFor(
  allocations: PortfolioIntelligenceInput["currentAllocations"],
  opportunities: WisdomPortfolioOpportunity[],
): WisdomAllocation[] {
  if (Array.isArray(allocations))
    return allocations.map((allocation) => ({
      id: allocation.id,
      amount: Math.max(0, numeric(allocation.amount, 0)),
    }));
  if (allocations && typeof allocations === "object") {
    return Object.entries(allocations).map(([id, amount]) => ({
      id,
      amount: Math.max(0, numeric(amount, 0)),
    }));
  }
  return opportunities.map((opportunity) => ({
    id: opportunity.id,
    amount: Math.max(0, numeric(opportunity.allocation, 0)),
  }));
}

function totalCapitalFor(
  constraints: PortfolioIntelligenceInput["capitalConstraints"],
  allocations: WisdomAllocation[],
  opportunities: WisdomPortfolioOpportunity[],
) {
  return Math.max(
    numeric(constraints?.availableCapital, 0),
    numeric(constraints?.usedCapital, 0),
    sum(allocations.map((allocation) => allocation.amount)),
    sum(opportunities.map((opportunity) => numeric(opportunity.allocation, 0))),
    0,
  );
}

function averageCorrelationFor(
  correlation: PortfolioIntelligenceInput["correlationStructure"],
) {
  if (!correlation) return 0;
  if (Array.isArray(correlation))
    return mean(
      correlation.map((item) => Math.abs(numeric(item.correlation, 0))),
    );
  const values: number[] = [];
  for (const row of Object.values(correlation)) {
    values.push(
      ...Object.values(row).map((value) => Math.abs(numeric(value, 0))),
    );
  }
  return mean(values);
}

function groupBalanceFor(
  opportunities: WisdomPortfolioOpportunity[],
  allocations: WisdomAllocation[],
) {
  if (!opportunities.length || !allocations.length) return 0;
  const byId = new Map(
    opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const groupTotals = new Map<string, number>();
  for (const allocation of allocations) {
    const group = byId.get(allocation.id)?.group ?? "ungrouped";
    groupTotals.set(group, (groupTotals.get(group) ?? 0) + allocation.amount);
  }
  const totals = Array.from(groupTotals.values());
  const total = sum(totals);
  if (total <= 0) return 0;
  const hhi = totals.reduce((acc, value) => acc + (value / total) ** 2, 0);
  return roundScore((1 - hhi) * 100);
}

function averageAllocatedUtility(
  opportunities: WisdomPortfolioOpportunity[],
  allocations: WisdomAllocation[],
) {
  if (!opportunities.length || !allocations.length) return 0;
  const byId = new Map(
    opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const weighted = allocations.map((allocation) => {
    const opportunity = byId.get(allocation.id);
    if (!opportunity) return 0;
    const utility =
      numeric(opportunity.expectedValue ?? opportunity.expectedReward, 0) -
      numeric(opportunity.expectedRisk, 0);
    return utility * allocation.amount;
  });
  return (
    sum(weighted) /
    Math.max(1, sum(allocations.map((allocation) => allocation.amount)))
  );
}

function coverageScoreFor(
  opportunities: WisdomPortfolioOpportunity[],
  allocations: WisdomAllocation[],
  minimumCoverage = 0,
) {
  const positive = opportunities.filter(
    (opportunity) =>
      numeric(opportunity.expectedValue ?? opportunity.expectedReward, 0) -
        numeric(opportunity.expectedRisk, 0) >
      0,
  );
  if (!positive.length) return 100;
  const allocated = new Set(
    allocations
      .filter((allocation) => allocation.amount > 0)
      .map((allocation) => allocation.id),
  );
  const coverage =
    (positive.filter((opportunity) => allocated.has(opportunity.id)).length /
      positive.length) *
    100;
  return roundScore(Math.max(coverage, Math.min(coverage, minimumCoverage)));
}

function convexityScoreFor(
  opportunities: WisdomPortfolioOpportunity[],
  allocations: WisdomAllocation[],
) {
  if (!opportunities.length || !allocations.length) return 50;
  const byId = new Map(
    opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const total = Math.max(
    1,
    sum(allocations.map((allocation) => allocation.amount)),
  );
  const scoreValue = sum(
    allocations.map((allocation) => {
      const opportunity = byId.get(allocation.id);
      if (!opportunity) return 0;
      const upside = numeric(
        opportunity.upside ??
          opportunity.expectedReward ??
          opportunity.expectedValue,
        0,
      );
      const downside = Math.max(
        0.0001,
        numeric(opportunity.downside ?? opportunity.expectedRisk, 1),
      );
      return (
        clamp(50 + ((upside - downside) / Math.max(upside, downside, 1)) * 50) *
        (allocation.amount / total)
      );
    }),
  );
  return roundScore(scoreValue);
}

function discoveryRecordsFrom(value: unknown): WisdomDiscoveryRecord[] {
  if (Array.isArray(value)) return value as WisdomDiscoveryRecord[];
  if (value && typeof value === "object")
    return [value as WisdomDiscoveryRecord];
  return [];
}

function economicsScoreFor(economics: OpportunityEconomicsResult) {
  const selectedValue = economics.actionValue;
  const bestValue = Math.max(
    economics.actionValue,
    economics.waitValue,
    economics.rejectValue,
    economics.scaleValue,
  );
  if (bestValue === 0 && selectedValue === 0) return 50;
  return roundScore(100 - Math.max(0, bestValue - selectedValue));
}

function pruningAdjustmentFor(
  input: DecisionQualityInput["pruning"],
): WisdomPruningAdjustment {
  if (!input) {
    return {
      pruningScore: 0,
      ignoranceEffectivenessScore: 100,
      evidenceConfidence: 100,
      falseConfidenceRisk: 0,
      robustnessAdjustment: 0,
      confidenceAdjustment: 0,
      recommendedAction: "keep",
      survivalContribution: 50,
      warnings: [],
    };
  }
  const candidates = Array.isArray(input)
    ? input
    : Array.isArray(input.candidates)
      ? input.candidates
      : [input];
  const fallbackSource = Array.isArray(input) ? {} : input;
  const recommendedAction = strongestPruningAction(
    candidates
      .map((candidate) => candidate.recommendedAction)
      .filter(Boolean) as PruningRecommendedAction[],
  );
  const pruningScore = scoreMean(candidates, "pruningScore", fallbackSource);
  const ignoranceEffectivenessScore = scoreMean(
    candidates,
    "ignoranceEffectivenessScore",
    fallbackSource,
    50,
  );
  const evidenceConfidence = scoreMean(
    candidates,
    "evidenceConfidence",
    fallbackSource,
    50,
  );
  const overfitPenalty = scoreMean(
    candidates,
    "overfitPenalty",
    fallbackSource,
  );
  const noisePenalty = scoreMean(candidates, "noisePenalty", fallbackSource);
  const clarityPenalty = scoreMean(
    candidates,
    "clarityPenalty",
    fallbackSource,
  );
  const survivalContribution = Math.max(
    ...candidates.map((candidate) => score(candidate.survivalContribution, 50)),
    score(fallbackSource.survivalContribution, 50),
  );
  const weakEvidence = clamp(100 - evidenceConfidence);
  const actionRisk =
    recommendedAction === "ignore"
      ? 18
      : recommendedAction === "quarantine"
        ? 24
        : recommendedAction === "review"
          ? 10
          : 0;
  const falseConfidenceRisk = roundScore(
    pruningScore * 0.26 +
      overfitPenalty * 0.24 +
      noisePenalty * 0.18 +
      clarityPenalty * 0.08 +
      weakEvidence * 0.2 +
      actionRisk -
      survivalContribution * 0.06,
  );
  const robustnessAdjustment =
    roundScore(
      ignoranceEffectivenessScore * 0.18 +
        evidenceConfidence * 0.14 -
        overfitPenalty * 0.22 -
        noisePenalty * 0.1 -
        pruningScore * 0.08,
    ) - 20;
  const confidenceAdjustment = -roundScore(
    falseConfidenceRisk * 0.2 + weakEvidence * 0.08,
  );
  const warnings = unique(
    candidates.flatMap((candidate) =>
      Array.isArray(candidate.warnings) ? candidate.warnings : [],
    ),
  );

  return {
    pruningScore,
    ignoranceEffectivenessScore,
    evidenceConfidence,
    falseConfidenceRisk,
    robustnessAdjustment,
    confidenceAdjustment,
    recommendedAction,
    survivalContribution,
    warnings,
  };
}

function meaningAdjustmentFor(
  input: DecisionQualityInput["meaning"],
): WisdomMeaningAdjustment {
  if (!input || typeof input !== "object") {
    return {
      gravityScore: 0,
      needConfidence: 0.7,
      falseConfidenceRisk: 0,
      confidenceAdjustment: 0,
      decisionPenalty: 0,
      safetyPriority: 50,
      recommendedAction: "allow",
      warnings: [],
    };
  }
  const gravityScore = clamp(
    numeric(input.gravityScore, input.purposeInputs?.gravityScore ?? 0),
    -10,
    10,
  );
  const needConfidence = clamp(
    numeric(input.needConfidence, input.purposeInputs?.needConfidence ?? 0.5),
    0,
    1,
  );
  const literalDesireUnsafe = Boolean(
    input.purposeInputs?.literalDesireUnsafe ?? gravityScore <= -5,
  );
  const safetyPriority = clamp(
    numeric(
      input.purposeInputs?.safetyPriority,
      55 + Math.max(0, -gravityScore) * 5,
    ),
  );
  const falseConfidenceRisk = roundScore(
    Math.max(0, -gravityScore) * 7 +
      Math.max(0, 0.55 - needConfidence) * 65 +
      (literalDesireUnsafe ? 12 : 0),
  );
  const confidenceAdjustment = -roundScore(
    falseConfidenceRisk * 0.22 + Math.max(0, 0.65 - needConfidence) * 20,
  );
  const decisionPenalty = roundScore(
    falseConfidenceRisk * 0.08 + (literalDesireUnsafe ? 4 : 0),
  );
  const recommendedAction =
    gravityScore <= -9
      ? "block"
      : gravityScore <= -7 || needConfidence < 0.45
        ? "review"
        : gravityScore <= -5
          ? "scale"
          : "allow";

  return {
    gravityScore,
    needConfidence,
    falseConfidenceRisk,
    confidenceAdjustment,
    decisionPenalty,
    safetyPriority,
    recommendedAction,
    warnings: [
      ...safeStrings(input.riskWarnings),
      ...(literalDesireUnsafe
        ? [
            "Meaning transformed an unsafe literal desire; Wisdom must not optimize the literal request.",
          ]
        : []),
      ...(needConfidence < 0.45
        ? ["Meaning confidence is low; Wisdom should escalate review."]
        : []),
    ],
  };
}

function wisdomRecommendedAction(
  bestOption: OpportunityEconomicsResult["bestOption"],
  pruning: WisdomPruningAdjustment,
  meaning: WisdomMeaningAdjustment,
) {
  if (meaning.recommendedAction === "block") return "review";
  if (meaning.recommendedAction === "review") return "review";
  if (meaning.recommendedAction === "scale")
    return bestOption === "action" ? "scale" : bestOption;
  if (pruning.recommendedAction === "quarantine") return "review";
  if (pruning.recommendedAction === "ignore") return "review";
  if (pruning.recommendedAction === "review") return "review";
  if (pruning.recommendedAction === "reduce")
    return bestOption === "action" ? "scale" : bestOption;
  if (pruning.evidenceConfidence < 40) return "review";
  return bestOption;
}

function strongestPruningAction(actions: PruningRecommendedAction[]) {
  if (!actions.length) return "keep";
  return (
    actions.sort(
      (left, right) => pruningActionRank(right) - pruningActionRank(left),
    )[0] ?? "keep"
  );
}

function pruningActionRank(action: PruningRecommendedAction) {
  if (action === "ignore") return 6;
  if (action === "quarantine") return 5;
  if (action === "review") return 4;
  if (action === "isolate") return 3;
  if (action === "reduce") return 2;
  return 1;
}

function scoreMean(
  candidates: Array<Partial<PruningCandidateAssessment>>,
  key: keyof PruningCandidateAssessment,
  fallbackSource: Partial<PruningResult> | Partial<PruningCandidateAssessment>,
  fallback = 0,
) {
  const direct = score(
    (fallbackSource as Record<string, unknown>)[key as string],
    fallback,
  );
  const values = candidates
    .map((candidate) =>
      optionalScore((candidate as Record<string, unknown>)[key as string]),
    )
    .filter((value): value is number => value != null);
  return values.length ? roundScore(mean(values)) : direct;
}

function sourceModulesFor(input: DecisionQualityInput) {
  return Object.entries({
    reflection: input.reflection,
    agency: input.agency,
    survivalMemory: input.survivalMemory,
    discovery: input.discovery,
    counterfactuals: input.counterfactuals,
    opportunityEconomics: input.opportunityEconomics,
    discoveryMaturity: input.discoveryMaturity,
    agencyEffectiveness: input.agencyEffectiveness,
    portfolioIntelligence: input.portfolioIntelligence,
  })
    .filter(([, value]) => value != null)
    .map(([key]) => key);
}

function aggregateCounterfactuals(records: DecisionOutcomeRecord[]) {
  if (!records.length) return evaluateCounterfactuals();
  const reviewed = records.map((record) =>
    evaluateCounterfactuals({ decision: record, history: records }),
  );
  const base = reviewed[0];
  return {
    ...base,
    decisionQuality: roundScore(
      mean(reviewed.map((item) => item.decisionQuality)),
    ),
    avoidedLoss: roundScore(sum(reviewed.map((item) => item.avoidedLoss))),
    missedUpside: roundScore(sum(reviewed.map((item) => item.missedUpside))),
    restrictionValue: roundScore(
      mean(reviewed.map((item) => item.restrictionValue)),
    ),
    counterfactualConfidence: roundScore(
      mean(reviewed.map((item) => item.counterfactualConfidence)),
    ),
    explanation: `Aggregated ${records.length} wisdom outcome records.`,
  };
}

function scoreFromUnknown(value: unknown, keys: string[], fallback: number) {
  if (!value || typeof value !== "object") return fallback;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    const numberValue = optionalScore(candidate);
    if (numberValue != null) return numberValue;
  }
  return fallback;
}

function deterministicNow(
  discoveries: WisdomDiscoveryRecord[],
  now: DiscoveryMaturityInput["now"],
) {
  const explicit = toTime(now);
  if (explicit != null) return explicit;
  const times = discoveries
    .flatMap((discovery) => [
      toTime(discovery.detectedAt),
      toTime(discovery.observedAt),
      toTime(discovery.confirmedAt),
    ])
    .filter((value): value is number => value != null);
  return times.length ? Math.max(...times) : 0;
}

function isRestricted(status: unknown) {
  return [
    "blocked",
    "delayed",
    "reduced-size",
    "reduced size",
    "rejected",
  ].includes(normalized(status));
}

function isAlternative(value: unknown): value is WisdomAlternativeScenario {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("expectedReward" in value ||
        "expectedValue" in value ||
        "kind" in value),
  );
}

function counterfactualExplanation(
  decisionQuality: number,
  avoidedLoss: number,
  missedUpside: number,
  restrictionValue: number,
) {
  if (restrictionValue >= 65)
    return `Restrictions appear valuable: avoided loss ${avoidedLoss}/100 exceeds missed upside ${missedUpside}/100.`;
  if (missedUpside > avoidedLoss)
    return `Caution is costly: missed upside ${missedUpside}/100 exceeds avoided loss ${avoidedLoss}/100.`;
  return `Decision quality is ${decisionQuality}/100 with balanced restriction value.`;
}

function audit(
  value: number,
  formula: string,
  contributors: WisdomContributor[],
): WisdomScoreAudit {
  return {
    value: roundNumber(value),
    contributors: contributors.map((item) => ({
      ...item,
      value: roundNumber(item.value),
      contribution: roundNumber(item.value * item.weight),
    })),
    formula,
  };
}

function contributor(
  id: string,
  label: string,
  value: number,
  weight: number,
  reason: string,
): WisdomContributor {
  return {
    id,
    label,
    value,
    weight,
    contribution: value * weight,
    reason,
  };
}

function contributorsFrom<T extends Record<string, WisdomScoreAudit>>(
  scores: T,
) {
  return Object.fromEntries(
    Object.entries(scores).map(([key, score]) => [key, score.contributors]),
  ) as { [K in keyof T]: WisdomContributor[] };
}

function labelForAlternative(
  alternative: WisdomAlternativeScenario,
  index: number,
) {
  if (alternative.kind === "do-nothing") return "Do nothing";
  if (alternative.kind === "wait")
    return alternative.delayHours ? `Wait ${alternative.delayHours}h` : "Wait";
  if (alternative.kind === "scale") return "Scale action";
  if (alternative.kind === "reject") return "Reject";
  return `Alternative ${index + 1}`;
}

function scaleFor(values: number[]) {
  const maximum = Math.max(1, ...values.map((value) => Math.abs(value)));
  return maximum;
}

function maxBy<T>(values: T[], selector: (value: T) => number): T {
  return values.reduce((best, candidate) =>
    selector(candidate) > selector(best) ? candidate : best,
  );
}

function minBy<T>(values: T[], selector: (value: T) => number): T {
  return values.reduce((best, candidate) =>
    selector(candidate) < selector(best) ? candidate : best,
  );
}

function pct(numerator: number, denominator: number, fallback: number) {
  return denominator > 0
    ? roundScore((numerator / denominator) * 100)
    : roundScore(fallback);
}

function score(value: unknown, fallback: number) {
  const numberValue = optionalScore(value);
  return Math.round(numberValue ?? fallback);
}

function optionalScore(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return clamp(Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue);
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function roundNumber(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function sum(values: number[]) {
  return values
    .filter(Number.isFinite)
    .reduce((total, value) => total + value, 0);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function safeStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
}

function toTime(value: unknown) {
  if (value == null || value === "") return null;
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

function copy<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

const DISCOVERY_STAGES: DiscoveryLifecycleStage[] = [
  "Detected",
  "Observed",
  "Confirmed",
  "Repeatable",
  "Trusted",
  "Institutional",
];
