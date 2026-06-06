/* c8 ignore next */
import { clamp, mean, stdev } from "../math/statistics";

export type RobustnessRegime =
  | "trending"
  | "volatile"
  | "low-volatility"
  | "panic"
  | "recovery"
  | "sideways"
  | "liquidity-compression"
  | "expansion";

export type RobustnessObservation = {
  id?: string;
  index?: number;
  timestamp?: number;
  actual: number;
  predicted?: number;
  confidence?: number;
  regime?: RobustnessRegime | string;
  features?: Record<string, number>;
  participated?: boolean;
};

export type RobustnessParameterVariant = {
  id: string;
  score: number;
  baselineScore?: number;
  benchmarkScore?: number;
  passed?: boolean;
};

export type RobustnessAdversarialScenario = {
  id: string;
  score: number;
  baselineScore?: number;
  severity?: number;
};

export type RobustnessEnsembleVote = {
  id: string;
  direction: number;
  confidence: number;
  weight?: number;
};

export type LeakageCheck = {
  id: string;
  trainEndIndex: number;
  validationStartIndex: number;
  normalizedWithFuture?: boolean;
  featureTimestampIndex?: number;
  labelTimestampIndex?: number;
};

export type SignalRobustnessInput = {
  observations: RobustnessObservation[];
  trainWindowSize?: number;
  validationWindowSize?: number;
  stepSize?: number;
  minimumSamples?: number;
  parameterVariants?: RobustnessParameterVariant[];
  adversarialScenarios?: RobustnessAdversarialScenario[];
  ensembleVotes?: RobustnessEnsembleVote[];
  leakageChecks?: LeakageCheck[];
  expectedForwardSamples?: number;
  observedForwardSamples?: number;
  dataQualityScore?: number;
  historyDepthScore?: number;
  regimeCoverageScore?: number;
  regimeDiversityScore?: number;
  sampleDiversityScore?: number;
  seed?: number;
};

export type SignalRobustnessResult = {
  robustnessScore: number;
  overfitRisk: number;
  generalizationConfidence: number;
  structuralReliability: number;
  adaptabilityScore: number;
  uncertaintyLevel: number;
  deploymentReadiness: number;
  historyDepthScore: number;
  regimeCoverageScore: number;
  regimeDiversityScore: number;
  sampleDiversityScore: number;
  safetyGate: "allow" | "reduce" | "block";
  reasons: string[];
  walkForward: {
    stabilityScore: number;
    consistencyScore: number;
    degradationPct: number;
    windows: Array<{
      trainStartIndex: number;
      trainEndIndex: number;
      validationStartIndex: number;
      validationEndIndex: number;
      trainMean: number;
      validationMean: number;
      degradationPct: number;
    }>;
  };
  regimes: {
    regimeRobustnessScore: number;
    regimeDependencyScore: number;
    adaptabilityScore: number;
    regimes: Array<{ regime: string; samples: number; meanOutcome: number; score: number }>;
  };
  calibration: {
    calibrationScore: number;
    calibrationError: number;
    confidenceDecay: number;
    reliabilityCurve: Array<{ bucket: string; samples: number; predictedConfidence: number; realizedRate: number }>;
  };
  parameterSensitivity: {
    stabilityScore: number;
    fragilityScore: number;
    gradient: number;
    heatmap: Array<{ id: string; score: number; degradationPct: number; passed: boolean }>;
  };
  adversarial: {
    robustnessScore: number;
    executionRealismScore: number;
    scenarios: Array<{ id: string; degradationPct: number; resilienceScore: number }>;
  };
  participation: {
    participationScore: number;
    opportunityDensity: number;
    executableConviction: number;
  };
  ensemble: {
    consensusScore: number;
    dominancePenalty: number;
    disagreementScore: number;
  };
  leakage: {
    passed: boolean;
    violations: string[];
  };
  featureTrust: {
    trustScore: number;
    entropy: number;
    features: Array<{ key: string; trust: number; weight: number }>;
  };
  realityGap: {
    realismScore: number;
    expectedDegradationPct: number;
  };
  statisticalIntegrity: {
    score: number;
    bootstrapStability: number;
    monteCarloStability: number;
    minimumSampleScore: number;
    dataQualityScore: number;
  };
};

