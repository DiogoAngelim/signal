/* c8 ignore next */
import { clamp, mean, stdev } from "../math/statistics";

export type RecognitionVerdict =
  | "recognized"
  | "partially_recognized"
  | "novel"
  | "conflicted"
  | "insufficient_evidence";

export type RecognitionOutcomeLabel =
  | "positive"
  | "negative"
  | "neutral"
  | "success"
  | "failure"
  | "unknown"
  | string;

export type RecognitionDiscoveryEvidence = {
  confidence?: number;
  novelty?: number;
  contextMatch?: Array<{ similarity?: number; novelty?: number }>;
  memory?: {
    similarOutcomes?: number;
    positiveOutcomes?: number;
    negativeOutcomes?: number;
    neutralOutcomes?: number;
    reliability?: number;
  };
  missingEvidence?: string[];
  invalidationConditions?: string[];
};

export type RecognitionJudgementEvidence = {
  similarSampleSize?: number;
  reliability?: number;
  outcomeStability?: number;
  overfitRisk?: number;
  evidence?: {
    similarStates?: number;
    positiveOutcomes?: number;
    negativeOutcomes?: number;
    neutralOutcomes?: number;
    consistency?: number;
  };
  warnings?: string[];
};

export type RecognitionSurvivalEvidence = {
  recordCount?: number;
  matchedCount?: number;
  currentStateSimilarity?: number;
  survivalConfidence?: number;
  missingEvidence?: string[];
  invalidationConditions?: string[];
};

