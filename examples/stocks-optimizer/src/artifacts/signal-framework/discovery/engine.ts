/* c8 ignore start */
export type DiscoveryStatus =
  | "none"
  | "detected"
  | "emerging"
  | "strengthening"
  | "eligible"
  | "sized"
  | "active"
  | "closed";
/* c8 ignore stop */

export type DiscoveryEvidenceDirection = "support" | "contradict" | "neutral";

export type DiscoveryCandidate = {
  id?: string;
  candidateId?: string;
  subjectId?: string;
  label?: string;
  kind?: string;
  score?: number;
  strength?: number;
  confidence?: number;
  trust?: number;
  maturity?: number;
  readiness?: number;
  lifecycleStatus?: DiscoveryStatus | string;
  status?: DiscoveryStatus | string;
  previousScore?: number | null;
  velocity?: number;
  persistence?: number;
  evidenceIds?: string[];
  evidence?: string[];
  missingEvidence?: string[];
  invalidationConditions?: string[];
  metadata?: Record<string, unknown>;
};

export type DiscoveryEvidence = {
  id?: string;
  candidateId?: string;
  label?: string;
  name?: string;
  description?: string;
  group?: string;
  direction?: DiscoveryEvidenceDirection;
  strength?: number;
  score?: number;
  confidence?: number;
  weight?: number;
  observed?: boolean;
  missing?: boolean;
  predictive?: boolean;
  misleading?: boolean;
  source?: string;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type DiscoveryHistoricalState = {
  id?: string;
  label?: string;
  domain?: string;
  state?: Record<string, unknown>;
  evidence?: DiscoveryEvidence[];
  outcomeId?: string;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type DiscoveryOutcomeLabel =
  | "positive"
  | "negative"
  | "neutral"
  | "invalidated"
  | "unknown"
  | "success"
  | "failure";

export type DiscoveryOutcome = {
  id?: string;
  subjectId?: string;
  candidateId?: string;
  state?: Record<string, unknown>;
  evidence?: DiscoveryEvidence[];
  outcome?: DiscoveryOutcomeLabel | string;
  result?: unknown;
  success?: boolean | null;
  score?: number;
  value?: number;
  confidence?: number;
  predictiveEvidence?: string[];
  misleadingEvidence?: string[];
  failureModes?: string[];
  invalidationConditions?: string[];
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type DiscoveryConstraint = {
  id?: string;
  label?: string;
  type?: string;
  passed?: boolean;
  severity?: "low" | "medium" | "high" | "critical" | string;
  score?: number;
  threshold?: number;
  reason?: string;
  missingEvidence?: string | string[];
  invalidationCondition?: string;
  unlockCondition?: string;
  metadata?: Record<string, unknown>;
};

export type DiscoveryInput = {
  subjectId?: string;
  domain?: string;
  state: Record<string, unknown>;
  candidates?: DiscoveryCandidate[];
  evidence?: DiscoveryEvidence[];
  historicalStates?: DiscoveryHistoricalState[];
  priorOutcomes?: DiscoveryOutcome[];
  constraints?: DiscoveryConstraint[];
  now?: string | Date;
};

export type DiscoveryRankedEvidence = {
  id: string;
  label: string;
  direction: DiscoveryEvidenceDirection;
  group: string;
  strength: number;
  confidence: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type DiscoveryConfidenceAttribution = {
  group: string;
  score: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type DiscoveryExplanation = {
  summary: string;
  supportingEvidence: DiscoveryRankedEvidence[];
  contradictoryEvidence: DiscoveryRankedEvidence[];
  confidenceAttribution: DiscoveryConfidenceAttribution[];
  confidencePenalties: DiscoveryConfidenceAttribution[];
  missingEvidence: string[];
};

export type DiscoveryContextMatch = {
  id: string;
  label: string;
  similarity: number;
  novelty: number;
  reason: string;
};

export type DiscoveryMemorySummary = {
  sampleSize: number;
  similarOutcomes: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  neutralOutcomes: number;
  successRatio: number;
  failureRatio: number;
  neutralRatio: number;
  reliability: number;
  recurringSuccessPatterns: string[];
  recurringFailurePatterns: string[];
  mostPredictiveEvidence: string[];
  mostMisleadingEvidence: string[];
};

export type DiscoveryCounterfactual = {
  type: "invalidate" | "confirm" | "fragile" | "safer";
  condition: string;
  impact: number;
  confidence: number;
};

export type DiscoveryForesightSummary = {
  counterfactuals: DiscoveryCounterfactual[];
  invalidationConditions: string[];
  unlockConditions: string[];
  fragilityDrivers: string[];
  safetyDrivers: string[];
};

export type DiscoveryLifecycleSummary = {
  status: DiscoveryStatus;
  previousStatus?: DiscoveryStatus;
  transitionReason: string;
  maturity: number;
  persistence: number;
  velocity: number;
  decayRisk: number;
  readiness: number;
  stageScores: Record<DiscoveryStatus, number>;
};

export type DiscoveryTrace = {
  id: string;
  label: string;
  value: number | string | null;
  score: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type DiscoveredOpportunity = {
  id: string;
  subjectId?: string;
  domain?: string;
  label: string;
  candidateId?: string;
  status: DiscoveryStatus;
  strength: number;
  confidence: number;
  trust: number;
  fragility: number;
  novelty: number;
  maturity: number;
  readiness: number;
  supportingEvidence: DiscoveryRankedEvidence[];
  contradictoryEvidence: DiscoveryRankedEvidence[];
  missingEvidence: string[];
  invalidationConditions: string[];
  unlockConditions: string[];
  explanation: string;
  lifecycle: DiscoveryLifecycleSummary;
  traces: DiscoveryTrace[];
};

export type DiscoveryResult = {
  status: DiscoveryStatus;
  opportunities: DiscoveredOpportunity[];
  confidence: number;
  trust: number;
  fragility: number;
  novelty: number;
  maturity: number;
  contextMatch: DiscoveryContextMatch[];
  memory: DiscoveryMemorySummary;
  foresight: DiscoveryForesightSummary;
  explanation: DiscoveryExplanation;
  lifecycle: DiscoveryLifecycleSummary;
  missingEvidence: string[];
  invalidationConditions: string[];
  recommendedNextStep: string;
  traces: DiscoveryTrace[];
  metadata: {
    module: "discovery";
    version: "v1";
    createdAt: string;
  };
};

type NormalizedCandidate = DiscoveryCandidate & {
  id: string;
  label: string;
  scoreValue: number;
  confidenceValue: number;
  previousScoreValue: number | null;
  velocityValue: number;
  persistenceValue: number;
  statusValue?: DiscoveryStatus;
};

type NormalizedEvidence = DiscoveryRankedEvidence & {
  candidateId?: string;
  observed: boolean;
  missing: boolean;
  predictive: boolean;
  misleading: boolean;
};

type OutcomeRecord = {
  id: string;
  profile: Map<string, number | string | boolean>;
  label: "positive" | "negative" | "neutral";
  evidenceLabels: string[];
  predictiveEvidence: string[];
  misleadingEvidence: string[];
  failureModes: string[];
  invalidationConditions: string[];
  similarity: number;
};

type DiscoveryComputation = {
  input: DiscoveryInput;
  state: Record<string, unknown>;
  candidates: NormalizedCandidate[];
  evidence: NormalizedEvidence[];
  support: NormalizedEvidence[];
  contradiction: NormalizedEvidence[];
  missingEvidence: string[];
  contextMatch: DiscoveryContextMatch[];
  memory: DiscoveryMemorySummary;
  novelty: number;
  candidateStrength: number;
  evidenceScore: number;
  contradictionScore: number;
  constraintScore: number;
  confidence: number;
  trust: number;
  fragility: number;
  lifecycle: DiscoveryLifecycleSummary;
  foresight: DiscoveryForesightSummary;
  explanation: DiscoveryExplanation;
  traces: DiscoveryTrace[];
};

const STATUS_RANK: Record<DiscoveryStatus, number> = {
  none: 0,
  detected: 18,
  emerging: 34,
  strengthening: 52,
  eligible: 70,
  sized: 82,
  active: 92,
  closed: 100,
};

const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";

/**
 * Discovery is a single bundled decision-intelligence pass.
 *
 * It combines memory, foresight, context comparison, explanation, and lifecycle
 * tracking while staying deterministic and domain-agnostic. Incomplete inputs
 * become missing-evidence notes and confidence penalties instead of exceptions.
 */
export function discover(input: DiscoveryInput): DiscoveryResult {
  const source = (input ?? { state: {} }) as DiscoveryInput;
  const computation = compute(source);
  const opportunities = buildOpportunities(computation);
  const status = opportunities[0]?.status ?? computation.lifecycle.status;

  return {
    status,
    opportunities,
    confidence: computation.confidence,
    trust: computation.trust,
    fragility: computation.fragility,
    novelty: computation.novelty,
    maturity: computation.lifecycle.maturity,
    contextMatch: computation.contextMatch,
    memory: computation.memory,
    foresight: computation.foresight,
    explanation: computation.explanation,
    lifecycle: computation.lifecycle,
    missingEvidence: computation.missingEvidence,
    invalidationConditions: computation.foresight.invalidationConditions,
    recommendedNextStep: recommendedNextStep(status, computation),
    traces: computation.traces,
    metadata: {
      module: "discovery",
      version: "v1",
      createdAt: createdAtFor(source.now),
    },
  };
}

export const runDiscovery = discover;

function compute(input: DiscoveryInput): DiscoveryComputation {
  const state = plainRecord(input.state) ? input.state : {};
  const candidates = normalizeCandidates(input.candidates);
  const evidence = normalizeEvidence(input.evidence);
  const support = evidence.filter((item) => item.direction === "support" && item.observed && !item.missing);
  const contradiction = evidence.filter((item) => item.direction === "contradict" && item.observed && !item.missing);
  const missingEvidence = unique([
    ...missingEvidenceForState(state),
    ...missingEvidenceForCandidates(candidates),
    ...missingEvidenceFromEvidence(evidence),
    ...missingEvidenceFromConstraints(input.constraints),
  ]);
  const contextMatch = compareContext(state, input.historicalStates);
  const novelty = noveltyFromContext(contextMatch, input.historicalStates);
  const outcomeRecords = normalizeOutcomes(input.priorOutcomes, profileForState(state), candidates, evidence);
  const memory = summarizeMemory(outcomeRecords);
  const candidateStrength = candidates.length ? average(candidates.map((candidate) => candidate.scoreValue)) : 0;
  const evidenceScore = support.length ? weightedAverage(support.map((item) => [item.contribution, item.weight])) : 0;
  const contradictionScore = contradiction.length ? weightedAverage(contradiction.map((item) => [item.contribution, item.weight])) : 0;
  const constraintScore = constraintsScore(input.constraints);
  const missingPenalty = clamp(missingEvidence.length * 7);
  const noveltyPenalty = novelty > 70 ? (novelty - 70) * 0.6 : 0;
  const memoryPenalty = memory.sampleSize > 0 && memory.failureRatio > memory.successRatio
    ? (memory.failureRatio - memory.successRatio) * 0.35
    : 0;
  const confidence = roundScore(clamp(
    candidateStrength * 0.28 +
      evidenceScore * 0.34 +
      memory.reliability * 0.16 +
      (100 - novelty) * 0.12 +
      constraintScore * 0.1 -
      contradictionScore * 0.28 -
      missingPenalty -
      noveltyPenalty -
      memoryPenalty,
  ));
  const trust = roundScore(clamp(
    memory.reliability * 0.34 +
      constraintScore * 0.24 +
      (100 - novelty) * 0.18 +
      evidenceScore * 0.24 -
      contradictionScore * 0.16 -
      missingPenalty * 0.45,
  ));
  const fragility = roundScore(clamp(
    contradictionScore * 0.34 +
      novelty * 0.24 +
      missingPenalty * 0.22 +
      (100 - constraintScore) * 0.2,
  ));
  const lifecycle = lifecycleFor({
    candidates,
    confidence,
    trust,
    fragility,
    novelty,
    evidenceScore,
    contradictionScore,
    missingEvidence,
  });
  const foresight = foresightFor({
    contradiction,
    missingEvidence,
    memory,
    novelty,
    constraints: input.constraints,
    support,
    confidence,
    fragility,
  });
  const traces = tracesFor({
    candidateStrength,
    evidenceScore,
    contradictionScore,
    memory,
    novelty,
    constraintScore,
    missingPenalty,
    confidence,
  });
  const explanation = explanationFor({
    support,
    contradiction,
    missingEvidence,
    traces,
    confidence,
    status: lifecycle.status,
  });

  return {
    input,
    state,
    candidates,
    evidence,
    support,
    contradiction,
    missingEvidence,
    contextMatch,
    memory,
    novelty,
    candidateStrength: roundScore(candidateStrength),
    evidenceScore: roundScore(evidenceScore),
    contradictionScore: roundScore(contradictionScore),
    constraintScore: roundScore(constraintScore),
    confidence,
    trust,
    fragility,
    lifecycle,
    foresight,
    explanation,
    traces,
  };
}

function buildOpportunities(computation: DiscoveryComputation): DiscoveredOpportunity[] {
  if (computation.lifecycle.status === "none") return [];

  const candidates = computation.candidates.length
    ? computation.candidates
    : [syntheticCandidate(computation)];

  return candidates
    .map((candidate) => opportunityFromCandidate(candidate, computation))
    .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
}

function opportunityFromCandidate(
  candidate: NormalizedCandidate,
  computation: DiscoveryComputation,
): DiscoveredOpportunity {
  const support = evidenceForCandidate(computation.support, candidate);
  const contradiction = evidenceForCandidate(computation.contradiction, candidate);
  const strength = roundScore(clamp((candidate.scoreValue + computation.evidenceScore) / 2));
  const confidence = roundScore(clamp(
    computation.confidence * 0.72 + candidate.confidenceValue * 0.18 + strength * 0.1,
  ));
  const status = candidate.statusValue && candidate.statusValue !== "none"
    ? candidate.statusValue
    : computation.lifecycle.status;

  return {
    id: candidate.id,
    ...(candidate.subjectId ? { subjectId: candidate.subjectId } : {}),
    ...(computation.input.domain ? { domain: computation.input.domain } : {}),
    label: candidate.label,
    candidateId: candidate.candidateId ?? candidate.id,
    status,
    strength,
    confidence,
    trust: computation.trust,
    fragility: computation.fragility,
    novelty: computation.novelty,
    maturity: computation.lifecycle.maturity,
    readiness: computation.lifecycle.readiness,
    supportingEvidence: support,
    contradictoryEvidence: contradiction,
    missingEvidence: unique([
      ...(candidate.missingEvidence ?? []),
      ...computation.missingEvidence,
    ]),
    invalidationConditions: unique([
      ...(candidate.invalidationConditions ?? []),
      ...computation.foresight.invalidationConditions,
    ]),
    unlockConditions: computation.foresight.unlockConditions,
    explanation: `${candidate.label} is ${status}; confidence is ${confidence}/100 after memory, context, evidence, and foresight checks.`,
    lifecycle: computation.lifecycle,
    traces: computation.traces,
  };
}

function syntheticCandidate(computation: DiscoveryComputation): NormalizedCandidate {
  return {
    id: computation.input.subjectId ?? "discovery:aggregate",
    label: computation.input.subjectId ?? "Aggregate opportunity",
    scoreValue: computation.evidenceScore,
    confidenceValue: computation.confidence,
    previousScoreValue: null,
    velocityValue: 0,
    persistenceValue: 50,
    evidence: computation.support.map((item) => item.label),
  };
}

function normalizeCandidates(candidates: DiscoveryCandidate[] | undefined): NormalizedCandidate[] {
  return array(candidates).map((candidate, index) => {
    const id = stringValue(candidate.id ?? candidate.candidateId ?? candidate.subjectId) ?? `candidate:${index + 1}`;
    const scoreValue = score(firstNumber(
      candidate.score,
      candidate.strength,
      candidate.maturity,
      candidate.readiness,
      candidate.confidence,
    ), 0);
    const confidenceValue = score(firstNumber(candidate.confidence, candidate.trust, scoreValue), scoreValue);
    const previousScoreValue = optionalScore(candidate.previousScore);
    const velocityValue = score(firstNumber(
      candidate.velocity,
      previousScoreValue == null ? undefined : scoreValue - previousScoreValue,
    ), 0);
    const persistenceValue = score(candidate.persistence, candidate.status === "active" ? 80 : 50);

    return {
      ...candidate,
      id,
      /* c8 ignore next */
      label: stringValue(candidate.label ?? candidate.kind ?? id) ?? id,
      scoreValue,
      confidenceValue,
      previousScoreValue,
      velocityValue,
      persistenceValue,
      statusValue: normalizeStatus(candidate.lifecycleStatus ?? candidate.status),
    };
  });
}

function normalizeEvidence(evidence: DiscoveryEvidence[] | undefined): NormalizedEvidence[] {
  return array(evidence).map((item, index) => {
    const id = stringValue(item.id) ?? `evidence:${index + 1}`;
    /* c8 ignore next */
    const label = stringValue(item.label ?? item.name ?? item.description ?? id) ?? id;
    const strength = score(firstNumber(item.strength, item.score, item.confidence), 50);
    const confidence = score(item.confidence, 60);
    const weight = score(item.weight, 1) / 100 || 0.01;
    const direction = directionFor(item);
    const contribution = roundScore(clamp(strength * 0.7 + confidence * 0.3));

    return {
      id,
      label,
      direction,
      group: stringValue(item.group ?? item.source) ?? "evidence",
      strength,
      confidence,
      weight,
      contribution,
      reason: stringValue(item.description) ?? `${label} contributes ${contribution}/100 as ${direction} evidence.`,
      candidateId: stringValue(item.candidateId),
      observed: item.observed !== false,
      missing: item.missing === true || item.observed === false,
      predictive: item.predictive === true,
      misleading: item.misleading === true,
    };
  }).sort((left, right) => right.contribution - left.contribution || left.id.localeCompare(right.id));
}

function directionFor(item: DiscoveryEvidence): DiscoveryEvidenceDirection {
  if (item.direction === "support" || item.direction === "contradict" || item.direction === "neutral") {
    return item.direction;
  }
  const strength = Number(item.strength ?? item.score);
  if (Number.isFinite(strength) && strength < 0) return "contradict";
  return "support";
}

function compareContext(
  state: Record<string, unknown>,
  historicalStates: DiscoveryHistoricalState[] | undefined,
): DiscoveryContextMatch[] {
  const current = profileForState(state);
  return array(historicalStates)
    .map((item, index) => {
      const similarity = roundScore(similarityBetween(current, profileForState(item.state ?? {})));
      return {
        id: stringValue(item.id) ?? `context:${index + 1}`,
        label: stringValue(item.label ?? item.domain ?? item.id) ?? `Context ${index + 1}`,
        similarity,
        novelty: roundScore(100 - similarity),
        reason: similarity >= 70
          ? "Current state is well represented by this prior context."
          : "Current state only partially matches this prior context.",
      };
    })
    .sort((left, right) => right.similarity - left.similarity || left.id.localeCompare(right.id))
    .slice(0, 5);
}

function noveltyFromContext(
  matches: DiscoveryContextMatch[],
  historicalStates: DiscoveryHistoricalState[] | undefined,
) {
  if (!array(historicalStates).length) return 100;
  /* c8 ignore next */
  return roundScore(100 - (matches[0]?.similarity ?? 0));
}

function normalizeOutcomes(
  outcomes: DiscoveryOutcome[] | undefined,
  currentProfile: Map<string, number | string | boolean>,
  candidates: NormalizedCandidate[],
  evidence: NormalizedEvidence[],
): OutcomeRecord[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const evidenceLabels = evidence.map((item) => item.label);

  return array(outcomes)
    .map((outcome, index) => {
      const profile = profileForState(outcome.state ?? {});
      for (const item of array(outcome.evidence)) {
        profile.set(`evidence:${stringValue(item.label ?? item.name ?? item.id) ?? "unknown"}`, true);
      }
      if (outcome.candidateId && candidateIds.has(outcome.candidateId)) {
        profile.set(`candidate:${outcome.candidateId}`, true);
      }
      for (const label of evidenceLabels) {
        if (array(outcome.evidence).some((item) => stringValue(item.label ?? item.name ?? item.id) === label)) {
          profile.set(`current-evidence:${label}`, true);
        }
      }

      return {
        id: stringValue(outcome.id ?? outcome.candidateId) ?? `outcome:${index + 1}`,
        profile,
        label: outcomeLabel(outcome),
        evidenceLabels: array(outcome.evidence).map((item) => stringValue(item.label ?? item.name ?? item.id) ?? "Unnamed evidence"),
        predictiveEvidence: array(outcome.predictiveEvidence).map(String),
        misleadingEvidence: array(outcome.misleadingEvidence).map(String),
        failureModes: array(outcome.failureModes).map(String),
        invalidationConditions: array(outcome.invalidationConditions).map(String),
        similarity: roundScore(similarityBetween(currentProfile, profile)),
      };
    })
    .filter((record) => record.similarity >= 35)
    .sort((left, right) => right.similarity - left.similarity || left.id.localeCompare(right.id));
}

function outcomeLabel(outcome: DiscoveryOutcome): OutcomeRecord["label"] {
  if (outcome.success === true) return "positive";
  if (outcome.success === false) return "negative";

  const value = String(outcome.outcome ?? outcome.result ?? "").toLowerCase();
  if (["positive", "success", "succeeded", "helped", "valid"].includes(value)) return "positive";
  if (["negative", "failure", "failed", "invalidated", "hurt", "blocked"].includes(value)) return "negative";

  const numeric = firstNumber(outcome.score, outcome.value);
  if (numeric != null && numeric > 0) return "positive";
  if (numeric != null && numeric < 0) return "negative";
  return "neutral";
}

function summarizeMemory(records: OutcomeRecord[]): DiscoveryMemorySummary {
  const sampleSize = records.length;
  const positiveOutcomes = records.filter((record) => record.label === "positive").length;
  const negativeOutcomes = records.filter((record) => record.label === "negative").length;
  const neutralOutcomes = records.filter((record) => record.label === "neutral").length;
  const successRatio = ratio(positiveOutcomes, sampleSize);
  const failureRatio = ratio(negativeOutcomes, sampleSize);
  const neutralRatio = ratio(neutralOutcomes, sampleSize);
  const sampleCoverage = clamp(sampleSize * 12.5);
  const consistency = sampleSize ? Math.max(successRatio, failureRatio, neutralRatio) : 0;
  const reliability = roundScore(clamp(sampleCoverage * 0.5 + consistency * 0.5));
  const successPatterns = rankedTerms(records.filter((record) => record.label === "positive").flatMap((record) => [
    ...record.evidenceLabels,
    ...record.predictiveEvidence,
  ]));
  const failurePatterns = rankedTerms(records.filter((record) => record.label === "negative").flatMap((record) => [
    ...record.evidenceLabels,
    ...record.failureModes,
  ]));

  return {
    sampleSize,
    similarOutcomes: sampleSize,
    positiveOutcomes,
    negativeOutcomes,
    neutralOutcomes,
    successRatio: roundScore(successRatio),
    failureRatio: roundScore(failureRatio),
    neutralRatio: roundScore(neutralRatio),
    reliability,
    recurringSuccessPatterns: successPatterns.slice(0, 4),
    recurringFailurePatterns: failurePatterns.slice(0, 4),
    mostPredictiveEvidence: rankedTerms(records.flatMap((record) => record.predictiveEvidence)).slice(0, 4),
    mostMisleadingEvidence: rankedTerms(records.flatMap((record) => record.misleadingEvidence)).slice(0, 4),
  };
}

function lifecycleFor(args: {
  candidates: NormalizedCandidate[];
  confidence: number;
  trust: number;
  fragility: number;
  novelty: number;
  evidenceScore: number;
  contradictionScore: number;
  missingEvidence: string[];
}): DiscoveryLifecycleSummary {
  const explicit = args.candidates.map((candidate) => candidate.statusValue).find(Boolean);
  const previous = previousStatus(args.candidates);
  const persistence = roundScore(args.candidates.length ? average(args.candidates.map((candidate) => candidate.persistenceValue)) : 30);
  const velocity = roundScore(clamp(50 + average(args.candidates.map((candidate) => candidate.velocityValue))));
  const readiness = roundScore(clamp(args.confidence * 0.38 + args.trust * 0.24 + (100 - args.fragility) * 0.22 + persistence * 0.16));
  const status = explicit ?? statusForScores({
    confidence: args.confidence,
    evidenceScore: args.evidenceScore,
    contradictionScore: args.contradictionScore,
    missingCount: args.missingEvidence.length,
    velocity,
    readiness,
    candidateCount: args.candidates.length,
  });
  const maturity = roundScore(clamp(STATUS_RANK[status] * 0.65 + readiness * 0.35));
  const decayRisk = roundScore(clamp(args.fragility * 0.48 + (100 - persistence) * 0.28 + args.contradictionScore * 0.24));

  return {
    status,
    ...(previous ? { previousStatus: previous } : {}),
    transitionReason: transitionReason(status, previous, args.confidence, args.missingEvidence.length),
    maturity,
    persistence,
    velocity,
    decayRisk,
    readiness,
    stageScores: stageScoresFor(args.confidence, readiness),
  };
}

function statusForScores(args: {
  confidence: number;
  evidenceScore: number;
  contradictionScore: number;
  missingCount: number;
  velocity: number;
  readiness: number;
  candidateCount: number;
}): DiscoveryStatus {
  if (args.candidateCount === 0 && args.evidenceScore < 35) return "none";
  if (args.confidence < 25 || args.contradictionScore >= 80) return "none";
  if (args.confidence >= 78 && args.readiness >= 78 && args.missingCount === 0) return "eligible";
  if (args.confidence >= 66 && args.evidenceScore >= 62 && args.contradictionScore < 45) return "strengthening";
  if (args.confidence >= 42 && args.velocity >= 52) return "emerging";
  return "detected";
}

function previousStatus(candidates: NormalizedCandidate[]): DiscoveryStatus | undefined {
  const scoreValue = candidates
    .map((candidate) => candidate.previousScoreValue)
    .find((value): value is number => value != null);
  if (scoreValue == null) return undefined;
  if (scoreValue >= 72) return "eligible";
  if (scoreValue >= 60) return "strengthening";
  if (scoreValue >= 45) return "emerging";
  return "detected";
}

function transitionReason(
  status: DiscoveryStatus,
  previous: DiscoveryStatus | undefined,
  confidence: number,
  missingCount: number,
) {
  if (status === "none") return "Evidence does not yet support an opportunity.";
  if (previous && previous !== status) return `Lifecycle moved from ${previous} to ${status} as confidence reached ${roundScore(confidence)}/100.`;
  if (missingCount > 0) return `${status} is held back by ${missingCount} missing evidence item${missingCount === 1 ? "" : "s"}.`;
  return `${status} is supported by the current evidence, memory, context, and foresight checks.`;
}

function stageScoresFor(confidence: number, readiness: number): Record<DiscoveryStatus, number> {
  return {
    none: roundScore(clamp(100 - confidence)),
    detected: roundScore(clamp(confidence * 0.55)),
    emerging: roundScore(clamp(confidence * 0.72)),
    strengthening: roundScore(clamp(confidence * 0.88)),
    eligible: roundScore(clamp((confidence + readiness) / 2)),
    sized: roundScore(clamp(readiness * 0.9)),
    active: roundScore(clamp(readiness * 0.82)),
    closed: 0,
  };
}

function foresightFor(args: {
  contradiction: NormalizedEvidence[];
  missingEvidence: string[];
  memory: DiscoveryMemorySummary;
  novelty: number;
  constraints: DiscoveryConstraint[] | undefined;
  support: NormalizedEvidence[];
  confidence: number;
  fragility: number;
}): DiscoveryForesightSummary {
  const invalidationConditions = unique([
    ...args.contradiction.slice(0, 3).map((item) => `${item.label} strengthens beyond the current support case.`),
    ...array(args.constraints).flatMap((constraint) => stringList(constraint.invalidationCondition)),
    ...(args.memory.failureRatio > args.memory.successRatio ? ["Similar prior outcomes continue to fail more often than they succeed."] : []),
    ...(args.novelty > 75 ? ["The current context remains too novel to compare with known states."] : []),
  ]);
  const unlockConditions = unique([
    ...args.missingEvidence.slice(0, 4).map((item) => `Collect or validate ${item}.`),
    ...array(args.constraints).flatMap((constraint) => stringList(constraint.unlockCondition)),
    ...(args.memory.sampleSize < 3 ? ["Add comparable outcomes to improve memory reliability."] : []),
    ...(args.novelty > 75 ? ["Add historical states that resemble the current context."] : []),
  ]);
  const fragilityDrivers = unique([
    ...args.contradiction.slice(0, 3).map((item) => item.label),
    ...(args.missingEvidence.length ? ["Missing evidence"] : []),
    ...(args.novelty > 75 ? ["Novel context"] : []),
  ]);
  const safetyDrivers = unique([
    ...args.support.slice(0, 3).map((item) => item.label),
    ...(args.memory.successRatio >= args.memory.failureRatio && args.memory.sampleSize ? ["Similar outcomes are not net negative"] : []),
  ]);
  const counterfactuals: DiscoveryCounterfactual[] = [
    ...invalidationConditions.slice(0, 3).map((condition) => ({
      type: "invalidate" as const,
      condition,
      impact: roundScore(Math.max(40, args.fragility)),
      confidence: roundScore(args.confidence),
    })),
    ...unlockConditions.slice(0, 3).map((condition) => ({
      type: "confirm" as const,
      condition,
      impact: roundScore(Math.max(35, 100 - args.fragility)),
      confidence: roundScore(args.confidence),
    })),
    {
      type: "fragile",
      condition: "Contradictions grow while missing evidence remains unresolved.",
      impact: roundScore(args.fragility),
      confidence: roundScore(args.confidence),
    },
    {
      type: "safer",
      condition: "Independent support persists and context similarity improves.",
      impact: roundScore(100 - args.fragility),
      confidence: roundScore(args.confidence),
    },
  ];

  return {
    counterfactuals,
    invalidationConditions,
    unlockConditions,
    fragilityDrivers,
    safetyDrivers,
  };
}

function explanationFor(args: {
  support: NormalizedEvidence[];
  contradiction: NormalizedEvidence[];
  missingEvidence: string[];
  traces: DiscoveryTrace[];
  confidence: number;
  status: DiscoveryStatus;
}): DiscoveryExplanation {
  const positive = args.traces.filter((trace) => trace.contribution >= 0);
  const negative = args.traces.filter((trace) => trace.contribution < 0);

  return {
    summary: `Discovery is ${args.status} with ${roundScore(args.confidence)}/100 confidence.`,
    supportingEvidence: args.support.slice(0, 6),
    contradictoryEvidence: args.contradiction.slice(0, 6),
    confidenceAttribution: positive.map((trace) => ({
      group: trace.id,
      score: trace.score,
      weight: trace.weight,
      contribution: roundSigned(trace.contribution),
      reason: trace.reason,
    })),
    confidencePenalties: negative.map((trace) => ({
      group: trace.id,
      score: trace.score,
      weight: trace.weight,
      contribution: roundSigned(trace.contribution),
      reason: trace.reason,
    })),
    missingEvidence: args.missingEvidence,
  };
}

function tracesFor(args: {
  candidateStrength: number;
  evidenceScore: number;
  contradictionScore: number;
  memory: DiscoveryMemorySummary;
  novelty: number;
  constraintScore: number;
  missingPenalty: number;
  confidence: number;
}): DiscoveryTrace[] {
  return [
    trace("candidate", "Candidate strength", args.candidateStrength, 0.28, "Candidate quality contributes to discovery confidence."),
    trace("evidence", "Supporting evidence", args.evidenceScore, 0.34, "Observed support explains why the opportunity may exist."),
    trace("memory", "Memory reliability", args.memory.reliability, 0.16, "Similar outcomes determine how much prior memory can be trusted."),
    trace("context", "Context familiarity", 100 - args.novelty, 0.12, "Known contexts reduce uncertainty."),
    trace("constraints", "Constraint health", args.constraintScore, 0.1, "Passed constraints increase readiness before action."),
    trace("contradiction", "Contradiction penalty", args.contradictionScore, -0.28, "Contradictory evidence reduces confidence."),
    trace("missing", "Missing evidence penalty", args.missingPenalty, -0.07, "Incomplete evidence lowers confidence instead of throwing."),
    trace("final", "Final confidence", args.confidence, 1, "Final normalized confidence after all discovery layers."),
  ];
}

function trace(id: string, label: string, scoreValue: number, weight: number, reason: string): DiscoveryTrace {
  return {
    id,
    label,
    value: roundScore(scoreValue),
    score: roundScore(scoreValue),
    weight,
    contribution: roundSigned(scoreValue * weight),
    reason,
  };
}

function evidenceForCandidate(
  evidence: NormalizedEvidence[],
  candidate: NormalizedCandidate,
): DiscoveryRankedEvidence[] {
  const ids = new Set([candidate.id, candidate.candidateId, ...array(candidate.evidenceIds)].filter(Boolean).map(String));
  const scoped = evidence.filter((item) => !item.candidateId || ids.has(item.candidateId));
  return (scoped.length ? scoped : evidence).slice(0, 6);
}

function recommendedNextStep(status: DiscoveryStatus, computation: DiscoveryComputation): string {
  if (status === "none") return "Wait for stronger support before treating this as an opportunity.";
  if (computation.missingEvidence.length) return `Resolve missing evidence: ${computation.missingEvidence[0]}.`;
  if (computation.fragility >= 70) return "Reduce fragility by addressing contradictions and context uncertainty.";
  if (status === "eligible") return "Prepare the opportunity for the next commitment boundary.";
  if (status === "strengthening") return "Keep tracking persistence and confirm the leading evidence cluster.";
  return "Continue observing until maturity and confidence improve.";
}

function constraintsScore(constraints: DiscoveryConstraint[] | undefined): number {
  const items = array(constraints);
  if (!items.length) return 70;
  return roundScore(average(items.map((constraint) => {
    if (constraint.passed === true) return 100;
    if (constraint.passed === false) return severityPenaltyScore(constraint.severity);
    return score(constraint.score, 60);
  })));
}

function severityPenaltyScore(severity: DiscoveryConstraint["severity"]) {
  const value = String(severity ?? "medium").toLowerCase();
  if (value === "critical") return 0;
  if (value === "high") return 20;
  if (value === "low") return 60;
  return 40;
}

function missingEvidenceForState(state: Record<string, unknown>) {
  return Object.keys(state).length ? [] : ["current state"];
}

function missingEvidenceForCandidates(candidates: NormalizedCandidate[]) {
  return candidates.length ? [] : ["candidate opportunity"];
}

function missingEvidenceFromEvidence(evidence: NormalizedEvidence[]) {
  const missing = evidence.filter((item) => item.missing).map((item) => item.label);
  const hasSupport = evidence.some((item) => item.direction === "support" && item.observed && !item.missing);
  return unique([
    ...missing,
    ...(hasSupport ? [] : ["supporting evidence"]),
  ]);
}

function missingEvidenceFromConstraints(constraints: DiscoveryConstraint[] | undefined) {
  return unique(array(constraints).flatMap((constraint) => stringList(constraint.missingEvidence)));
}

function profileForState(state: Record<string, unknown>) {
  const profile = new Map<string, number | string | boolean>();
  for (const [key, value] of Object.entries(state)) {
    const normalized = profileValue(value);
    if (normalized != null) profile.set(key, normalized);
  }
  return profile;
}

function similarityBetween(
  left: Map<string, number | string | boolean>,
  right: Map<string, number | string | boolean>,
) {
  const keys = unique([...left.keys(), ...right.keys()]);
  if (!keys.length) return 0;

  const scores = keys.map((key) => {
    if (!left.has(key) || !right.has(key)) return 0;
    const leftValue = left.get(key);
    const rightValue = right.get(key);
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return clamp(100 - Math.abs(leftValue - rightValue));
    }
    return leftValue === rightValue ? 100 : 0;
  });

  return average(scores);
}

function profileValue(value: unknown): number | string | boolean | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundScore(clamp(value));
  if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  if (typeof value === "boolean") return value;
  return null;
}

function rankedTerms(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value]) => value);
}

function createdAtFor(value: DiscoveryInput["now"]) {
  if (value == null) return DEFAULT_CREATED_AT;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return DEFAULT_CREATED_AT;
  return date.toISOString();
}

function normalizeStatus(value: unknown): DiscoveryStatus | undefined {
  const status = String(value ?? "").toLowerCase();
  return isStatus(status) ? status : undefined;
}

function isStatus(value: string): value is DiscoveryStatus {
  return value in STATUS_RANK;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function optionalScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed) : null;
}

function score(value: unknown, fallback: number) {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback);
}

function weightedAverage(values: Array<[number, number]>) {
  const totalWeight = values.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  /* c8 ignore next */
  if (totalWeight <= 0) return 0;
  return values.reduce((sum, [value, weight]) => sum + value * Math.max(0, weight), 0) / totalWeight;
}

function average(values: number[]) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function ratio(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function array<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter((value) => value != null)));
}

function clamp(value: number, min = 0, max = 100) {
  /* c8 ignore next */
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundScore(value: number) {
  return Number(clamp(value).toFixed(2));
}

/* c8 ignore start */
function roundSigned(value: number) {
  return Number(value.toFixed(2));
}
/* c8 ignore stop */