type NormalizedObservation = Required<Pick<RobustnessObservation, "actual" | "confidence" | "participated">> &
  RobustnessObservation & {
    order: number;
    regime: string;
  };

export class SignalRobustnessEngine {
  evaluate(input: SignalRobustnessInput): SignalRobustnessResult {
    const observations = normalizeObservations(input.observations);
    const minimumSamples = Math.max(1, Math.round(input.minimumSamples ?? 30));
    const walkForward = evaluateRollingWalkForward(
      observations,
      Math.max(2, Math.round(input.trainWindowSize ?? Math.max(12, minimumSamples))),
      Math.max(1, Math.round(input.validationWindowSize ?? Math.max(4, Math.floor(minimumSamples / 3)))),
      Math.max(1, Math.round(input.stepSize ?? Math.max(1, Math.floor((input.validationWindowSize ?? minimumSamples / 3) / 2)))),
    );
    const regimes = evaluateRegimes(observations);
    const calibration = evaluateCalibration(observations, minimumSamples);
    const parameterSensitivity = evaluateParameterSensitivity(input.parameterVariants ?? []);
    const adversarial = evaluateAdversarial(input.adversarialScenarios ?? []);
    const participation = evaluateParticipation(observations);
    const ensemble = evaluateEnsemble(input.ensembleVotes ?? []);
    const leakage = evaluateLeakage(input.leakageChecks ?? []);
    const featureTrust = evaluateFeatureTrust(observations);
    const statisticalIntegrity = evaluateStatisticalIntegrity(
      observations,
      minimumSamples,
      clamp(input.dataQualityScore ?? 100),
      input.seed ?? 17,
    );
    const realityGap = estimateRealityGap(walkForward.degradationPct, adversarial.executionRealismScore, statisticalIntegrity.score);
    const observedForwardSamples = Math.max(0, Math.round(input.observedForwardSamples ?? observations.length));
    const expectedForwardSamples = Math.max(1, Math.round(input.expectedForwardSamples ?? minimumSamples));
    const forwardSampleScore = clamp((observedForwardSamples / expectedForwardSamples) * 100);
    const historyDepthScore = clamp(input.historyDepthScore ?? statisticalIntegrity.minimumSampleScore);
    const regimeCoverageScore = clamp(input.regimeCoverageScore ?? regimes.regimeRobustnessScore);
    const regimeDiversityScore = clamp(input.regimeDiversityScore ?? clamp(100 - regimes.regimeDependencyScore));
    const sampleDiversityScore = clamp(input.sampleDiversityScore ?? statisticalIntegrity.score);
    const componentScores = [
      walkForward.stabilityScore,
      regimes.regimeRobustnessScore,
      calibration.calibrationScore,
      parameterSensitivity.stabilityScore,
      adversarial.robustnessScore,
      participation.participationScore,
      ensemble.consensusScore,
      leakage.passed ? 100 : 0,
      featureTrust.trustScore,
      realityGap.realismScore,
      statisticalIntegrity.score,
      forwardSampleScore,
      historyDepthScore,
      regimeCoverageScore,
      regimeDiversityScore,
      sampleDiversityScore,
    ];
    const robustnessScore = Math.round(weightedMean(componentScores, [1.1, 1, 1, 1.05, 0.9, 0.9, 0.85, 1.25, 0.8, 1, 1.1, 0.7, 0.55, 0.5, 0.5, 0.45]));
    const uncertaintyLevel = Math.round(clamp(100 - weightedMean(componentScores, [1, 1, 1.2, 1, 0.8, 0.8, 0.7, 1.4, 0.7, 1, 1.1, 0.7, 0.45, 0.45, 0.45, 0.4])));
    const structuralReliability = Math.round(mean([
      parameterSensitivity.stabilityScore,
      leakage.passed ? 100 : 0,
      statisticalIntegrity.score,
      realityGap.realismScore,
    ]));
    const adaptabilityScore = Math.round(mean([
      regimes.adaptabilityScore,
      walkForward.consistencyScore,
      adversarial.robustnessScore,
      featureTrust.trustScore,
    ]));
    const generalizationConfidence = Math.round(mean([
      robustnessScore,
      calibration.calibrationScore,
      structuralReliability,
      forwardSampleScore,
      historyDepthScore,
      regimeCoverageScore,
    ]));
    const historyPenalty =
      Math.max(0, 65 - historyDepthScore) * 0.12 +
      Math.max(0, 65 - regimeCoverageScore) * 0.12 +
      Math.max(0, 60 - regimeDiversityScore) * 0.1 +
      Math.max(0, 60 - sampleDiversityScore) * 0.08;
    const historyCredit = Math.min(12,
      Math.max(0, historyDepthScore - 75) * 0.05 +
        Math.max(0, regimeCoverageScore - 75) * 0.05 +
        Math.max(0, regimeDiversityScore - 70) * 0.04 +
        Math.max(0, sampleDiversityScore - 70) * 0.04,
    );
    const overfitRisk = Math.round(clamp(
      100 - robustnessScore +
        parameterSensitivity.fragilityScore * 0.16 +
        regimes.regimeDependencyScore * 0.12 +
        Math.max(0, 55 - calibration.calibrationScore) * 0.2 +
        (leakage.passed ? 0 : 28) +
        historyPenalty -
        historyCredit,
    ));
    const deploymentReadiness = Math.round(clamp(mean([
      robustnessScore,
      generalizationConfidence,
      structuralReliability,
      adaptabilityScore,
      100 - overfitRisk,
      participation.participationScore,
      historyDepthScore,
      regimeCoverageScore,
    ])));
    const safetyGate = leakage.passed === false || overfitRisk > 60
      ? "block"
      : overfitRisk > 30 || deploymentReadiness < 62 || participation.participationScore < 35
        ? "reduce"
        : "allow";
    const reasons = buildReasons({
      overfitRisk,
      safetyGate,
      walkForward: walkForward.stabilityScore,
      regimes: regimes.regimeRobustnessScore,
      calibration: calibration.calibrationScore,
      parameters: parameterSensitivity.stabilityScore,
      adversarial: adversarial.robustnessScore,
      participation: participation.participationScore,
      leakage,
      statisticalIntegrity: statisticalIntegrity.score,
      historyDepthScore,
      regimeCoverageScore,
      regimeDiversityScore,
      sampleDiversityScore,
    });

    return {
      robustnessScore,
      overfitRisk,
      generalizationConfidence,
      structuralReliability,
      adaptabilityScore,
      uncertaintyLevel,
      deploymentReadiness,
      historyDepthScore,
      regimeCoverageScore,
      regimeDiversityScore,
      sampleDiversityScore,
      safetyGate,
      reasons,
      walkForward,
      regimes,
      calibration,
      parameterSensitivity,
      adversarial,
      participation,
      ensemble,
      leakage,
      featureTrust,
      realityGap,
      statisticalIntegrity,
    };
  }
}

