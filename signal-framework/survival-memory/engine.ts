/* c8 ignore next */
export type SurvivalOutcomeClass =
  | "comfortable_survival"
  | "stressed_survival"
  | "barely_survived"
  | "failed_survival";

export type SurvivalAction = "buy" | "sell" | "hold" | "watch" | "reduce" | "exit";

export type SurvivalMemoryStatus = "empty" | "clear" | "watch" | "scarred" | "near_ruin";

export type SurvivalMemoryRecommendation = "act" | "act_with_reduced_size" | "wait";

export interface SurvivalMemoryRecord {
  id: string;
  timestamp: string;
  asset?: string;
  venue?: string;
  regime?: string;
  stateFingerprint: string;
  action: SurvivalAction;
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

export type SurvivalCostInput = {
  maxDrawdown?: number;
  maxAdverseExcursion?: number;
  recoveryTimeBars?: number;
  volatilityExpansion?: number;
  tailRisk?: number;
  liquidityStress?: number;
  structuralDanger?: number;
  novelty?: number;
};

export type SurvivalClassificationInput = SurvivalCostInput & {
  realizedReturn?: number;
  survivalCost?: number;
};

export type SurvivalMemoryRecordInput = SurvivalClassificationInput & {
  id: string;
  timestamp?: string;
  asset?: string;
  venue?: string;
  regime?: string;
  stateFingerprint?: string;
  state?: Record<string, unknown>;
  action?: SurvivalAction | string;
  maxExposure?: number;
  opportunityDensity?: number;
  notes?: string[];
};

export type SurvivalMemoryAnalysisInput = {
  records?: SurvivalMemoryRecord[];
  currentState?: Record<string, unknown>;
  stateFingerprint?: string;
  similarityThreshold?: number;
};

export type SurvivalMemoryAnalysis = {
  status: SurvivalMemoryStatus;
  recommendation: SurvivalMemoryRecommendation;
  recordCount: number;
  matchedCount: number;
  scarCount: number;
  nearRuinCount: number;
  scarRate?: number;
  nearRuinRate?: number;
  severeNearRuinRate?: number;
  averageSurvivalCost: number;
  recoveryBurden: number;
  survivalConfidence: number;
  currentStateSimilarity: number;
  nearRuinSimilarity?: number;
  exposureMultiplier: number;
  confidencePenalty: number;
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
};

const SURVIVAL_COST_WEIGHTS = {
  maxDrawdown: 0.18,
  maxAdverseExcursion: 0.18,
  recoveryTime: 0.12,
  volatilityExpansion: 0.12,
  tailRisk: 0.14,
  liquidityStress: 0.12,
  structuralDanger: 0.09,
  novelty: 0.05,
};

export function calculateSurvivalCost(input: SurvivalCostInput): number {
  const recoveryTime = scoreRecovery(input.recoveryTimeBars);
  return roundScore(
    normalizeMagnitude(input.maxDrawdown) * SURVIVAL_COST_WEIGHTS.maxDrawdown +
      normalizeMagnitude(input.maxAdverseExcursion) * SURVIVAL_COST_WEIGHTS.maxAdverseExcursion +
      recoveryTime * SURVIVAL_COST_WEIGHTS.recoveryTime +
      normalizeScore(input.volatilityExpansion) * SURVIVAL_COST_WEIGHTS.volatilityExpansion +
      normalizeScore(input.tailRisk) * SURVIVAL_COST_WEIGHTS.tailRisk +
      normalizeScore(input.liquidityStress) * SURVIVAL_COST_WEIGHTS.liquidityStress +
      normalizeScore(input.structuralDanger) * SURVIVAL_COST_WEIGHTS.structuralDanger +
      normalizeScore(input.novelty) * SURVIVAL_COST_WEIGHTS.novelty,
  );
}

export function classifySurvivalOutcome(input: SurvivalClassificationInput): SurvivalOutcomeClass {
  const survivalCost = normalizeScore(input.survivalCost ?? calculateSurvivalCost(input));
  const realizedReturn = number(input.realizedReturn);
  const maxDrawdown = normalizeMagnitude(input.maxDrawdown);
  const adverse = normalizeMagnitude(input.maxAdverseExcursion);
  const recovery = scoreRecovery(input.recoveryTimeBars);
  const tailRisk = normalizeScore(input.tailRisk);
  const liquidityStress = normalizeScore(input.liquidityStress);
  const structuralDanger = normalizeScore(input.structuralDanger);
  const stressPeak = Math.max(tailRisk, liquidityStress, structuralDanger);

  if (realizedReturn < 0 || maxDrawdown >= 45 || adverse >= 45 || survivalCost >= 85) {
    return "failed_survival";
  }

  if (
    survivalCost >= 58 ||
    maxDrawdown >= 25 ||
    adverse >= 30 ||
    recovery >= 75 ||
    stressPeak >= 70
  ) {
    return "barely_survived";
  }

  if (
    survivalCost >= 25 ||
    maxDrawdown >= 8 ||
    adverse >= 10 ||
    recovery >= 25 ||
    stressPeak >= 35 ||
    normalizeScore(input.volatilityExpansion) >= 35
  ) {
    return "stressed_survival";
  }

  return "comfortable_survival";
}

export function scarWeightForOutcome(outcomeClass: SurvivalOutcomeClass, survivalCost: number): number {
  const costRatio = normalizeScore(survivalCost) / 100;

  if (outcomeClass === "failed_survival") return 1;
  if (outcomeClass === "barely_survived") return roundRatio(Math.max(0.55, costRatio * 0.9));
  if (outcomeClass === "stressed_survival") return roundRatio(Math.max(0.18, costRatio * 0.55));
  return 0;
}

export function buildSurvivalMemoryRecord(input: SurvivalMemoryRecordInput): SurvivalMemoryRecord {
  const survivalCost = calculateSurvivalCost(input);
  const outcomeClass = classifySurvivalOutcome({ ...input, survivalCost });
  const scarWeight = scarWeightForOutcome(outcomeClass, survivalCost);
  const action = normalizeAction(input.action);
  const notes = unique([
    ...(input.notes ?? []),
    ...notesForRecord({
      ...input,
      action,
      survivalCost,
      outcomeClass,
      scarWeight,
    }),
  ]);

  return {
    id: input.id,
    timestamp: timestampFor(input.timestamp),
    ...(input.asset ? { asset: input.asset } : {}),
    ...(input.venue ? { venue: input.venue } : {}),
    ...(input.regime ? { regime: input.regime } : {}),
    stateFingerprint: input.stateFingerprint ?? fingerprintSurvivalState(input.state ?? {}),
    action,
    maxExposure: roundScore(normalizeScore(input.maxExposure)),
    realizedReturn: roundScore(number(input.realizedReturn)),
    maxDrawdown: roundScore(normalizeMagnitude(input.maxDrawdown)),
    maxAdverseExcursion: roundScore(normalizeMagnitude(input.maxAdverseExcursion)),
    ...(input.recoveryTimeBars == null ? {} : { recoveryTimeBars: Math.max(0, Math.round(number(input.recoveryTimeBars))) }),
    volatilityExpansion: roundScore(normalizeScore(input.volatilityExpansion)),
    tailRisk: roundScore(normalizeScore(input.tailRisk)),
    liquidityStress: roundScore(normalizeScore(input.liquidityStress)),
    structuralDanger: roundScore(normalizeScore(input.structuralDanger)),
    novelty: roundScore(normalizeScore(input.novelty)),
    opportunityDensity: roundScore(normalizeScore(input.opportunityDensity)),
    outcomeClass,
    survivalCost,
    scarWeight,
    ...(notes.length ? { notes } : {}),
  };
}

export function evaluateSurvivalMemory(input: SurvivalMemoryAnalysisInput = {}): SurvivalMemoryAnalysis {
  const records = Array.isArray(input.records) ? input.records : [];
  const currentFingerprint = input.stateFingerprint ?? fingerprintSurvivalState(input.currentState ?? {});
  const threshold = clampRatio(input.similarityThreshold ?? 0.35);
  const matched = records
    .map((record) => ({
      record,
      similarity: similarityForFingerprint(currentFingerprint, record.stateFingerprint),
    }))
    .filter((match) => match.similarity >= threshold)
    .sort((left, right) => right.similarity - left.similarity || right.record.id.localeCompare(left.record.id));
  const effectiveMatches = matched.length ? matched : records.map((record) => ({ record, similarity: 0 }));
  const fragileMatches = effectiveMatches.filter((match) => isSurvivalScar(match.record));
  const nearRuinMatches = effectiveMatches.filter((match) => isNearRuin(match.record));
  const severeNearRuinMatches = nearRuinMatches.filter((match) => isSevereNearRuin(match.record));
  const scarRate = ratio(fragileMatches.length, effectiveMatches.length);
  const nearRuinRate = ratio(nearRuinMatches.length, effectiveMatches.length);
  const severeNearRuinRate = ratio(severeNearRuinMatches.length, effectiveMatches.length);
  const averageSurvivalCost = average(effectiveMatches.map((match) => match.record.survivalCost));
  const recoveryBurden = average(effectiveMatches.map((match) => scoreRecovery(match.record.recoveryTimeBars)));
  const currentStateSimilarity = fragileMatches.length
    ? Math.max(...fragileMatches.map((match) => match.similarity))
    : 0;
  const nearRuinSimilarity = nearRuinMatches.length
    ? Math.max(...nearRuinMatches.map((match) => match.similarity))
    : 0;
  const exposureMultiplier = exposureMultiplierFor({
    averageSurvivalCost,
    scarRate,
    nearRuinCount: nearRuinMatches.length,
    nearRuinRate,
    severeNearRuinCount: severeNearRuinMatches.length,
    severeNearRuinRate,
    currentStateSimilarity,
    nearRuinSimilarity,
  });
  const controlledRecovery = averageSurvivalCost < 35 && recoveryBurden < 20;
  const confidencePenalty = roundScore(
    (1 - exposureMultiplier) * 35 +
      averageSurvivalCost * 0.1 +
      nearRuinRate * 8 * (controlledRecovery ? 0.4 : 1) +
      severeNearRuinRate * 20 * (controlledRecovery ? 0.35 : 1),
  );
  const survivalConfidence = survivalConfidenceFor({
    averageSurvivalCost,
    recoveryBurden,
    scarRate,
    nearRuinRate,
    severeNearRuinRate,
    currentStateSimilarity,
  });
  const status = statusFor({
    recordCount: records.length,
    averageSurvivalCost,
    scarRate,
    nearRuinRate,
    severeNearRuinCount: severeNearRuinMatches.length,
    severeNearRuinRate,
    nearRuinSimilarity,
  });
  const recommendation = recommendationFor(status, exposureMultiplier);
  const mainWarnings = warningsFor({
    fragileMatches: fragileMatches.map((match) => match.record),
    nearRuinCount: nearRuinMatches.length,
    averageSurvivalCost,
    recoveryBurden,
    currentStateSimilarity,
  });
  const reasons = reasonsFor({
    status,
    recommendation,
    exposureMultiplier,
    survivalConfidence,
    mainWarnings,
  });

  return {
    status,
    recommendation,
    recordCount: records.length,
    matchedCount: effectiveMatches.length,
    scarCount: fragileMatches.length,
    nearRuinCount: nearRuinMatches.length,
    scarRate: roundScore(scarRate * 100),
    nearRuinRate: roundScore(nearRuinRate * 100),
    severeNearRuinRate: roundScore(severeNearRuinRate * 100),
    averageSurvivalCost: roundScore(averageSurvivalCost),
    recoveryBurden: roundScore(recoveryBurden),
    survivalConfidence,
    currentStateSimilarity: roundScore(currentStateSimilarity * 100),
    nearRuinSimilarity: roundScore(nearRuinSimilarity * 100),
    exposureMultiplier,
    confidencePenalty,
    mainWarnings,
    reasons,
    missingEvidence: missingEvidenceFor(recommendation),
    unlockConditions: unlockConditionsFor(recommendation),
    invalidationConditions: invalidationConditionsFor(recommendation),
    fragileMatches: fragileMatches.slice(0, 5).map((match) => ({
      id: match.record.id,
      similarity: roundScore(match.similarity * 100),
      outcomeClass: match.record.outcomeClass,
      survivalCost: match.record.survivalCost,
      realizedReturn: match.record.realizedReturn,
    })),
  };
}

export function fingerprintSurvivalState(state: Record<string, unknown>): string {
  const tokens = Object.entries(state)
    .flatMap(([key, value]) => fingerprintTokens(key, value))
    .filter(Boolean)
    .sort();

  return tokens.length ? tokens.join("|") : "survival:unknown";
}

function fingerprintTokens(key: string, value: unknown): string[] {
  const normalizedKey = normalizeToken(key);

  if (!normalizedKey) return [];
  if (typeof value === "number" && Number.isFinite(value)) {
    return [`${normalizedKey}:${scoreBucket(value)}`];
  }
  if (typeof value === "boolean") {
    return [`${normalizedKey}:${value ? "true" : "false"}`];
  }
  if (typeof value === "string") {
    const normalized = normalizeToken(value);
    return normalized ? [`${normalizedKey}:${normalized}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => fingerprintTokens(normalizedKey, item));
  }
  return [];
}

function similarityForFingerprint(current: string, historical: string): number {
  if (current === historical) return 1;
  const currentTokens = new Set(current.split("|").filter(Boolean));
  const historicalTokens = new Set(historical.split("|").filter(Boolean));
  const union = new Set([...currentTokens, ...historicalTokens]);
  if (!union.size) return 0;
  let intersection = 0;

  for (const token of currentTokens) {
    if (historicalTokens.has(token)) intersection += 1;
  }

  return intersection / union.size;
}

function notesForRecord(input: SurvivalMemoryRecordInput & {
  action: SurvivalAction;
  survivalCost: number;
  outcomeClass: SurvivalOutcomeClass;
  scarWeight: number;
}) {
  const notes: string[] = [];
  const profitable = number(input.realizedReturn) > 0;

  if (profitable && input.outcomeClass === "barely_survived") {
    notes.push("Profitable outcome carried unacceptable survival cost.");
  }
  if (input.outcomeClass === "failed_survival") {
    notes.push("Outcome failed the survival boundary.");
  }
  if (normalizeMagnitude(input.maxDrawdown) >= 25) {
    notes.push("Large drawdown created survival scar tissue.");
  }
  if (normalizeScore(input.tailRisk) >= 70 || normalizeScore(input.liquidityStress) >= 70) {
    notes.push("Tail or liquidity pressure made the signal structurally fragile.");
  }

  return notes;
}

function isSurvivalScar(record: SurvivalMemoryRecord) {
  return record.scarWeight >= 0.18 || record.outcomeClass !== "comfortable_survival";
}

function isNearRuin(record: SurvivalMemoryRecord) {
  return record.outcomeClass === "failed_survival" ||
    record.outcomeClass === "barely_survived" && (
      record.survivalCost >= 65 ||
      record.maxDrawdown >= 30 ||
      record.maxAdverseExcursion >= 35 ||
      record.tailRisk >= 80 ||
      record.liquidityStress >= 80
    );
}

function isSevereNearRuin(record: SurvivalMemoryRecord) {
  return record.outcomeClass === "failed_survival" ||
    record.survivalCost >= 75 ||
    record.maxDrawdown >= 45 ||
    record.maxAdverseExcursion >= 45 ||
    record.tailRisk >= 90 ||
    record.liquidityStress >= 90;
}

function exposureMultiplierFor(input: {
  averageSurvivalCost: number;
  scarRate: number;
  nearRuinCount: number;
  nearRuinRate: number;
  severeNearRuinCount: number;
  severeNearRuinRate: number;
  currentStateSimilarity: number;
  nearRuinSimilarity: number;
}) {
  const severeCluster =
    input.severeNearRuinRate >= 0.2 &&
    (input.nearRuinSimilarity >= 0.5 || input.averageSurvivalCost >= 55);

  if (input.severeNearRuinCount >= 2 && severeCluster && input.averageSurvivalCost >= 65) return 0;
  if (severeCluster && input.averageSurvivalCost >= 35) return 0.2;
  if (input.averageSurvivalCost >= 70) return 0.25;
  if (input.averageSurvivalCost >= 55 || input.nearRuinRate >= 0.5 && input.averageSurvivalCost >= 35) return 0.4;
  if (input.averageSurvivalCost >= 35 || input.scarRate >= 0.5 || input.nearRuinRate >= 0.2) return 0.65;
  return 1;
}

function statusFor(input: {
  recordCount: number;
  averageSurvivalCost: number;
  scarRate: number;
  nearRuinRate: number;
  severeNearRuinCount: number;
  severeNearRuinRate: number;
  nearRuinSimilarity: number;
}): SurvivalMemoryStatus {
  if (input.recordCount === 0) return "empty";
  const severeCluster =
    input.severeNearRuinRate >= 0.2 &&
    (input.nearRuinSimilarity >= 0.45 || input.averageSurvivalCost >= 55);

  if (
    input.averageSurvivalCost >= 70 ||
    severeCluster && input.averageSurvivalCost >= 35
  ) {
    return "near_ruin";
  }
  if (input.averageSurvivalCost >= 55 || input.nearRuinRate >= 0.5 || input.scarRate >= 0.65) return "scarred";
  if (input.scarRate > 0 || input.nearRuinRate > 0 || input.averageSurvivalCost >= 30) return "watch";
  return "clear";
}

function survivalConfidenceFor(input: {
  averageSurvivalCost: number;
  recoveryBurden: number;
  scarRate: number;
  nearRuinRate: number;
  severeNearRuinRate: number;
  currentStateSimilarity: number;
}) {
  const controlledRecovery = input.averageSurvivalCost < 35 && input.recoveryBurden < 20;
  const stabilizingRecoveryCredit = controlledRecovery
    ? clampScore((35 - input.averageSurvivalCost) * 0.6 + (20 - input.recoveryBurden) * 0.25)
    : 0;
  const scarPenaltyScale = controlledRecovery ? 0.45 : 1;
  const nearRuinPenaltyScale = controlledRecovery ? 0.25 : input.averageSurvivalCost < 45 ? 0.65 : 1;
  const severePenaltyScale = controlledRecovery ? 0.25 : input.averageSurvivalCost < 45 ? 0.6 : 1;
  const similarityPenaltyScale = controlledRecovery ? 0.6 : 1;

  return roundScore(clampScore(
    100 -
      input.averageSurvivalCost * 0.65 -
      input.scarRate * 12 * scarPenaltyScale -
      input.nearRuinRate * 18 * nearRuinPenaltyScale -
      input.severeNearRuinRate * 35 * severePenaltyScale -
      input.currentStateSimilarity * 6 * similarityPenaltyScale -
      input.recoveryBurden * 0.08 +
      stabilizingRecoveryCredit,
  ));
}

function recommendationFor(status: SurvivalMemoryStatus, exposureMultiplier: number): SurvivalMemoryRecommendation {
  if (status === "near_ruin" || exposureMultiplier === 0) return "wait";
  if (status === "scarred" || status === "watch" || exposureMultiplier < 0.85) return "act_with_reduced_size";
  return "act";
}

function warningsFor(input: {
  fragileMatches: SurvivalMemoryRecord[];
  nearRuinCount: number;
  averageSurvivalCost: number;
  recoveryBurden: number;
  currentStateSimilarity: number;
}) {
  const warnings: string[] = [];

  if (input.nearRuinCount > 0) {
    warnings.push("Similar states include near-ruin survival patterns.");
  }
  if (input.fragileMatches.some((record) => record.realizedReturn > 0 && record.outcomeClass === "barely_survived")) {
    warnings.push("Similar states were profitable but carried unacceptable drawdown or stress.");
  }
  if (input.averageSurvivalCost >= 35) {
    warnings.push(`Average survival cost is elevated at ${Math.round(input.averageSurvivalCost)}/100.`);
  }
  if (input.recoveryBurden >= 50) {
    warnings.push("Recovery burden is high after adverse moves.");
  }
  if (input.currentStateSimilarity >= 0.5) {
    warnings.push("Current state resembles fragile historical states.");
  }

  return unique(warnings);
}

function reasonsFor(input: {
  status: SurvivalMemoryStatus;
  recommendation: SurvivalMemoryRecommendation;
  exposureMultiplier: number;
  survivalConfidence: number;
  mainWarnings: string[];
}) {
  if (input.status === "empty") {
    return ["No survival memory records are available yet."];
  }

  const reasons = [
    `Survival memory status is ${input.status.replace(/_/g, " ")} with confidence ${Math.round(input.survivalConfidence)}/100.`,
  ];

  if (input.recommendation === "wait") {
    reasons.push("Wait because similar states had unacceptable survival cost.");
  } else if (input.recommendation === "act_with_reduced_size") {
    reasons.push(`Cap exposure to ${Math.round(input.exposureMultiplier * 100)}% of the normal limit before opportunity sizing expands it.`);
  }

  return unique([...reasons, ...input.mainWarnings]);
}

function missingEvidenceFor(recommendation: SurvivalMemoryRecommendation) {
  if (recommendation === "wait") return ["Survival memory clearance"];
  if (recommendation === "act_with_reduced_size") return ["Reduced-size survival review"];
  return [];
}

function unlockConditionsFor(recommendation: SurvivalMemoryRecommendation) {
  if (recommendation === "wait") {
    return ["Wait until similar states show survival cost below 35/100 and no near-ruin match."];
  }
  if (recommendation === "act_with_reduced_size") {
    return ["Raise survival confidence above 70/100 before normal sizing is restored."];
  }
  return [];
}

function invalidationConditionsFor(recommendation: SurvivalMemoryRecommendation) {
  const base = ["Invalidate if similar states repeat max adverse excursion above the survival boundary."];
  if (recommendation === "act") return [];
  if (recommendation === "wait") return [...base, "Invalidate if liquidity or tail pressure remains elevated in the current state."];
  return base;
}

function normalizeAction(action: unknown): SurvivalAction {
  const normalized = normalizeToken(action);
  if (normalized === "sell") return "sell";
  if (normalized === "hold") return "hold";
  if (normalized === "watch") return "watch";
  if (normalized === "reduce") return "reduce";
  if (normalized === "exit") return "exit";
  return "buy";
}

function scoreRecovery(recoveryTimeBars: unknown) {
  return clampScore(number(recoveryTimeBars) / 60 * 100);
}

function scoreBucket(value: number) {
  const score = normalizeScore(value);
  if (score < 20) return "very-low";
  if (score < 40) return "low";
  if (score < 60) return "mid";
  if (score < 80) return "high";
  return "extreme";
}

function normalizeMagnitude(value: unknown) {
  return normalizeScore(Math.abs(number(value)));
}

function normalizeScore(value: unknown) {
  const parsed = number(value);
  return clampScore(Math.abs(parsed) < 1 && parsed !== 0 ? parsed * 100 : parsed);
}

function clampScore(value: number) {
  /* c8 ignore next 1 */
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function average(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function ratio(count: number, total: number) {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return 0;
  return clampRatio(count / total);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9.-]+/g, "");
}

function timestampFor(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return "1970-01-01T00:00:00.000Z";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function roundScore(value: number) {
  return Math.round(clampScore(value) * 100) / 100;
}

/* c8 ignore next */
function roundRatio(value: number) {
  return Math.round(clampRatio(value) * 100) / 100;
}
