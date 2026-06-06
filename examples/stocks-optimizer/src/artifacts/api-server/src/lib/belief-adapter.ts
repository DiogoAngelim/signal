import {
  evaluateBelief,
  type BeliefInput,
  type BeliefResult,
  type BeliefVerdict,
  type EvidenceDirection,
  type EvidenceInput,
  type EvidenceResult,
} from "../../../signal-framework/belief/engine";

export type TradeBeliefEvidenceSummary = {
  name: string;
  direction: EvidenceDirection;
  strength: number;
  confidence: number;
  weightedStrength: number;
  source?: string;
  reason: string;
};

export type TradeBeliefDiagnostic = {
  verdict: BeliefVerdict;
  confidence: number;
  trustworthiness: number;
  evidenceStrength: number;
  evidenceAgreement: number;
  fragility: number;
  blockers: string[];
  warnings: string[];
  reason: string;
  supportingEvidence: TradeBeliefEvidenceSummary[];
  contradictoryEvidence: TradeBeliefEvidenceSummary[];
};

export function mapTradeCandidateToBeliefInput(
  candidate: any,
  marketState: any = {},
  calibration: any = {},
  perception: any = {},
): BeliefInput {
  const symbol = symbolFor(candidate);
  const liquidityScore = clamp(firstNumber(candidate?.liquidityScore, perception?.liquidityScore, 70));
  const volatilityPct = Math.max(0, firstNumber(candidate?.volatilityPct, perception?.volatilityPct, 0));
  const riskPressure = clamp(firstNumber(candidate?.riskPressure, perception?.riskPressure, 50));
  const setupQuality = clamp(firstNumber(candidate?.setupQuality, perception?.candidateQuality, 50));
  const trendQuality = clamp(firstNumber(candidate?.trendQuality, perception?.trendStrength, setupQuality));
  const expectedEdgePct = firstNumber(
    candidate?.expectedEdgePct,
    candidate?.expectedMove,
    perception?.expectedEdgePct,
    0,
  );
  const maxPositionPct = Math.max(0, firstNumber(candidate?.maxPositionPct, marketState?.maxPositionPct, 0));
  const requestedExposurePct = Math.max(
    0,
    firstNumber(candidate?.rawSuggestedExposurePct, candidate?.requestedExposurePct, candidate?.suggestedExposure, 0),
  );
  const opportunityDensity = clamp(
    firstNumber(
      perception?.opportunityDensity,
      candidate?.opportunityDensity,
      maxPositionPct > 0 ? (requestedExposurePct / maxPositionPct) * 100 : 0,
    ),
  );
  const calibrationStatus = String(
    calibration?.status ?? marketState?.calibrationStatus ?? "",
  ).toLowerCase();
  const calibrationTrust = clamp(
    firstNumber(calibration?.trustworthiness, marketState?.trustworthiness, candidate?.trustworthiness, 50),
  );
  const historicalAccuracy = clamp(
    firstNumber(calibration?.historicalAccuracy, marketState?.historicalAccuracy, 50),
  );
  const dataReliability = clamp(
    firstNumber(perception?.dataReliability, marketState?.dataReliability, 70),
  );
  const crossTimeframeAgreement = clamp(
    firstNumber(
      perception?.crossTimeframeAgreement,
      average([
        scoreOf(perception?.walkForwardRobustness),
        scoreOf(perception?.parameterRobustness),
        scoreOf(marketState?.walkForwardRobustness),
        scoreOf(marketState?.parameterRobustness),
      ]),
      50,
    ),
  );
  const similarMarketMatch = clamp(
    firstNumber(
      perception?.similarMarketMatch,
      marketState?.similarMarketMatch,
      benchmarkMatchScore(marketState?.benchmarkExcessPct ?? perception?.benchmarkExcessPct),
    ),
  );
  const overfitRisk = clamp(
    firstNumber(
      marketState?.overfitRisk,
      marketState?.overfitRiskPct,
      perception?.overfitRisk,
      0,
    ),
  );
  const drawdownPressure = clamp(
    firstNumber(
      marketState?.drawdownPressure,
      firstNumber(marketState?.maxDrawdownPct, perception?.maxDrawdownPct, 0) * 3,
    ),
  );
  const concentrationRisk = clamp(
    firstNumber(
      marketState?.concentrationRisk,
      perception?.concentrationRisk,
      firstNumber(marketState?.top1TradeContributionPct, perception?.top1TradeContributionPct, 0),
    ),
  );
  const staleData = marketState?.staleData === true || perception?.staleData === true;
  const priorConfidence = clamp(
    firstNumber(
      candidate?.signalConfidence,
      candidate?.confidence,
      calibration?.calibratedConfidence,
      marketState?.calibratedConfidence,
      setupQuality,
    ),
  );
  const uncertainty = clamp(
    Math.max(
      firstNumber(candidate?.uncertainty, 0),
      100 - dataReliability,
      calibrationStatus === "unstable-outcomes" ? 45 : 0,
      overfitRisk * 0.45,
      staleData ? 35 : 0,
    ),
  );

  return {
    claim: `Candidate ${symbol} has a justified positive opportunity.`,
    priorConfidence,
    uncertainty,
    minimumEvidenceCount: 8,
    minimumCoverage: 70,
    contradictionTolerance: 35,
    evidence: [
      evidence("Trend strength", "support", trendQuality, dataReliability, 1.1, "perception", `Trend quality is ${trendQuality.toFixed(1)}.`),
      evidence("Momentum", "support", momentumScore(expectedEdgePct), dataReliability, 1, "perception", `Expected edge is ${expectedEdgePct.toFixed(2)}%.`),
      evidence("Cross-timeframe agreement", "support", crossTimeframeAgreement, calibrationTrust, 1.1, "readiness", `Cross-timeframe agreement is ${crossTimeframeAgreement.toFixed(1)}.`),
      evidence("Opportunity density", "support", opportunityDensity, dataReliability, 1, "discovery", `Requested exposure covers ${opportunityDensity.toFixed(1)}% of the available candidate cap.`),
      evidence("Volume confirmation", "support", liquidityScore, dataReliability, 0.85, "market-data", `Liquidity confirmation is ${liquidityScore.toFixed(1)}.`),
      evidence("Candidate quality", "support", setupQuality, dataReliability, 1, "perception", `Candidate quality is ${setupQuality.toFixed(1)}.`),
      evidence("Positive historical calibration", "support", average([historicalAccuracy, calibrationTrust]), calibrationTrust, 1, "calibration", `Historical calibration trust is ${calibrationTrust.toFixed(1)}.`),
      evidence("Similar market match", "support", similarMarketMatch, calibrationTrust, 0.85, "market-memory", `Similar market match is ${similarMarketMatch.toFixed(1)}.`),
      evidence("Risk control", "support", riskControlScore(riskPressure, volatilityPct), dataReliability, 1.05, "risk", `Risk pressure is ${riskPressure.toFixed(1)} and volatility is ${volatilityPct.toFixed(1)}%.`),
      evidence("Unstable calibration", "contradict", calibrationInstabilityScore(calibrationStatus), calibrationTrust, 1.1, "calibration", calibrationStatus ? `Calibration status is ${calibrationStatus}.` : "Calibration status is not restrictive."),
      evidence("Overfit risk", "contradict", overfitRisk, calibrationTrust, 1.1, "robustness", `Overfit risk is ${overfitRisk.toFixed(1)}.`),
      evidence("High volatility", "contradict", clamp(volatilityPct * 7), dataReliability, 1, "risk", `Volatility is ${volatilityPct.toFixed(1)}%.`),
      evidence("Weak liquidity", "contradict", 100 - liquidityScore, dataReliability, 0.9, "market-data", `Liquidity weakness is ${(100 - liquidityScore).toFixed(1)}.`),
      evidence("Poor data reliability", "contradict", 100 - dataReliability, dataReliability, 1.05, "market-data", `Data reliability is ${dataReliability.toFixed(1)}.`),
      evidence("Drawdown pressure", "contradict", drawdownPressure, calibrationTrust, 0.9, "risk", `Drawdown pressure is ${drawdownPressure.toFixed(1)}.`),
      evidence("Stale data", "contradict", staleData ? 85 : 0, dataReliability, 1, "synchronization", staleData ? "Market data is stale." : "Market data is current enough for review."),
      evidence("Excessive concentration", "contradict", concentrationRisk, calibrationTrust, 0.9, "risk", `Concentration risk is ${concentrationRisk.toFixed(1)}.`),
      evidence("Negative benchmark comparison", "contradict", negativeBenchmarkScore(marketState?.benchmarkExcessPct ?? perception?.benchmarkExcessPct), calibrationTrust, 1, "benchmark", `Benchmark excess is ${formatNumber(marketState?.benchmarkExcessPct ?? perception?.benchmarkExcessPct)}%.`),
      evidence("Watchlist presence", "neutral", candidate?.watchlist === true || candidate?.watchlistPresence === true ? 70 : 35, dataReliability, 0.35, "lifecycle", "Watchlist context is informational."),
      evidence("Lifecycle stage", "neutral", lifecycleScore(candidate?.lifecycle ?? perception?.lifecycleStage ?? marketState?.lifecycleStage), dataReliability, 0.35, "lifecycle", `Lifecycle stage is ${String(candidate?.lifecycle ?? perception?.lifecycleStage ?? marketState?.lifecycleStage ?? "untracked")}.`),
      evidence("Candidate age", "neutral", candidateAgeScore(candidate), dataReliability, 0.3, "lifecycle", "Candidate age contributes context but not direction."),
      evidence("Market regime label", "neutral", 50, dataReliability, 0.25, "regime", `Market regime is ${String(marketState?.regime ?? perception?.marketRegimeLabel ?? "unlabeled")}.`),
    ],
    metadata: {
      symbol,
      rawAction: candidate?.rawAction ?? candidate?.signalAction,
      expectedEdgePct,
      requestedExposurePct,
      maxPositionPct,
      calibrationStatus,
    },
  };
}