function normalizeObservations(observations: RobustnessObservation[]): NormalizedObservation[] {
  return observations
    .map((item, order) => {
      const actual = finite(item.actual);
      return {
        ...item,
        order,
        actual,
        confidence: clamp(item.confidence ?? 50),
        participated: item.participated !== false,
        regime: String(item.regime ?? inferRegime(actual, item.features)),
      };
    })
    .filter((item) => Number.isFinite(item.actual))
    .sort((a, b) => (a.timestamp ?? a.index ?? a.order) - (b.timestamp ?? b.index ?? b.order));
}

function evaluateRollingWalkForward(
  observations: NormalizedObservation[],
  trainWindowSize: number,
  validationWindowSize: number,
  stepSize: number,
) {
  const windows: SignalRobustnessResult["walkForward"]["windows"] = [];
  for (
    let start = 0;
    start + trainWindowSize + validationWindowSize <= observations.length;
    start += stepSize
  ) {
    const train = observations.slice(start, start + trainWindowSize).map((item) => item.actual);
    const validation = observations
      .slice(start + trainWindowSize, start + trainWindowSize + validationWindowSize)
      .map((item) => item.actual);
    const trainMean = mean(train);
    const validationMean = mean(validation);
    windows.push({
      trainStartIndex: start,
      trainEndIndex: start + trainWindowSize - 1,
      validationStartIndex: start + trainWindowSize,
      validationEndIndex: start + trainWindowSize + validationWindowSize - 1,
      trainMean,
      validationMean,
      degradationPct: trainMean > 0 ? clamp(((trainMean - validationMean) / Math.max(0.0001, Math.abs(trainMean))) * 100, -100, 100) : validationMean < 0 ? 100 : 0,
    });
  }
  const validationMeans = windows.map((window) => window.validationMean);
  const positiveRatio = ratio(validationMeans, (value) => value > 0);
  const consistencyScore = clamp(positiveRatio * 100 - stdev(validationMeans) * 6);
  const degradationPct = windows.length ? Math.max(0, mean(windows.map((window) => window.degradationPct))) : 100;
  const stabilityScore = windows.length
    ? clamp(consistencyScore * 0.7 + (100 - degradationPct) * 0.3)
    : clamp((observations.length / Math.max(1, trainWindowSize + validationWindowSize)) * 55);

  return { stabilityScore, consistencyScore, degradationPct, windows };
}

