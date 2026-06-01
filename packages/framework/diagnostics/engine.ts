import { clamp, mean } from "../math/statistics";
import type { Contradiction, DiagnosticsState, PerceptionLayerState, SynchronizationState, ValidationState } from "../types";

export function evaluateDiagnostics(
  layers: Record<string, PerceptionLayerState>,
  synchronization: SynchronizationState,
  validation: ValidationState,
): DiagnosticsState {
  const contradictions = detectContradictions(layers, synchronization);
  const contradictionDensity = clamp(contradictions.reduce((sum, item) => sum + item.severity, 0) / 4);
  const historicalReliability = clamp(mean([validation.calibrationAccuracy, validation.confidenceRealism, synchronization.score]));
  const overfitMetric = layers.selfAwareness.contributors.find((item) => item.metricKey === "overfitRisk");
  const overfitProbability = clamp(Number(overfitMetric?.raw ?? overfitMetric?.value ?? 50));
  const uncertainty = clamp(mean(Object.values(layers).map((layer) => layer.uncertainty)) + contradictionDensity * 0.22);
  const confidenceDecay = clamp((100 - synchronization.dataFreshness) * 0.38 + contradictionDensity * 0.24 + overfitProbability * 0.18);
  const predictionCalibration = validation.evaluatedSignals > 0 ? validation.calibrationAccuracy : clamp(100 - overfitProbability * 0.45);
  const modelConfidence = clamp(layers.selfAwareness.score - confidenceDecay * 0.35);
  const trust = clamp(mean([modelConfidence, predictionCalibration, historicalReliability, synchronization.score]) - contradictionDensity * 0.38);

  return {
    modelConfidence,
    predictionCalibration,
    overfitProbability,
    contradictionDensity,
    uncertainty,
    confidenceDecay,
    historicalReliability,
    trust,
    contradictions,
  };
}

function detectContradictions(layers: Record<string, PerceptionLayerState>, sync: SynchronizationState): Contradiction[] {
  const contradictions: Contradiction[] = [];
  addIf(contradictions, layers.harmony.score > 68 && lowMetric(layers.harmony, "breadthHealth"), {
    key: "harmony_without_participation",
    description: "High harmony conflicts with weak participation evidence.",
    severity: 68,
    evidence: { harmony: layers.harmony.score, breadthHealth: metricValue(layers.harmony, "breadthHealth") },
  });
  addIf(contradictions, layers.conviction.score > 68 && lowMetric(layers.information, "volumeConfirmation"), {
    key: "trend_without_volume_confirmation",
    description: "Strong conviction lacks information confirmation.",
    severity: 62,
    evidence: { conviction: layers.conviction.score, volumeConfirmation: metricValue(layers.information, "volumeConfirmation") },
  });
  addIf(contradictions, highMetric(layers.conviction, "signalConsensus") && lowMetric(layers.harmony, "breadthHealth"), {
    key: "consensus_without_breadth",
    description: "High consensus is not supported by broad participation.",
    severity: 58,
    evidence: { signalConsensus: metricValue(layers.conviction, "signalConsensus"), breadthHealth: metricValue(layers.harmony, "breadthHealth") },
  });
  addIf(contradictions, layers.survival.score < 35 && sync.spreadIrregularity > 55, {
    key: "low_volatility_unstable_spreads",
    description: "Low structural stress conflicts with unstable spread conditions.",
    severity: 54,
    evidence: { survival: layers.survival.score, spreadIrregularity: sync.spreadIrregularity },
  });
  return contradictions.map((item) => ({
    ...item,
    confidenceImpact: clamp(item.severity * 0.34),
    readinessImpact: clamp(item.severity * 0.42),
  }));
}

function addIf(items: Contradiction[], condition: boolean, item: Omit<Contradiction, "confidenceImpact" | "readinessImpact">) {
  if (condition) items.push({ ...item, confidenceImpact: 0, readinessImpact: 0 });
}

function metricValue(layer: PerceptionLayerState, key: string) {
  return layer.contributors.find((item) => item.metricKey === key)?.contribution ?? 0;
}

function lowMetric(layer: PerceptionLayerState, key: string) {
  return metricValue(layer, key) < 42;
}

function highMetric(layer: PerceptionLayerState, key: string) {
  return metricValue(layer, key) > 68;
}