export function evaluateTradeCandidateBelief(
  candidate: any,
  marketState: any = {},
  calibration: any = {},
  perception: any = {},
): TradeBeliefDiagnostic {
  return beliefResultToTradeDiagnostic(
    evaluateBelief(mapTradeCandidateToBeliefInput(candidate, marketState, calibration, perception)),
  );
}

export function beliefResultToTradeDiagnostic(result: BeliefResult): TradeBeliefDiagnostic {
  return {
    verdict: result.verdict,
    confidence: result.confidence,
    trustworthiness: result.trustworthiness,
    evidenceStrength: result.evidenceStrength,
    evidenceAgreement: result.evidenceAgreement,
    fragility: result.fragility,
    blockers: result.blockers,
    warnings: result.warnings,
    reason: result.reason,
    supportingEvidence: summarizeEvidence(result.supportingEvidence),
    contradictoryEvidence: summarizeEvidence(result.contradictoryEvidence),
  };
}

function evidence(
  name: string,
  direction: EvidenceDirection,
  strength: number,
  confidence: number,
  weight: number,
  source: string,
  reason: string,
): EvidenceInput {
  return {
    name,
    direction,
    strength: clamp(strength),
    confidence: clamp(confidence),
    weight: clamp(weight),
    source,
    reason,
  };
}