function evaluateRegimes(observations: NormalizedObservation[]) {
  const buckets = new Map<string, number[]>();
  for (const item of observations) {
    const bucket = buckets.get(item.regime) ?? [];
    bucket.push(item.actual);
    buckets.set(item.regime, bucket);
  }
  const regimes = Array.from(buckets.entries()).map(([regime, values]) => ({
    regime,
    samples: values.length,
    meanOutcome: mean(values),
    score: clamp(50 + mean(values) * 8 + ratio(values, (value) => value > 0) * 35 - stdev(values) * 2),
  }));
  const scores = regimes.map((item) => item.score);
  const sampleCounts = regimes.map((item) => item.samples);
  const dominantShare = observations.length ? Math.max(0, ...sampleCounts) / observations.length : 1;
  const regimeDependencyScore = clamp(dominantShare * 100 + stdev(scores) * 0.6);
  const regimeRobustnessScore = clamp(mean(scores) - Math.max(0, dominantShare - 0.55) * 35);
  const adaptabilityScore = clamp(regimeRobustnessScore - Math.max(0, stdev(scores) - 18) * 0.8);

  return { regimeRobustnessScore, regimeDependencyScore, adaptabilityScore, regimes };
}

function evaluateCalibration(observations: NormalizedObservation[], minimumSamples: number) {
  const buckets = [0, 20, 40, 60, 80].map((start) => {
    const end = start + 20;
    const values = observations.filter((item) => item.confidence >= start && item.confidence < end + (end === 100 ? 1 : 0));
    const predictedConfidence = values.length ? mean(values.map((item) => item.confidence)) : start + 10;
    const realizedRate = values.length ? ratio(values.map((item) => item.actual), (value) => value > 0) * 100 : predictedConfidence;
    return {
      bucket: `${start}-${end}`,
      samples: values.length,
      predictedConfidence,
      realizedRate,
    };
  });
  const populated = buckets.filter((bucket) => bucket.samples > 0);
  const weightedError = populated.length
    ? populated.reduce((sum, bucket) => sum + Math.abs(bucket.predictedConfidence - bucket.realizedRate) * bucket.samples, 0) /
      Math.max(1, populated.reduce((sum, bucket) => sum + bucket.samples, 0))
    : 50;
  const samplePenalty = observations.length < minimumSamples ? (1 - observations.length / minimumSamples) * 25 : 0;
  const calibrationError = clamp(weightedError + samplePenalty);
  const confidenceDecay = clamp(calibrationError * 0.75 + samplePenalty);
  const calibrationScore = clamp(100 - calibrationError);

  return { calibrationScore, calibrationError, confidenceDecay, reliabilityCurve: buckets };
}

