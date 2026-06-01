import { clamp, mean, numeric, stdev } from "../math/statistics";
import { normalizeMetric, type NormalizationMemory } from "../metrics/normalization";
import type { MetricInput, MetricState, PerceptionLayerKey, PerceptionLayerState, TimeframeState } from "../types";
import { classifyPerceptionLayer, PERCEPTION_LAYER_DEFINITIONS, PERCEPTION_LAYER_ORDER } from "./layers";
import { MetricRegistry } from "../metrics/registry";

export type PerceptionEngineOptions = {
  maxMetricHistory?: number;
};

export class PerceptionEngine {
  private readonly metricHistory: NormalizationMemory = new Map();
  private readonly previousLayers = new Map<PerceptionLayerKey, number>();
  private readonly maxMetricHistory: number;

  constructor(private readonly registry: MetricRegistry, options: PerceptionEngineOptions = {}) {
    this.maxMetricHistory = options.maxMetricHistory ?? 180;
  }

  evaluate(inputs: MetricInput[], regimeVolatilityScale = 1) {
    const inputMap = new Map(inputs.map((input) => [input.key, input]));
    const metrics: Record<string, MetricState> = {};

    for (const descriptor of this.registry.all()) {
      const input = inputMap.get(descriptor.key) ?? {
        key: descriptor.key,
        value: 0,
        raw: null,
        confidence: 0,
        detail: "Metric unavailable.",
      };
      const score = clamp(numeric(input.value));
      const normalization = normalizeMetric(
        descriptor.key,
        score,
        this.metricHistory,
        this.maxMetricHistory,
        regimeVolatilityScale,
      );

      metrics[descriptor.key] = {
        key: descriptor.key,
        label: descriptor.label,
        description: descriptor.description,
        raw: input.raw ?? score,
        unit: input.unit ?? descriptor.unit,
        score: normalization.boundedScore,
        confidence: clamp(input.confidence ?? 100),
        detail: input.detail,
        normalization,
        layers: descriptor.layerMappings,
      };
    }

    const layers = {} as Record<PerceptionLayerKey, PerceptionLayerState>;

    for (const layerKey of PERCEPTION_LAYER_ORDER) {
      const definition = PERCEPTION_LAYER_DEFINITIONS[layerKey];
      const contributors = Object.values(metrics)
        .flatMap((metricState) =>
          metricState.layers
            .filter((mapping) => mapping.layer === layerKey)
            .map((mapping) => {
              const polarity = mapping.polarity ?? "direct";
              const contribution = polarity === "inverse" ? 100 - metricState.score : metricState.score;
              return {
                metricKey: metricState.key,
                label: metricState.label,
                value: metricState.score,
                contribution,
                weight: mapping.weight,
                raw: metricState.raw,
                unit: metricState.unit,
                detail: metricState.detail,
                polarity,
              };
            }),
        )
        .sort((a, b) => b.weight * b.contribution - a.weight * a.contribution);

      const weightTotal = contributors.reduce((sum, item) => sum + item.weight, 0) || 1;
      const score = clamp(contributors.reduce((sum, item) => sum + item.contribution * item.weight, 0) / weightTotal);
      const confidence = clamp(
        contributors.reduce((sum, item) => sum + metrics[item.metricKey].confidence * item.weight, 0) / weightTotal,
      );
      const previousScore = this.previousLayers.get(layerKey) ?? score;
      this.previousLayers.set(layerKey, score);

      layers[layerKey] = {
        ...definition,
        score,
        confidence,
        uncertainty: clamp(100 - confidence),
        momentum: score - previousScore,
        classification: classifyPerceptionLayer(layerKey, score),
        contributors,
      };
    }

    const layerScores = PERCEPTION_LAYER_ORDER.map((key) => layers[key].score);
    const compositeScore = clamp(mean(layerScores));
    const confidence = clamp(mean(PERCEPTION_LAYER_ORDER.map((key) => layers[key].confidence)));
    const dominantLayer = PERCEPTION_LAYER_ORDER.reduce(
      (best, key) => (layers[key].score > layers[best].score ? key : best),
      "survival",
    );
    const agreement = clamp(100 - stdev(layerScores) * 1.35);

    const timeframes: Record<"intraday" | "swing" | "macro", TimeframeState> = {
      intraday: timeframe("intraday", "Intraday", [layers.survival.score, layers.emotion.score, layers.information.score, layers.selfAwareness.score]),
      swing: timeframe("swing", "Swing", [layers.conviction.score, layers.harmony.score, layers.intuition.score, layers.selfAwareness.score]),
      macro: timeframe("macro", "Macro", [layers.macroContext.score, layers.survival.score, layers.harmony.score, layers.selfAwareness.score]),
    };

    return {
      layers,
      timeframes,
      compositeScore,
      confidence,
      agreement,
      dominantLayer,
      metrics,
    };
  }
}

function timeframe(key: "intraday" | "swing" | "macro", label: string, values: number[]): TimeframeState {
  return {
    key,
    label,
    score: clamp(mean(values)),
    agreement: clamp(100 - stdev(values) * 1.25),
  };
}

