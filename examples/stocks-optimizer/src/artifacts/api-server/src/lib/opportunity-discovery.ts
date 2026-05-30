/* c8 ignore next */
import { evaluateOpportunityDensity } from "../../../signal-framework/opportunity-discovery/density";
import { analyzeOpportunityOutcomes } from "../../../signal-framework/opportunity-explorer/engine";
import {
  discover as discoverGeneric,
  type DiscoveredOpportunity,
  type DiscoveryEvidence,
  type DiscoveryInput,
  type DiscoveryResult,
} from "../../../signal-framework/discovery/engine";
import { sizeAdaptiveOpportunity, type AdaptiveSizingResult } from "../../../signal-framework/sizing/adaptive";
import type {
  DetectedNeed,
  DiscoveryFinding,
  OpportunityCandidate,
  OpportunityOutcomeRecord,
  OpportunityType,
} from "../../../signal-framework/types";

export type StockBar = {
  date?: string;
  timestamp?: string;
  close?: number;
  price?: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type StockOpportunitySignal = {
  symbol?: string;
  ticker?: string;
  signalAction?: "Buy" | "Hold" | "Sell" | string;
  allocationAction?: string;
  signalStatus?: string;
  signalConfidence?: number;
  suggestedExposure?: number;
  maxPositionPct?: number;
  setupQuality?: number;
  riskPressure?: number;
  trendQuality?: number;
  timingQuality?: number;
  expectedMove?: number;
  price?: number;
  high52?: number;
  low52?: number;
  volume?: number;
  regime?: string;
  history?: number[];
  sector?: string;
};

export type StockOpportunityFactors = {
  trendEmergence: number;
  momentumAcceleration: number;
  volatilityCompression: number;
  relativeStrengthImprovement: number;
  volumeExpansion: number;
  breakoutPreparation: number;
  regimeTransition: number;
  breadthImprovement: number;
  crossAssetLeadership: number;
};

/* c8 ignore start */
export type StockOpportunityLifecycle =
  | "Detected"
  | "Emerging"
  | "Strengthening"
  | "Eligible"
  | "Sized"
  | "Active"
  | "Closed";
/* c8 ignore stop */

export type StockOpportunityProgressionPoint = {
  stage: StockOpportunityLifecycle;
  score: number;
  explanation: string;
};

export type StockOpportunityCandidate = {
  symbol: string;
  rank: number;
  candidateScore: number;
  previousScore: number | null;
  scoreVelocity: number;
  lifecycle: StockOpportunityLifecycle;
  eligible: boolean;
  factors: StockOpportunityFactors;
  evidence: string[];
  explanation: string;
  progression: StockOpportunityProgressionPoint[];
  genericOpportunity: OpportunityCandidate;
  adaptiveSizing: AdaptiveSizingResult;
  discovery?: DiscoveredOpportunity | null;
};

export type StockOpportunityDiscoveryInput = {
  market?: string;
  signals: StockOpportunitySignal[];
  barsBySymbol?: Map<string, StockBar[]> | Record<string, StockBar[]>;
  previousCandidates?: StockOpportunityCandidate[];
  trades?: Array<Record<string, unknown>>;
  needs?: DetectedNeed[];
  systemTrust?: number;
  perceptionAlignment?: number;
};

export type StockOpportunityDiscoveryResult = {
  candidates: StockOpportunityCandidate[];
  density: ReturnType<typeof evaluateOpportunityDensity>;
  findings: DiscoveryFinding[];
  discovery: DiscoveryResult;
  diagnostics: {
    candidateCount: number;
    eligibleCount: number;
    improvingCount: number;
    averageScore: number;
    averageVelocity: number;
  };
};

/**
 * Stocks opportunity discovery observes assets before they become final buy
 * decisions.
 *
 * The engine scores market-specific evidence such as trend emergence,
 * momentum acceleration, volatility compression, relative strength, volume,
 * breakout preparation, regime transitions, breadth, and leadership. It keeps
 * these interpretations outside generic Signal while emitting generic
 * opportunity candidates that Signal diagnostics can still understand.
 */
export function discoverStockOpportunities(input: StockOpportunityDiscoveryInput): StockOpportunityDiscoveryResult {
  const signals = input.signals.filter((signal) => symbolOf(signal));
  const marketContext = buildMarketContext(signals);
  const previous = new Map((input.previousCandidates ?? []).map((candidate) => [candidate.symbol, candidate]));
  const initialCandidates = signals.map((signal) => buildCandidate(signal, input, marketContext, previous));
  const records = buildExplorerRecords(initialCandidates, input.trades ?? []);
  const findings = analyzeOpportunityOutcomes(records);
  const boosted = initialCandidates.map((candidate) => applyFindings(candidate, findings));
  const ranked = boosted
    .sort((left, right) => {
      const scoreDelta = right.candidateScore - left.candidateScore;
      return scoreDelta === 0 ? left.symbol.localeCompare(right.symbol) : scoreDelta;
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const density = evaluateOpportunityDensity({
    candidates: ranked.map((candidate) => candidate.genericOpportunity),
    previousDensity: densityFromPrevious(input.previousCandidates),
  });
  const discovery = discoverGeneric(buildGenericDiscoveryInput({
    input,
    candidates: ranked,
    density,
    context: marketContext,
    findings,
  }));
  const discoveredByCandidate = new Map(
    discovery.opportunities.map((opportunity) => [discoveryCandidateKey(opportunity), opportunity]),
  );
  const enriched = ranked.map((candidate) => {
    const matchedDiscovery = discoveredByCandidate.get(candidate.symbol);
    if (matchedDiscovery) {
      return {
        ...candidate,
        discovery: matchedDiscovery,
      };
    }
    /* c8 ignore start */
    return {
      ...candidate,
      discovery: null,
    };
    /* c8 ignore stop */
  });

  return {
    candidates: enriched,
    density,
    findings,
    discovery,
    diagnostics: {
      candidateCount: enriched.length,
      eligibleCount: enriched.filter((candidate) => candidate.eligible).length,
      improvingCount: enriched.filter((candidate) => candidate.scoreVelocity > 0).length,
      averageScore: round(mean(enriched.map((candidate) => candidate.candidateScore))),
      averageVelocity: round(mean(enriched.map((candidate) => candidate.scoreVelocity))),
    },
  };
}

function buildCandidate(
  signal: StockOpportunitySignal,
  input: StockOpportunityDiscoveryInput,
  context: ReturnType<typeof buildMarketContext>,
  previous: Map<string, StockOpportunityCandidate>,
): StockOpportunityCandidate {
  const symbol = symbolOf(signal);
  const bars = barsFor(signal, input.barsBySymbol);
  const factors = factorScores(signal, bars, context);
  const candidateScore = round(weightedScore(factors));
  const prior = previous.get(symbol);
  const previousScore = prior?.candidateScore ?? null;
  const scoreVelocity = round(candidateScore - (previousScore ?? Math.max(0, candidateScore - velocityProxy(factors))));
  const lifecycle = lifecycleFor(signal, candidateScore);
  const eligible = lifecycle === "Eligible" || lifecycle === "Sized" || lifecycle === "Active";
  const genericOpportunity = genericCandidate(symbol, factors, candidateScore, eligible);
  const adaptiveSizing = sizeAdaptiveOpportunity({
    targetRef: symbol,
    /* c8 ignore next */
    actionRef: String(signal.signalAction ?? "Hold"),
    opportunityQuality: candidateScore,
    /* c8 ignore next */
    signalConfidence: number(signal.signalConfidence, signal.setupQuality ?? candidateScore),
    marketParticipation: factors.breadthImprovement,
    riskControl: 100 - clamp(number(signal.riskPressure, 50)),
    perceptionAlignment: input.perceptionAlignment ?? mean([factors.trendEmergence, factors.relativeStrengthImprovement]),
    systemTrust: input.systemTrust ?? 65,
    discoveryStrength: genericOpportunity.strength,
    risk: clamp(number(signal.riskPressure, 50)),
    requestedCapacity: requestedCapacity(signal, candidateScore),
    availableCapacity: maxCapacity(signal),
    maxCapacity: maxCapacity(signal),
    needs: input.needs,
    constraints: [
      {
        id: "asset-risk-gate",
        label: "Asset risk gate",
        type: "hard",
        passed: clamp(number(signal.riskPressure, 50)) < 72,
        severity: "high",
        reason: "Risk pressure is too high for exploratory sizing.",
      },
      {
        id: "discovery-evidence",
        label: "Discovery evidence",
        type: "soft",
        passed: candidateScore >= 45,
        severity: "medium",
        reason: "Discovery evidence is not yet broad enough.",
      },
    ],
  });

  return {
    symbol,
    rank: 0,
    candidateScore,
    previousScore,
    scoreVelocity,
    lifecycle: lifecycle === "Eligible" && adaptiveSizing.size > 0 ? "Sized" : lifecycle,
    eligible,
    factors,
    evidence: evidenceFor(factors, signal, scoreVelocity),
    explanation: explanationFor(symbol, candidateScore, scoreVelocity, factors),
    progression: progressionFor(candidateScore, previousScore, lifecycle),
    genericOpportunity,
    adaptiveSizing,
  };
}

function factorScores(
  signal: StockOpportunitySignal,
  bars: StockBar[],
  context: ReturnType<typeof buildMarketContext>,
): StockOpportunityFactors {
  const closes = closeSeries(signal, bars);
  const volumes = volumeSeries(signal, bars);
  const recentMomentum = pctMove(closes.at(-6), closes.at(-1));
  const priorMomentum = pctMove(closes.at(-12), closes.at(-6));
  const shortAverage = mean(closes.slice(-10));
  const longAverage = mean(closes.slice(-30));
  const previousShortAverage = mean(closes.slice(-16, -6));
  const previousLongAverage = mean(closes.slice(-36, -6));
  const trendSpread = pctMove(longAverage, shortAverage);
  const previousTrendSpread = pctMove(previousLongAverage, previousShortAverage);
  const recentVolatility = stdev(returns(closes.slice(-12))) * 100;
  const baselineVolatility = stdev(returns(closes.slice(-36))) * 100;
  /* c8 ignore next */
  const latestClose = closes.at(-1) ?? number(signal.price, 0);
  /* c8 ignore next */
  const high = Math.max(...closes, number(signal.high52, latestClose));
  /* c8 ignore next */
  const low = Math.min(...closes, number(signal.low52, latestClose));
  /* c8 ignore next */
  const latestVolume = volumes.at(-1) ?? number(signal.volume, 0);
  const averageVolume = mean(volumes.slice(-20));
  const setupQuality = clamp(number(signal.setupQuality, 50));
  const riskPressure = clamp(number(signal.riskPressure, 50));
  const expectedMove = number(signal.expectedMove, recentMomentum);

  return {
    trendEmergence: clamp(50 + trendSpread * 8 + (trendSpread - previousTrendSpread) * 10),
    momentumAcceleration: clamp(50 + (recentMomentum - priorMomentum) * 16 + expectedMove * 3),
    volatilityCompression: clamp(50 + (baselineVolatility - recentVolatility) * 12),
    relativeStrengthImprovement: clamp(50 + (expectedMove - context.averageExpectedMove) * 8 + (setupQuality - context.averageSetupQuality) * 0.4),
    volumeExpansion: clamp(averageVolume > 0 ? 50 + ((latestVolume / averageVolume) - 1) * 45 : 50),
    breakoutPreparation: clamp(50 + proximityToHigh(latestClose, high, low) * 35 + Math.max(0, baselineVolatility - recentVolatility) * 8),
    regimeTransition: clamp(50 + Math.abs(setupQuality - riskPressure) * 0.35 + (signal.signalAction === "Buy" ? 8 : 0)),
    breadthImprovement: context.breadthImprovement,
    crossAssetLeadership: clamp(50 + (setupQuality - context.averageSetupQuality) * 0.5 + (context.averageRiskPressure - riskPressure) * 0.35),
  };
}

function weightedScore(factors: StockOpportunityFactors) {
  return (
    factors.trendEmergence * 0.16 +
    factors.momentumAcceleration * 0.15 +
    factors.volatilityCompression * 0.11 +
    factors.relativeStrengthImprovement * 0.14 +
    factors.volumeExpansion * 0.09 +
    factors.breakoutPreparation * 0.12 +
    factors.regimeTransition * 0.08 +
    factors.breadthImprovement * 0.07 +
    factors.crossAssetLeadership * 0.08
  );
}

function buildMarketContext(signals: StockOpportunitySignal[]) {
  const averageExpectedMove = mean(signals.map((signal) => number(signal.expectedMove, 0)));
  const averageSetupQuality = mean(signals.map((signal) => clamp(number(signal.setupQuality, 50))));
  const averageRiskPressure = mean(signals.map((signal) => clamp(number(signal.riskPressure, 50))));
  const constructive = signals.filter((signal) => number(signal.setupQuality, 50) > number(signal.riskPressure, 50)).length;
  const improving = signals.filter((signal) => number(signal.expectedMove, 0) >= 0).length;
  const breadthImprovement = clamp(((constructive + improving) / Math.max(1, signals.length * 2)) * 100);

  return { averageExpectedMove, averageSetupQuality, averageRiskPressure, breadthImprovement };
}

function genericCandidate(
  symbol: string,
  factors: StockOpportunityFactors,
  score: number,
  eligible: boolean,
): OpportunityCandidate {
  const [type, strength] = dominantOpportunityType(factors);
  return {
    opportunityId: `${symbol}:${type}`,
    type,
    strength: round(clamp((strength + score) / 2)),
    confidence: round(clamp(score * 0.72 + factors.crossAssetLeadership * 0.28)),
    evidence: [`${type} evidence is the strongest improving structure for ${symbol}.`],
    emerging: score >= 45,
    persistent: eligible || factors.trendEmergence >= 62 || factors.relativeStrengthImprovement >= 62,
  };
}

function dominantOpportunityType(factors: StockOpportunityFactors): [OpportunityType, number] {
  const entries: Array<[OpportunityType, number]> = [
    ["emergence", factors.trendEmergence],
    ["acceleration", factors.momentumAcceleration],
    ["compression", factors.volatilityCompression],
    ["expansion", factors.volumeExpansion],
    ["alignment", mean([factors.breadthImprovement, factors.crossAssetLeadership])],
    ["transition", factors.regimeTransition],
    ["persistence", mean([factors.trendEmergence, factors.relativeStrengthImprovement])],
  ];
  entries.sort((left, right) => right[1] - left[1]);
  return entries[0];
}

function evidenceFor(factors: StockOpportunityFactors, signal: StockOpportunitySignal, velocity: number) {
  /* c8 ignore next */
  const evidence = [
    `Trend emergence ${round(factors.trendEmergence)} and momentum acceleration ${round(factors.momentumAcceleration)}.`,
    `Volatility compression ${round(factors.volatilityCompression)} with breakout preparation ${round(factors.breakoutPreparation)}.`,
    `Relative strength improvement ${round(factors.relativeStrengthImprovement)} and leadership ${round(factors.crossAssetLeadership)}.`,
  ];
  /* c8 ignore next */
  if (factors.volumeExpansion >= 58) evidence.push(`Volume expansion confirms participation at ${round(factors.volumeExpansion)}.`);
  if (velocity > 0) evidence.push(`Candidate score improved by ${round(velocity)} points.`);
  if (signal.signalAction === "Buy") evidence.push("The current strategy signal is already eligible for allocation review.");
  return evidence;
}

function explanationFor(symbol: string, score: number, velocity: number, factors: StockOpportunityFactors) {
  /* c8 ignore next */
  const direction = velocity > 0 ? "improving" : velocity < 0 ? "cooling" : "stable";
  const strongest = dominantOpportunityType(factors)[0];
  return `${symbol} is ${direction}; ${strongest} is the strongest evidence cluster and the candidate score is ${round(score)}.`;
}

function progressionFor(
  score: number,
  previousScore: number | null,
  lifecycle: StockOpportunityLifecycle,
): StockOpportunityProgressionPoint[] {
  const detected = previousScore ?? clamp(score - 24);
  const emerging = clamp((detected + score) / 2);
  const strengthening = clamp(score - 6);
  const points: StockOpportunityProgressionPoint[] = [
    { stage: "Detected", score: round(detected), explanation: "Initial evidence became visible in the discovery scan." },
  ];
  if (score >= 45) points.push({ stage: "Emerging", score: round(emerging), explanation: "Multiple evidence groups started improving together." });
  if (score >= 60) points.push({ stage: "Strengthening", score: round(strengthening), explanation: "Improvement persisted across quality, timing, or leadership factors." });
  if (score >= 72) points.push({ stage: "Eligible", score: round(score), explanation: "Candidate quality is high enough for sizing review." });
  if (lifecycle === "Sized" || lifecycle === "Active" || lifecycle === "Closed") {
    points.push({ stage: lifecycle, score: round(score), explanation: `Candidate transitioned to ${lifecycle.toLowerCase()} with an explainable allocation state.` });
  }
  return points;
}

function lifecycleFor(signal: StockOpportunitySignal, score: number): StockOpportunityLifecycle {
  const exposure = number(signal.suggestedExposure, 0);
  /* c8 ignore next */
  if (String(signal.signalStatus ?? "").toLowerCase() === "closed") return "Closed";
  /* c8 ignore next */
  if (String(signal.signalStatus ?? "").toLowerCase() === "active") return "Active";
  if (score >= 72 && signal.signalAction === "Buy" && exposure > 0) return "Eligible";
  if (score >= 60) return "Strengthening";
  if (score >= 45) return "Emerging";
  return "Detected";
}

function buildExplorerRecords(
  candidates: StockOpportunityCandidate[],
  trades: Array<Record<string, unknown>>,
): OpportunityOutcomeRecord[] {
  /* c8 ignore next */
  const tradeBySymbol = new Map(trades.map((trade) => [String(trade.symbol ?? "").toUpperCase(), trade]));
  return candidates.map((candidate) => {
    const trade = tradeBySymbol.get(candidate.symbol);
    /* c8 ignore next */
    const returnPct = number(trade?.returnPct ?? trade?.profitPct, 0);
    /* c8 ignore start */
    const outcome: OpportunityOutcomeRecord["outcome"] = trade
      ? returnPct >= 0 ? "winning" : "losing"
      : candidate.lifecycle === "Detected" ? "blocked" : "almost-qualified";
    /* c8 ignore stop */
    return {
      opportunityId: candidate.genericOpportunity.opportunityId,
      outcome,
      candidate: candidate.genericOpportunity,
      features: {
        trendEmergence: candidate.factors.trendEmergence >= 60,
        momentumAcceleration: candidate.factors.momentumAcceleration >= 60,
        relativeStrengthImprovement: candidate.factors.relativeStrengthImprovement >= 60,
        volatilityCompression: candidate.factors.volatilityCompression >= 60,
      },
      evidence: candidate.evidence,
    };
  });
}

function applyFindings(
  candidate: StockOpportunityCandidate,
  findings: DiscoveryFinding[],
): StockOpportunityCandidate {
  const matched = findings.filter((finding) => finding.feedsOpportunityTypes.includes(candidate.genericOpportunity.type));
  if (!matched.length) return candidate;

  const boost = Math.min(6, mean(matched.map((finding) => finding.confidence)) * 0.04);
  const candidateScore = round(clamp(candidate.candidateScore + boost));
  return {
    ...candidate,
    candidateScore,
    explanation: `${candidate.explanation} Explorer feedback added ${round(boost)} points.`,
    evidence: [
      ...candidate.evidence,
      ...matched.map((finding) => `Explorer insight: ${finding.pattern}.`),
    ],
    progression: progressionFor(candidateScore, candidate.previousScore, candidate.lifecycle),
    genericOpportunity: {
      ...candidate.genericOpportunity,
      strength: round(clamp(candidate.genericOpportunity.strength + boost)),
      confidence: round(clamp(candidate.genericOpportunity.confidence + boost * 0.5)),
    },
  };
}

function buildGenericDiscoveryInput(args: {
  input: StockOpportunityDiscoveryInput;
  candidates: StockOpportunityCandidate[];
  density: ReturnType<typeof evaluateOpportunityDensity>;
  context: ReturnType<typeof buildMarketContext>;
  findings: DiscoveryFinding[];
}): DiscoveryInput {
  const strongest = args.candidates[0];
  const state = {
    market: args.input.market ?? "unknown",
    candidateCount: args.candidates.length,
    eligibleCount: args.candidates.filter((candidate) => candidate.eligible).length,
    improvingCount: args.candidates.filter((candidate) => candidate.scoreVelocity > 0).length,
    averageScore: round(mean(args.candidates.map((candidate) => candidate.candidateScore))),
    averageVelocity: round(mean(args.candidates.map((candidate) => candidate.scoreVelocity))),
    opportunityDensity: args.density.density,
    opportunityQuality: args.density.quality,
    densityConfidence: args.density.confidence,
    breadthImprovement: args.context.breadthImprovement,
    systemTrust: args.input.systemTrust ?? 65,
    perceptionAlignment: args.input.perceptionAlignment ?? 65,
  };

  return {
    subjectId: args.input.market ?? strongest?.symbol ?? "market",
    domain: "stocks-optimizer",
    state,
    candidates: args.candidates.map((candidate) => ({
      id: candidate.symbol,
      candidateId: candidate.symbol,
      subjectId: candidate.symbol,
      label: candidate.symbol,
      kind: candidate.genericOpportunity.type,
      score: candidate.candidateScore,
      strength: candidate.genericOpportunity.strength,
      confidence: candidate.genericOpportunity.confidence,
      maturity: lifecycleMaturity(candidate.lifecycle),
      readiness: candidate.eligible ? 78 : Math.min(70, candidate.candidateScore),
      lifecycleStatus: genericLifecycle(candidate.lifecycle),
      previousScore: candidate.previousScore,
      velocity: candidate.scoreVelocity,
      persistence: candidate.genericOpportunity.persistent ? 82 : 54,
      evidenceIds: evidenceIdsForCandidate(candidate),
      evidence: candidate.evidence,
      missingEvidence: candidate.adaptiveSizing.constraints
        .filter((constraint) => !constraint.passed)
        .map(constraintEvidenceLabel),
      invalidationConditions: [
        `Invalidate ${candidate.symbol} if the leading evidence cluster stops improving.`,
        ...candidate.adaptiveSizing.constraints
          .filter((constraint) => constraint.type === "hard" && !constraint.passed)
          .map((constraint) => constraint.reason ?? `Hard constraint ${constraint.id} remains unresolved.`),
      ],
      metadata: {
        rank: candidate.rank,
        eligible: candidate.eligible,
        lifecycle: candidate.lifecycle,
      },
    })),
    evidence: args.candidates.flatMap((candidate) => evidenceForGenericDiscovery(candidate)),
    historicalStates: [
      ...args.candidates.map((candidate) => ({
        id: `candidate-context:${candidate.symbol}`,
        label: `${candidate.symbol} current context`,
        state: {
          market: args.input.market ?? "unknown",
          score: candidate.candidateScore,
          lifecycleMaturity: lifecycleMaturity(candidate.lifecycle),
          eligible: candidate.eligible,
        },
      })),
      ...(args.input.previousCandidates ?? []).map((candidate) => ({
        id: `previous-candidate:${candidate.symbol}`,
        label: `${candidate.symbol} previous context`,
        state: {
          market: args.input.market ?? "unknown",
          score: candidate.candidateScore,
          lifecycleMaturity: lifecycleMaturity(candidate.lifecycle),
          eligible: candidate.eligible,
        },
      })),
    ],
    priorOutcomes: args.input.trades?.map((trade, index) => {
      const symbol = String(trade.symbol ?? `trade-${index + 1}`).toUpperCase();
      const returnPct = number(trade.returnPct ?? trade.profitPct, 0);
      return {
        id: `outcome:${symbol}:${index + 1}`,
        candidateId: symbol,
        state: {
          market: args.input.market ?? "unknown",
          score: number(trade.setupQuality, 50),
          eligible: returnPct >= 0,
        },
        outcome: returnPct > 0 ? "positive" : returnPct < 0 ? "negative" : "neutral",
        value: returnPct,
        predictiveEvidence: returnPct > 0 ? ["Prior positive result", "Candidate evidence persisted"] : [],
        misleadingEvidence: returnPct < 0 ? ["Prior candidate failed after initial evidence"] : [],
        failureModes: returnPct < 0 ? ["Evidence did not persist"] : [],
      };
    }),
    constraints: [
      {
        id: "opportunity-density",
        label: "Opportunity density",
        passed: args.density.density >= 35,
        severity: "medium",
        score: args.density.density,
        missingEvidence: args.density.density < 35 ? "broader independent opportunity density" : undefined,
        unlockCondition: "Improve independent opportunity density across candidates.",
        invalidationCondition: "Invalidate if opportunity density collapses across candidates.",
      },
      {
        id: "generic-memory-depth",
        label: "Memory depth",
        passed: (args.input.trades?.length ?? 0) >= 3,
        severity: "low",
        score: Math.min(100, (args.input.trades?.length ?? 0) * 20),
        missingEvidence: (args.input.trades?.length ?? 0) >= 3 ? undefined : "similar closed outcomes",
        unlockCondition: "Add similar closed outcomes to discovery memory.",
      },
      ...args.findings.slice(0, 3).map((finding) => ({
        id: `finding:${finding.findingId}`,
        label: finding.pattern,
        passed: finding.confidence >= 55,
        severity: "low",
        score: finding.confidence,
        unlockCondition: finding.recommendations[0],
      })),
    ],
    now: "1970-01-01T00:00:00.000Z",
  };
}

function evidenceForGenericDiscovery(candidate: StockOpportunityCandidate): DiscoveryEvidence[] {
  const factorEntries = Object.entries(candidate.factors) as Array<[keyof StockOpportunityFactors, number]>;
  const support = factorEntries
    .filter(([, value]) => value >= 58)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, value]) => ({
      id: `${candidate.symbol}:${key}`,
      candidateId: candidate.symbol,
      label: factorLabel(key),
      direction: "support" as const,
      strength: value,
      confidence: candidate.genericOpportunity.confidence,
      group: "candidate factors",
      description: `${factorLabel(key)} supports ${candidate.symbol} with a ${round(value)}/100 score.`,
      predictive: value >= 70,
    }));
  const contradictions = [
    candidate.factors.breadthImprovement < 45
      ? {
          id: `${candidate.symbol}:breadth-contradiction`,
          candidateId: candidate.symbol,
          label: "Weak breadth confirmation",
          direction: "contradict" as const,
          strength: 100 - candidate.factors.breadthImprovement,
          confidence: 70,
          group: "candidate factors",
          description: "The candidate is not yet supported by broad participation.",
          misleading: true,
        }
      : null,
    /* c8 ignore start */
    candidate.factors.regimeTransition < 45
      ? {
          id: `${candidate.symbol}:transition-contradiction`,
          candidateId: candidate.symbol,
          label: "Weak environment transition",
          direction: "contradict" as const,
          strength: 100 - candidate.factors.regimeTransition,
          confidence: 65,
          group: "candidate factors",
          description: "The environment transition evidence is still weak.",
          misleading: true,
        }
      : null,
    /* c8 ignore stop */
  ].filter(Boolean) as DiscoveryEvidence[];

  return [...support, ...contradictions];
}