function evaluateParameterSensitivity(variants: RobustnessParameterVariant[]) {
  if (!variants.length) {
    return { stabilityScore: 35, fragilityScore: 65, gradient: 65, heatmap: [] };
  }
  const baseline = variants.find((variant) => variant.baselineScore != null)?.baselineScore ?? mean(variants.map((variant) => variant.score));
  const heatmap = variants.map((variant) => {
    const degradationPct = baseline > 0 ? clamp(((baseline - variant.score) / Math.max(0.0001, Math.abs(baseline))) * 100, -100, 100) : 0;
    return {
      id: variant.id,
      score: variant.score,
      degradationPct,
      passed: variant.passed !== false && variant.score >= Math.max(0, (variant.benchmarkScore ?? 0)),
    };
  });
  const passRate = ratio(heatmap, (item) => item.passed);
  const positiveDegradation = heatmap.map((item) => Math.max(0, item.degradationPct));
  const gradient = clamp(mean(positiveDegradation) + stdev(positiveDegradation));
  const fragilityScore = clamp((1 - passRate) * 100 + gradient * 0.55);
  const stabilityScore = clamp(passRate * 75 + (100 - gradient) * 0.25);

  return { stabilityScore, fragilityScore, gradient, heatmap };
}

function evaluateAdversarial(scenarios: RobustnessAdversarialScenario[]) {
  if (!scenarios.length) {
    return { robustnessScore: 50, executionRealismScore: 50, scenarios: [] };
  }
  const mapped = scenarios.map((scenario) => {
    const baseline = scenario.baselineScore ?? scenario.score;
    const degradationPct = baseline > 0 ? clamp(((baseline - scenario.score) / Math.max(0.0001, Math.abs(baseline))) * 100, -100, 100) : 0;
    return {
      id: scenario.id,
      degradationPct,
      resilienceScore: clamp(100 - Math.max(0, degradationPct) - (scenario.severity ?? 0) * 0.12),
    };
  });
  return {
    robustnessScore: mean(mapped.map((item) => item.resilienceScore)),
    executionRealismScore: clamp(mean(mapped.map((item) => item.resilienceScore)) - Math.max(0, ...mapped.map((item) => item.degradationPct)) * 0.15),
    scenarios: mapped,
  };
}

function evaluateParticipation(observations: NormalizedObservation[]) {
  const participated = observations.filter((item) => item.participated);
  const opportunityDensity = observations.length ? participated.length / observations.length : 0;
  const executableConviction = participated.length
    ? clamp(ratio(participated.map((item) => item.actual), (value) => value > 0) * 75 + mean(participated.map((item) => item.confidence)) * 0.25)
    : 0;
  const participationScore = clamp(opportunityDensity * 70 + executableConviction * opportunityDensity * 0.3);

  return { participationScore, opportunityDensity: opportunityDensity * 100, executableConviction };
}

function evaluateEnsemble(votes: RobustnessEnsembleVote[]) {
  if (!votes.length) {
    return { consensusScore: 50, dominancePenalty: 20, disagreementScore: 50 };
  }
  const totalWeight = votes.reduce((sum, vote) => sum + Math.max(0, vote.weight ?? 1), 0) || 1;
  const weightedDirection = votes.reduce((sum, vote) => sum + Math.sign(vote.direction) * clamp(vote.confidence) * Math.max(0, vote.weight ?? 1), 0) / totalWeight;
  const largestWeight = Math.max(...votes.map((vote) => Math.max(0, vote.weight ?? 1))) / totalWeight;
  const dominancePenalty = clamp(Math.max(0, largestWeight - 0.45) * 100);
  const disagreementScore = clamp(100 - stdev(votes.map((vote) => Math.sign(vote.direction) * clamp(vote.confidence))) * 0.9);
  const consensusScore = clamp(Math.abs(weightedDirection) - dominancePenalty * 0.35 + disagreementScore * 0.25);

  return { consensusScore, dominancePenalty, disagreementScore };
}

