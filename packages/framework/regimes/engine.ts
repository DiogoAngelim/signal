import { clamp } from "../math/statistics";
import type { PerceptionLayerState, RegimeName, RegimeState, SynchronizationState } from "../types";

const REGIMES: RegimeName[] = [
  "Risk-On Expansion",
  "Defensive Compression",
  "Panic Cascade",
  "Rotational Recovery",
  "Low-Vol Grind",
  "Trend Expansion",
  "Distribution Phase",
  "Mean-Reversion Chaos",
];

export class RegimeEngine {
  private previous?: RegimeName;
  private rollingConfidence = 50;

  evaluate(
    layers: Record<string, PerceptionLayerState>,
    synchronization: SynchronizationState,
    previousRegime?: RegimeName,
  ): RegimeState {
    const probabilities = scoreRegimes(layers, synchronization);
    const current = chooseWithHysteresis(probabilities, previousRegime ?? this.previous);
    const rawConfidence = probabilities[current];
    this.rollingConfidence = clamp(this.rollingConfidence * 0.72 + rawConfidence * 0.28);
    const transitionDetected = Boolean(this.previous && this.previous !== current);
    const previous = this.previous;
    this.previous = current;

    return {
      name: current,
      probabilities,
      confidence: this.rollingConfidence,
      transitionDetected,
      previous,
      thresholds: adaptiveThresholds(current, layers),
      modifiers: regimeModifiers(current),
    };
  }
}

function scoreRegimes(layers: Record<string, PerceptionLayerState>, sync: SynchronizationState) {
  const survival = layers.survival.score;
  const emotion = layers.emotion.score;
  const conviction = layers.conviction.score;
  const harmony = layers.harmony.score;
  const information = layers.information.score;
  const intuition = layers.intuition.score;
  const macro = layers.macroContext.score;
  const trust = layers.selfAwareness.score;
  const synced = sync.score;

  const raw: Record<RegimeName, number> = {
    "Risk-On Expansion": conviction * 0.3 + harmony * 0.25 + information * 0.15 + trust * 0.15 + Math.max(0, 100 - survival) * 0.15,
    "Defensive Compression": survival * 0.3 + macro * 0.25 + Math.max(0, 100 - emotion) * 0.15 + Math.max(0, 100 - harmony) * 0.15 + trust * 0.15,
    "Panic Cascade": survival * 0.38 + emotion * 0.26 + Math.max(0, 100 - trust) * 0.18 + Math.max(0, 100 - synced) * 0.18,
    "Rotational Recovery": intuition * 0.28 + harmony * 0.22 + conviction * 0.2 + macro * 0.15 + trust * 0.15,
    "Low-Vol Grind": Math.max(0, 100 - survival) * 0.22 + Math.max(0, 100 - emotion) * 0.2 + conviction * 0.2 + information * 0.18 + trust * 0.2,
    "Trend Expansion": conviction * 0.34 + information * 0.22 + harmony * 0.18 + emotion * 0.12 + trust * 0.14,
    "Distribution Phase": survival * 0.24 + macro * 0.24 + conviction * 0.12 + Math.max(0, 100 - harmony) * 0.22 + emotion * 0.18,
    "Mean-Reversion Chaos": emotion * 0.24 + intuition * 0.23 + survival * 0.2 + Math.max(0, 100 - information) * 0.18 + Math.max(0, 100 - harmony) * 0.15,
  };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(REGIMES.map((name) => [name, clamp((raw[name] / total) * 100)])) as Record<RegimeName, number>;
}

function chooseWithHysteresis(probabilities: Record<RegimeName, number>, previous?: RegimeName) {
  const sorted = REGIMES.slice().sort((a, b) => probabilities[b] - probabilities[a]);
  const winner = sorted[0];
  if (!previous || previous === winner) return winner;
  return probabilities[winner] - probabilities[previous] > 7 ? winner : previous;
}

function adaptiveThresholds(regime: RegimeName, layers: Record<string, PerceptionLayerState>) {
  const uncertainty = layers.selfAwareness.uncertainty;
  const stress = layers.survival.score;
  return {
    signalActivation: clamp(55 + uncertainty * 0.08 + stress * 0.06),
    contradictionTolerance: clamp(28 - uncertainty * 0.08),
    participationRequired: regime === "Risk-On Expansion" || regime === "Trend Expansion" ? 58 : 42,
    freshnessRequired: clamp(65 + uncertainty * 0.1),
  };
}

function regimeModifiers(regime: RegimeName) {
  const table: Record<RegimeName, RegimeState["modifiers"]> = {
    "Risk-On Expansion": { signalWeightScale: 1.12, confidenceScale: 1.08, exposureCap: 78, trendInterpretation: 1.1, volatilityNormalization: 0.9 },
    "Defensive Compression": { signalWeightScale: 0.86, confidenceScale: 0.9, exposureCap: 42, trendInterpretation: 0.82, volatilityNormalization: 1.25 },
    "Panic Cascade": { signalWeightScale: 0.62, confidenceScale: 0.72, exposureCap: 18, trendInterpretation: 0.55, volatilityNormalization: 1.55 },
    "Rotational Recovery": { signalWeightScale: 1, confidenceScale: 0.98, exposureCap: 58, trendInterpretation: 0.96, volatilityNormalization: 1.05 },
    "Low-Vol Grind": { signalWeightScale: 0.94, confidenceScale: 1, exposureCap: 55, trendInterpretation: 0.9, volatilityNormalization: 0.82 },
    "Trend Expansion": { signalWeightScale: 1.15, confidenceScale: 1.06, exposureCap: 72, trendInterpretation: 1.16, volatilityNormalization: 0.95 },
    "Distribution Phase": { signalWeightScale: 0.78, confidenceScale: 0.84, exposureCap: 34, trendInterpretation: 0.7, volatilityNormalization: 1.28 },
    "Mean-Reversion Chaos": { signalWeightScale: 0.72, confidenceScale: 0.8, exposureCap: 28, trendInterpretation: 0.62, volatilityNormalization: 1.45 },
  };
  return table[regime];
}