export type RecognitionSample = {
  id?: string;
  label?: string;
  state?: Record<string, unknown>;
  currentState?: Record<string, unknown>;
  features?: Record<string, unknown>;
  perception?: Record<string, unknown>;
  context?: Record<string, unknown>;
  fingerprint?: string;
  archetype?: string;
  archetypeId?: string;
  archetypeLabel?: string;
  similarity?: number;
  featureCoverage?: number;
  outcome?: RecognitionOutcomeLabel | unknown;
  result?: unknown;
  value?: number;
  score?: number;
  success?: boolean | null;
  confidence?: number;
  weight?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type RecognitionArchetype = {
  id?: string;
  label?: string;
  name?: string;
  state?: Record<string, unknown>;
  features?: Record<string, unknown>;
  perception?: Record<string, unknown>;
  fingerprint?: string;
  confidence?: number;
  sampleSize?: number;
  positiveOutcomes?: number;
  negativeOutcomes?: number;
  neutralOutcomes?: number;
  outcomeStability?: number;
  metadata?: Record<string, unknown>;
};

export type RecognitionThresholds = {
  minComparableSamples: number;
  minMatchedSamples: number;
  minOutcomeSamples: number;
  strongSampleSize: number;
  similarityThreshold: number;
  partialSimilarityThreshold: number;
  minFeatureCoverage: number;
  strongRecurrence: number;
  partialRecurrence: number;
  noveltyThreshold: number;
};

export type RecognitionInput = {
  currentState?: Record<string, unknown>;
  normalizedFeatures?: Record<string, unknown>;
  perception?: Record<string, unknown> | null;
  discovery?: RecognitionDiscoveryEvidence | null;
  survivalMemory?: RecognitionSurvivalEvidence | null;
  recovery?: Record<string, unknown> | null;
  judgement?: RecognitionJudgementEvidence | null;
  historicalStates?: RecognitionSample[];
  similarOutcomeSamples?: RecognitionSample[];
  outcomeSamples?: RecognitionSample[];
  archetypes?: RecognitionArchetype[];
  thresholds?: Partial<RecognitionThresholds>;
  now?: string | Date;
};

export type RecognitionResult = {
  recognitionScore: number;
  recurrenceConfidence: number;
  noveltyScore: number;
  archetype: string;
  archetypeConfidence: number;
  stateFingerprint: string;
  matchedSamples: number;
  matchedPositiveOutcomes: number;
  matchedNegativeOutcomes: number;
  outcomeStability: number;
  discoveryNoveltyJustified: boolean;
  judgementSimilarityJustified: boolean;
  verdict: RecognitionVerdict;
  reason: string;
  missingEvidence: string[];
  invalidationConditions: string[];
  metadata: {
    module: "recognition";
    version: "v1";
    createdAt: string;
  };
};

type FeatureValue = number | string | boolean | string[];

type Profile = Map<string, FeatureValue>;

type SimilarityMatch = {
  sample: RecognitionSample;
  similarity: number;
  coverage: number;
  score: number;
  outcome?: number;
};

type ArchetypeMatch = {
  label: string;
  confidence: number;
  sampleSize: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  neutralOutcomes: number;
  outcomeStability: number;
};

type EvidenceSummary = {
  currentProfile: Profile;
  stateFingerprint: string;
  samples: RecognitionSample[];
  comparable: SimilarityMatch[];
  matches: SimilarityMatch[];
  looseMatches: SimilarityMatch[];
  outcomes: number[];
  archetype: ArchetypeMatch;
  evidenceSampleCount: number;
  evidenceOutcomeCount: number;
  matchedPositiveOutcomes: number;
  matchedNegativeOutcomes: number;
  matchedNeutralOutcomes: number;
  averageSimilarity: number;
  averageCoverage: number;
  outcomeStability: number;
};

const DEFAULT_THRESHOLDS: RecognitionThresholds = {
  minComparableSamples: 5,
  minMatchedSamples: 5,
  minOutcomeSamples: 3,
  strongSampleSize: 12,
  similarityThreshold: 0.68,
  partialSimilarityThreshold: 0.58,
  minFeatureCoverage: 0.45,
  strongRecurrence: 70,
  partialRecurrence: 50,
  noveltyThreshold: 65,
};

const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";
const OUTCOME_EPSILON = 0.000001;

export function recognizeState(input: RecognitionInput = {}): RecognitionResult {
  const thresholds = normalizeThresholds(input.thresholds);
  const evidence = summarizeEvidence(input, thresholds);
  const discoveryNovelty = optionalScore(input.discovery?.novelty);
  const discoveryConfidence = optionalScore(input.discovery?.confidence);
  const judgementSamples = sampleCountFromJudgement(input.judgement);
  const judgementReliability = optionalScore(input.judgement?.reliability);
  const recurrenceConfidence = recurrenceConfidenceFor(evidence, input, thresholds);
  const noveltyScore = noveltyScoreFor(evidence, input, recurrenceConfidence, thresholds);
  const recognitionScore = recognitionScoreFor(recurrenceConfidence, noveltyScore, evidence.archetype.confidence);
  const discoverySaysNovel = discoveryNovelty >= thresholds.noveltyThreshold ||
    (discoveryConfidence > 0 && discoveryConfidence < 50 && (input.discovery?.memory?.similarOutcomes ?? 0) === 0);
  const judgementSaysSimilar = judgementSamples >= thresholds.minMatchedSamples && judgementReliability >= 50;
  const strongRecurrence = recurrenceConfidence >= thresholds.strongRecurrence &&
    evidence.evidenceSampleCount >= thresholds.minMatchedSamples &&
    evidence.outcomeStability >= 60;
  const partialRecurrence = recurrenceConfidence >= thresholds.partialRecurrence &&
    (evidence.evidenceSampleCount >= thresholds.minMatchedSamples ||
      evidence.looseMatches.length >= thresholds.minMatchedSamples ||
      evidence.archetype.confidence >= 55);
  const enoughNoveltyMemory =
    evidence.comparable.length >= thresholds.minComparableSamples ||
    evidence.evidenceSampleCount >= thresholds.minMatchedSamples ||
    evidence.archetype.confidence >= 70;
  const discoveryNoveltyJustified = noveltyScore >= thresholds.noveltyThreshold &&
    enoughNoveltyMemory &&
    recurrenceConfidence < thresholds.partialRecurrence;
  const judgementSimilarityJustified = strongRecurrence ||
    (judgementSaysSimilar &&
      recurrenceConfidence >= thresholds.strongRecurrence &&
      evidence.averageCoverage >= thresholds.minFeatureCoverage * 100);
  const verdict = verdictFor({
    hasCurrentFeatures: evidence.currentProfile.size > 0,
    evidence,
    thresholds,
    strongRecurrence,
    partialRecurrence,
    discoverySaysNovel,
    judgementSaysSimilar,
    discoveryNoveltyJustified,
    judgementSimilarityJustified,
  });
  const missingEvidence = missingEvidenceFor({
    input,
    evidence,
    thresholds,
    discoverySaysNovel,
    judgementSaysSimilar,
    discoveryNoveltyJustified,
    judgementSimilarityJustified,
  });
  const invalidationConditions = invalidationConditionsFor({
    input,
    verdict,
    thresholds,
    discoverySaysNovel,
    judgementSaysSimilar,
    discoveryNoveltyJustified,
    judgementSimilarityJustified,
  });

  return {
    recognitionScore,
    recurrenceConfidence,
    noveltyScore,
    archetype: evidence.archetype.label,
    archetypeConfidence: evidence.archetype.confidence,
    stateFingerprint: evidence.stateFingerprint,
    matchedSamples: evidence.evidenceSampleCount,
    matchedPositiveOutcomes: evidence.matchedPositiveOutcomes,
    matchedNegativeOutcomes: evidence.matchedNegativeOutcomes,
    outcomeStability: evidence.outcomeStability,
    discoveryNoveltyJustified,
    judgementSimilarityJustified,
    verdict,
    reason: reasonFor({
      verdict,
      recurrenceConfidence,
      noveltyScore,
      recognitionScore,
      evidence,
      discoverySaysNovel,
      judgementSaysSimilar,
      discoveryNoveltyJustified,
      judgementSimilarityJustified,
    }),
    missingEvidence,
    invalidationConditions,
    metadata: {
      module: "recognition",
      version: "v1",
      createdAt: createdAtFor(input.now),
    },
  };
}

export const recognize = recognizeState;
export const evaluateRecognition = recognizeState;

function summarizeEvidence(input: RecognitionInput, thresholds: RecognitionThresholds): EvidenceSummary {
  const currentProfile = profileFor({
    state: plainRecord(input.currentState) ? input.currentState : {},
    features: plainRecord(input.normalizedFeatures) ? input.normalizedFeatures : {},
    perception: plainRecord(input.perception) ? input.perception as Record<string, unknown> : {},
    context: plainRecord(input.recovery) ? input.recovery as Record<string, unknown> : {},
  });
  const stateFingerprint = fingerprintFor(currentProfile);
  const samples = collectSamples(input);
  const comparable = samples
    .map((sample) => compareSample(currentProfile, stateFingerprint, sample))
    .filter((match) => match.score > 0 || match.coverage > 0)
    .sort((left, right) => right.score - left.score || idFor(left.sample).localeCompare(idFor(right.sample)));
  const matches = comparable.filter((match) =>
    match.score >= thresholds.similarityThreshold &&
    match.coverage >= thresholds.minFeatureCoverage);
  const looseMatches = comparable.filter((match) =>
    match.score >= thresholds.partialSimilarityThreshold &&
    match.coverage >= thresholds.minFeatureCoverage);
  const outcomes = matches
    .map((match) => match.outcome)
    .filter((value): value is number => Number.isFinite(value));
  const archetype = archetypeFor({
    input,
    currentProfile,
    stateFingerprint,
    matches,
    outcomes,
    thresholds,
  });
  const matchedPositiveOutcomes = outcomes.length
    ? outcomes.filter((value) => value > OUTCOME_EPSILON).length
    : archetype.positiveOutcomes;
  const matchedNegativeOutcomes = outcomes.length
    ? outcomes.filter((value) => value < -OUTCOME_EPSILON).length
    : archetype.negativeOutcomes;
  const matchedNeutralOutcomes = outcomes.length
    ? outcomes.length - matchedPositiveOutcomes - matchedNegativeOutcomes
    : archetype.neutralOutcomes;
  const evidenceSampleCount = Math.max(matches.length, archetype.sampleSize);
  const evidenceOutcomeCount = outcomes.length ||
    archetype.positiveOutcomes + archetype.negativeOutcomes + archetype.neutralOutcomes;
  const averageSimilarity = roundScore(mean(matches.map((match) => match.score * 100)));
  const averageCoverage = roundScore(mean(matches.map((match) => match.coverage * 100)));
  const outcomeStability = outcomes.length
    ? stabilityFor(outcomes, matchedPositiveOutcomes, matchedNegativeOutcomes, matchedNeutralOutcomes)
    : archetype.outcomeStability || optionalScore(input.judgement?.outcomeStability);

  return {
    currentProfile,
    stateFingerprint,
    samples,
    comparable,
    matches,
    looseMatches,
    outcomes,
    archetype,
    evidenceSampleCount,
    evidenceOutcomeCount,
    matchedPositiveOutcomes,
    matchedNegativeOutcomes,
    matchedNeutralOutcomes,
    averageSimilarity,
    averageCoverage,
    outcomeStability,
  };
}

function collectSamples(input: RecognitionInput) {
  const seen = new Set<string>();
  const samples = [
    ...array(input.historicalStates),
    ...array(input.similarOutcomeSamples),
    ...array(input.outcomeSamples),
  ];

  return samples.filter((sample, index) => {
    const key = sample.id ?? sample.fingerprint ?? `sample:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareSample(current: Profile, fingerprint: string, sample: RecognitionSample): SimilarityMatch {
  const explicitSimilarity = optionalRatio(sample.similarity);
  const explicitCoverage = optionalRatio(sample.featureCoverage);
  const sampleFingerprint = stringValue(sample.fingerprint);
  const profile = profileFor({
    state: firstRecord(sample.state, sample.currentState, recordFromMetadata(sample.metadata, "state")),
    features: firstRecord(sample.features, recordFromMetadata(sample.metadata, "features")),
    perception: firstRecord(sample.perception, recordFromMetadata(sample.metadata, "perception")),
    context: firstRecord(sample.context, recordFromMetadata(sample.metadata, "context")),
  });
  const similarity = sampleFingerprint && sampleFingerprint === fingerprint
    ? { similarity: 1, coverage: 1, score: 1 }
    : profile.size
      ? similarityBetween(current, profile)
      : {
          similarity: explicitSimilarity ?? 0,
          coverage: explicitCoverage ?? 0,
          score: (explicitSimilarity ?? 0) * Math.sqrt(explicitCoverage ?? 0),
        };

  return {
    sample,
    ...similarity,
    outcome: outcomeValueFor(sample),
  };
}

function archetypeFor(input: {
  input: RecognitionInput;
  currentProfile: Profile;
  stateFingerprint: string;
  matches: SimilarityMatch[];
  outcomes: number[];
  thresholds: RecognitionThresholds;
}): ArchetypeMatch {
  const explicit = explicitArchetypeMatch(input);
  if (explicit.confidence > 0) return explicit;

  const grouped = groupedArchetypeMatch(input.matches, input.thresholds);
  if (grouped.confidence > 0) return grouped;

  return derivedArchetypeMatch(input.matches, input.outcomes, input.thresholds);
}

function explicitArchetypeMatch(input: {
  input: RecognitionInput;
  currentProfile: Profile;
  stateFingerprint: string;
  thresholds: RecognitionThresholds;
}): ArchetypeMatch {
  const matches = array(input.input.archetypes)
    .map((archetype) => {
      const profile = profileFor({
        state: firstRecord(archetype.state, recordFromMetadata(archetype.metadata, "state")),
        features: firstRecord(archetype.features, recordFromMetadata(archetype.metadata, "features")),
        perception: firstRecord(archetype.perception, recordFromMetadata(archetype.metadata, "perception")),
      });
      const fingerprint = stringValue(archetype.fingerprint);
      const similarity = fingerprint && fingerprint === input.stateFingerprint
        ? { similarity: 1, coverage: 1, score: 1 }
        : profile.size
          ? similarityBetween(profile, input.currentProfile)
          : { similarity: 0, coverage: 0, score: 0 };
      const sampleSize = Math.max(0, Math.round(numberValue(archetype.sampleSize)));
      const confidence = roundScore(
        similarity.score * 45 +
          similarity.coverage * 20 +
          optionalScore(archetype.confidence) * 0.2 +
          sampleScore(sampleSize, input.thresholds.strongSampleSize) * 0.15,
      );

      return { archetype, similarity, confidence, sampleSize };
    })
    .filter((match) =>
      match.confidence >= 50 &&
      match.similarity.coverage >= input.thresholds.minFeatureCoverage)
    .sort((left, right) => right.confidence - left.confidence || labelForArchetype(left.archetype).localeCompare(labelForArchetype(right.archetype)));

  const best = matches[0];
  if (!best) return emptyArchetype();

  return {
    label: labelForArchetype(best.archetype),
    confidence: best.confidence,
    sampleSize: best.sampleSize,
    positiveOutcomes: Math.max(0, Math.round(numberValue(best.archetype.positiveOutcomes))),
    negativeOutcomes: Math.max(0, Math.round(numberValue(best.archetype.negativeOutcomes))),
    neutralOutcomes: Math.max(0, Math.round(numberValue(best.archetype.neutralOutcomes))),
    outcomeStability: optionalScore(best.archetype.outcomeStability),
  };
}

function groupedArchetypeMatch(matches: SimilarityMatch[], thresholds: RecognitionThresholds): ArchetypeMatch {
  const groups = new Map<string, SimilarityMatch[]>();
  for (const match of matches) {
    const label = stringValue(match.sample.archetypeLabel ?? match.sample.archetype ?? match.sample.archetypeId);
    if (!label) continue;
    groups.set(label, [...(groups.get(label) ?? []), match]);
  }

  const ranked = Array.from(groups.entries())
    .map(([label, group]) => {
      const outcomes = group.map((match) => match.outcome).filter((value): value is number => Number.isFinite(value));
      const positive = outcomes.filter((value) => value > OUTCOME_EPSILON).length;
      const negative = outcomes.filter((value) => value < -OUTCOME_EPSILON).length;
      const neutral = outcomes.length - positive - negative;
      const stability = outcomes.length ? stabilityFor(outcomes, positive, negative, neutral) : 0;
      const confidence = roundScore(
        mean(group.map((match) => match.score * 100)) * 0.45 +
          sampleScore(group.length, thresholds.strongSampleSize) * 0.25 +
          stability * 0.3,
      );

      return { label, confidence, sampleSize: group.length, positiveOutcomes: positive, negativeOutcomes: negative, neutralOutcomes: neutral, outcomeStability: stability };
    })
    .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label));

  return ranked[0] ?? emptyArchetype();
}

function derivedArchetypeMatch(matches: SimilarityMatch[], outcomes: number[], thresholds: RecognitionThresholds): ArchetypeMatch {
  if (matches.length < thresholds.minMatchedSamples) return emptyArchetype();

  const positive = outcomes.filter((value) => value > OUTCOME_EPSILON).length;
  const negative = outcomes.filter((value) => value < -OUTCOME_EPSILON).length;
  const neutral = outcomes.length - positive - negative;
  const stability = outcomes.length ? stabilityFor(outcomes, positive, negative, neutral) : 0;
  const dominant = Math.max(positive, negative, neutral);
  const ratio = outcomes.length ? dominant / outcomes.length : 0;
  const label = outcomes.length < thresholds.minOutcomeSamples
    ? "recurring_state"
    : stability < 50
      ? "unstable_recurring_state"
      : ratio >= 0.7 && positive === dominant
        ? "stable_positive_state"
        : ratio >= 0.7 && negative === dominant
          ? "stable_negative_state"
          : "mixed_recurring_state";
  const confidence = roundScore(
    mean(matches.map((match) => match.score * 100)) * 0.42 +
      sampleScore(matches.length, thresholds.strongSampleSize) * 0.28 +
      stability * 0.3,
  );

  return {
    label,
    confidence,
    sampleSize: matches.length,
    positiveOutcomes: positive,
    negativeOutcomes: negative,
    neutralOutcomes: neutral,
    outcomeStability: stability,
  };
}

function recurrenceConfidenceFor(evidence: EvidenceSummary, input: RecognitionInput, thresholds: RecognitionThresholds) {
  const sampleEvidence = sampleScore(evidence.evidenceSampleCount, thresholds.strongSampleSize);
  const similarity = evidence.averageSimilarity || evidence.archetype.confidence * 0.85;
  const coverage = evidence.averageCoverage || (evidence.archetype.confidence > 0 ? 70 : 0);
  const broadPenalty = evidence.comparable.length > 0 && evidence.matches.length === 0
    ? Math.max(0, thresholds.minFeatureCoverage * 100 - mean(evidence.comparable.map((match) => match.coverage * 100))) * 0.5
    : 0;
  const direct = roundScore(
    similarity * 0.38 +
      sampleEvidence * 0.24 +
      evidence.outcomeStability * 0.24 +
      coverage * 0.14 -
      broadPenalty,
  );
  const judgementSamples = sampleCountFromJudgement(input.judgement);
  const summary = roundScore(
    sampleScore(judgementSamples, thresholds.strongSampleSize) * 0.25 +
      optionalScore(input.judgement?.reliability) * 0.2 +
      optionalScore(input.judgement?.outcomeStability) * 0.25 +
      optionalScore(input.discovery?.memory?.reliability) * 0.1 +
      optionalScore(input.survivalMemory?.currentStateSimilarity) * 0.1 +
      optionalScore(input.survivalMemory?.survivalConfidence) * 0.1,
  );

  if (evidence.evidenceSampleCount >= thresholds.minMatchedSamples || evidence.archetype.confidence >= 70) {
    return roundScore(Math.max(direct, Math.min(82, summary)));
  }

  return roundScore(Math.max(direct, Math.min(49, summary)));
}

function noveltyScoreFor(
  evidence: EvidenceSummary,
  input: RecognitionInput,
  recurrenceConfidence: number,
  thresholds: RecognitionThresholds,
) {
  const archetypeSimilarity = evidence.archetype.confidence > 0 ? evidence.archetype.confidence / 100 : 0;
  const bestSimilarity = evidence.matches[0]?.score ?? evidence.looseMatches[0]?.score ?? archetypeSimilarity;
  const averageCoverage = evidence.averageCoverage ||
    (evidence.archetype.confidence > 0 ? Math.min(100, Math.max(70, evidence.archetype.confidence)) : 0);
  const samplePenalty = 100 - sampleScore(evidence.evidenceSampleCount, thresholds.strongSampleSize);
  const evidenceNovelty = roundScore(
    (100 - bestSimilarity * 100) * 0.62 +
      samplePenalty * 0.23 +
      (100 - averageCoverage) * 0.15,
  );
  const discoveryNovelty = optionalScore(input.discovery?.novelty, evidenceNovelty);
  const reconciled = evidence.evidenceSampleCount >= thresholds.minMatchedSamples || evidence.archetype.confidence >= 70
    ? evidenceNovelty * 0.72 + discoveryNovelty * 0.28
    : Math.max(evidenceNovelty, discoveryNovelty * 0.7);

  return roundScore(Math.min(100, Math.max(0, reconciled - recurrenceConfidence * 0.12)));
}

function recognitionScoreFor(recurrenceConfidence: number, noveltyScore: number, archetypeConfidence: number) {
  return roundScore(
    recurrenceConfidence * 0.55 +
      (100 - noveltyScore) * 0.25 +
      archetypeConfidence * 0.2,
  );
}

function verdictFor(input: {
  hasCurrentFeatures: boolean;
  evidence: EvidenceSummary;
  thresholds: RecognitionThresholds;
  strongRecurrence: boolean;
  partialRecurrence: boolean;
  discoverySaysNovel: boolean;
  judgementSaysSimilar: boolean;
  discoveryNoveltyJustified: boolean;
  judgementSimilarityJustified: boolean;
}): RecognitionVerdict {
  if (!input.hasCurrentFeatures) return "insufficient_evidence";
  if (input.strongRecurrence) return "recognized";
  if (
    input.discoverySaysNovel &&
    input.judgementSaysSimilar &&
    !input.judgementSimilarityJustified &&
    input.evidence.samples.length >= input.thresholds.minComparableSamples
  ) {
    return "conflicted";
  }
  if (input.partialRecurrence) return "partially_recognized";
  if (
    input.evidence.samples.length < input.thresholds.minComparableSamples &&
    input.evidence.archetype.confidence < 50
  ) {
    return "insufficient_evidence";
  }
  if (input.discoveryNoveltyJustified) return "novel";
  if (input.discoverySaysNovel || input.judgementSaysSimilar) return "conflicted";
  return "insufficient_evidence";
}

function missingEvidenceFor(input: {
  input: RecognitionInput;
  evidence: EvidenceSummary;
  thresholds: RecognitionThresholds;
  discoverySaysNovel: boolean;
  judgementSaysSimilar: boolean;
  discoveryNoveltyJustified: boolean;
  judgementSimilarityJustified: boolean;
}) {
  const missing = [
    input.evidence.currentProfile.size === 0 ? "current state features" : "",
    input.evidence.samples.length < input.thresholds.minComparableSamples &&
      input.evidence.archetype.confidence < 70
      ? "historical state samples"
      : "",
    input.evidence.evidenceSampleCount < input.thresholds.minMatchedSamples
      ? "recurring state matches above the recognition threshold"
      : "",
    input.evidence.evidenceOutcomeCount < input.thresholds.minOutcomeSamples
      ? "historical outcome linkage"
      : "",
    input.judgementSaysSimilar && !input.judgementSimilarityJustified
      ? "state-level evidence explaining Judgement similarity"
      : "",
    input.discoverySaysNovel && !input.discoveryNoveltyJustified &&
      !input.judgementSimilarityJustified &&
      input.evidence.samples.length < input.thresholds.minComparableSamples
      ? "memory depth sufficient to justify novelty"
      : "",
    ...(input.judgementSimilarityJustified ? [] : array(input.input.discovery?.missingEvidence).slice(0, 3)),
    ...array(input.input.survivalMemory?.missingEvidence).slice(0, 2),
  ];

  return unique(missing);
}

function invalidationConditionsFor(input: {
  input: RecognitionInput;
  verdict: RecognitionVerdict;
  thresholds: RecognitionThresholds;
  discoverySaysNovel: boolean;
  judgementSaysSimilar: boolean;
  discoveryNoveltyJustified: boolean;
  judgementSimilarityJustified: boolean;
}) {
  const conditions = [
    input.verdict === "recognized" || input.verdict === "partially_recognized"
      ? `Invalidate recognition if state similarity falls below ${Math.round(input.thresholds.similarityThreshold * 100)}/100 or outcome stability falls below 60/100.`
      : "",
    input.verdict === "novel"
      ? "Invalidate novelty if recurring state matches accumulate with stable outcomes."
      : "",
    input.discoverySaysNovel && !input.discoveryNoveltyJustified
      ? "Invalidate Discovery novelty if recurrence evidence remains stable across additional samples."
      : "",
    input.judgementSaysSimilar && !input.judgementSimilarityJustified
      ? "Invalidate Judgement similarity if feature coverage remains too broad or outcome linkage is missing."
      : "",
    input.verdict === "insufficient_evidence"
      ? "Invalidate the insufficient-evidence verdict when comparable states and linked outcomes become available."
      : "",
    ...array(input.input.discovery?.invalidationConditions).slice(0, 3),
    ...array(input.input.survivalMemory?.invalidationConditions).slice(0, 2),
  ];

  return unique(conditions);
}

function reasonFor(input: {
  verdict: RecognitionVerdict;
  recurrenceConfidence: number;
  noveltyScore: number;
  recognitionScore: number;
  evidence: EvidenceSummary;
  discoverySaysNovel: boolean;
  judgementSaysSimilar: boolean;
  discoveryNoveltyJustified: boolean;
  judgementSimilarityJustified: boolean;
}) {
  const base = `Recognition is ${input.verdict} with recurrence ${formatScore(input.recurrenceConfidence)}, novelty ${formatScore(input.noveltyScore)}, and ${input.evidence.evidenceSampleCount} matched sample(s).`;

  if (input.verdict === "recognized") {
    return `${base} The current state resembles the ${input.evidence.archetype.label} archetype with stable linked outcomes.`;
  }
  if (input.verdict === "partially_recognized") {
    return `${base} The state recurs, but match confidence or outcome linkage is not strong enough for full recognition.`;
  }
  if (input.verdict === "novel") {
    return `${base} Comparable memory is broad enough and recurrence evidence is weak, so Discovery novelty is justified.`;
  }
  if (input.verdict === "conflicted") {
    const cause = input.judgementSaysSimilar && !input.judgementSimilarityJustified
      ? "Judgement similarity is broader than Recognition can justify from state-level matches."
      : "Discovery and Judgement point to different similarity definitions.";
    return `${base} ${cause}`;
  }

  return `${base} Recognition needs more comparable states or outcome linkage before accepting either novelty or recurrence.`;
}

function profileFor(input: {
  state?: Record<string, unknown>;
  features?: Record<string, unknown>;
  perception?: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  const features = new Map<string, FeatureValue>();
  flattenInto(features, "state", input.state);
  flattenInto(features, "features", input.features);
  flattenInto(features, "perception", input.perception);
  flattenInto(features, "context", input.context);
  return features;
}

function flattenInto(features: Map<string, FeatureValue>, prefix: string, value: unknown) {
  if (!plainRecord(value)) return;

  for (const [key, child] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const path = `${prefix}.${key}`;
    if (plainRecord(child)) {
      flattenInto(features, path, child);
      continue;
    }

    const normalized = featureValue(child);
    if (normalized !== undefined) features.set(path, normalized);
  }
}

function featureValue(value: unknown): FeatureValue | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return roundFeatureNumber(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized ? normalized : undefined;
  }
  if (Array.isArray(value)) {
    const values = value
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean)
      .sort();
    return values.length ? Array.from(new Set(values)) : undefined;
  }
  return undefined;
}

function similarityBetween(current: Profile, historical: Profile) {
  let matchedWeight = 0;
  let weightedSimilarity = 0;
  let totalWeight = 0;

  for (const [key, currentValue] of current) {
    const weight = featureWeight(key);
    totalWeight += weight;
    if (!historical.has(key)) continue;

    matchedWeight += weight;
    weightedSimilarity += valueSimilarity(currentValue, historical.get(key) as FeatureValue) * weight;
  }

  const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const similarity = matchedWeight > 0 ? weightedSimilarity / matchedWeight : 0;
  const score = similarity * Math.sqrt(coverage);

  return {
    similarity: roundRatio(similarity),
    coverage: roundRatio(coverage),
    score: roundRatio(score),
  };
}

function valueSimilarity(left: FeatureValue, right: FeatureValue) {
  if (typeof left === "number" && typeof right === "number") {
    const denominator = Math.max(1, Math.abs(left), Math.abs(right));
    return clamp(1 - Math.abs(left - right) / denominator, 0, 1);
  }
  if (Array.isArray(left) && Array.isArray(right)) return jaccard(left, right);
  if (typeof left === "string" && typeof right === "string") {
    if (left === right) return 1;
    return jaccard(tokens(left), tokens(right)) * 0.75;
  }
  return Object.is(left, right) ? 1 : 0;
}

function featureWeight(path: string) {
  if (path.startsWith("features.")) return 1.3;
  if (path.startsWith("state.")) return 1.2;
  if (path.startsWith("perception.")) return 1;
  /* c8 ignore next */
  return 0.8;
}

function fingerprintFor(profile: Profile) {
  const body = Array.from(profile.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodeFeature(value)}`)
    .join("|");
  return `recog-v1:${hashString(body)}:${body.slice(0, 48)}`;
}

function encodeFeature(value: FeatureValue) {
  return Array.isArray(value) ? `[${value.join(",")}]` : String(value);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function outcomeValueFor(sample: RecognitionSample) {
  const direct = firstFinite(sample.value, sample.score, recordNumber(sample.result, "value"), recordNumber(sample.outcome, "value"));
  if (direct != null) return direct;
  if (sample.success === true) return 1;
  if (sample.success === false) return -1;

  const label = stringValue(
    recordValue(sample.outcome, "label") ??
      recordValue(sample.result, "label") ??
      sample.outcome ??
      sample.result,
  );
  if (!label) return undefined;
  if (/positive|success|win|helped|valid|approved/i.test(label)) return 1;
  if (/negative|failure|loss|hurt|invalid|rejected/i.test(label)) return -1;
  if (/neutral|flat|mixed|unknown/i.test(label)) return 0;
  return undefined;
}

function stabilityFor(outcomes: number[], positive: number, negative: number, neutral: number) {
  /* c8 ignore next */
  if (!outcomes.length) return 0;
  const consistency = Math.max(positive, negative, neutral) / outcomes.length * 100;
  const dispersionSafety = clamp(100 - stdev(outcomes), 0, 100);
  return roundScore(consistency * 0.65 + dispersionSafety * 0.35);
}

function sampleCountFromJudgement(judgement?: RecognitionJudgementEvidence | null) {
  return Math.max(
    0,
    Math.round(
      firstFinite(judgement?.similarSampleSize, judgement?.evidence?.similarStates) ?? 0,
    ),
  );
}

function sampleScore(count: number, strongSampleSize: number) {
  return clamp((Math.max(0, count) / Math.max(1, strongSampleSize)) * 100);
}

function normalizeThresholds(input?: Partial<RecognitionThresholds>) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(input ?? {}),
  };
}

function emptyArchetype(): ArchetypeMatch {
  return {
    label: "unknown",
    confidence: 0,
    sampleSize: 0,
    positiveOutcomes: 0,
    negativeOutcomes: 0,
    neutralOutcomes: 0,
    outcomeStability: 0,
  };
}

function labelForArchetype(archetype: RecognitionArchetype) {
  return stringValue(archetype.label ?? archetype.name ?? archetype.id) ?? "known_state";
}

function optionalScore(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return roundScore(Math.abs(number) <= 1 ? number * 100 : number);
}

function optionalRatio(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return clamp(Math.abs(number) <= 1 ? number : number / 100, 0, 1);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstFinite(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function recordNumber(value: unknown, key: string) {
  const record = plainRecord(value) ? value : null;
  return record ? firstFinite(record[key]) : undefined;
}

function recordValue(value: unknown, key: string) {
  return plainRecord(value) ? value[key] : undefined;
}

function firstRecord(...values: unknown[]) {
  return values.find(plainRecord) as Record<string, unknown> | undefined;
}

function recordFromMetadata(metadata: unknown, key: string) {
  const value = recordValue(metadata, key);
  return plainRecord(value) ? value : undefined;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date));
}

function array<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (!union.size) return 0;

  let overlap = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) overlap += 1;
  }
  return overlap / union.size;
}

function tokens(value: string) {
  return value.split(/[^a-z0-9]+/i).filter(Boolean);
}

function roundFeatureNumber(value: number) {
  return Number(value.toFixed(6));
}

function roundRatio(value: number) {
  return Number(clamp(value, 0, 1).toFixed(6));
}

function roundScore(value: number) {
  return Number(clamp(value).toFixed(2));
}

function formatScore(value: number) {
  return `${Math.round(value)}/100`;
}

function idFor(sample: RecognitionSample) {
  return stringValue(sample.id ?? sample.label ?? sample.fingerprint) ?? "sample";
}

/* c8 ignore next */
function createdAtFor(value: string | Date | undefined) {
  let date: Date | null = null;
  if (typeof value === "string") date = new Date(value);
  if (Object.prototype.toString.call(value) === "[object Date]") date = value as Date;

  return date != null && Number.isFinite(date.getTime()) ? date.toISOString() : DEFAULT_CREATED_AT;
}