function evaluateLeakage(checks: LeakageCheck[]) {
  const violations = checks.flatMap((check) => {
    const issues: string[] = [];
    if (check.validationStartIndex <= check.trainEndIndex) issues.push(`${check.id}: validation overlaps training`);
    if (check.normalizedWithFuture === true) issues.push(`${check.id}: normalization used future data`);
    if (
      check.featureTimestampIndex != null &&
      check.labelTimestampIndex != null &&
      check.featureTimestampIndex >= check.labelTimestampIndex
    ) {
      issues.push(`${check.id}: feature timestamp is not earlier than label`);
    }
    return issues;
  });

  return { passed: violations.length === 0, violations };
}

function evaluateFeatureTrust(observations: NormalizedObservation[]) {
  const keys = Array.from(new Set(observations.flatMap((item) => Object.keys(item.features ?? {}))));
  if (!keys.length) {
    return { trustScore: 50, entropy: 100, features: [] };
  }
  const features = keys.map((key) => {
    const pairs = observations
      .map((item) => [item.features?.[key], item.actual] as const)
      .filter(([feature, actual]) => Number.isFinite(feature) && Number.isFinite(actual));
    const trust = pairs.length >= 3 ? clamp(50 + correlation(pairs.map(([feature]) => feature as number), pairs.map(([, actual]) => actual)) * 50) : 45;
    return { key, trust, weight: trust };
  });
  const total = features.reduce((sum, item) => sum + Math.max(0, item.weight), 0) || 1;
  const probabilities = features.map((item) => Math.max(0, item.weight) / total);
  const entropy = clamp(-probabilities.reduce((sum, value) => sum + (value > 0 ? value * Math.log2(value) : 0), 0) / Math.log2(Math.max(2, probabilities.length)) * 100);
  const trustScore = clamp(mean(features.map((item) => item.trust)) - Math.max(0, 35 - entropy) * 0.4);

  return { trustScore, entropy, features };
}

function evaluateStatisticalIntegrity(
  observations: NormalizedObservation[],
  minimumSamples: number,
  dataQualityScore: number,
  seed: number,
) {
  const values = observations.map((item) => item.actual);
  const minimumSampleScore = clamp((values.length / minimumSamples) * 100);
  const bootstrapStability = bootstrapPositiveMeanStability(values, seed);
  const monteCarloStability = monteCarloOrderStability(values, seed + 101);
  const score = clamp(mean([minimumSampleScore, bootstrapStability, monteCarloStability, dataQualityScore]));

  return { score, bootstrapStability, monteCarloStability, minimumSampleScore, dataQualityScore };
}

function estimateRealityGap(degradationPct: number, executionRealismScore: number, statisticalIntegrityScore: number) {
  const expectedDegradationPct = clamp(Math.max(0, degradationPct) * 0.45 + (100 - executionRealismScore) * 0.25 + (100 - statisticalIntegrityScore) * 0.18);
  return {
    realismScore: clamp(100 - expectedDegradationPct),
    expectedDegradationPct,
  };
}

function buildReasons(input: {
  overfitRisk: number;
  safetyGate: "allow" | "reduce" | "block";
  walkForward: number;
  regimes: number;
  calibration: number;
  parameters: number;
  adversarial: number;
  participation: number;
  leakage: { passed: boolean; violations: string[] };
  statisticalIntegrity: number;
  historyDepthScore: number;
  regimeCoverageScore: number;
  regimeDiversityScore: number;
  sampleDiversityScore: number;
}) {
  const reasons: string[] = [];
  if (input.overfitRisk > 30) reasons.push("Overfit risk is above the production threshold.");
  if (input.walkForward < 60) reasons.push("Rolling walk-forward validation is unstable.");
  if (input.regimes < 60) reasons.push("Performance is too dependent on a narrow regime set.");
  if (input.calibration < 60) reasons.push("Predicted confidence is poorly calibrated to realized outcomes.");
  if (input.parameters < 60) reasons.push("Nearby parameter variants are fragile.");
  if (input.adversarial < 60) reasons.push("Adversarial distortions create too much degradation.");
  if (input.participation < 35) reasons.push("Executable participation is too sparse.");
  if (!input.leakage.passed) reasons.push(...input.leakage.violations);
  if (input.statisticalIntegrity < 60) reasons.push("Statistical integrity is below the production floor.");
  if (input.historyDepthScore < 55) reasons.push("Historical depth is too shallow for broad overfit confidence.");
  if (input.regimeCoverageScore < 55) reasons.push("Regime coverage is too narrow for broad overfit confidence.");
  if (input.regimeDiversityScore < 55) reasons.push("Regime diversity is too narrow for broad overfit confidence.");
  if (input.sampleDiversityScore < 55) reasons.push("Sample diversity is too concentrated for broad overfit confidence.");
  if (input.safetyGate === "allow" && reasons.length === 0) reasons.push("Robustness diagnostics are within production tolerance.");
  return Array.from(new Set(reasons));
}

