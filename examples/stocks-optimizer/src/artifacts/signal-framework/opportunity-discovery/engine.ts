
import { clamp, mean, stdev } from "../math/statistics";
import type {
  DetectedNeed,
  DiscoveryFinding,
  OpportunityCandidate,
  OpportunityDiscoveryInput,
  OpportunitySeed,
  OpportunityType,
} from "../types";

const CONCEPT_LABEL: Record<OpportunityType, string> = {
  emergence: "Emergence",
  acceleration: "Acceleration",
  compression: "Compression",
  expansion: "Expansion",
  alignment: "Alignment",
  divergence: "Divergence",
  persistence: "Persistence",
  transition: "Transition",
};









export function discoverOpportunities(input: OpportunityDiscoveryInput): OpportunityCandidate[] {
  const candidates: OpportunityCandidate[] = [];

  for (const seed of input.seeds ?? []) {
    candidates.push(fromSeed(seed, input.explorerFindings));
  }

  for (const series of input.observationSeries ?? []) {
    const candidate = fromSeries(series.id, series.values, input.explorerFindings);
    if (candidate) candidates.push(candidate);
  }

  const global = globalCandidates(input);
  for (const candidate of global) {
    candidates.push(applyFindings(candidate, input.explorerFindings));
  }

  return dedupe(candidates)
    .filter((candidate) => candidate.strength > 0)
    .sort((left, right) => {
      const strengthDelta = right.strength - left.strength;
      
      return strengthDelta === 0 ? left.opportunityId.localeCompare(right.opportunityId) : strengthDelta;
    });
}

function fromSeed(seed: OpportunitySeed, findings: DiscoveryFinding[] | undefined): OpportunityCandidate {
  return applyFindings({
    opportunityId: seed.opportunityId,
    type: seed.type,
    strength: round(clamp(seed.strength)),
    confidence: round(clamp(seed.confidence)),
    evidence: seed.evidence.slice(),
    emerging: seed.emerging ?? seed.strength >= 45,
    persistent: seed.persistent ?? false,
  }, findings);
}

function fromSeries(
  id: string,
  values: number[],
  findings: DiscoveryFinding[] | undefined,
): OpportunityCandidate | null {
  const usable = values.filter(Number.isFinite);
  if (usable.length < 3) return null;

  const first = usable[0];
  const latest = usable[usable.length - 1];
  const previous = usable[usable.length - 2];
  const beforePrevious = usable[usable.length - 3];
  const totalMove = latest - first;
  const latestMove = latest - previous;
  const priorMove = previous - beforePrevious;
  const acceleration = latestMove - priorMove;
  const variability = stdev(usable);
  const positiveSteps = usable.slice(1).filter((value, index) => value >= usable[index]).length;
  const persistence = positiveSteps / (usable.length - 1);
  const type = typeForSeries(totalMove, acceleration, variability, persistence);
  const strength = clamp(Math.abs(totalMove) * 3 + Math.max(0, acceleration) * 4 + persistence * 28 + Math.max(0, 18 - variability));
  const evidence = [
    `${CONCEPT_LABEL[type]} detected across ${usable.length} observations.`,
    `Latest value ${latest.toFixed(2)} versus starting value ${first.toFixed(2)}.`,
  ];

  return applyFindings({
    opportunityId: `${id}:${type}`,
    type,
    strength: round(strength),
    confidence: round(clamp(45 + usable.length * 4 - variability)),
    evidence,
    emerging: totalMove > 0 || acceleration > 0,
    persistent: persistence >= 0.66,
  }, findings);
}

function typeForSeries(totalMove: number, acceleration: number, variability: number, persistence: number): OpportunityType {
  if (acceleration >= 3) return "acceleration";
  if (variability <= 2.5 && totalMove >= 0) return "compression";
  if (persistence >= 0.75) return "persistence";
  if (totalMove > 0) return "emergence";
  return "divergence";
}

function globalCandidates(input: OpportunityDiscoveryInput): OpportunityCandidate[] {
  const perception = input.perception;
  const intelligence = input.intelligence;
  const candidates: OpportunityCandidate[] = [];
  const composite = score(perception?.compositeScore, 50);
  const confidence = score(perception?.confidence, 50);
  const agreement = score(perception?.agreement, 50);
  const layerScores = Object.values(perception?.layers ?? {}).map((layer) => score(layer.score, 50));
  const layerMomentum = Object.values(perception?.layers ?? {}).map((layer) => number(layer.momentum));
  const averageMomentum = mean(layerMomentum);
  const dispersion = stdev(layerScores);
  const needs = input.needs ?? [];

  if (composite >= 62 && agreement >= 58) {
    candidates.push(candidate("system:alignment", "alignment", mean([composite, agreement, confidence]), confidence, [
      "Perception score, confidence, and agreement are aligned.",
    ]));
  }

  if (composite >= 68 && averageMomentum > 0) {
    candidates.push(candidate("system:expansion", "expansion", composite + averageMomentum * 0.4, confidence, [
      "Composite perception is expanding with positive layer momentum.",
    ]));
  }

  if (dispersion <= 8 && agreement >= 55) {
    candidates.push(candidate("system:compression", "compression", 70 - dispersion * 2 + agreement * 0.2, confidence, [
      "Layer dispersion is compressed while agreement remains constructive.",
    ]));
  }

  if ((intelligence?.contradictions ?? 0) > 0 || hasNeed(needs, "wait")) {
    
    candidates.push(candidate("system:divergence", "divergence", 45 + (intelligence?.contradictions ?? 0) * 8, confidence, [
      "Contradictory evidence is active and may resolve into a transition.",
    ], false));
  }

  if (intelligence?.transitionDetected || hasNeed(needs, "discover-opportunities")) {
    candidates.push(candidate("system:transition", "transition", mean([composite, confidence, 60]), confidence, [
      "The system is moving through a detectable state transition.",
    ]));
  }

  return candidates;
}

function candidate(
  opportunityId: string,
  type: OpportunityType,
  strength: number,
  confidence: number,
  evidence: string[],
  emerging = true,
): OpportunityCandidate {
  return {
    opportunityId,
    type,
    strength: round(clamp(strength)),
    confidence: round(clamp(confidence)),
    evidence,
    emerging,
    persistent: type === "persistence" || type === "alignment",
  };
}

function applyFindings(
  candidate: OpportunityCandidate,
  findings: DiscoveryFinding[] | undefined,
): OpportunityCandidate {
  const matching = (findings ?? []).filter((finding) => finding.feedsOpportunityTypes.includes(candidate.type));
  if (!matching.length) return candidate;

  const boost = Math.min(12, mean(matching.map((finding) => finding.confidence)) * 0.08);
  return {
    ...candidate,
    strength: round(clamp(candidate.strength + boost)),
    confidence: round(clamp(candidate.confidence + boost * 0.6)),
    evidence: [
      ...candidate.evidence,
      ...matching.map((finding) => `Explorer finding: ${finding.pattern}.`),
    ],
  };
}

function dedupe(candidates: OpportunityCandidate[]) {
  const best = new Map<string, OpportunityCandidate>();
  for (const candidate of candidates) {
    const existing = best.get(candidate.opportunityId);
    if (!existing || candidate.strength > existing.strength) best.set(candidate.opportunityId, candidate);
  }
  return Array.from(best.values());
}

function hasNeed(needs: DetectedNeed[], category: DetectedNeed["category"]) {
  return needs.some((need) => need.category === category);
}

function score(value: unknown, fallback: number) {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}


function round(value: number) {
  return Number(value.toFixed(2));
}

