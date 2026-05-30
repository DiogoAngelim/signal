export type DiscoveryIntelligenceStage =
  | "EMERGING"
  | "DETECTED"
  | "OBSERVED"
  | "CONFIRMED"
  | "REPEATABLE"
  | "TRUSTED"
  | "INSTITUTIONAL";

export type InstitutionalStage =
  | "discovery"
  | "knowledge"
  | "policy"
  | "standard"
  | "institutional";

export type DecisionAction = "ACT" | "WAIT" | "REJECT" | "RESTRICT";

export type RecommendationCategory =
  | "maturity"
  | "economics"
  | "governance"
  | "institutionalization"
  | "meta-learning";

export type RecommendationPriority = "low" | "medium" | "high";

export interface DiscoveryRecord {
  id: string;
  stage?: DiscoveryIntelligenceStage | string;
  previousStage?: DiscoveryIntelligenceStage | string;
  novelty?: number;
  confidence?: number;
  trust?: number;
  maturity?: number;
  value?: number;
  abandoned?: boolean;
  falseDiscovery?: boolean;
  converted?: boolean;
  institutionalStage?: InstitutionalStage | string;
  knowledgeStage?: InstitutionalStage | string;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export interface DecisionRecord {
  id: string;
  discoveryId?: string;
  opportunityId?: string;
  action?: DecisionAction | string;
  expectedValue?: number;
  actualValue?: number;
  alternatives?: Partial<Record<DecisionAction, number>>;
  confidence?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export interface OutcomeRecord {
  id: string;
  decisionId?: string;
  discoveryId?: string;
  opportunityId?: string;
  action?: DecisionAction | string;
  value?: number;
  reward?: number;
  cost?: number;
  loss?: number;
  avoidedLoss?: number;
  missedUpside?: number;
  success?: boolean;
  calibrationScore?: number;
  trustScore?: number;
  survivalScore?: number;
  decisionQuality?: number;
  governanceScore?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export interface RestrictionRecord {
  id: string;
  type?: string;
  label?: string;
  decisionId?: string;
  discoveryId?: string;
  opportunityId?: string;
  avoidedLoss?: number;
  missedUpside?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export interface TraceRecord {
  id: string;
  metric?: string;
  value?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryMaturity {
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
}

export interface OpportunityEconomics {
  actValue: number;
  waitValue: number;
  rejectValue: number;
  restrictValue: number;
  avoidedLoss: number;
  missedUpside: number;
  opportunityCost: number;
  economicsScore: number;
}

export interface RestrictionAudit {
  id: string;
  type: string;
  label: string;
  avoidedLoss: number;
  missedUpside: number;
  effectiveness: number;
  helpful: boolean;
  recommendation: string;
}

export interface GovernanceEffectiveness {
  score: number;
  restrictions: RestrictionAudit[];
  helpfulRestrictions: number;
  harmfulRestrictions: number;
}

export interface InstitutionalKnowledge {
  knowledgeCount: number;
  policyCount: number;
  standardCount: number;
  institutionalCount: number;
  institutionalizationScore: number;
}

export interface MetaLearning {
  score: number;
  calibrationTrend: number;
  trustTrend: number;
  survivalTrend: number;
  decisionQualityTrend: number;
  governanceTrend: number;
}

export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  message: string;
}

export interface DiscoveryIntelligenceInput {
  discoveries: DiscoveryRecord[];
  decisions: DecisionRecord[];
  outcomes: OutcomeRecord[];
  restrictions: RestrictionRecord[];
  traces: TraceRecord[];
  historyDepthScore?: number;
  regimeCoverageScore?: number;
  sampleDiversityScore?: number;
  regimeDiversityScore?: number;
}

export interface DiscoveryIntelligenceResult {
  score: number;
  regimeCoverageScore?: number;
  maturity: DiscoveryMaturity;
  economics: OpportunityEconomics;
  governance: GovernanceEffectiveness;
  institutionalization: InstitutionalKnowledge;
  metaLearning: MetaLearning;
  recommendations: Recommendation[];
}

const STAGE_ORDER: DiscoveryIntelligenceStage[] = [
  "EMERGING",
  "DETECTED",
  "OBSERVED",
  "CONFIRMED",
  "REPEATABLE",
  "TRUSTED",
  "INSTITUTIONAL",
];

const STAGE_INDEX = Object.fromEntries(
  STAGE_ORDER.map((stage, index) => [stage, index]),
) as Record<DiscoveryIntelligenceStage, number>;

const INSTITUTIONAL_STAGE_ORDER: InstitutionalStage[] = [
  "discovery",
  "knowledge",
  "policy",
  "standard",
  "institutional",
];

const INSTITUTIONAL_STAGE_INDEX = Object.fromEntries(
  INSTITUTIONAL_STAGE_ORDER.map((stage, index) => [stage, index]),
) as Record<InstitutionalStage, number>;

const ACTIONS: DecisionAction[] = ["ACT", "WAIT", "REJECT", "RESTRICT"];

export function evaluateDiscoveryIntelligence(
  input: Partial<DiscoveryIntelligenceInput> = {},
): DiscoveryIntelligenceResult {
  const completeInput: DiscoveryIntelligenceInput = {
    discoveries: input.discoveries ?? [],
    decisions: input.decisions ?? [],
    outcomes: input.outcomes ?? [],
    restrictions: input.restrictions ?? [],
    traces: input.traces ?? [],
    historyDepthScore: input.historyDepthScore,
    regimeCoverageScore: input.regimeCoverageScore,
    sampleDiversityScore: input.sampleDiversityScore,
    regimeDiversityScore: input.regimeDiversityScore,
  };

  const maturity = evaluateDiscoveryMaturity(completeInput.discoveries);
  const economics = evaluateOpportunityEconomics(
    completeInput.decisions,
    completeInput.outcomes,
  );
  const governance = evaluateGovernanceEffectiveness(
    completeInput.restrictions,
    completeInput.decisions,
    completeInput.outcomes,
  );
  const institutionalization = evaluateInstitutionalKnowledge(
    completeInput.discoveries,
  );
  const metaLearning = evaluateMetaLearning(
    completeInput.traces,
    completeInput.outcomes,
  );
  const regimeCoverageScore = evaluateRegimeCoverage(completeInput);
  const hasAnyRecords =
    completeInput.discoveries.length > 0 ||
    completeInput.decisions.length > 0 ||
    completeInput.outcomes.length > 0 ||
    completeInput.restrictions.length > 0 ||
    completeInput.traces.length > 0;
  const regimeCoverageSignal = regimeCoverageScore > 0 ? regimeCoverageScore : hasAnyRecords ? 50 : 0;
  const score = roundScore(
    weightedMean([
      [maturity.maturityScore, 0.2],
      [economics.economicsScore, 0.22],
      [governance.score, 0.18],
      [institutionalization.institutionalizationScore, 0.14],
      [metaLearning.score, 0.16],
      [regimeCoverageSignal, 0.1],
    ]),
  );

  return {
    score,
    regimeCoverageScore,
    maturity,
    economics,
    governance,
    institutionalization,
    metaLearning,
    recommendations: buildRecommendations({
      maturity,
      economics,
      governance,
      institutionalization,
      metaLearning,
      regimeCoverageScore,
    }),
  };
}

export const runDiscoveryIntelligence = evaluateDiscoveryIntelligence;
export const scoreDiscoveryIntelligence = evaluateDiscoveryIntelligence;

function evaluateRegimeCoverage(input: DiscoveryIntelligenceInput) {
  const explicit = finiteNumber(input.regimeCoverageScore);
  if (explicit != null) return roundScore(explicit);

  const traceValues = input.traces
    .filter((trace) => normalizeText(trace.metric).includes("regime coverage"))
    .map((trace) => finiteNumber(trace.value))
    .filter((value): value is number => value != null);
  const diagnostics = [
    finiteNumber(input.historyDepthScore),
    finiteNumber(input.sampleDiversityScore),
    finiteNumber(input.regimeDiversityScore),
  ].filter((value): value is number => value != null);

  if (traceValues.length) return roundScore(mean(traceValues));
  if (diagnostics.length) return roundScore(mean(diagnostics));
  return 0;
}

export function evaluateDiscoveryMaturity(
  discoveries: readonly DiscoveryRecord[] = [],
): DiscoveryMaturity {
  const counts = Object.fromEntries(
    STAGE_ORDER.map((stage) => [stage, 0]),
  ) as Record<DiscoveryIntelligenceStage, number>;
  let promotions = 0;
  let abandoned = 0;
  let falseDiscoveries = 0;
  let novelDiscoveries = 0;
  let novelConversions = 0;

  for (const discovery of discoveries) {
    const stage = normalizeDiscoveryStage(discovery.stage);
    counts[stage] += 1;

    const previousStage = normalizeDiscoveryStage(discovery.previousStage);
    if (STAGE_INDEX[stage] > STAGE_INDEX[previousStage]) promotions += 1;
    if (discovery.abandoned === true) abandoned += 1;
    if (isFalseDiscovery(discovery)) falseDiscoveries += 1;
    if (finiteNumber(discovery.novelty) != null && Number(discovery.novelty) >= 70) {
      novelDiscoveries += 1;
      if (STAGE_INDEX[stage] >= STAGE_INDEX.CONFIRMED || discovery.converted === true) {
        novelConversions += 1;
      }
    }
  }

  const discoveryCount = discoveries.length;
  const trusted = counts.TRUSTED + counts.INSTITUTIONAL;
  const institutional = counts.INSTITUTIONAL;
  const stageScore =
    discoveryCount === 0
      ? 0
      : sum(
          STAGE_ORDER.map((stage) => counts[stage] * STAGE_INDEX[stage]),
        ) /
        (discoveryCount * (STAGE_ORDER.length - 1)) *
        100;
  const promotionRate = percentage(promotions, discoveryCount);
  const abandonmentRate = percentage(abandoned, discoveryCount);
  const falseDiscoveryRate = percentage(falseDiscoveries, discoveryCount);
  const noveltyConversionRate = percentage(novelConversions, novelDiscoveries);
  const trustedConversionRate = percentage(trusted, discoveryCount);
  const institutionalConversionRate = percentage(institutional, discoveryCount);
  const maturityScore = roundScore(
    clamp(
      stageScore * 0.5 +
        promotionRate * 0.15 +
        noveltyConversionRate * 0.1 +
        trustedConversionRate * 0.15 +
        institutionalConversionRate * 0.1 -
        abandonmentRate * 0.2 -
        falseDiscoveryRate * 0.25,
    ),
  );

  return {
    emerging: counts.EMERGING,
    detected: counts.DETECTED,
    observed: counts.OBSERVED,
    confirmed: counts.CONFIRMED,
    repeatable: counts.REPEATABLE,
    trusted: counts.TRUSTED,
    institutional: counts.INSTITUTIONAL,
    discoveryCount,
    promotionRate: roundScore(promotionRate),
    abandonmentRate: roundScore(abandonmentRate),
    falseDiscoveryRate: roundScore(falseDiscoveryRate),
    noveltyConversionRate: roundScore(noveltyConversionRate),
    trustedConversionRate: roundScore(trustedConversionRate),
    institutionalConversionRate: roundScore(institutionalConversionRate),
    maturityScore,
  };
}

export function evaluateOpportunityEconomics(
  decisions: readonly DecisionRecord[] = [],
  outcomes: readonly OutcomeRecord[] = [],
): OpportunityEconomics {
  const totals = { ACT: 0, WAIT: 0, REJECT: 0, RESTRICT: 0 };
  let avoidedLoss = 0;
  let missedUpside = 0;

  for (const decision of decisions) {
    const outcome = findOutcomeForDecision(decision, outcomes);
    const action = normalizeDecisionAction(
      outcome?.action ?? decision.action,
    );
    const values = scenarioValues(decision, outcome, action);
    const actual = values[action];
    const best = Math.max(...ACTIONS.map((candidate) => values[candidate]));
    const worst = Math.min(...ACTIONS.map((candidate) => values[candidate]));

    totals.ACT += values.ACT;
    totals.WAIT += values.WAIT;
    totals.REJECT += values.REJECT;
    totals.RESTRICT += values.RESTRICT;
    avoidedLoss += Math.max(0, actual - worst);
    missedUpside += Math.max(0, best - actual);
  }

  const opportunityCost = missedUpside - avoidedLoss;
  const decisionCount = Math.max(1, decisions.length);
  const economicsScore =
    decisions.length === 0
      ? 0
      : clamp(
          50 +
            ((avoidedLoss - missedUpside) / decisionCount) * 8 +
            (totals.ACT + totals.WAIT + totals.RESTRICT + totals.REJECT) /
              decisionCount,
        );

  return {
    actValue: roundMoney(totals.ACT),
    waitValue: roundMoney(totals.WAIT),
    rejectValue: roundMoney(totals.REJECT),
    restrictValue: roundMoney(totals.RESTRICT),
    avoidedLoss: roundMoney(avoidedLoss),
    missedUpside: roundMoney(missedUpside),
    opportunityCost: roundMoney(opportunityCost),
    economicsScore: roundScore(economicsScore),
  };
}

export function evaluateGovernanceEffectiveness(
  restrictions: readonly RestrictionRecord[] = [],
  decisions: readonly DecisionRecord[] = [],
  outcomes: readonly OutcomeRecord[] = [],
): GovernanceEffectiveness {
  const audits = restrictions.map((restriction) =>
    auditRestriction(restriction, decisions, outcomes),
  );
  const helpfulRestrictions = audits.filter((audit) => audit.effectiveness > 0).length;
  const harmfulRestrictions = audits.filter((audit) => audit.effectiveness < 0).length;
  const meanEffectiveness =
    audits.length === 0
      ? 0
      : sum(audits.map((audit) => audit.effectiveness)) / audits.length;
  const balance =
    audits.length === 0
      ? 0
      : ((helpfulRestrictions - harmfulRestrictions) / audits.length) * 25;
  const score =
    audits.length === 0 ? 0 : clamp(50 + meanEffectiveness * 6 + balance);

  return {
    score: roundScore(score),
    restrictions: audits,
    helpfulRestrictions,
    harmfulRestrictions,
  };
}

export function evaluateInstitutionalKnowledge(
  discoveries: readonly DiscoveryRecord[] = [],
): InstitutionalKnowledge {
  let knowledgeCount = 0;
  let policyCount = 0;
  let standardCount = 0;
  let institutionalCount = 0;
  let scoreTotal = 0;

  for (const discovery of discoveries) {
    const institutionalStage = normalizeInstitutionalStage(
      discovery.institutionalStage ?? discovery.knowledgeStage,
      discovery.stage,
    );
    const stageIndex = INSTITUTIONAL_STAGE_INDEX[institutionalStage];
    if (stageIndex >= INSTITUTIONAL_STAGE_INDEX.knowledge) knowledgeCount += 1;
    if (stageIndex >= INSTITUTIONAL_STAGE_INDEX.policy) policyCount += 1;
    if (stageIndex >= INSTITUTIONAL_STAGE_INDEX.standard) standardCount += 1;
    if (stageIndex >= INSTITUTIONAL_STAGE_INDEX.institutional) {
      institutionalCount += 1;
    }
    scoreTotal += stageIndex / (INSTITUTIONAL_STAGE_ORDER.length - 1);
  }

  return {
    knowledgeCount,
    policyCount,
    standardCount,
    institutionalCount,
    institutionalizationScore: roundScore(
      discoveries.length === 0 ? 0 : clamp((scoreTotal / discoveries.length) * 100),
    ),
  };
}

export function evaluateMetaLearning(
  traces: readonly TraceRecord[] = [],
  outcomes: readonly OutcomeRecord[] = [],
): MetaLearning {
  const series = {
    calibration: [] as TimedValue[],
    trust: [] as TimedValue[],
    survival: [] as TimedValue[],
    decisionQuality: [] as TimedValue[],
    governance: [] as TimedValue[],
  };

  for (const trace of traces) {
    const metric = normalizeMetric(trace.metric);
    const value = finiteNumber(trace.value);
    if (metric && value != null) {
      series[metric].push({ value, time: timeValue(trace.timestamp) });
    }
  }

  for (const outcome of outcomes) {
    pushOutcomeMetric(series.calibration, outcome.calibrationScore, outcome.timestamp);
    pushOutcomeMetric(series.trust, outcome.trustScore, outcome.timestamp);
    pushOutcomeMetric(series.survival, outcome.survivalScore, outcome.timestamp);
    pushOutcomeMetric(series.decisionQuality, outcome.decisionQuality, outcome.timestamp);
    pushOutcomeMetric(series.governance, outcome.governanceScore, outcome.timestamp);
  }

  const calibrationTrend = trendFor(series.calibration);
  const trustTrend = trendFor(series.trust);
  const survivalTrend = trendFor(series.survival);
  const decisionQualityTrend = trendFor(series.decisionQuality);
  const governanceTrend = trendFor(series.governance);
  const trendValues = [
    calibrationTrend,
    trustTrend,
    survivalTrend,
    decisionQualityTrend,
    governanceTrend,
  ];
  const hasSamples = Object.values(series).some((items) => items.length > 0);

  return {
    score: roundScore(hasSamples ? clamp(50 + mean(trendValues)) : 0),
    calibrationTrend: roundNumber(calibrationTrend),
    trustTrend: roundNumber(trustTrend),
    survivalTrend: roundNumber(survivalTrend),
    decisionQualityTrend: roundNumber(decisionQualityTrend),
    governanceTrend: roundNumber(governanceTrend),
  };
}

type TimedValue = {
  value: number;
  time: number;
};

function auditRestriction(
  restriction: RestrictionRecord,
  decisions: readonly DecisionRecord[],
  outcomes: readonly OutcomeRecord[],
): RestrictionAudit {
  const linkedDecision = decisions.find((decision) =>
    isLinked(restriction, decision),
  );
  const linkedOutcome = linkedDecision
    ? findOutcomeForDecision(linkedDecision, outcomes)
    : outcomes.find((outcome) => isLinked(restriction, outcome));
  const explicitAvoidedLoss = finiteNumber(
    restriction.avoidedLoss ?? linkedOutcome?.avoidedLoss,
  );
  const explicitMissedUpside = finiteNumber(
    restriction.missedUpside ?? linkedOutcome?.missedUpside,
  );
  const inferred = linkedDecision
    ? inferRestrictionEconomics(linkedDecision, linkedOutcome)
    : { avoidedLoss: 0, missedUpside: 0 };
  const avoidedLoss = explicitAvoidedLoss ?? inferred.avoidedLoss;
  const missedUpside = explicitMissedUpside ?? inferred.missedUpside;
  const effectiveness = avoidedLoss - missedUpside;

  return {
    id: restriction.id,
    type: restriction.type ?? "restriction",
    label: restriction.label ?? restriction.type ?? restriction.id,
    avoidedLoss: roundMoney(avoidedLoss),
    missedUpside: roundMoney(missedUpside),
    effectiveness: roundMoney(effectiveness),
    helpful: effectiveness > 0,
    recommendation:
      effectiveness >= 0
        ? "Preserve this restriction while monitoring its opportunity cost."
        : "Review or relax this restriction because missed upside exceeds avoided loss.",
  };
}

function inferRestrictionEconomics(
  decision: DecisionRecord,
  outcome?: OutcomeRecord,
) {
  const action = normalizeDecisionAction(outcome?.action ?? decision.action);
  const values = scenarioValues(decision, outcome, action);
  const restrictedValue = values[action];
  const actValue = values.ACT;

  return {
    avoidedLoss: Math.max(0, restrictedValue - actValue),
    missedUpside: Math.max(0, actValue - restrictedValue),
  };
}

function scenarioValues(
  decision: DecisionRecord,
  outcome: OutcomeRecord | undefined,
  action: DecisionAction,
): Record<DecisionAction, number> {
  const expected = finiteNumber(decision.expectedValue) ?? 0;
  const actual = finiteNumber(outcomeValue(outcome)) ?? finiteNumber(decision.actualValue);
  const values = {
    ACT: finiteNumber(decision.alternatives?.ACT) ?? expected,
    WAIT: finiteNumber(decision.alternatives?.WAIT) ?? expected * 0.45,
    REJECT: finiteNumber(decision.alternatives?.REJECT) ?? 0,
    RESTRICT:
      finiteNumber(decision.alternatives?.RESTRICT) ??
      Math.max(0, expected * 0.6),
  };

  if (actual != null) values[action] = actual;
  return values;
}

function outcomeValue(outcome?: OutcomeRecord) {
  if (!outcome) return undefined;
  const explicit = finiteNumber(outcome.value);
  if (explicit != null) return explicit;
  const reward = finiteNumber(outcome.reward) ?? 0;
  const cost = finiteNumber(outcome.cost) ?? 0;
  const loss = finiteNumber(outcome.loss) ?? 0;
  return reward - cost - loss;
}

function findOutcomeForDecision(
  decision: DecisionRecord,
  outcomes: readonly OutcomeRecord[],
) {
  return outcomes.find(
    (outcome) =>
      outcome.decisionId === decision.id ||
      nonEmptyMatch(outcome.opportunityId, decision.opportunityId) ||
      nonEmptyMatch(outcome.discoveryId, decision.discoveryId),
  );
}

function isLinked(
  source: RestrictionRecord,
  target: DecisionRecord | OutcomeRecord,
) {
  const targetDecisionId = "decisionId" in target ? target.decisionId : target.id;
  return (
    nonEmptyMatch(source.decisionId, targetDecisionId) ||
    nonEmptyMatch(source.opportunityId, target.opportunityId) ||
    nonEmptyMatch(source.discoveryId, target.discoveryId)
  );
}

function normalizeDiscoveryStage(value: unknown): DiscoveryIntelligenceStage {
  const text = normalizeText(value);
  if (text === "institutional" || text === "institutionalized") {
    return "INSTITUTIONAL";
  }
  if (text === "trusted") return "TRUSTED";
  if (text === "repeatable" || text === "repeated" || text === "recurring") {
    return "REPEATABLE";
  }
  if (text === "confirmed" || text === "validated" || text === "eligible") {
    return "CONFIRMED";
  }
  if (text === "observed" || text === "active" || text === "strengthening") {
    return "OBSERVED";
  }
  if (text === "detected" || text === "found") return "DETECTED";
  return "EMERGING";
}

function normalizeInstitutionalStage(
  value: unknown,
  lifecycleStage: unknown,
): InstitutionalStage {
  const text = normalizeText(value);
  if (text === "institutional" || text === "institutionalized") {
    return "institutional";
  }
  if (text === "standard" || text === "standardized") return "standard";
  if (text === "policy" || text === "governance policy") return "policy";
  if (text === "knowledge" || text === "known") return "knowledge";
  if (normalizeDiscoveryStage(lifecycleStage) === "INSTITUTIONAL") {
    return "institutional";
  }
  return "discovery";
}

function normalizeDecisionAction(value: unknown): DecisionAction {
  const text = normalizeText(value);
  if (text === "act" || text === "action" || text === "execute" || text === "buy" || text === "sell") {
    return "ACT";
  }
  if (text === "wait" || text === "watch" || text === "hold") return "WAIT";
  if (text === "reject" || text === "avoid" || text === "block") return "REJECT";
  if (text === "restrict" || text === "scale" || text === "limit" || text === "limited") {
    return "RESTRICT";
  }
  return "WAIT";
}

function normalizeMetric(value: unknown): keyof MetaLearningSeries | null {
  const text = normalizeText(value);
  if (text.includes("calibration")) return "calibration";
  if (text.includes("trust")) return "trust";
  if (text.includes("survival")) return "survival";
  if (text.includes("decision") || text.includes("quality")) {
    return "decisionQuality";
  }
  if (text.includes("governance") || text.includes("restriction")) {
    return "governance";
  }
  return null;
}

type MetaLearningSeries = {
  calibration: TimedValue[];
  trust: TimedValue[];
  survival: TimedValue[];
  decisionQuality: TimedValue[];
  governance: TimedValue[];
};

function pushOutcomeMetric(
  target: TimedValue[],
  value: unknown,
  timestamp: unknown,
) {
  const numberValue = finiteNumber(value);
  if (numberValue != null) {
    target.push({ value: numberValue, time: timeValue(timestamp) });
  }
}

function trendFor(values: TimedValue[]) {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a.time - b.time);
  const midpoint = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, midpoint);
  const recent = sorted.slice(midpoint);
  return mean(recent.map((item) => item.value)) -
    mean(early.map((item) => item.value));
}

function buildRecommendations(parts: {
  maturity: DiscoveryMaturity;
  economics: OpportunityEconomics;
  governance: GovernanceEffectiveness;
  institutionalization: InstitutionalKnowledge;
  metaLearning: MetaLearning;
  regimeCoverageScore: number;
}): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (parts.maturity.falseDiscoveryRate > 25) {
    recommendations.push({
      id: "reduce-false-discoveries",
      category: "maturity",
      priority: "high",
      message: "Tighten confirmation evidence before promoting discoveries.",
    });
  }
  if (parts.economics.missedUpside > parts.economics.avoidedLoss) {
    recommendations.push({
      id: "reduce-caution-cost",
      category: "economics",
      priority: "high",
      message: "Use smaller probes or cheaper waits when caution is too expensive.",
    });
  }
  if (parts.governance.harmfulRestrictions > parts.governance.helpfulRestrictions) {
    recommendations.push({
      id: "review-harmful-restrictions",
      category: "governance",
      priority: "high",
      message: "Review restrictions whose missed upside exceeds avoided loss.",
    });
  }
  if (
    parts.maturity.trusted + parts.maturity.institutional >
    parts.institutionalization.institutionalCount
  ) {
    recommendations.push({
      id: "institutionalize-trusted-knowledge",
      category: "institutionalization",
      priority: "medium",
      message: "Convert trusted discoveries into policies, standards, or reusable knowledge assets.",
    });
  }
  if (parts.metaLearning.score > 0 && parts.metaLearning.score < 50) {
    recommendations.push({
      id: "repair-meta-learning",
      category: "meta-learning",
      priority: "medium",
      message: "Investigate why calibration, trust, survival, decision quality, or governance trends are weakening.",
    });
  }
  if (parts.regimeCoverageScore > 0 && parts.regimeCoverageScore < 55) {
    recommendations.push({
      id: "expand-regime-coverage",
      category: "maturity",
      priority: "medium",
      message: "Broaden long-history coverage across bull, bear, crash, recovery, and volatility transition regimes.",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: "maintain-learning-loop",
      category: "meta-learning",
      priority: "low",
      message: "Continue recording discoveries, decisions, restrictions, traces, and outcomes.",
    });
  }

  return recommendations;
}

function isFalseDiscovery(discovery: DiscoveryRecord) {
  if (discovery.falseDiscovery === true) return true;
  const stage = normalizeDiscoveryStage(discovery.stage);
  const value = finiteNumber(discovery.value);
  const trust = finiteNumber(discovery.trust ?? discovery.confidence);
  return (
    discovery.abandoned === true &&
    STAGE_INDEX[stage] <= STAGE_INDEX.OBSERVED &&
    ((value != null && value <= 0) || (trust != null && trust < 35))
  );
}

function percentage(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : (numerator / denominator) * 100;
}

function weightedMean(values: Array<[number, number]>) {
  const totalWeight = sum(values.map(([, weight]) => weight));
  /* c8 ignore next */
  if (totalWeight <= 0) return 0;
  return sum(values.map(([value, weight]) => value * weight)) / totalWeight;
}

function mean(values: readonly number[]) {
  /* c8 ignore next */
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number, min = 0, max = 100) {
  /* c8 ignore next */
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function roundScore(value: number) {
  return Math.round(clamp(value) * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function nonEmptyMatch(left: unknown, right: unknown) {
  return left != null && right != null && String(left) === String(right);
}

function timeValue(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