function inferRegime(actual: number, features: Record<string, number> | undefined): RobustnessRegime {
  const volatility = finite(features?.volatility ?? features?.risk ?? Math.abs(actual));
  const liquidity = finite(features?.liquidity ?? 70);
  if (actual < -6 || volatility > 78) return "panic";
  if (actual > 6 && volatility > 55) return "expansion";
  if (actual > 1.2 && volatility <= 55) return "trending";
  if (actual < 0 && volatility > 45) return "volatile";
  if (Math.abs(actual) < 0.8 && volatility < 25) return "low-volatility";
  if (liquidity < 35) return "liquidity-compression";
  if (actual > 0) return "recovery";
  return "sideways";
}

function bootstrapPositiveMeanStability(values: number[], seed: number) {
  if (!values.length) return 0;
  const generator = seeded(seed);
  let positive = 0;
  const rounds = 64;
  for (let round = 0; round < rounds; round += 1) {
    const sample = values.map(() => values[Math.floor(generator() * values.length)]);
    if (mean(sample) > 0) positive += 1;
  }
  return clamp((positive / rounds) * 100);
}

function monteCarloOrderStability(values: number[], seed: number) {
  if (!values.length) return 0;
  const generator = seeded(seed);
  let stable = 0;
  const rounds = 48;
  for (let round = 0; round < rounds; round += 1) {
    const shuffled = deterministicShuffle(values, generator);
    const curve = shuffled.reduce<number[]>((acc, value) => {
      const last = acc[acc.length - 1] ?? 0;
      acc.push(last + value);
      return acc;
    }, []);
    let peak = Number.NEGATIVE_INFINITY;
    let trough = 0;
    for (const value of curve) {
      peak = Math.max(peak, value);
      trough = Math.max(trough, peak - value);
    }
    if (curve[curve.length - 1] > 0 && trough < Math.max(12, Math.abs(curve[curve.length - 1]) * 0.65)) stable += 1;
  }
  return clamp((stable / rounds) * 100);
}

function deterministicShuffle(values: number[], generator: () => number) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(generator() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = temp;
  }
  return copy;
}

function seeded(seed: number) {
  let value = Math.floor(seed) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function weightedMean(values: number[], weights: number[]) {
  /* c8 ignore next */
  const totalWeight = values.reduce((sum, _value, index) => sum + (weights[index] ?? 1), 0) || 1;
  /* c8 ignore next */
  return values.reduce((sum, value, index) => sum + clamp(value) * (weights[index] ?? 1), 0) / totalWeight;
}

function ratio<T>(values: T[], predicate: (value: T) => boolean) {
  return values.length ? values.filter(predicate).length / values.length : 0;
}

function finite(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

/* c8 ignore next */
function correlation(left: number[], right: number[]) {
  const count = Math.min(left.length, right.length);
  /* c8 ignore next */
  if (count < 2) return 0;
  const leftValues = left.slice(0, count);
  const rightValues = right.slice(0, count);
  const leftMean = mean(leftValues);
  const rightMean = mean(rightValues);
  const numerator = leftValues.reduce((sum, value, index) => sum + (value - leftMean) * (rightValues[index] - rightMean), 0);
  const denominator = Math.sqrt(
    leftValues.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) *
      rightValues.reduce((sum, value) => sum + (value - rightMean) ** 2, 0),
  );
  return denominator > 0 ? numerator / denominator : 0;
}