function summarizeEvidence(evidenceResults: EvidenceResult[]): TradeBeliefEvidenceSummary[] {
  return evidenceResults.slice(0, 3).map((item) => ({
    name: item.name,
    direction: item.direction,
    strength: item.strength,
    confidence: item.confidence,
    weightedStrength: item.weightedStrength,
    ...(item.source ? { source: item.source } : {}),
    reason: item.reason,
  }));
}

function symbolFor(candidate: any) {
  return String(candidate?.symbol ?? candidate?.ticker ?? candidate?.targetRef ?? "strategy-signal")
    .trim()
    .toUpperCase() || "STRATEGY-SIGNAL";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  /* c8 ignore next */
  return 0;
}

function optionalNumber(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function scoreOf(value: any) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 100 : 0;
  return optionalNumber(value?.score, value?.readinessScore, value?.passRate, value?.confidence) ?? Number.NaN;
}

function average(values: number[]) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : Number.NaN;
}

function momentumScore(expectedEdgePct: number) {
  return clamp(50 + expectedEdgePct * 7);
}

function benchmarkMatchScore(value: unknown) {
  const benchmarkExcess = firstNumber(value, 0);
  return clamp(50 + benchmarkExcess * 2.5);
}

function negativeBenchmarkScore(value: unknown) {
  const benchmarkExcess = firstNumber(value, 0);
  return benchmarkExcess < 0 ? clamp(45 + Math.abs(benchmarkExcess) * 5) : 0;
}

function riskControlScore(riskPressure: number, volatilityPct: number) {
  return clamp(100 - Math.max(riskPressure, volatilityPct * 6));
}

function calibrationInstabilityScore(status: string) {
  if (status === "unstable-outcomes") return 85;
  if (status === "poor-calibration") return 75;
  if (status === "insufficient-history") return 55;
  return 0;
}

function lifecycleScore(value: unknown) {
  const label = String(value ?? "").toLowerCase();
  if (label.includes("production") || label.includes("active") || label.includes("eligible")) return 85;
  if (label.includes("limited") || label.includes("paper") || label.includes("shadow")) return 65;
  if (label.includes("research") || label.includes("watch")) return 45;
  return 50;
}

function candidateAgeScore(candidate: any) {
  const ageDays = optionalNumber(candidate?.ageDays);
  if (ageDays != null) return clamp(100 - ageDays * 3);

  const observedAt = Date.parse(String(candidate?.observedAt ?? candidate?.signalDate ?? ""));
  if (!Number.isFinite(observedAt)) return 50;

  return clamp(100 - Math.max(0, (Date.now() - observedAt) / 86_400_000) * 3);
}

function formatNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function clamp(value: number, min = 0, max = 100) {
  /* c8 ignore next */
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, safeValue));
}
