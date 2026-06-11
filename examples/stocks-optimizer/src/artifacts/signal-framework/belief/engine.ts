import { clamp, mean } from "../math/statistics";

export type BeliefVerdict = "justified" | "weak" | "contradicted" | "uncertain";

export type EvidenceDirection = "support" | "contradict" | "neutral";

export interface EvidenceInput {
  name: string;
  direction: EvidenceDirection;
  strength: number;
  confidence?: number;
  weight?: number;
  source?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceResult {
  name: string;
  direction: EvidenceDirection;
  strength: number;
  confidence: number;
  weight: number;
  weightedStrength: number;
  source?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface BeliefInput {
  claim: string;
  priorConfidence?: number;
  evidence: EvidenceInput[];
  uncertainty?: number;
  minimumEvidenceCount?: number;
  minimumCoverage?: number;
  contradictionTolerance?: number;
  metadata?: Record<string, unknown>;
}

export interface BeliefResult {
  claim: string;
  verdict: BeliefVerdict;
  confidence: number;
  trustworthiness: number;
  evidenceStrength: number;
  evidenceAgreement: number;
  evidenceCoverage: number;
  supportStrength: number;
  contradictionStrength: number;
  uncertainty: number;
  fragility: number;
  supportingEvidence: EvidenceResult[];
  contradictoryEvidence: EvidenceResult[];
  neutralEvidence: EvidenceResult[];
  blockers: string[];
  warnings: string[];
  reason: string;
  audit: {
    formula: string;
    inputs: BeliefInput;
    normalized: Record<string, number>;
    steps: string[];
  };
}

type BeliefMetrics = {
  priorConfidence: number;
  uncertainty: number;
  minimumEvidenceCount: number;
  minimumCoverage: number;
  contradictionTolerance: number;
  evidenceStrength: number;
  evidenceAgreement: number;
  evidenceCoverage: number;
  supportStrength: number;
  contradictionStrength: number;
  neutralStrength: number;
  averageEvidenceConfidence: number;
  sourceDominance: number;
  confidence: number;
  trustworthiness: number;
  fragility: number;
};

const DEFAULT_PRIOR_CONFIDENCE = 50;
const DEFAULT_EVIDENCE_CONFIDENCE = 50;
const DEFAULT_EVIDENCE_WEIGHT = 1;
const DEFAULT_UNCERTAINTY = 0;
const DEFAULT_MINIMUM_EVIDENCE_COUNT = 3;
const DEFAULT_MINIMUM_COVERAGE = 60;
const DEFAULT_CONTRADICTION_TOLERANCE = 35;

export function evaluateBelief(input: BeliefInput): BeliefResult {
  const evidence = safeEvidence(input.evidence).map(evaluateEvidence);
  const supportingEvidence = evidenceByDirection(evidence, "support");
  const contradictoryEvidence = evidenceByDirection(evidence, "contradict");
  const neutralEvidence = evidenceByDirection(evidence, "neutral");
  const metrics = calculateBeliefMetrics(input, evidence);
  const warnings = collectWarnings(metrics, evidence);
  const verdict = resolveVerdict(metrics, evidence);
  const blockers = collectBlockers(verdict, metrics, evidence);
  const result: BeliefResult = {
    claim: String(input.claim ?? "").trim() || "Unspecified claim",
    verdict,
    confidence: metrics.confidence,
    trustworthiness: metrics.trustworthiness,
    evidenceStrength: metrics.evidenceStrength,
    evidenceAgreement: metrics.evidenceAgreement,
    evidenceCoverage: metrics.evidenceCoverage,
    supportStrength: metrics.supportStrength,
    contradictionStrength: metrics.contradictionStrength,
    uncertainty: metrics.uncertainty,
    fragility: metrics.fragility,
    supportingEvidence,
    contradictoryEvidence,
    neutralEvidence,
    blockers,
    warnings,
    reason: "",
    audit: {
      formula:
        "confidence = prior*0.25 + support*0.8 - contradiction*0.65 - uncertainty*0.3 + (coverage-50)*0.15 + (agreement-50)*0.1; trustworthiness = agreement*0.25 + coverage*0.25 + averageEvidenceConfidence*0.35 + (100-uncertainty)*0.15; fragility = lowCoverage*0.4 + conflict*0.2 + uncertainty*0.2 + lowEvidenceConfidence*0.1 + sourceDominance*0.1",
      inputs: {
        ...input,
        claim: String(input.claim ?? ""),
        evidence: safeEvidence(input.evidence),
      },
      normalized: normalizedAudit(metrics),
      steps: [
        `Evaluated ${evidence.length} evidence item(s).`,
        `Support ${formatScore(metrics.supportStrength)} vs contradiction ${formatScore(metrics.contradictionStrength)}.`,
        `Coverage ${formatScore(metrics.evidenceCoverage)}, agreement ${formatScore(metrics.evidenceAgreement)}, uncertainty ${formatScore(metrics.uncertainty)}.`,
        `Confidence ${formatScore(metrics.confidence)}, trustworthiness ${formatScore(metrics.trustworthiness)}, fragility ${formatScore(metrics.fragility)}.`,
      ],
    },
  };

  return {
    ...result,
    reason: createBeliefReason(result),
  };
}

export function evaluateEvidence(input: EvidenceInput): EvidenceResult {
  const name = String(input.name ?? "").trim() || "evidence";
  const direction = normalizeDirection(input.direction);
  const strength = score(input.strength);
  const confidence = score(input.confidence, DEFAULT_EVIDENCE_CONFIDENCE);
  const weight = score(input.weight, DEFAULT_EVIDENCE_WEIGHT);
  const weightedStrength = roundScore(strength * (confidence / 100) * weight);
  const reason =
    String(input.reason ?? "").trim() ||
    defaultEvidenceReason(name, direction, strength);

  return {
    name,
    direction,
    strength,
    confidence,
    weight,
    weightedStrength,
    ...(input.source ? { source: String(input.source) } : {}),
    reason,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function calculateEvidenceAgreement(results: EvidenceResult[]): number {
  const evidence = Array.isArray(results) ? results : [];
  if (!evidence.length) return 0;

  const support = directionalStrength(evidence, "support");
  const contradiction = directionalStrength(evidence, "contradict");
  const directionalTotal = support + contradiction;

  if (directionalTotal <= 0) return 50;

  return roundScore(
    (Math.max(support, contradiction) / directionalTotal) * 100,
  );
}

export function calculateBeliefFragility(
  input: BeliefInput,
  evidence: EvidenceResult[],
): number {
  return calculateBeliefMetrics(input, Array.isArray(evidence) ? evidence : [])
    .fragility;
}

export function createBeliefReason(result: BeliefResult): string {
  const support = topEvidenceName(result.supportingEvidence);
  const contradiction = topEvidenceName(result.contradictoryEvidence);
  const suffix = result.blockers.length
    ? ` Blockers: ${result.blockers.join("; ")}.`
    : result.warnings.length
      ? ` Warnings: ${result.warnings.slice(0, 2).join("; ")}.`
      : "";
  const evidencePhrase = [
    support ? `top support: ${support}` : "",
    contradiction ? `top contradiction: ${contradiction}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return [
    `Belief is ${result.verdict} for "${result.claim}"`,
    `with confidence ${formatScore(result.confidence)}, trustworthiness ${formatScore(result.trustworthiness)}, and fragility ${formatScore(result.fragility)}.`,
    evidencePhrase
      ? `Evidence ${evidencePhrase}.`
      : "No directional evidence is available.",
    suffix.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

function calculateBeliefMetrics(
  input: BeliefInput,
  evidence: EvidenceResult[],
): BeliefMetrics {
  const priorConfidence = score(
    input.priorConfidence,
    DEFAULT_PRIOR_CONFIDENCE,
  );
  const uncertainty = score(input.uncertainty, DEFAULT_UNCERTAINTY);
  const minimumEvidenceCount = Math.max(
    1,
    Math.round(
      score(input.minimumEvidenceCount, DEFAULT_MINIMUM_EVIDENCE_COUNT),
    ),
  );
  const minimumCoverage = score(
    input.minimumCoverage,
    DEFAULT_MINIMUM_COVERAGE,
  );
  const contradictionTolerance = score(
    input.contradictionTolerance,
    DEFAULT_CONTRADICTION_TOLERANCE,
  );
  const supportStrength = directionalStrength(evidence, "support");
  const contradictionStrength = directionalStrength(evidence, "contradict");
  const neutralStrength = directionalStrength(evidence, "neutral");
  const evidenceAgreement = calculateEvidenceAgreement(evidence);
  const averageEvidenceConfidence = roundScore(
    mean(evidence.map((item) => item.confidence)),
  );
  const evidenceStrength = roundScore(
    Math.max(supportStrength, contradictionStrength, neutralStrength),
  );
  const evidenceCoverage = evidenceCoverageScore(
    evidence.length,
    minimumEvidenceCount,
    averageEvidenceConfidence,
  );
  const sourceDominance = sourceDominanceScore(evidence);
  const confidence = roundScore(
    priorConfidence * 0.25 +
      supportStrength * 0.8 -
      contradictionStrength * 0.65 -
      uncertainty * 0.3 +
      (evidenceCoverage - 50) * 0.15 +
      (evidenceAgreement - 50) * 0.1,
  );
  const trustworthiness = roundScore(
    evidenceAgreement * 0.25 +
      evidenceCoverage * 0.25 +
      averageEvidenceConfidence * 0.35 +
      (100 - uncertainty) * 0.15,
  );
  const conflictFragility =
    supportStrength + contradictionStrength <= 0
      ? 80
      : clamp(100 - Math.abs(supportStrength - contradictionStrength) * 2);
  const dominanceFragility = clamp(Math.max(0, sourceDominance - 50) * 2);
  const fragility = evidence.length
    ? roundScore(
        (100 - evidenceCoverage) * 0.4 +
          conflictFragility * 0.2 +
          uncertainty * 0.2 +
          (100 - averageEvidenceConfidence) * 0.1 +
          dominanceFragility * 0.1,
      )
    : 100;

  return {
    priorConfidence,
    uncertainty,
    minimumEvidenceCount,
    minimumCoverage,
    contradictionTolerance,
    evidenceStrength,
    evidenceAgreement,
    evidenceCoverage,
    supportStrength,
    contradictionStrength,
    neutralStrength,
    averageEvidenceConfidence,
    sourceDominance,
    confidence: clamp(confidence),
    trustworthiness: clamp(trustworthiness),
    fragility: clamp(fragility),
  };
}

function resolveVerdict(
  metrics: BeliefMetrics,
  evidence: EvidenceResult[],
): BeliefVerdict {
  if (!evidence.length) return "uncertain";

  if (
    metrics.confidence >= 70 &&
    metrics.trustworthiness >= 70 &&
    metrics.contradictionStrength <= metrics.contradictionTolerance &&
    metrics.fragility <= 35 &&
    metrics.evidenceCoverage >= metrics.minimumCoverage
  ) {
    return "justified";
  }

  if (
    metrics.contradictionStrength > metrics.supportStrength ||
    metrics.contradictionStrength >= 60
  ) {
    return "contradicted";
  }

  if (
    metrics.confidence >= 55 &&
    metrics.trustworthiness >= 50 &&
    metrics.contradictionStrength <= 45
  ) {
    return "weak";
  }

  return "uncertain";
}

function collectWarnings(metrics: BeliefMetrics, evidence: EvidenceResult[]) {
  const warnings: string[] = [];

  if (evidence.length > 0 && evidence.length < metrics.minimumEvidenceCount) {
    warnings.push(
      `Evidence count ${evidence.length} is below minimum ${metrics.minimumEvidenceCount}.`,
    );
  }

  if (
    evidence.length > 0 &&
    metrics.evidenceCoverage < metrics.minimumCoverage
  ) {
    warnings.push(
      `Evidence coverage ${formatScore(metrics.evidenceCoverage)} is below minimum ${formatScore(metrics.minimumCoverage)}.`,
    );
  }

  if (metrics.uncertainty >= 60) {
    warnings.push(
      `Uncertainty is high at ${formatScore(metrics.uncertainty)}.`,
    );
  }

  if (evidence.length > 0 && metrics.averageEvidenceConfidence < 50) {
    warnings.push(
      `Average evidence confidence is low at ${formatScore(metrics.averageEvidenceConfidence)}.`,
    );
  }

  if (metrics.sourceDominance >= 70) {
    warnings.push(
      `One evidence source dominates ${formatScore(metrics.sourceDominance)} of source weight.`,
    );
  }

  if (
    metrics.supportStrength > 0 &&
    metrics.contradictionStrength > 0 &&
    Math.abs(metrics.supportStrength - metrics.contradictionStrength) <= 15
  ) {
    warnings.push("Supporting and contradictory evidence are close.");
  }

  if (metrics.contradictionStrength > metrics.contradictionTolerance) {
    warnings.push(
      `Contradiction ${formatScore(metrics.contradictionStrength)} exceeds tolerance ${formatScore(metrics.contradictionTolerance)}.`,
    );
  }

  return unique(warnings);
}

function collectBlockers(
  verdict: BeliefVerdict,
  metrics: BeliefMetrics,
  evidence: EvidenceResult[],
) {
  if (verdict === "justified" || verdict === "weak") return [];

  const blockers: string[] = [];

  if (!evidence.length) {
    blockers.push("No evidence was supplied.");
  }

  if (
    verdict === "contradicted" &&
    metrics.contradictionStrength > metrics.supportStrength
  ) {
    blockers.push(
      "Contradictory evidence is stronger than supporting evidence.",
    );
  }

  if (metrics.contradictionStrength >= 60) {
    blockers.push("Contradictory evidence is strong.");
  }

  if (evidence.length > 0 && metrics.confidence < 55) {
    blockers.push(
      `Confidence ${formatScore(metrics.confidence)} is below weak-belief threshold.`,
    );
  }

  if (evidence.length > 0 && metrics.trustworthiness < 50) {
    blockers.push(
      `Trustworthiness ${formatScore(metrics.trustworthiness)} is below minimum.`,
    );
  }

  if (
    evidence.length > 0 &&
    metrics.evidenceCoverage < metrics.minimumCoverage
  ) {
    blockers.push("Evidence coverage is insufficient.");
  }

  if (evidence.length > 0 && metrics.fragility > 65) {
    blockers.push("Belief is too fragile.");
  }

  return unique(blockers);
}

function evidenceByDirection(
  evidence: EvidenceResult[],
  direction: EvidenceDirection,
) {
  return evidence
    .filter((item) => item.direction === direction)
    .sort(
      (a, b) =>
        b.weightedStrength - a.weightedStrength || a.name.localeCompare(b.name),
    );
}

function directionalStrength(
  evidence: EvidenceResult[],
  direction: EvidenceDirection,
) {
  const directional = evidence.filter((item) => item.direction === direction);
  const totalWeight = directional.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;

  return roundScore(
    directional.reduce((sum, item) => sum + item.weightedStrength, 0) /
      totalWeight,
  );
}

function evidenceCoverageScore(
  evidenceCount: number,
  minimumEvidenceCount: number,
  averageEvidenceConfidence: number,
) {
  if (evidenceCount <= 0) return 0;

  const countCoverage = clamp((evidenceCount / minimumEvidenceCount) * 100);
  return roundScore(countCoverage * 0.85 + averageEvidenceConfidence * 0.15);
}

function sourceDominanceScore(evidence: EvidenceResult[]) {
  const sourceWeights = new Map<string, number>();
  let totalWeight = 0;

  for (const item of evidence) {
    const sourceKey = String(item.source ?? `evidence:${item.name}`);
    const sourceWeight = item.weight * (item.confidence / 100);
    sourceWeights.set(
      sourceKey,
      (sourceWeights.get(sourceKey) ?? 0) + sourceWeight,
    );
    totalWeight += sourceWeight;
  }

  if (totalWeight <= 0 || sourceWeights.size === 0) return 0;

  return roundScore((Math.max(...sourceWeights.values()) / totalWeight) * 100);
}

function normalizedAudit(metrics: BeliefMetrics): Record<string, number> {
  return {
    priorConfidence: metrics.priorConfidence,
    uncertainty: metrics.uncertainty,
    minimumEvidenceCount: metrics.minimumEvidenceCount,
    minimumCoverage: metrics.minimumCoverage,
    contradictionTolerance: metrics.contradictionTolerance,
    evidenceStrength: metrics.evidenceStrength,
    evidenceAgreement: metrics.evidenceAgreement,
    evidenceCoverage: metrics.evidenceCoverage,
    supportStrength: metrics.supportStrength,
    contradictionStrength: metrics.contradictionStrength,
    neutralStrength: metrics.neutralStrength,
    averageEvidenceConfidence: metrics.averageEvidenceConfidence,
    sourceDominance: metrics.sourceDominance,
    confidence: metrics.confidence,
    trustworthiness: metrics.trustworthiness,
    fragility: metrics.fragility,
  };
}

function topEvidenceName(evidence: EvidenceResult[]) {
  const top = evidence[0];
  return top ? `${top.name} (${formatScore(top.weightedStrength)})` : "";
}

function defaultEvidenceReason(
  name: string,
  direction: EvidenceDirection,
  strength: number,
) {
  return `${name} provides ${direction} evidence with strength ${formatScore(strength)}.`;
}

function safeEvidence(evidence: EvidenceInput[] | undefined) {
  return Array.isArray(evidence) ? evidence : [];
}

function normalizeDirection(direction: EvidenceDirection): EvidenceDirection {
  if (
    direction === "support" ||
    direction === "contradict" ||
    direction === "neutral"
  ) {
    return direction;
  }

  return "neutral";
}

function score(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return clamp(Number.isFinite(numberValue) ? numberValue : fallback);
}

function roundScore(value: number) {
  return Number(clamp(value).toFixed(2));
}

function formatScore(value: number) {
  return `${Number(value.toFixed(2))}/100`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