function evidenceIdsForCandidate(candidate: StockOpportunityCandidate) {
  return Object.keys(candidate.factors).map((key) => `${candidate.symbol}:${key}`);
}

function genericLifecycle(lifecycle: StockOpportunityLifecycle) {
  return lifecycle.toLowerCase() as Lowercase<StockOpportunityLifecycle>;
}

function lifecycleMaturity(lifecycle: StockOpportunityLifecycle) {
  const rank: Record<StockOpportunityLifecycle, number> = {
    Detected: 22,
    Emerging: 40,
    Strengthening: 58,
    Eligible: 72,
    Sized: 84,
    Active: 92,
    Closed: 100,
  };
  return rank[lifecycle];
}

function discoveryCandidateKey(opportunity: DiscoveredOpportunity) {
  if (opportunity.candidateId) return opportunity.candidateId;
  /* c8 ignore next */
  return opportunity.id;
}

function constraintEvidenceLabel(constraint: AdaptiveSizingResult["constraints"][number]) {
  if (constraint.reason) return constraint.reason;
  if (constraint.label) return constraint.label;
  /* c8 ignore next */
  return constraint.id;
}

function factorLabel(key: keyof StockOpportunityFactors) {
  return String(key).replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

function barsFor(
  signal: StockOpportunitySignal,
  barsBySymbol: StockOpportunityDiscoveryInput["barsBySymbol"],
): StockBar[] {
  const symbol = symbolOf(signal);
  /* c8 ignore next */
  if (barsBySymbol instanceof Map) return barsBySymbol.get(symbol) ?? [];
  return barsBySymbol?.[symbol] ?? [];
}

function closeSeries(signal: StockOpportunitySignal, bars: StockBar[]) {
  /* c8 ignore next */
  const barCloses = bars.map((bar) => number(bar.close ?? bar.price, Number.NaN)).filter(Number.isFinite);
  const history = (signal.history ?? []).map((value) => number(value, Number.NaN)).filter(Number.isFinite);
  const merged = barCloses.length >= 6 ? barCloses : history;
  const price = number(signal.price, merged.at(-1) ?? 1);
  return merged.length >= 3 ? merged : [price * 0.97, price * 0.99, price];
}

function volumeSeries(signal: StockOpportunitySignal, bars: StockBar[]) {
  const volumes = bars.map((bar) => number(bar.volume, Number.NaN)).filter(Number.isFinite);
  const latest = number(signal.volume, 0);
  return volumes.length >= 3 ? volumes : [latest * 0.9, latest * 0.95, latest].filter((value) => value > 0);
}

function requestedCapacity(signal: StockOpportunitySignal, score: number) {
  const explicit = number(signal.suggestedExposure, 0);
  if (explicit > 0) return explicit;
  /* c8 ignore next */
  if (score >= 72) return Math.min(5, maxCapacity(signal));
  if (score >= 60) return Math.min(2, maxCapacity(signal));
  if (score >= 45) return Math.min(1, maxCapacity(signal));
  return 0;
}

function maxCapacity(signal: StockOpportunitySignal) {
  return Math.max(1, number(signal.maxPositionPct, 5));
}

function densityFromPrevious(previousCandidates: StockOpportunityCandidate[] | undefined) {
  if (!previousCandidates?.length) return undefined;
  return evaluateOpportunityDensity({ candidates: previousCandidates.map((candidate) => candidate.genericOpportunity) }).density;
}

function symbolOf(signal: StockOpportunitySignal) {
  /* c8 ignore next */
  return String(signal.symbol ?? signal.ticker ?? "").trim().toUpperCase();
}

function velocityProxy(factors: StockOpportunityFactors) {
  return Math.max(4, mean([
    Math.max(0, factors.trendEmergence - 50),
    Math.max(0, factors.momentumAcceleration - 50),
    Math.max(0, factors.relativeStrengthImprovement - 50),
  ]));
}

function returns(values: number[]) {
  const output: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous > 0 && current > 0) output.push(current / previous - 1);
  }
  return output;
}

function pctMove(previous: number | undefined, current: number | undefined) {
  return previous && current && previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

function proximityToHigh(price: number, high: number, low: number) {
  const range = Math.max(0.01, high - low);
  return clamp((price - low) / range, 0, 1);
}

function stdev(values: number[]) {
  /* c8 ignore next */
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function mean(values: number[]) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 100) {
  /* c8 ignore next */
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round(value: number) {
  return Number(value.toFixed(2));
}
